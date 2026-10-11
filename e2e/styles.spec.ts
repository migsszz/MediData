import { expect, test, Page } from '@playwright/test';
import { mockSupabase } from './mock-supabase';

const theme = (page: Page) => page.evaluate(() => ({
  theme: document.documentElement.getAttribute('data-theme'),
  style: document.documentElement.getAttribute('data-style'),
  font: getComputedStyle(document.body).fontFamily,
  heading: getComputedStyle(document.querySelector('h1')!).fontFamily
}));

test('every style x mode resolves to a defined DaisyUI theme with its own look', async ({ page }) => {
  await mockSupabase(page);
  const seen = new Set<string>();
  for (const style of ['editorial', 'utilitarian', 'friendly']) {
    for (const mode of ['light', 'dark']) {
      await page.addInitScript(([s, m]) => { localStorage.setItem('medidata-style', s); localStorage.setItem('medidata-theme', m); }, [style, mode]);
      await page.goto('/login');
      await expect(page.locator('h1')).toBeVisible();
      const t = await theme(page);
      expect(t.theme).toBe(`${style}-${mode}`);
      // A theme that isn't defined in styles.css silently falls back to defaults: catch that by
      // checking the page background actually changed between light and dark.
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      seen.add(`${style}-${mode}:${bg}`);
    }
  }
  const bgs = [...seen].map((x) => x.split(':')[1]);
  expect(new Set(bgs).size).toBe(6);
});

test('switching style changes typography and persists across reloads', async ({ page }) => {
  await mockSupabase(page);
  await page.addInitScript(() => { if (!localStorage.getItem('medidata-style')) localStorage.setItem('medidata-theme', 'light'); });
  await page.goto('/login');
  await page.getByRole('radio', { name: 'Editorial' }).click();
  const editorial = await theme(page);
  expect(editorial.heading).toContain('Fraunces');

  await page.getByRole('radio', { name: 'Utilitarian' }).click();
  expect((await theme(page)).style).toBe('utilitarian');
  expect((await theme(page)).heading).toContain('IBM Plex Sans');

  await page.getByRole('radio', { name: 'Friendly' }).click();
  expect((await theme(page)).heading).toContain('Nunito');

  await page.reload();
  expect((await theme(page)).style).toBe('friendly');
  await expect(page.getByRole('radio', { name: 'Friendly' })).toHaveAttribute('aria-checked', 'true');
});

test('the appearance menu and command palette switch style from inside the app', async ({ page }) => {
  await mockSupabase(page);
  await page.addInitScript(() => { localStorage.setItem('medidata-style', 'editorial'); localStorage.setItem('medidata-theme', 'light'); });
  await page.goto('/login');
  await page.fill('#login-email', 'dr@example.com');
  await page.fill('#login-password', 'password');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('radio', { name: /Friendly/ }).click();
  expect((await theme(page)).theme).toBe('friendly-light');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: /Search patients or run a command/ });
  await box.fill('style: util');
  await page.keyboard.press('Enter');
  expect((await theme(page)).theme).toBe('utilitarian-light');
});

test('the command palette finds a patient by name and opens the chart', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/login');
  await page.fill('#login-email', 'dr@example.com');
  await page.fill('#login-password', 'password');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: /Search patients or run a command/ }).fill('bro');
  await expect(page.getByRole('option', { name: /Brown, Bob/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Bob Brown' })).toBeVisible();
});
