-- Server-side logic the client used to do in the browser, plus demo-workspace
-- handling. Query functions are SECURITY INVOKER so row-level security
-- applies exactly as it does for direct table reads.

-- ---------------------------------------------------------------------------
-- Patient search with keyset pagination (alphabetical by last, first, id).
-- Pass the last row of the previous page as p_after_* to get the next page.
-- ---------------------------------------------------------------------------

create or replace function public.search_patients(
  p_org uuid,
  p_query text default null,
  p_limit int default 25,
  p_after_last text default null,
  p_after_first text default null,
  p_after_id uuid default null
)
returns setof patients
language sql stable security invoker
as $$
  select p.*
  from patients p
  where p.organization_id = p_org
    and p.deleted_at is null
    and (p_query is null or trim(p_query) = ''
         or (p.first_name || ' ' || p.last_name) ilike '%' || trim(p_query) || '%')
    and (p_after_id is null
         or (p.last_name, p.first_name, p.id) > (p_after_last, p_after_first, p_after_id))
  order by p.last_name, p.first_name, p.id
  limit least(greatest(p_limit, 1), 100)
$$;

-- ---------------------------------------------------------------------------
-- Cohorts (defined first: dashboard_stats counts them).
-- ---------------------------------------------------------------------------

-- Patients whose most recent blood pressure reading is >= 140/90.
create or replace function public.cohort_hypertension(p_org uuid)
returns table (patient_id uuid, first_name text, last_name text, systolic numeric, diastolic numeric, observed_at timestamptz)
language sql stable security invoker
as $$
  with latest as (
    select distinct on (o.patient_id) o.patient_id, o.encounter_id, o.observed_at
    from observations o
    where o.organization_id = p_org and o.deleted_at is null and o.type_code = '8480-6'
    order by o.patient_id, o.observed_at desc
  )
  select p.id, p.first_name, p.last_name, sys.value, dia.value, l.observed_at
  from latest l
  join patients p on p.id = l.patient_id and p.deleted_at is null
  join observations sys on sys.patient_id = l.patient_id and sys.type_code = '8480-6'
       and sys.observed_at = l.observed_at and sys.deleted_at is null
  left join observations dia on dia.patient_id = l.patient_id and dia.type_code = '8462-4'
       and dia.encounter_id is not distinct from sys.encounter_id and dia.deleted_at is null
  where sys.value >= 140 or coalesce(dia.value, 0) >= 90
  order by p.last_name, p.first_name
$$;

-- Patients with no encounter in the last p_months (or none at all).
create or replace function public.cohort_overdue_followups(p_org uuid, p_months int default 12)
returns table (patient_id uuid, first_name text, last_name text, last_visit date)
language sql stable security invoker
as $$
  select p.id, p.first_name, p.last_name, max(e.visit_date)
  from patients p
  left join encounters e on e.patient_id = p.id and e.deleted_at is null
  where p.organization_id = p_org and p.deleted_at is null
  group by p.id, p.first_name, p.last_name
  having max(e.visit_date) is null or max(e.visit_date) < current_date - make_interval(months => p_months)
  order by max(e.visit_date) nulls first, p.last_name
$$;

-- ---------------------------------------------------------------------------
-- Dashboard aggregates.
-- ---------------------------------------------------------------------------

create or replace function public.dashboard_stats(p_org uuid)
returns jsonb
language sql stable security invoker
as $$
  with live_patients as (
    select * from patients where organization_id = p_org and deleted_at is null
  ), live_encounters as (
    select e.* from encounters e
    join live_patients p on p.id = e.patient_id
    where e.organization_id = p_org and e.deleted_at is null
  ), months as (
    select generate_series(date_trunc('month', current_date) - interval '5 months',
                           date_trunc('month', current_date), interval '1 month')::date as month
  )
  select jsonb_build_object(
    'total_patients', (select count(*) from live_patients),
    'encounters_this_month', (select count(*) from live_encounters
                              where visit_date >= date_trunc('month', current_date)::date),
    'average_age', (select coalesce(round(avg(date_part('year', age(date_of_birth)))), 0) from live_patients),
    'active_medications', (select count(*) from medications m
                           join live_patients p on p.id = m.patient_id
                           where m.organization_id = p_org and m.deleted_at is null
                             and m.active and (m.end_date is null or m.end_date >= current_date)),
    'encounters_by_month', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'month', to_char(m.month, 'YYYY-MM-DD'),
               'count', (select count(*) from live_encounters e
                         where date_trunc('month', e.visit_date) = m.month)
             ) order by m.month), '[]'::jsonb)
      from months m),
    'sex_distribution', (
      select coalesce(jsonb_agg(jsonb_build_object('sex', sex, 'count', n) order by n desc), '[]'::jsonb)
      from (select sex, count(*) n from live_patients group by sex) s),
    'top_diagnoses', (
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'code', code, 'count', n) order by n desc, label), '[]'::jsonb)
      from (
        select d.description as label, max(d.icd10_code) as code, count(*) n
        from encounter_diagnoses d
        join live_encounters e on e.id = d.encounter_id
        where d.organization_id = p_org and d.deleted_at is null
        group by d.description
        order by n desc, d.description
        limit 5) t),
    'hypertension_count', (select count(*) from public.cohort_hypertension(p_org)),
    'overdue_followup_count', (select count(*) from public.cohort_overdue_followups(p_org, 12))
  )
$$;

-- ---------------------------------------------------------------------------
-- Demo workspaces.
-- ---------------------------------------------------------------------------

-- Seeds the caller's own guest workspace. Idempotent; refuses real accounts.
create or replace function public.seed_demo_workspace()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  org uuid := public.current_org_id();
  uid uuid := auth.uid();
  pid uuid;
  eid uuid;
  i int := 0;
  v int;
  names text[][] := array[
    ['Ava','Thompson','1985-03-12','female','O+','Penicillin'],
    ['Liam','Garcia','1972-11-02','male','A-',null],
    ['Noor','Haddad','1998-07-22','female','B+','Latex'],
    ['Ethan','Walker','1960-01-30','male','AB+',null],
    ['Sofia','Rossi','2001-09-15','female','O-','Ibuprofen']];
  dx_codes text[] := array['I10','E11.9','J30.2','J00','G43.909'];
  reasons text[] := array['Annual checkup','Follow-up visit','Acute symptoms','Prescription refill','Lab review'];
  row text[];
  dx icd10_codes;
begin
  if uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'Demo data can only be created for guest sessions' using errcode = 'insufficient_privilege';
  end if;
  if org is null or exists (select 1 from patients where organization_id = org) then
    return;
  end if;

  foreach row slice 1 in array names loop
    insert into patients (organization_id, created_by, is_seed, first_name, last_name, date_of_birth, sex,
                          phone, email, address, blood_type, notes)
    values (org, uid, true, row[1], row[2], row[3]::date, row[4], '555-010' || (i + 1),
            lower(row[1] || '.' || row[2]) || '@example.com', (10 + i * 11) || ' Demo St', row[5], 'Demo patient.')
    returning id into pid;

    if row[6] is not null then
      insert into allergies (organization_id, patient_id, substance, category, severity, reaction)
      values (org, pid, row[6], 'drug', case when i = 0 then 'severe' else 'moderate' end, 'Rash');
    end if;

    for v in 0 .. (1 + i % 3) loop
      select * into dx from icd10_codes where code = dx_codes[1 + (i + v) % 5];
      insert into encounters (organization_id, created_by, is_seed, patient_id, visit_date, reason, notes)
      values (org, uid, true, pid, current_date - (v * 30 + i * 5), reasons[1 + (i + v) % 5], 'Seeded demo encounter.')
      returning id into eid;

      insert into encounter_diagnoses (organization_id, encounter_id, icd10_code, description, is_primary)
      values (org, eid, dx.code, dx.description, true);

      insert into observations (organization_id, patient_id, encounter_id, type_code, value, observed_at) values
        (org, pid, eid, '8480-6', 110 + ((i + v) % 6) * 7, (current_date - (v * 30 + i * 5))::timestamptz + interval '12 hours'),
        (org, pid, eid, '8462-4', 70 + ((i + v) % 4) * 6, (current_date - (v * 30 + i * 5))::timestamptz + interval '12 hours'),
        (org, pid, eid, '8867-4', 60 + ((i + v) % 8) * 3, (current_date - (v * 30 + i * 5))::timestamptz + interval '12 hours'),
        (org, pid, eid, '8310-5', 36.5 + ((i + v) % 3) * 0.2, (current_date - (v * 30 + i * 5))::timestamptz + interval '12 hours'),
        (org, pid, eid, '59408-5', 96 + ((i + v) % 4), (current_date - (v * 30 + i * 5))::timestamptz + interval '12 hours'),
        (org, pid, eid, '29463-7', 60 + i * 6 + v, (current_date - (v * 30 + i * 5))::timestamptz + interval '12 hours'),
        (org, pid, eid, '8302-2', 160 + i * 3, (current_date - (v * 30 + i * 5))::timestamptz + interval '12 hours');
    end loop;

    if i % 2 = 0 then
      insert into medications (organization_id, created_by, is_seed, patient_id, name, rxcui, dosage, frequency, start_date)
      values (org, uid, true, pid, case when i = 0 then 'Lisinopril' else 'Metformin' end,
              case when i = 0 then '29046' else '6809' end,
              case when i = 0 then '10mg' else '500mg' end, 'Once daily', current_date - 60);
    end if;
    i := i + 1;
  end loop;
end
$$;
revoke all on function public.seed_demo_workspace() from public, anon;
grant execute on function public.seed_demo_workspace() to authenticated;

-- Called by the client after a guest upgrades to a real account. The
-- database has already promoted the workspace (handle_user_upgraded); this
-- applies the user's choice about their demo data, once: seeded sample rows
-- are always dropped, and the guest's own rows are kept unless they chose to
-- discard them. Deleting a patient cascades to its encounters, observations,
-- allergies and medications. Does nothing for a workspace with no pending
-- cleanup, so it can't be used to wipe a real practice's records.
create or replace function public.finish_guest_upgrade(keep_own_data boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  org uuid := public.current_org_id();
begin
  if auth.uid() is null or org is null or not public.has_role(org, 'admin') then
    return;
  end if;
  if not exists (select 1 from organizations where id = org and (pending_demo_cleanup or is_demo)) then
    return;
  end if;

  delete from patients where organization_id = org and (is_seed or not keep_own_data);
  update organizations set pending_demo_cleanup = false where id = org;
end
$$;
revoke all on function public.finish_guest_upgrade(boolean) from public, anon;
grant execute on function public.finish_guest_upgrade(boolean) to authenticated;

-- Scheduled cleanup (see supabase/expire-guest-data.sql): removes guests older
-- than the cutoff and any demo workspace left without members. Service role / cron only.
create or replace function public.expire_guest_workspaces(older_than interval default interval '24 hours')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from auth.users where is_anonymous is true and created_at < now() - older_than;
  delete from organizations o where o.is_demo and not exists (select 1 from memberships m where m.organization_id = o.id);
end
$$;
revoke all on function public.expire_guest_workspaces(interval) from public, anon, authenticated;
grant execute on function public.expire_guest_workspaces(interval) to service_role;
