-- record_encounter: atomic, idempotent, and subject to RLS and range checks.
begin;
do $$
declare
  dr_a constant uuid := '00000000-0000-0000-0000-00000000a001';
  dr_b constant uuid := '00000000-0000-0000-0000-00000000b002';
  ann constant uuid := '10000000-0000-0000-0000-000000000001';
  eid constant uuid := gen_random_uuid();
  n int;
begin
  perform set_config('request.jwt.claim.sub', dr_a::text, true);
  perform set_config('role', 'authenticated', true);

  perform record_encounter(eid, ann, current_date, 'Checkup', 'ok',
    '{"8480-6": 118, "8462-4": 76, "8867-4": 64}'::jsonb,
    '[{"icd10_code":"I10","description":"Essential (primary) hypertension","is_primary":true},{"description":"Sore knee","is_primary":false}]'::jsonb);
  assert (select count(*) from observations where encounter_id = eid) = 3, 'three vitals saved';
  assert (select count(*) from encounter_diagnoses where encounter_id = eid) = 2, 'two diagnoses saved';

  -- replaying the same id (offline retry) changes nothing
  perform record_encounter(eid, ann, current_date, 'Checkup', 'ok', '{"8480-6": 118}'::jsonb, '[]'::jsonb);
  assert (select count(*) from encounters where id = eid) = 1, 'no duplicate encounter';
  assert (select count(*) from observations where encounter_id = eid) = 3, 'no duplicate vitals';

  -- implausible vital rolls the whole encounter back
  begin
    perform record_encounter(gen_random_uuid(), ann, current_date, 'Bad', null, '{"8480-6": 999}'::jsonb, '[]'::jsonb);
    raise exception 'should have failed';
  exception when check_violation then null;
  end;
  select count(*) into n from encounters where reason = 'Bad';
  assert n = 0, 'failed call leaves no partial encounter';

  -- another org's patient is invisible
  perform set_config('request.jwt.claim.sub', dr_b::text, true);
  begin
    perform record_encounter(gen_random_uuid(), ann, current_date, 'Nope');
    raise exception 'should have failed';
  exception when no_data_found then null;
  end;
end $$;
rollback;
