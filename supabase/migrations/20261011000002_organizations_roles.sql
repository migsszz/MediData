-- Organizations, memberships and roles.
--
-- Replaces "a practitioner only sees rows they created" with clinic-level
-- ownership: every clinical row belongs to an organization, and what a user
-- may do with it depends on their role in that organization.
--
--   admin      everything, including hard deletes, members and the audit log
--   clinician  read/create/update/archive clinical data
--   viewer     read only
--
-- Every new auth user (including anonymous guests) automatically gets a
-- personal workspace with themselves as admin, so the single-practitioner
-- flow keeps working with no onboarding. Guest workspaces are flagged
-- is_demo so they can be expired and excluded from the audit log.
--
-- Existing data: each distinct created_by gets a personal organization and
-- their rows move into it. Rows with a null created_by (invisible under the
-- old policies) go to an "Unassigned (legacy)" organization with no members,
-- so nothing is lost and an operator can reassign them.

create type app_role as enum ('admin', 'clinician', 'viewer');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (length(trim(name)) > 0),
  is_demo boolean not null default false,
  -- Set when a guest upgrades to a real account, until they've chosen what to
  -- do with their demo data (see finish_guest_upgrade()).
  pending_demo_cleanup boolean not null default false
);

create table memberships (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role app_role not null default 'clinician',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index memberships_user_id_idx on memberships (user_id);

-- ---------------------------------------------------------------------------
-- Authorization helpers. SECURITY DEFINER so policies on memberships itself
-- don't recurse; they only ever answer questions about auth.uid().
-- ---------------------------------------------------------------------------

create or replace function public.has_role(org uuid, min_role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and case min_role
            when 'viewer' then true
            when 'clinician' then m.role in ('clinician', 'admin')
            else m.role = 'admin'
          end
  )
$$;

-- The caller's oldest organization: the default for new rows when the client
-- doesn't name one (single-organization users never need to).
create or replace function public.current_org_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select organization_id from memberships
  where user_id = auth.uid()
  order by created_at, organization_id
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Personal workspace for every new user.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  org uuid;
begin
  insert into organizations (name, is_demo)
  values (case when new.is_anonymous then 'Demo workspace' else 'My practice' end, new.is_anonymous)
  returning id into org;

  insert into memberships (organization_id, user_id, role) values (org, new.id, 'admin');
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A guest who upgrades (Supabase flips auth.users.is_anonymous to false once
-- the email is confirmed) keeps the same user and workspace: promote the
-- workspace from demo to a normal one, and flag that demo data may need
-- cleaning up. Doing this in the database means it happens exactly once and
-- regardless of whether the client is still open.
create or replace function public.handle_user_upgraded()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Only flag cleanup if sample data is still there to clean (the client may
  -- already have run finish_guest_upgrade() while confirmation was pending).
  update organizations o
  set is_demo = false, name = 'My practice',
      pending_demo_cleanup = exists (select 1 from patients p where p.organization_id = o.id and p.is_seed)
  where o.is_demo and o.id in (select organization_id from memberships where user_id = new.id);
  return new;
end
$$;

drop trigger if exists on_auth_user_upgraded on auth.users;
create trigger on_auth_user_upgraded
  after update of is_anonymous on auth.users
  for each row when (old.is_anonymous is true and new.is_anonymous is false)
  execute function public.handle_user_upgraded();

-- ---------------------------------------------------------------------------
-- Move existing data into organizations.
-- ---------------------------------------------------------------------------

alter table patients add column if not exists organization_id uuid references organizations (id) on delete cascade;
alter table encounters add column if not exists organization_id uuid references organizations (id) on delete cascade;
alter table medications add column if not exists organization_id uuid references organizations (id) on delete cascade;

do $$
declare
  owner_id uuid;
  org uuid;
  legacy_org uuid;
begin
  -- Every user who ever created a row gets a personal organization (users
  -- created after the trigger above already have one).
  for owner_id in
    select created_by from patients where created_by is not null
    union select created_by from encounters where created_by is not null
    union select created_by from medications where created_by is not null
  loop
    select organization_id into org from memberships where user_id = owner_id order by created_at limit 1;
    if org is null then
      insert into organizations (name, is_demo)
      values ('My practice', coalesce((select is_anonymous from auth.users where id = owner_id), false))
      returning id into org;
      insert into memberships (organization_id, user_id, role) values (org, owner_id, 'admin');
    end if;

    update patients set organization_id = org where created_by = owner_id and organization_id is null;
    update encounters set organization_id = org where created_by = owner_id and organization_id is null;
    update medications set organization_id = org where created_by = owner_id and organization_id is null;
  end loop;

  -- Children inherit their patient's organization when the creator differs.
  update encounters e set organization_id = p.organization_id
    from patients p where e.patient_id = p.id and e.organization_id is distinct from p.organization_id;
  update medications m set organization_id = p.organization_id
    from patients p where m.patient_id = p.id and m.organization_id is distinct from p.organization_id;

  if exists (select 1 from patients where organization_id is null)
     or exists (select 1 from encounters where organization_id is null)
     or exists (select 1 from medications where organization_id is null) then
    insert into organizations (name) values ('Unassigned (legacy)') returning id into legacy_org;
    update patients set organization_id = legacy_org where organization_id is null;
    update encounters set organization_id = legacy_org where organization_id is null;
    update medications set organization_id = legacy_org where organization_id is null;
  end if;
end $$;

alter table patients alter column organization_id set not null;
alter table encounters alter column organization_id set not null;
alter table medications alter column organization_id set not null;
alter table patients alter column organization_id set default public.current_org_id();
alter table encounters alter column organization_id set default public.current_org_id();
alter table medications alter column organization_id set default public.current_org_id();

-- A child row must live in the same organization as its patient. Enforced by
-- the database (composite FK) rather than trusting every policy and client.
alter table patients add constraint patients_id_org_key unique (id, organization_id);
alter table encounters add constraint encounters_id_org_key unique (id, organization_id);

alter table encounters drop constraint if exists encounters_patient_id_fkey;
alter table encounters add constraint encounters_patient_org_fkey
  foreign key (patient_id, organization_id) references patients (id, organization_id) on delete cascade;
alter table medications drop constraint if exists medications_patient_id_fkey;
alter table medications add constraint medications_patient_org_fkey
  foreign key (patient_id, organization_id) references patients (id, organization_id) on delete cascade;

create index patients_org_idx on patients (organization_id);
create index encounters_org_idx on encounters (organization_id);
create index medications_org_idx on medications (organization_id);

-- ---------------------------------------------------------------------------
-- Row metadata: updated_*, soft delete, and immutable ownership.
-- ---------------------------------------------------------------------------

alter table patients
  add column updated_at timestamptz not null default now(), add column updated_by uuid,
  add column deleted_at timestamptz, add column deleted_by uuid;
alter table encounters
  add column updated_at timestamptz not null default now(), add column updated_by uuid,
  add column deleted_at timestamptz, add column deleted_by uuid;
alter table medications
  add column updated_at timestamptz not null default now(), add column updated_by uuid,
  add column deleted_at timestamptz, add column deleted_by uuid;

alter table patients alter column created_by set default auth.uid();
alter table encounters alter column created_by set default auth.uid();
alter table medications alter column created_by set default auth.uid();

-- Shared by every clinical table (including the ones later migrations add).
create or replace function public.row_metadata()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- created_by is always the caller; a client can't attribute a row to someone else.
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot be changed' using errcode = 'check_violation';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.deleted_at is not null and old.deleted_at is null then
    new.deleted_by := auth.uid();
  elsif new.deleted_at is null then
    new.deleted_by := null;
  end if;
  return new;
end
$$;

create trigger patients_row_metadata before insert or update on patients
  for each row execute function public.row_metadata();
create trigger encounters_row_metadata before insert or update on encounters
  for each row execute function public.row_metadata();
create trigger medications_row_metadata before insert or update on medications
  for each row execute function public.row_metadata();

-- ---------------------------------------------------------------------------
-- Policies: membership + role instead of created_by = auth.uid().
--
-- Archiving (soft delete) is an UPDATE of deleted_at, so clinicians can do
-- it; the DELETE policy (permanent removal) is admin-only. Reads don't hide
-- archived rows at the policy level (an UPDATE that archives a row must still
-- be able to see its own result); the app and the RPCs filter deleted_at.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['patients', 'encounters', 'medications'] loop
    execute format('drop policy if exists "Users can read their own %1$s" on %1$s', t);
    execute format('drop policy if exists "Users can insert their own %1$s" on %1$s', t);
    execute format('drop policy if exists "Users can update their own %1$s" on %1$s', t);
    execute format('drop policy if exists "Users can delete their own %1$s" on %1$s', t);

    execute format($p$create policy "Members can read %1$s" on %1$s for select to authenticated
                      using (public.has_role(organization_id, 'viewer'))$p$, t);
    execute format($p$create policy "Clinicians can insert %1$s" on %1$s for insert to authenticated
                      with check (public.has_role(organization_id, 'clinician'))$p$, t);
    execute format($p$create policy "Clinicians can update %1$s" on %1$s for update to authenticated
                      using (public.has_role(organization_id, 'clinician'))
                      with check (public.has_role(organization_id, 'clinician'))$p$, t);
    execute format($p$create policy "Admins can delete %1$s" on %1$s for delete to authenticated
                      using (public.has_role(organization_id, 'admin'))$p$, t);
  end loop;
end $$;

alter table organizations enable row level security;
alter table memberships enable row level security;

create policy "Members can read their organizations" on organizations for select to authenticated
  using (public.has_role(id, 'viewer'));
create policy "Admins can rename their organizations" on organizations for update to authenticated
  using (public.has_role(id, 'admin')) with check (public.has_role(id, 'admin'));

create policy "Members can read memberships of their organizations" on memberships for select to authenticated
  using (user_id = auth.uid() or public.has_role(organization_id, 'admin'));
create policy "Admins can add members" on memberships for insert to authenticated
  with check (public.has_role(organization_id, 'admin'));
create policy "Admins can change roles" on memberships for update to authenticated
  using (public.has_role(organization_id, 'admin')) with check (public.has_role(organization_id, 'admin'));
create policy "Admins can remove members" on memberships for delete to authenticated
  using (public.has_role(organization_id, 'admin'));

-- An organization must never be left without an admin (it would be unmanageable).
-- Deleting the whole organization (cascade) is still allowed. Note this also
-- blocks deleting the auth user of a practice's only admin, which is intended.
create or replace function public.keep_one_admin()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     -- Demo workspaces are disposable: guest expiry must be able to remove them.
     and exists (select 1 from organizations where id = old.organization_id and not is_demo)
     and not exists (
       select 1 from memberships
       where organization_id = old.organization_id and role = 'admin' and user_id <> old.user_id
     ) then
    raise exception 'An organization must keep at least one admin' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end
$$;

create trigger memberships_keep_one_admin before update or delete on memberships
  for each row execute function public.keep_one_admin();

-- Admin invites an existing user by email. (Sending invitation emails to
-- people without an account is a product feature for later.)
create or replace function public.add_member_by_email(org uuid, member_email text, member_role app_role default 'clinician')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  target uuid;
begin
  if not public.has_role(org, 'admin') then
    raise exception 'Only an organization admin can add members' using errcode = 'insufficient_privilege';
  end if;

  select id into target from auth.users where lower(email) = lower(trim(member_email));
  if target is null then
    raise exception 'No user with that email has signed up yet' using errcode = 'no_data_found';
  end if;

  insert into memberships (organization_id, user_id, role) values (org, target, member_role)
  on conflict (organization_id, user_id) do update set role = excluded.role;
end
$$;

revoke all on function public.add_member_by_email(uuid, text, app_role) from public;
grant execute on function public.add_member_by_email(uuid, text, app_role) to authenticated;
