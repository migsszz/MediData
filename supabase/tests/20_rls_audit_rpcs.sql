-- Row-level security, roles, audit log and RPC behaviour.
-- Runs as a superuser but switches to the `authenticated` role (so RLS
-- applies) using pg_temp.act_as(). Everything runs in one transaction that
-- is rolled back, so it leaves the database as it found it.
begin;

create function pg_temp.act_as(uid uuid, guest boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claim.is_anonymous', guest::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.act_as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Runs sql and asserts it fails with the given SQLSTATE.
create function pg_temp.expect_error(sql text, expected_state text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    assert sqlstate = expected_state, format('%s: expected %s, got %s (%s)', label, expected_state, sqlstate, sqlerrm);
    return;
  end;
  raise exception '%: expected error % but statement succeeded', label, expected_state;
end $$;

grant execute on all functions in schema pg_temp to public;

do $$
declare
  dr_a constant uuid := '00000000-0000-0000-0000-00000000a001';
  dr_b constant uuid := '00000000-0000-0000-0000-00000000b002';
  guest constant uuid := '00000000-0000-0000-0000-0000000000c3';
  org_a uuid; org_b uuid;
  n int; affected int; rec jsonb; page1 patients; page2 patients;
  new_pid uuid; new_eid uuid; newguest uuid := gen_random_uuid(); second_guest uuid := gen_random_uuid();
begin
  select organization_id into org_a from memberships where user_id = dr_a;
  select organization_id into org_b from memberships where user_id = dr_b;

  -- ---------------------------------------------------------------- isolation
  perform pg_temp.act_as(dr_a);
  assert (select count(*) from patients) = 2, 'A sees only own org patients';
  assert (select count(*) from encounters) = 2 and (select count(*) from observations) = 7, 'A sees own encounters/observations';
  assert (select count(*) from organizations) = 1, 'A sees one organization';

  perform pg_temp.act_as(dr_b);
  assert (select count(*) from patients) = 1, 'B sees only B patient';
  select count(*) into n from patients where organization_id = org_a;
  assert n = 0, 'B cannot read A rows even when asking';
  perform pg_temp.expect_error(format($q$insert into patients (organization_id, first_name, last_name, date_of_birth, sex) values (%L, 'X', 'Y', '2000-01-01', 'male')$q$, org_a),
    '42501', 'B cannot insert into A org');
  update patients set last_name = 'Hacked' where organization_id = org_a;
  get diagnostics affected = row_count;
  assert affected = 0, 'B cannot update A rows';

  perform pg_temp.act_as(null);
  assert (select count(*) from patients) = 0, 'no uid sees nothing';

  -- ------------------------------------------ defaults, ownership, children
  perform pg_temp.act_as(dr_a);
  insert into patients (first_name, last_name, date_of_birth, sex, created_by)
    values ('New', 'Patient', '1990-01-01', 'female', dr_b) returning id into new_pid;
  assert (select organization_id from patients where id = new_pid) = org_a, 'org defaults to caller''s org';
  assert (select created_by from patients where id = new_pid) = dr_a, 'created_by cannot be spoofed';

  insert into encounters (patient_id, visit_date, reason) values (new_pid, current_date, 'Test') returning id into new_eid;
  perform pg_temp.expect_error(format($q$update patients set organization_id = %L where id = %L$q$, org_b, new_pid),
    '23514', 'organization cannot change');
  perform pg_temp.expect_error(format($q$insert into observations (patient_id, encounter_id, type_code, value) values (%L, %L, '8480-6', 900)$q$, new_pid, new_eid),
    '23514', 'implausible vital rejected');
  insert into observations (patient_id, encounter_id, type_code, value) values (new_pid, new_eid, '8480-6', 120);
  perform pg_temp.expect_error(format($q$insert into observations (patient_id, encounter_id, type_code, value) values (%L, %L, '8480-6', 125)$q$, new_pid, new_eid),
    '23505', 'one reading per type per encounter');

  perform pg_temp.act_as(dr_b);
  perform pg_temp.expect_error(format($q$insert into encounters (organization_id, patient_id, visit_date, reason) values (%L, %L, current_date, 'x')$q$, org_b, new_pid),
    '23503', 'encounter cannot attach to another org''s patient');

  -- ------------------------------------------------------------------ roles
  perform pg_temp.act_as(dr_a);
  perform add_member_by_email(org_a, 'dr.b@example.com', 'viewer');
  perform pg_temp.expect_error($q$select add_member_by_email(gen_random_uuid(), 'dr.b@example.com', 'admin')$q$, '42501', 'non-admin cannot add members');

  perform pg_temp.act_as(dr_b);
  select count(*) into n from patients where organization_id = org_a and deleted_at is null;
  assert n = 3, 'viewer can read org A';
  perform pg_temp.expect_error(format($q$insert into patients (organization_id, first_name, last_name, date_of_birth, sex) values (%L, 'V', 'V', '2000-01-01', 'male')$q$, org_a),
    '42501', 'viewer cannot insert');
  update patients set notes = 'x' where organization_id = org_a;
  get diagnostics affected = row_count;
  assert affected = 0, 'viewer cannot update';
  perform pg_temp.expect_error(format($q$select add_member_by_email(%L, 'dr.a@example.com', 'admin')$q$, org_a), '42501', 'viewer cannot manage members');

  perform pg_temp.act_as(dr_a);
  perform add_member_by_email(org_a, 'dr.b@example.com', 'clinician');
  perform pg_temp.act_as(dr_b);
  update patients set notes = 'clinician edit' where id = new_pid;
  get diagnostics affected = row_count;
  assert affected = 1, 'clinician can update';
  update patients set deleted_at = now() where id = new_pid;
  get diagnostics affected = row_count;
  assert affected = 1, 'clinician can archive';
  assert (select deleted_by from patients where id = new_pid) = dr_b, 'archiver recorded';
  delete from patients where id = new_pid;
  get diagnostics affected = row_count;
  assert affected = 0, 'clinician cannot hard delete';
  update patients set deleted_at = null where id = new_pid;
  assert (select deleted_by from patients where id = new_pid) is null, 'restore clears deleted_by';

  -- ----------------------------------------------------------------- audit
  perform pg_temp.act_as(dr_b);
  select count(*) into n from audit_log;
  assert n = 0, 'clinician cannot read the audit log';
  perform pg_temp.expect_error($q$insert into audit_log (organization_id, table_name, record_id, action) values (gen_random_uuid(), 't', gen_random_uuid(), 'insert')$q$, '42501', 'clients cannot write audit rows');

  perform pg_temp.act_as(dr_a);
  assert (select count(*) from audit_log where record_id = new_pid and action = 'insert') = 1, 'insert audited';
  assert (select count(*) from audit_log where record_id = new_pid and action = 'archive' and actor = dr_b) = 1, 'archive audited with actor';
  assert (select count(*) from audit_log where record_id = new_pid and action = 'restore') = 1, 'restore audited';
  assert (select count(*) from audit_log where record_id = new_pid and action = 'update') >= 1, 'update audited';
  assert (select old_data ->> 'notes' from audit_log where record_id = new_pid and action = 'archive') = 'clinician edit', 'before-snapshot kept';
  perform pg_temp.expect_error($q$update audit_log set action = 'insert'$q$, '42501', 'audit rows cannot be updated');
  perform pg_temp.expect_error($q$delete from audit_log$q$, '42501', 'audit rows cannot be deleted');

  perform pg_temp.act_as_admin();
  perform pg_temp.expect_error($q$update audit_log set action = 'insert'$q$, '42501', 'even superuser needs purge function');
  perform set_config('role', 'service_role', true);
  select purge_audit_log(now() - interval '100 years') into n;
  assert n = 0, 'purge only removes old entries';
  perform pg_temp.act_as_admin();

  -- ------------------------------------------------------ last-admin guard
  perform pg_temp.act_as(dr_a);
  perform pg_temp.expect_error(format($q$delete from memberships where organization_id = %L and user_id = %L$q$, org_a, dr_a),
    '23514', 'cannot remove the last admin');
  perform pg_temp.expect_error(format($q$update memberships set role = 'viewer' where organization_id = %L and user_id = %L$q$, org_a, dr_a),
    '23514', 'cannot demote the last admin');

  -- admin hard delete cascades
  delete from patients where id = new_pid;
  get diagnostics affected = row_count;
  assert affected = 1, 'admin can hard delete';
  assert not exists (select 1 from encounters where id = new_eid), 'delete cascades to encounters';
  assert not exists (select 1 from observations where encounter_id = new_eid), 'delete cascades to observations';

  -- ------------------------------------------------- search + pagination
  perform pg_temp.act_as(dr_a);
  select * into page1 from search_patients(org_a, null, 1);
  assert page1.last_name = 'Adams', 'first page alphabetical';
  select * into page2 from search_patients(org_a, null, 1, page1.last_name, page1.first_name, page1.id);
  assert page2.last_name = 'Brown', 'second page via keyset';
  assert not exists (select 1 from search_patients(org_a, null, 1, page2.last_name, page2.first_name, page2.id)), 'no third page';
  assert (select count(*) from search_patients(org_a, 'bro')) = 1, 'substring search';
  assert (select count(*) from search_patients(org_a, 'ANN ADA')) = 1, 'case-insensitive full-name search';
  assert (select count(*) from search_patients(org_b, null)) = 0, 'cannot page through another org';

  -- ---------------------------------------------------- dashboard + cohorts
  rec := dashboard_stats(org_a);
  assert (rec ->> 'total_patients')::int = 2, 'dashboard total patients';
  assert jsonb_array_length(rec -> 'encounters_by_month') = 6, 'six months of buckets';
  assert (rec ->> 'hypertension_count')::int = 1, 'hypertension cohort (Ann, 150/95)';
  assert (select count(*) from cohort_overdue_followups(org_a, 12) where last_name = 'Brown') = 1, 'Bob (no visits) overdue';
  assert not exists (select 1 from cohort_overdue_followups(org_a, 12) where last_name = 'Adams'), 'Ann recently seen';
  assert (rec -> 'top_diagnoses' -> 0 ->> 'label') is not null, 'top diagnoses present';
  perform pg_temp.act_as(dr_b);
  assert (dashboard_stats(org_a) ->> 'total_patients')::int = 2, 'org member (clinician) sees org A stats';
  perform pg_temp.act_as(guest, true);
  assert (dashboard_stats(org_a) ->> 'total_patients')::int = 0, 'non-member gets empty stats';

  -- ------------------------------------------------------------ demo flow
  perform pg_temp.act_as_admin();
  insert into auth.users (id, is_anonymous) values (newguest, true);   -- trigger creates a demo org
  assert (select is_demo from organizations o join memberships m on m.organization_id = o.id where m.user_id = newguest), 'new guest gets demo org';

  perform pg_temp.act_as(dr_a);
  perform pg_temp.expect_error($q$select seed_demo_workspace()$q$, '42501', 'real accounts cannot seed demo data');

  perform pg_temp.act_as(newguest, true);
  perform seed_demo_workspace();
  perform seed_demo_workspace();  -- idempotent
  assert (select count(*) from patients) = 5, 'five demo patients (once)';
  assert (select count(*) from patients where is_seed) = 5, 'demo patients flagged is_seed';
  assert (select count(*) from encounters) >= 10 and (select count(*) from observations) >= 70, 'demo encounters + vitals';
  assert (select count(*) from allergies) = 3, 'demo allergies';
  insert into patients (first_name, last_name, date_of_birth, sex) values ('Mine', 'Own', '2001-01-01', 'male');
  assert (select is_demo from organizations), 'still a demo workspace while anonymous';
  perform pg_temp.act_as_admin();
  assert (select count(*) from audit_log where organization_id = (select organization_id from memberships where user_id = newguest)) = 0, 'demo orgs are not audited';

  -- Order 1: email confirmation pending, client cleans up first, upgrade lands later.
  perform pg_temp.act_as(newguest, true);
  perform finish_guest_upgrade(true);
  assert (select count(*) from patients) = 1 and (select last_name from patients) = 'Own', 'seed data dropped, own data kept';
  perform pg_temp.act_as_admin();
  update auth.users set is_anonymous = false, email = 'upgraded@example.com' where id = newguest;
  assert not (select is_demo from organizations o join memberships m on m.organization_id = o.id where m.user_id = newguest), 'workspace promoted by trigger';
  assert not (select pending_demo_cleanup from organizations o join memberships m on m.organization_id = o.id where m.user_id = newguest), 'nothing left to clean, no stale flag';
  perform pg_temp.act_as(newguest, false);
  perform finish_guest_upgrade(false);
  assert (select count(*) from patients) = 1, 'late call cannot wipe a real practice';

  -- Order 2: upgrade lands first, then the client applies the choice (discard everything).
  perform pg_temp.act_as_admin();
  insert into auth.users (id, is_anonymous) values (second_guest, true);
  perform pg_temp.act_as(second_guest, true);
  perform seed_demo_workspace();
  insert into patients (first_name, last_name, date_of_birth, sex) values ('Throw', 'Away', '2001-01-01', 'male');
  perform pg_temp.act_as_admin();
  update auth.users set is_anonymous = false, email = 'second@example.com' where id = second_guest;
  assert (select pending_demo_cleanup from organizations o join memberships m on m.organization_id = o.id where m.user_id = second_guest), 'cleanup flagged while seed rows remain';
  perform pg_temp.act_as(second_guest, false);
  perform finish_guest_upgrade(false);
  assert (select count(*) from patients) = 0, 'start fresh removes seed and own data';
  assert not (select pending_demo_cleanup from organizations o join memberships m on m.organization_id = o.id where m.user_id = second_guest), 'cleanup is one-shot';

  -- --------------------------------------------------------- guest expiry
  perform pg_temp.act_as_admin();
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true);
  perform set_config('role', 'service_role', true);
  perform expire_guest_workspaces(interval '-1 second');  -- now() is frozen inside a transaction
  perform pg_temp.act_as_admin();
  assert not exists (select 1 from auth.users where is_anonymous), 'guests expired';
  assert exists (select 1 from auth.users where id = newguest), 'upgraded user (no longer anonymous) is not expired';
  assert not exists (select 1 from organizations where is_demo), 'orphaned demo orgs removed';
  assert exists (select 1 from patients where last_name = 'Own'), 'upgraded (non-demo) workspace and its data survive expiry';
  assert exists (select 1 from organizations where id = org_a), 'real organizations untouched';
end $$;

rollback;
