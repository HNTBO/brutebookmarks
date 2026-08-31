import { describe, expect, it } from 'vitest';
import { parseIconLinks } from '../../convex/favicon_candidates';

describe('parseIconLinks', () => {
  it('prefers browser favicons over larger Apple touch artwork', () => {
    const icons = parseIconLinks(`
      <link rel="apple-touch-icon" sizes="180x180" href="/opaque-tile.png">
      <link rel="icon" sizes="32x32" href="/transparent-32.png">
    `, 'https://example.com/account');

    expect(icons.map((icon) => icon.href)).toEqual([
      'https://example.com/transparent-32.png',
      'https://example.com/opaque-tile.png',
    ]);
  });

  it('prefers scalable favicons, independent of attribute order', () => {
    const icons = parseIconLinks(`
      <link href="icons/favicon-128.png" sizes="128x128" rel="icon">
      <link type="image/svg+xml" href="icons/favicon.svg" rel="icon">
      <link href="icons/favicon-32.png" rel="icon" sizes="32x32">
    `, 'https://example.com/account/');

    expect(icons[0]).toMatchObject({
      href: 'https://example.com/account/icons/favicon.svg',
      scalable: true,
      kind: 'favicon',
    });
    expect(icons.slice(1).map((icon) => icon.size)).toEqual([128, 32]);
  });
});
