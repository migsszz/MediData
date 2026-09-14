-- MediData schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- Two kinds of Supabase Auth users hit these tables:
--   - Real (non-anonymous) users: staff accounts. Every real user can
--     read/write every record (single shared clinic workspace). Tighten
--     the policies below if you need per-clinician data isolation.
--   - Anonymous users (Supabase's signInAnonymously): guests trying the
--     demo. Each guest is scoped to only the rows they created
--     (created_by = auth.uid()), so demo sessions can never see or touch
--     real patient data or each other's demo data. This requires
--     "Allow anonymous sign-ins" to be enabled for the project
--     (Authentication > Sign In / Providers, or `enable_anonymous_sign_ins`
--     in supabase/config.toml for local dev).

create extension if not exists "pgcrypto";

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  first_name text not null,
  last_name text not null,
  date_of_birth date not null,
  sex text not null check (sex in ('male', 'female', 'other', 'unknown')),
  phone text,
  email text,
  address text,
  blood_type text,
  allergies text,
  notes text
);

create table if not exists encounters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  patient_id uuid not null references patients (id) on delete cascade,
  visit_date date not null,
  reason text not null,
  diagnosis text,
  notes text,
  blood_pressure_systolic int,
  blood_pressure_diastolic int,
  heart_rate int,
  temperature_c numeric(4, 1),
  weight_kg numeric(5, 1),
  height_cm numeric(5, 1),
  spo2 int
);

create table if not exists medications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  patient_id uuid not null references patients (id) on delete cascade,
  name text not null,
  dosage text not null,
  frequency text not null,
  start_date date not null,
  end_date date,
  active boolean not null default true
);

create index if not exists encounters_patient_id_idx on encounters (patient_id);
create index if not exists medications_patient_id_idx on medications (patient_id);

-- True for guest/demo sessions created via supabase.auth.signInAnonymously().
-- Supabase stamps `is_anonymous` on the JWT for these sessions; real users
-- (including ones upgraded from a guest session via updateUser) don't have
-- it set to true.
create or replace function public.is_guest()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

alter table patients enable row level security;
alter table encounters enable row level security;
alter table medications enable row level security;

-- Drop the original (pre-guest-mode) permissive policies if this script was
-- run before — otherwise they'd keep granting guests full access alongside
-- the new restricted ones below.
drop policy if exists "Authenticated users can read patients" on patients;
drop policy if exists "Authenticated users can insert patients" on patients;
drop policy if exists "Authenticated users can update patients" on patients;
drop policy if exists "Authenticated users can delete patients" on patients;
drop policy if exists "Authenticated users can read encounters" on encounters;
drop policy if exists "Authenticated users can insert encounters" on encounters;
drop policy if exists "Authenticated users can update encounters" on encounters;
drop policy if exists "Authenticated users can delete encounters" on encounters;
drop policy if exists "Authenticated users can read medications" on medications;
drop policy if exists "Authenticated users can insert medications" on medications;
drop policy if exists "Authenticated users can update medications" on medications;
drop policy if exists "Authenticated users can delete medications" on medications;

-- Also drop-and-recreate the current policies, so this script stays
-- re-runnable (e.g. after pulling schema changes) instead of erroring on
-- "policy already exists".
drop policy if exists "Read patients: staff see all, guests see their own" on patients;
drop policy if exists "Insert patients: guests must own the row" on patients;
drop policy if exists "Update patients: staff update all, guests their own" on patients;
drop policy if exists "Delete patients: staff delete all, guests their own" on patients;
drop policy if exists "Read encounters: staff see all, guests see their own" on encounters;
drop policy if exists "Insert encounters: guests must own the row" on encounters;
drop policy if exists "Update encounters: staff update all, guests their own" on encounters;
drop policy if exists "Delete encounters: staff delete all, guests their own" on encounters;
drop policy if exists "Read medications: staff see all, guests see their own" on medications;
drop policy if exists "Insert medications: guests must own the row" on medications;
drop policy if exists "Update medications: staff update all, guests their own" on medications;
drop policy if exists "Delete medications: staff delete all, guests their own" on medications;

create policy "Read patients: staff see all, guests see their own"
  on patients for select
  to authenticated
  using (not public.is_guest() or created_by = auth.uid());

create policy "Insert patients: guests must own the row"
  on patients for insert
  to authenticated
  with check (not public.is_guest() or created_by = auth.uid());

create policy "Update patients: staff update all, guests their own"
  on patients for update
  to authenticated
  using (not public.is_guest() or created_by = auth.uid());

create policy "Delete patients: staff delete all, guests their own"
  on patients for delete
  to authenticated
  using (not public.is_guest() or created_by = auth.uid());

create policy "Read encounters: staff see all, guests see their own"
  on encounters for select
  to authenticated
  using (not public.is_guest() or created_by = auth.uid());

create policy "Insert encounters: guests must own the row"
  on encounters for insert
  to authenticated
  with check (not public.is_guest() or created_by = auth.uid());

create policy "Update encounters: staff update all, guests their own"
  on encounters for update
  to authenticated
  using (not public.is_guest() or created_by = auth.uid());

create policy "Delete encounters: staff delete all, guests their own"
  on encounters for delete
  to authenticated
  using (not public.is_guest() or created_by = auth.uid());

create policy "Read medications: staff see all, guests see their own"
  on medications for select
  to authenticated
  using (not public.is_guest() or created_by = auth.uid());

create policy "Insert medications: guests must own the row"
  on medications for insert
  to authenticated
  with check (not public.is_guest() or created_by = auth.uid());

create policy "Update medications: staff update all, guests their own"
  on medications for update
  to authenticated
  using (not public.is_guest() or created_by = auth.uid());

create policy "Delete medications: staff delete all, guests their own"
  on medications for delete
  to authenticated
  using (not public.is_guest() or created_by = auth.uid());
