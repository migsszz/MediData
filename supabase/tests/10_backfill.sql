-- The legacy fixture (tests/01_legacy_fixture.sql) was migrated correctly.
do $$
declare
  org_a uuid; org_b uuid; org_guest uuid; org_legacy uuid;
begin
  select organization_id into org_a from memberships where user_id = '00000000-0000-0000-0000-00000000a001';
  select organization_id into org_b from memberships where user_id = '00000000-0000-0000-0000-00000000b002';
  select organization_id into org_guest from memberships where user_id = '00000000-0000-0000-0000-0000000000c3';
  select id into org_legacy from organizations where name = 'Unassigned (legacy)';

  assert org_a is not null and org_b is not null and org_a <> org_b, 'each legacy user got a personal org';
  assert (select role from memberships where organization_id = org_a and user_id = '00000000-0000-0000-0000-00000000a001') = 'admin', 'owner is admin';
  assert (select is_demo from organizations where id = org_guest), 'anonymous user org is a demo org';
  assert not (select is_demo from organizations where id = org_a), 'real user org is not demo';

  assert (select count(*) from patients where organization_id = org_a) = 2, 'A has 2 patients';
  assert (select count(*) from patients where organization_id = org_b) = 1, 'B has 1 patient';
  assert (select count(*) from patients where organization_id = org_legacy) = 1, 'orphan row kept in legacy org';
  assert (select count(*) from memberships where organization_id = org_legacy) = 0, 'legacy org has no members';
  assert (select organization_id from encounters where id = '20000000-0000-0000-0000-000000000001') = org_a, 'encounter follows its patient';

  -- vitals -> observations: 7 from encounter 1; encounter 2's 500 mmHg typo is skipped
  assert (select count(*) from observations where encounter_id = '20000000-0000-0000-0000-000000000001') = 7, '7 observations backfilled';
  assert (select count(*) from observations where encounter_id = '20000000-0000-0000-0000-000000000002') = 0, 'out-of-range legacy value skipped';
  assert (select value from observations where encounter_id = '20000000-0000-0000-0000-000000000001' and type_code = '29463-7') = 70.5, 'weight preserved';

  -- diagnosis -> encounter_diagnoses
  assert (select icd10_code from encounter_diagnoses where encounter_id = '20000000-0000-0000-0000-000000000001') = 'I10', 'diagnosis matched to ICD-10';
  assert (select icd10_code from encounter_diagnoses where encounter_id = '20000000-0000-0000-0000-000000000002') is null, 'unknown diagnosis kept as free text';
  assert (select description from encounter_diagnoses where encounter_id = '20000000-0000-0000-0000-000000000002') = 'Mystery condition', 'free text preserved';

  -- allergies text -> rows
  assert (select count(*) from allergies where patient_id = '10000000-0000-0000-0000-000000000001') = 2, 'two allergies split out';
  assert (select count(*) from allergies where patient_id = '10000000-0000-0000-0000-000000000002') = 0, '"None" is not an allergy';

  assert (select rxcui from medications where id = '30000000-0000-0000-0000-000000000001') = '29046', 'medication linked to RxNorm case-insensitively';

  -- legacy columns are gone
  assert not exists (select 1 from information_schema.columns where table_name = 'encounters' and column_name in ('heart_rate', 'diagnosis')), 'vitals columns dropped';
  assert not exists (select 1 from information_schema.columns where table_name = 'patients' and column_name = 'allergies'), 'allergies column dropped';
end $$;
