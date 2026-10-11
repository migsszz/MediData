-- Audit trail: who changed what, and when.
--
-- A single trigger function records every insert/update/delete on a clinical
-- table with the actor, before/after snapshots and a derived action
-- (insert / update / archive / restore / delete). The log is append-only:
-- clients can't write to it, and updates/deletes are blocked except through
-- purge_audit_log(), which only the service role can call (for a retention
-- policy). Only organization admins can read it.
--
-- Demo (guest) workspaces are not audited: they are synthetic and expire.

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  organization_id uuid not null, -- deliberately no FK: the log outlives the org's rows
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'archive', 'restore', 'delete')),
  old_data jsonb,
  new_data jsonb
);
create index audit_log_org_at_idx on audit_log (organization_id, at desc);
create index audit_log_record_idx on audit_log (table_name, record_id);

alter table audit_log enable row level security;
create policy "Admins can read the audit log" on audit_log for select to authenticated
  using (public.has_role(organization_id, 'admin'));
revoke insert, update, delete on audit_log from anon, authenticated;

create or replace function public.audit_row()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  row_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  org uuid := coalesce((row_new ->> 'organization_id'), (row_old ->> 'organization_id'))::uuid;
  kind text;
begin
  if exists (select 1 from organizations where id = org and is_demo) then
    return coalesce(new, old);
  end if;

  kind := case
    when tg_op = 'INSERT' then 'insert'
    when tg_op = 'DELETE' then 'delete'
    when (row_new ->> 'deleted_at') is not null and (row_old ->> 'deleted_at') is null then 'archive'
    when (row_new ->> 'deleted_at') is null and (row_old ->> 'deleted_at') is not null then 'restore'
    else 'update'
  end;

  insert into audit_log (actor, organization_id, table_name, record_id, action, old_data, new_data)
  values (auth.uid(), org, tg_table_name, (coalesce(row_new, row_old) ->> 'id')::uuid, kind, row_old, row_new);

  return coalesce(new, old);
end
$$;

create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  if current_setting('medidata.allow_audit_purge', true) = 'on' then
    return coalesce(old, new);
  end if;
  raise exception 'audit_log is append-only' using errcode = 'insufficient_privilege';
end
$$;

create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function public.audit_log_immutable();

-- Retention: delete entries older than the cutoff. Service role only.
create or replace function public.purge_audit_log(older_than timestamptz)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  removed bigint;
begin
  perform set_config('medidata.allow_audit_purge', 'on', true);
  delete from audit_log where at < older_than;
  get diagnostics removed = row_count;
  return removed;
end
$$;
revoke all on function public.purge_audit_log(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_audit_log(timestamptz) to service_role;

create trigger patients_audit after insert or update or delete on patients
  for each row execute function public.audit_row();
create trigger encounters_audit after insert or update or delete on encounters
  for each row execute function public.audit_row();
create trigger medications_audit after insert or update or delete on medications
  for each row execute function public.audit_row();
