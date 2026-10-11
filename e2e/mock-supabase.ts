import type { Page, Route } from '@playwright/test';

export const ORG = '11111111-1111-1111-1111-111111111111';
export const UID = '22222222-2222-2222-2222-222222222222';

const patient = (id: string, first: string, last: string, extra: object = {}) => ({
  id, organization_id: ORG, first_name: first, last_name: last, date_of_birth: '1980-05-01', sex: 'female',
  phone: null, email: null, address: null, blood_type: 'O+', notes: null, is_seed: false,
  created_at: '2026-01-01T00:00:00Z', created_by: UID, updated_at: '2026-01-01T00:00:00Z', updated_by: null,
  deleted_at: null, deleted_by: null, ...extra
});

export const PATIENTS = [
  patient('aaaaaaaa-0000-0000-0000-000000000001', 'Ann', 'Adams'),
  patient('aaaaaaaa-0000-0000-0000-000000000002', 'Bob', 'Brown', { sex: 'male' })
];

const meta = { created_at: '2026-01-01T00:00:00Z', created_by: UID, updated_at: '2026-01-01T00:00:00Z', updated_by: null, deleted_at: null, deleted_by: null, organization_id: ORG };

export interface MockState {
  /** Every body POSTed to a given RPC, in order. */
  rpc: Record<string, any[]>;
  /** Number of times the server "saw" record_encounter with each id. */
  encounterIds: string[];
}

/** Stands in for Supabase Auth + PostgREST. Returns state the test can assert on. */
export async function mockSupabase(page: Page): Promise<MockState> {
  const state: MockState = { rpc: {}, encounterIds: [] };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

  const session = {
    access_token: 'fake.access.token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'fake-refresh',
    user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'dr@example.com', is_anonymous: false, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  };

  await page.route('http://localhost:54321/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;

    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }
    if (path.startsWith('/auth/v1/token')) return json(route, session);
    if (path.startsWith('/auth/v1/user')) return json(route, session.user);
    if (path.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });

    if (path.startsWith('/rest/v1/rpc/')) {
      const name = path.split('/').pop()!;
      const body = req.postDataJSON() ?? {};
      (state.rpc[name] ??= []).push(body);
      switch (name) {
        case 'dashboard_stats':
          return json(route, {
            total_patients: 2, encounters_this_month: 3, average_age: 46, active_medications: 1,
            encounters_by_month: [0, 1, 2, 3, 4, 5].map((i) => ({ month: `2026-0${i + 5 > 9 ? 9 : i + 5}-01`, count: i })),
            sex_distribution: [{ sex: 'female', count: 1 }, { sex: 'male', count: 1 }],
            top_diagnoses: [{ label: 'Essential (primary) hypertension', code: 'I10', count: 2 }],
            hypertension_count: 1, overdue_followup_count: 1
          });
        case 'search_patients': {
          const q = String(body.p_query ?? '').toLowerCase();
          return json(route, PATIENTS.filter((p) => !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)));
        }
        case 'record_encounter':
          state.encounterIds.push(body.p_id);
          return json(route, body.p_id);
        default:
          return json(route, []);
      }
    }

    const table = path.replace('/rest/v1/', '');
    const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    switch (table) {
      case 'memberships':
        return json(route, [{ organization_id: ORG, user_id: UID, role: 'admin', created_at: '2026-01-01T00:00:00Z' }]);
      case 'organizations':
        return json(route, [{ id: ORG, name: 'My practice', is_demo: false, created_at: '2026-01-01T00:00:00Z' }]);
      case 'patients': {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const found = PATIENTS.find((p) => p.id === id);
        return wantsObject ? json(route, found ?? null) : json(route, found ? [found] : PATIENTS);
      }
      case 'allergies':
        return json(route, [{ ...meta, id: 'al-1', patient_id: PATIENTS[1].id, substance: 'Penicillin', rxcui: null, category: 'drug', severity: 'severe', reaction: 'Hives', active: true }]);
      case 'medications':
        return json(route, [{ ...meta, id: 'm-1', patient_id: PATIENTS[1].id, is_seed: false, name: 'Lisinopril', rxcui: '29046', dosage: '10mg', frequency: 'Once daily', start_date: '2026-01-01', end_date: null, active: true }]);
      case 'encounters':
        return json(route, [{ ...meta, id: 'e-1', patient_id: PATIENTS[1].id, is_seed: false, visit_date: '2026-09-01', reason: 'Checkup', notes: 'All well' }]);
      case 'encounter_diagnoses':
        return json(route, [{ ...meta, id: 'd-1', encounter_id: 'e-1', icd10_code: 'I10', description: 'Essential (primary) hypertension', is_primary: true }]);
      case 'observations':
        return json(route, [
          { ...meta, id: 'o-1', patient_id: PATIENTS[1].id, encounter_id: 'e-1', type_code: '8480-6', value: 150, observed_at: '2026-09-01T12:00:00Z' },
          { ...meta, id: 'o-2', patient_id: PATIENTS[1].id, encounter_id: 'e-1', type_code: '8462-4', value: 95, observed_at: '2026-09-01T12:00:00Z' }
        ]);
      default:
        return json(route, []);
    }
  });

  return state;
}
