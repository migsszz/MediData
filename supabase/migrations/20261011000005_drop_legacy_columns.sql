-- Finish the move to structured data and organization ownership.
--
-- Safe to run only after 20261011000004 has backfilled observations,
-- encounter_diagnoses and allergies. If you need a rollback path, take a
-- backup before applying this migration: dropped columns can't be restored.

-- Vitals now live in observations; diagnosis in encounter_diagnoses;
-- allergies in allergies.
alter table encounters
  drop column blood_pressure_systolic,
  drop column blood_pressure_diastolic,
  drop column heart_rate,
  drop column temperature_c,
  drop column weight_kg,
  drop column height_cm,
  drop column spo2,
  drop column diagnosis;
alter table patients drop column allergies;

-- The baseline cascaded rows away when their creator's auth user was deleted,
-- which would wipe a clinic's records the day a staff member leaves. Records
-- belong to the organization now; the creator is just attribution.
alter table patients drop constraint if exists patients_created_by_fkey;
alter table patients add constraint patients_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;
alter table encounters drop constraint if exists encounters_created_by_fkey;
alter table encounters add constraint encounters_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;
alter table medications drop constraint if exists medications_created_by_fkey;
alter table medications add constraint medications_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- Search / listing support. Partial indexes: live rows are what we query.
create index patients_name_trgm on patients
  using gin ((first_name || ' ' || last_name) gin_trgm_ops) where deleted_at is null;
create index patients_org_name_idx on patients (organization_id, last_name, first_name, id)
  where deleted_at is null;
create index encounters_org_visit_idx on encounters (organization_id, visit_date desc)
  where deleted_at is null;
create index encounters_patient_visit_idx on encounters (patient_id, visit_date desc)
  where deleted_at is null;
