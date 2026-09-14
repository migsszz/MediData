-- MediData schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query).
-- Assumes Supabase Auth is used for sign-in; every authenticated user can
-- read/write all records (single shared clinic workspace). Tighten the
-- policies below if you need per-clinician data isolation.

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

alter table patients enable row level security;
alter table encounters enable row level security;
alter table medications enable row level security;

create policy "Authenticated users can read patients"
  on patients for select
  to authenticated
  using (true);

create policy "Authenticated users can insert patients"
  on patients for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update patients"
  on patients for update
  to authenticated
  using (true);

create policy "Authenticated users can delete patients"
  on patients for delete
  to authenticated
  using (true);

create policy "Authenticated users can read encounters"
  on encounters for select
  to authenticated
  using (true);

create policy "Authenticated users can insert encounters"
  on encounters for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update encounters"
  on encounters for update
  to authenticated
  using (true);

create policy "Authenticated users can delete encounters"
  on encounters for delete
  to authenticated
  using (true);

create policy "Authenticated users can read medications"
  on medications for select
  to authenticated
  using (true);

create policy "Authenticated users can insert medications"
  on medications for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update medications"
  on medications for update
  to authenticated
  using (true);

create policy "Authenticated users can delete medications"
  on medications for delete
  to authenticated
  using (true);
