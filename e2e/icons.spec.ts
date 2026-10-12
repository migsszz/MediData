import { expect, test } from '@playwright/test';

test('favicon, touch icon and every manifest icon are served, with the right image sizes', async ({ page, request }) => {
  await page.goto('/login');

  const href = (sel: string) => page.locator(sel).first().getAttribute('href');
  expect(await href('link[rel="icon"][type="image/svg+xml"]')).toBe('favicon.svg');
  expect(await href('link[rel="icon"][type="image/x-icon"]')).toBe('favicon.ico');
  expect(await href('link[rel="apple-touch-icon"]')).toBe('apple-touch-icon.png');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1f5f5b');
  await expect(page).toHaveTitle('MediData');

  const svg = await request.get('/favicon.svg');
  expect(svg.ok()).toBeTruthy();
  expect(await svg.text()).toContain('prefers-color-scheme:dark'); // adapts to dark browser chrome

  // .ico: header says "icon", and contains 16, 32 and 48px images.
  const ico = Buffer.from(await (await request.get('/favicon.ico')).body());
  expect(ico.readUInt16LE(2)).toBe(1);
  const count = ico.readUInt16LE(4);
  const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + i * 16));
  expect(sizes).toEqual([16, 32, 48]);

  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('MediData');
  expect(manifest.theme_color).toBe('#1f5f5b');
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  // 'any' and 'maskable' must not be combined on one file (Android crops those badly).
  for (const icon of manifest.icons) expect(icon.purpose).not.toContain(' ');

  for (const icon of manifest.icons as { src: string; sizes: string }[]) {
    const res = await request.get('/' + icon.src);
    expect(res.ok(), icon.src).toBeTruthy();
    const png = Buffer.from(await res.body());
    const [w, h] = icon.sizes.split('x').map(Number);
    expect(png.readUInt32BE(16), `${icon.src} width`).toBe(w); // IHDR width/height
    expect(png.readUInt32BE(20), `${icon.src} height`).toBe(h);
  }
});
