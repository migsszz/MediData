-- Structured clinical data.
--
--   observation_types  LOINC-coded measurement catalogue with plausible ranges
--   observations       one row per measurement (replaces the fixed vitals columns)
--   allergies          structured per-patient allergies (replaces free text)
--   icd10_codes        small ICD-10 reference set (extend with a bulk import)
--   encounter_diagnoses  coded (or free-text) diagnoses per encounter
--   rxnorm_drugs       small RxNorm reference set (extend with a bulk import)
--   medications.rxcui  optional link to the drug catalogue
--
-- Existing free-text/fixed-column data is backfilled here; the legacy columns
-- are dropped in the next migration.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Reference data (read-only to clients).
-- ---------------------------------------------------------------------------

create table observation_types (
  code text primary key,            -- LOINC
  display text not null,
  unit text not null,               -- UCUM
  min_value numeric not null,
  max_value numeric not null,
  check (min_value < max_value)
);

insert into observation_types (code, display, unit, min_value, max_value) values
  ('8480-6',  'Systolic blood pressure',  'mm[Hg]', 40, 300),
  ('8462-4',  'Diastolic blood pressure', 'mm[Hg]', 20, 200),
  ('8867-4',  'Heart rate',               '/min',   20, 300),
  ('8310-5',  'Body temperature',         'Cel',    25, 45),
  ('59408-5', 'Oxygen saturation (SpO2)', '%',      30, 100),
  ('29463-7', 'Body weight',              'kg',     0.3, 700),
  ('8302-2',  'Body height',              'cm',     20, 280)
on conflict (code) do nothing;

create table icd10_codes (
  code text primary key,
  description text not null
);
create index icd10_codes_description_trgm on icd10_codes using gin (description gin_trgm_ops);

insert into icd10_codes (code, description) values
  ('I10',    'Essential (primary) hypertension'),
  ('E11.9',  'Type 2 diabetes mellitus without complications'),
  ('J30.2',  'Other seasonal allergic rhinitis'),
  ('J00',    'Acute nasopharyngitis [common cold]'),
  ('G43.909','Migraine, unspecified, not intractable'),
  ('E78.5',  'Hyperlipidemia, unspecified'),
  ('J45.909','Unspecified asthma, uncomplicated'),
  ('M54.5',  'Low back pain'),
  ('F41.9',  'Anxiety disorder, unspecified'),
  ('N39.0',  'Urinary tract infection, site not specified'),
  ('Z00.00', 'Encounter for general adult medical examination without abnormal findings'),
  ('Z23',    'Encounter for immunization')
on conflict (code) do nothing;

create table rxnorm_drugs (
  rxcui text primary key,
  name text not null
);
create index rxnorm_drugs_name_trgm on rxnorm_drugs using gin (name gin_trgm_ops);

insert into rxnorm_drugs (rxcui, name) values
  ('29046',  'Lisinopril'),
  ('6809',   'Metformin'),
  ('83367',  'Atorvastatin'),
  ('17767',  'Amlodipine'),
  ('197361', 'Amoxicillin'),
  ('5640',   'Ibuprofen'),
  ('161',    'Acetaminophen'),
  ('7052',   'Morphine'),
  ('36437',  'Sertraline'),
  ('4850',   'Glipizide'),
  ('7646',   'Omeprazole'),
  ('435',    'Albuterol'),
  ('7980',   'Penicillin V')
on conflict (rxcui) do nothing;

alter table observation_types enable row level security;
alter table icd10_codes enable row level security;
alter table rxnorm_drugs enable row level security;
create policy "Anyone signed in can read observation types" on observation_types for select to authenticated using (true);
create policy "Anyone signed in can read ICD-10 codes" on icd10_codes for select to authenticated using (true);
create policy "Anyone signed in can read RxNorm drugs" on rxnorm_drugs for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Clinical tables.
-- ---------------------------------------------------------------------------

create table observations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  organization_id uuid not null default public.current_org_id() references organizations (id) on delete cascade,
  patient_id uuid not null,
  encounter_id uuid,
  type_code text not null references observation_types (code),
  value numeric not null,
  observed_at timestamptz not null default now(),
  foreign key (patient_id, organization_id) references patients (id, organization_id) on delete cascade,
  foreign key (encounter_id, organization_id) references encounters (id, organization_id) on delete cascade
);
create index observations_patient_type_idx on observations (patient_id, type_code, observed_at desc);
create index observations_encounter_idx on observations (encounter_id);
create index observations_org_idx on observations (organization_id);
-- One live value per measurement per encounter.
create unique index observations_one_per_encounter on observations (encounter_id, type_code)
  where encounter_id is not null and deleted_at is null;

create or replace function public.check_observation_range()
returns trigger
language plpgsql
as $$
declare
  t observation_types;
begin
  select * into t from observation_types where code = new.type_code;
  if new.value < t.min_value or new.value > t.max_value then
    raise exception '% of % % is outside the plausible range % to %',
      t.display, new.value, t.unit, t.min_value, t.max_value using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger observations_range before insert or update of value, type_code on observations
  for each row execute function public.check_observation_range();

create table allergies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  organization_id uuid not null default public.current_org_id() references organizations (id) on delete cascade,
  patient_id uuid not null,
  substance text not null check (length(trim(substance)) > 0),
  rxcui text references rxnorm_drugs (rxcui),   -- set when the substance is a catalogued drug
  category text not null default 'drug' check (category in ('drug', 'food', 'environment', 'other')),
  severity text not null default 'moderate' check (severity in ('mild', 'moderate', 'severe')),
  reaction text,
  active boolean not null default true,
  foreign key (patient_id, organization_id) references patients (id, organization_id) on delete cascade
);
create index allergies_patient_idx on allergies (patient_id);
create index allergies_org_idx on allergies (organization_id);

create table encounter_diagnoses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  organization_id uuid not null default public.current_org_id() references organizations (id) on delete cascade,
  encounter_id uuid not null,
  icd10_code text references icd10_codes (code),   -- null = free-text diagnosis
  description text not null check (length(trim(description)) > 0),
  is_primary boolean not null default false,
  foreign key (encounter_id, organization_id) references encounters (id, organization_id) on delete cascade
);
create index encounter_diagnoses_encounter_idx on encounter_diagnoses (encounter_id);
create index encounter_diagnoses_org_idx on encounter_diagnoses (organization_id);
create unique index encounter_diagnoses_one_primary on encounter_diagnoses (encounter_id)
  where is_primary and deleted_at is null;

alter table medications add column rxcui text references rxnorm_drugs (rxcui);

-- Same policies, metadata and audit as the original tables.
do $$
declare
  t text;
begin
  foreach t in array array['observations', 'allergies', 'encounter_diagnoses'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy "Members can read %1$s" on %1$s for select to authenticated
                      using (public.has_role(organization_id, 'viewer'))$p$, t);
    execute format($p$create policy "Clinicians can insert %1$s" on %1$s for insert to authenticated
                      with check (public.has_role(organization_id, 'clinician'))$p$, t);
    execute format($p$create policy "Clinicians can update %1$s" on %1$s for update to authenticated
                      using (public.has_role(organization_id, 'clinician'))
                      with check (public.has_role(organization_id, 'clinician'))$p$, t);
    execute format($p$create policy "Admins can delete %1$s" on %1$s for delete to authenticated
                      using (public.has_role(organization_id, 'admin'))$p$, t);
    execute format('create trigger %1$s_row_metadata before insert or update on %1$s
                      for each row execute function public.row_metadata()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on %1$s
                      for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Backfill from the legacy columns.
-- ---------------------------------------------------------------------------

-- Vitals -> observations (stamped at noon on the visit date).
insert into observations (organization_id, patient_id, encounter_id, type_code, value, observed_at, created_by)
select e.organization_id, e.patient_id, e.id, v.code, v.value, e.visit_date::timestamptz + interval '12 hours', e.created_by
from encounters e
cross join lateral (values
  ('8480-6',  e.blood_pressure_systolic::numeric),
  ('8462-4',  e.blood_pressure_diastolic::numeric),
  ('8867-4',  e.heart_rate::numeric),
  ('8310-5',  e.temperature_c),
  ('59408-5', e.spo2::numeric),
  ('29463-7', e.weight_kg),
  ('8302-2',  e.height_cm)
) as v (code, value)
where v.value is not null
  -- Out-of-range legacy values (typos) are skipped rather than failing the migration.
  and v.value between (select min_value from observation_types where code = v.code)
                  and (select max_value from observation_types where code = v.code);

-- Free-text diagnosis -> primary diagnosis (matched to ICD-10 by description when possible).
insert into encounter_diagnoses (organization_id, encounter_id, icd10_code, description, is_primary, created_by)
select e.organization_id, e.id,
       (select c.code from icd10_codes c where lower(c.description) like '%' || lower(trim(e.diagnosis)) || '%' limit 1),
       trim(e.diagnosis), true, e.created_by
from encounters e
where e.diagnosis is not null and length(trim(e.diagnosis)) > 0;

-- Comma/semicolon separated allergy text -> one row per substance.
insert into allergies (organization_id, patient_id, substance, created_by)
select p.organization_id, p.id, trim(s), p.created_by
from patients p, lateral regexp_split_to_table(coalesce(p.allergies, ''), '\s*[,;]\s*') as s
where length(trim(s)) > 0 and lower(trim(s)) not in ('none', 'nkda', 'n/a', 'no known allergies');

-- Link medications to the drug catalogue where the name matches exactly.
update medications m set rxcui = d.rxcui
from rxnorm_drugs d where lower(d.name) = lower(trim(m.name)) and m.rxcui is null;
