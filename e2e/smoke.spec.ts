import { expect, test, Page } from '@playwright/test';
import { mockSupabase, PATIENTS } from './mock-supabase';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.fill('#login-email', 'dr@example.com');
  await page.fill('#login-password', 'password');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('dashboard shows server-computed stats and cohorts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const server = await mockSupabase(page);
  await signIn(page);

  // Chart.js is registered lazily with the dashboard route; a missing registration only shows up at draw time.
  await expect(page.locator('canvas')).toHaveCount(3);
  await expect.poll(() => page.locator('canvas').first().evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    return d.some((v, i) => i % 4 === 3 && v > 0); // any non-transparent pixel
  })).toBe(true);
  expect(errors).toEqual([]);

  await expect(page.locator('.stat-value', { hasText: '46' })).toBeVisible();
  await expect(page.getByText('Latest blood pressure ≥ 140/90')).toBeVisible();
  expect(server.rpc['dashboard_stats']).toHaveLength(1);
  expect(server.rpc['dashboard_stats'][0]).toEqual({ p_org: '11111111-1111-1111-1111-111111111111' });
});

test('patient search is done by the server and the chart shows safety banners', async ({ page }) => {
  const server = await mockSupabase(page);
  await signIn(page);

  await page.getByRole('link', { name: /patients/i }).first().click();
  await expect(page.getByRole('row')).toHaveCount(3); // header + 2 patients

  await page.getByLabel('Search patients by name').fill('bro');
  await expect(page.getByRole('row')).toHaveCount(2);
  expect(server.rpc['search_patients'].at(-1)).toMatchObject({ p_query: 'bro', p_limit: 25 });

  await page.getByRole('row', { name: /Brown/ }).click();
  await expect(page.getByRole('heading', { name: 'Bob Brown' })).toBeVisible();
  const rail = page.getByLabel('Patient safety summary');
  await expect(rail).toContainText('Penicillin');
  await expect(rail).toContainText('Hives');
  await expect(rail).toContainText('Lisinopril');
  await expect(rail).toContainText('10mg');
  await expect(page.getByLabel('Vitals trends')).toContainText('150/95');
});

test('implausible vitals are blocked before anything is sent', async ({ page }) => {
  const server = await mockSupabase(page);
  await signIn(page);
  await page.goto(`/patients/${PATIENTS[1].id}`);

  await page.getByRole('button', { name: 'New encounter' }).click();
  await page.fill('#enc-reason', 'Checkup');
  await page.fill('#vital-systolic', '500');
  await page.fill('#vital-diastolic', '80');
  await page.getByRole('button', { name: 'Save encounter' }).click();

  await expect(page.getByText('Systolic BP should be between 40 and 300.')).toBeVisible();
  expect(server.encounterIds).toHaveLength(0);
});

test('an encounter saved while offline syncs exactly once when the connection returns', async ({ page, context }) => {
  const server = await mockSupabase(page);
  await signIn(page);
  await page.goto(`/patients/${PATIENTS[1].id}`);
  await expect(page.getByRole('heading', { name: 'Bob Brown' })).toBeVisible();

  await page.getByRole('button', { name: 'New encounter' }).click();
  await page.fill('#enc-reason', 'Acute symptoms');
  await page.fill('#vital-systolic', '120');
  await page.fill('#vital-diastolic', '80');

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save encounter' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'saved on this device' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sync status/ })).toContainText('Offline');
  expect(server.encounterIds).toHaveLength(0);

  await context.setOffline(false);
  await expect.poll(() => server.encounterIds.length).toBe(1);
  await expect(page.getByRole('button', { name: /Sync status/ })).toBeHidden();

  const call = server.rpc['record_encounter'][0];
  expect(call).toMatchObject({
    p_patient_id: PATIENTS[1].id,
    p_reason: 'Acute symptoms',
    p_vitals: { '8480-6': 120, '8462-4': 80 }
  });
  expect(call.p_id).toMatch(/^[0-9a-f-]{36}$/);
});

test('the vitals card flags an out-of-range reading and shades the typical range', async ({ page }) => {
  await mockSupabase(page);
  await signIn(page);
  await page.goto(`/patients/${PATIENTS[1].id}`);
  const card = page.getByLabel('Vitals trends');
  await expect(card).toContainText('150/95');
  await expect(card.getByText('High')).toBeVisible();
  await expect(card.locator('svg rect')).toHaveCount(1); // the reference-range band
});
