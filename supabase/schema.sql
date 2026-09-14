-- MediData schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- Data is isolated per practitioner: every authenticated user (real
-- practitioner or anonymous guest alike) can only see and modify the
-- patients/encounters/medications they themselves created
-- (created_by = auth.uid()). A practitioner can't see another
-- practitioner's patients, and no one can see guest demo data or vice
-- versa — there is currently no shared/clinic-wide visibility at all.
--
-- Guests (Supabase's signInAnonymously(), used by the "Try the demo"
-- button) work the same way: they get their own created_by, so their
-- seeded demo rows are automatically isolated like anyone else's data.
-- This requires "Allow anonymous sign-ins" to be enabled for the project
-- (Authentication > Sign In / Providers, or `enable_anonymous_sign_ins`
-- in supabase/config.toml for local dev).
--
-- NOTE: this relies on created_by always being set by the app on insert.
-- Any pre-existing row with a null created_by (e.g. from before this
-- policy existed) becomes invisible to everyone under these policies —
-- back-fill created_by for those rows manually if you have any.
--
-- is_seed marks rows inserted by DemoDataService's seeding (as opposed to
-- rows a guest adds themselves during their session). The app uses it to
-- block guests from deleting the seeded sample rows, and to always drop
-- seed rows (never carrying them into a real account) when a guest
-- upgrades — see UpgradeAccountDialogComponent. Not enforced at the RLS
-- level since it's a UX/product concern, not a security boundary: it's
-- always the guest's own data either way.
--
-- created_by cascades on delete: abandoned anonymous guest accounts pile up
-- in auth.users indefinitely otherwise (there's no client-side moment where
-- a guest who never returns triggers any cleanup). See
-- supabase/expire-guest-data.sql for the scheduled job that deletes old
-- ones — cascading here is what lets that job just delete the auth.users
-- row and have their patients/encounters/medications disappear with it.

create extension if not exists "pgcrypto";

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete cascade,
  is_seed boolean not null default false,
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
  created_by uuid references auth.users (id) on delete cascade,
  is_seed boolean not null default false,
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
  created_by uuid references auth.users (id) on delete cascade,
  is_seed boolean not null default false,
  patient_id uuid not null references patients (id) on delete cascade,
  name text not null,
  dosage text not null,
  frequency text not null,
  start_date date not null,
  end_date date,
  active boolean not null default true
);

-- Idempotent for existing databases created before is_seed existed.
alter table patients add column if not exists is_seed boolean not null default false;
alter table encounters add column if not exists is_seed boolean not null default false;
alter table medications add column if not exists is_seed boolean not null default false;

-- Idempotent for existing databases created before created_by cascaded.
-- Needed so supabase/expire-guest-data.sql can delete an abandoned guest's
-- auth.users row directly and have their patients/encounters/medications
-- disappear with it, instead of the delete failing on a foreign key or
-- (with "set null") leaving orphaned rows RLS would hide but never remove.
alter table patients drop constraint if exists patients_created_by_fkey;
alter table patients add constraint patients_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete cascade;
alter table encounters drop constraint if exists encounters_created_by_fkey;
alter table encounters add constraint encounters_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete cascade;
alter table medications drop constraint if exists medications_created_by_fkey;
alter table medications add constraint medications_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete cascade;

create index if not exists encounters_patient_id_idx on encounters (patient_id);
create index if not exists medications_patient_id_idx on medications (patient_id);

alter table patients enable row level security;
alter table encounters enable row level security;
alter table medications enable row level security;

-- Drop every policy name used by earlier versions of this script, so it
-- stays safely re-runnable regardless of which version you last applied.
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

-- The old staff/guest split relied on this to grant staff full access; no
-- longer needed now that every user (staff or guest) is scoped the same way.
drop function if exists public.is_guest();

drop policy if exists "Users can read their own patients" on patients;
drop policy if exists "Users can insert their own patients" on patients;
drop policy if exists "Users can update their own patients" on patients;
drop policy if exists "Users can delete their own patients" on patients;
drop policy if exists "Users can read their own encounters" on encounters;
drop policy if exists "Users can insert their own encounters" on encounters;
drop policy if exists "Users can update their own encounters" on encounters;
drop policy if exists "Users can delete their own encounters" on encounters;
drop policy if exists "Users can read their own medications" on medications;
drop policy if exists "Users can insert their own medications" on medications;
drop policy if exists "Users can update their own medications" on medications;
drop policy if exists "Users can delete their own medications" on medications;

create policy "Users can read their own patients"
  on patients for select
  to authenticated
  using (created_by = auth.uid());

create policy "Users can insert their own patients"
  on patients for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Users can update their own patients"
  on patients for update
  to authenticated
  using (created_by = auth.uid());

create policy "Users can delete their own patients"
  on patients for delete
  to authenticated
  using (created_by = auth.uid());

create policy "Users can read their own encounters"
  on encounters for select
  to authenticated
  using (created_by = auth.uid());

create policy "Users can insert their own encounters"
  on encounters for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Users can update their own encounters"
  on encounters for update
  to authenticated
  using (created_by = auth.uid());

create policy "Users can delete their own encounters"
  on encounters for delete
  to authenticated
  using (created_by = auth.uid());

create policy "Users can read their own medications"
  on medications for select
  to authenticated
  using (created_by = auth.uid());

create policy "Users can insert their own medications"
  on medications for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Users can update their own medications"
  on medications for update
  to authenticated
  using (created_by = auth.uid());

create policy "Users can delete their own medications"
  on medications for delete
  to authenticated
  using (created_by = auth.uid());
