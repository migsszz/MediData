-- Rows as the pre-redesign app (baseline schema only) would have stored them.
-- Applied between migration 1 and 2 to prove the backfill works.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'dr.a@example.com'),
  ('00000000-0000-0000-0000-00000000b002', 'dr.b@example.com');
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000c3', null, true);

insert into patients (id, created_by, first_name, last_name, date_of_birth, sex, allergies) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', 'Ann', 'Adams', '1980-05-01', 'female', 'Penicillin, Latex'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000a001', 'Bob', 'Brown', '1970-02-02', 'male', 'None'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000b002', 'Cy', 'Clark', '1990-03-03', 'male', null),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000c3', 'Guest', 'Person', '2000-01-01', 'other', null),
  ('10000000-0000-0000-0000-000000000005', null, 'Orphan', 'Row', '1999-09-09', 'unknown', null);

insert into encounters (id, created_by, patient_id, visit_date, reason, diagnosis,
                        blood_pressure_systolic, blood_pressure_diastolic, heart_rate, temperature_c, weight_kg, height_cm, spo2) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', '10000000-0000-0000-0000-000000000001',
   '2026-09-01', 'Checkup', 'Hypertension', 150, 95, 72, 36.8, 70.5, 170, 98),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000a001', '10000000-0000-0000-0000-000000000001',
   '2026-06-01', 'Follow up', 'Mystery condition', 500, null, null, null, null, null, null);

insert into medications (id, created_by, patient_id, name, dosage, frequency, start_date) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', '10000000-0000-0000-0000-000000000001',
   'lisinopril', '10mg', 'daily', '2026-01-01');
