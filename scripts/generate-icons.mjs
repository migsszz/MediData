// Generates every icon from one design: the heart-pulse mark on a teal tile.
//
//   npm run icons
//
// Writes public/favicon.svg, favicon.ico, apple-touch-icon.png and public/icons/*.png.
// Rendering uses Playwright's Chromium (set PW_CHROMIUM to point at a browser binary if needed).
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Lucide "heart-pulse" (ISC licence), the same mark the app header uses.
const MARK = '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/><path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>';

const TEAL = '#1f5f5b'; // Editorial primary
const PAPER = '#f4f1ea';
const TEAL_DARK_MODE = '#6fb8ae';
const INK_DARK_MODE = '#10201e';

/**
 * @param {object} o
 * @param {number} o.scale      mark size relative to the 24-unit icon grid, on a 64-unit tile
 * @param {number} o.stroke     stroke width in icon units (thicker for tiny sizes so it survives 16px)
 * @param {number} o.radius     tile corner radius (0 = full bleed, for maskable/Apple icons)
 * @param {boolean} [o.adaptive] emit CSS so the SVG follows the viewer's light/dark preference
 */
function svg({ scale, stroke, radius, adaptive = false }) {
  const offset = (64 - 24 * scale) / 2;
  const style = adaptive
    ? `<style>.bg{fill:${TEAL}}.fg{stroke:${PAPER}}@media (prefers-color-scheme:dark){.bg{fill:${TEAL_DARK_MODE}}.fg{stroke:${INK_DARK_MODE}}}</style>`
    : '';
  const bg = adaptive ? 'class="bg"' : `fill="${TEAL}"`;
  const fg = adaptive ? 'class="fg"' : `stroke="${PAPER}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${style}<rect width="64" height="64" rx="${radius}" ${bg}/><g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" ${fg} stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${MARK}</g></svg>`;
}

const variants = {
  any: (size) => svg({ scale: size <= 48 ? 2.15 : 1.9, stroke: size <= 32 ? 2.8 : size <= 48 ? 2.4 : 2.1, radius: 14 }),
  // Maskable: full-bleed background, mark inside the central 80% safe zone.
  maskable: () => svg({ scale: 1.45, stroke: 2.1, radius: 0 }),
  // Apple rounds corners itself and rejects transparency.
  apple: () => svg({ scale: 1.7, stroke: 2.1, radius: 0 })
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage();

/**
 * Renders SVG markup to a PNG buffer of the given pixel size (transparent outside the tile).
 * The viewport stays large: Chromium clamps very small viewports, which would lay the page
 * out bigger than asked and make the clip below crop the corner of the icon instead.
 */
await page.setViewportSize({ width: 600, height: 600 });
async function png(markup, size) {
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{position:absolute;top:0;left:0;display:block;width:${size}px;height:${size}px}</style>${markup}`);
  return page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

/** Packs PNG buffers into an .ico (PNG-compressed entries are valid since Windows Vista). */
function ico(entries) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dir = entries.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([head, ...dir, ...entries.map((e) => e.data)]);
}

await mkdir(join(root, 'icons'), { recursive: true });

await writeFile(join(root, 'favicon.svg'), svg({ scale: 2.15, stroke: 2.4, radius: 14, adaptive: true }) + '\n');

// Sequential on purpose: every render reuses one page, so concurrent renders would
// overwrite each other's content before the screenshot is taken.
const icoSizes = [16, 32, 48];
const icoEntries = [];
for (const size of icoSizes) icoEntries.push({ size, data: await png(variants.any(size), size) });
await writeFile(join(root, 'favicon.ico'), ico(icoEntries));

for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
  await writeFile(join(root, 'icons', `icon-${size}x${size}.png`), await png(variants.any(size), size));
}
for (const size of [192, 512]) {
  await writeFile(join(root, 'icons', `icon-maskable-${size}x${size}.png`), await png(variants.maskable(), size));
}
await writeFile(join(root, 'apple-touch-icon.png'), await png(variants.apple(), 180));

await browser.close();
console.log('Icons written to public/');
