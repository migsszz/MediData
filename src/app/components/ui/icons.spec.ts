import { ICONS } from './icons';


describe('ICONS', () => {
  it('has well-formed markup for every icon', () => {
    for (const [name, markup] of Object.entries(ICONS)) {
      expect(markup).withContext(name).toMatch(/^<(path|circle|rect|line|polyline|polygon|ellipse)\b/);
    }
  });
});
