-- Atomic, idempotent encounter creation.
--
-- Saving an encounter writes the encounter, its vitals (observations) and
-- its diagnoses. Doing that as one call means a dropped connection can't
-- leave a half-saved visit, and because the caller supplies the encounter id,
-- replaying the same call (the offline queue retries after reconnecting) is a
-- no-op rather than a duplicate.
--
--   p_vitals      {"<LOINC code>": number, ...}, e.g. {"8480-6": 120, "8462-4": 80}
--   p_diagnoses   [{"icd10_code": "I10" | null, "description": "...", "is_primary": true}, ...]
--
-- SECURITY INVOKER: row-level security, the plausible-range check and the
-- audit triggers all apply exactly as for direct inserts.

create or replace function public.record_encounter(
  p_id uuid,
  p_patient_id uuid,
  p_visit_date date,
  p_reason text,
  p_notes text default null,
  p_vitals jsonb default '{}'::jsonb,
  p_diagnoses jsonb default '[]'::jsonb
)
returns uuid
language plpgsql security invoker
as $$
declare
  org uuid;
  inserted uuid;
  vital record;
  dx jsonb;
begin
  select organization_id into org from patients where id = p_patient_id and deleted_at is null;
  if org is null then
    raise exception 'Patient not found' using errcode = 'no_data_found';
  end if;

  insert into encounters (id, organization_id, patient_id, visit_date, reason, notes)
  values (p_id, org, p_patient_id, p_visit_date, p_reason, nullif(trim(p_notes), ''))
  on conflict (id) do nothing
  returning id into inserted;

  if inserted is null then
    return p_id;  -- already recorded by an earlier attempt
  end if;

  for vital in select key as code, value::numeric as val from jsonb_each_text(coalesce(p_vitals, '{}'::jsonb)) loop
    if vital.val is not null then
      insert into observations (organization_id, patient_id, encounter_id, type_code, value, observed_at)
      values (org, p_patient_id, p_id, vital.code, vital.val, p_visit_date::timestamptz + interval '12 hours');
    end if;
  end loop;

  for dx in select * from jsonb_array_elements(coalesce(p_diagnoses, '[]'::jsonb)) loop
    insert into encounter_diagnoses (organization_id, encounter_id, icd10_code, description, is_primary)
    values (org, p_id, nullif(dx ->> 'icd10_code', ''), trim(dx ->> 'description'),
            coalesce((dx ->> 'is_primary')::boolean, false));
  end loop;

  return p_id;
end
$$;

grant execute on function public.record_encounter(uuid, uuid, date, text, text, jsonb, jsonb) to authenticated;
