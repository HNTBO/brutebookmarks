import { describe, expect, it } from 'vitest';
import {
  getTokenExpiry as getQuickSaveTokenExpiry,
  isConnected as isQuickSaveConnected,
} from '../../quicksave/src/lib/auth';
import {
  getTokenExpiry as getNewTabTokenExpiry,
  isConnected as isNewTabConnected,
} from '../../newtab/src/lib/auth';

function makeToken(expiresAtSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: expiresAtSeconds, marker: '>>>30' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

describe.each([
  ['Quick Save', getQuickSaveTokenExpiry, isQuickSaveConnected],
  ['New Tab', getNewTabTokenExpiry, isNewTabConnected],
] as const)('%s extension token parsing', (_name, getTokenExpiry, isConnected) => {
  it('decodes unpadded base64url JWT payloads', () => {
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + 120;
    const token = makeToken(expiresAtSeconds);

    expect(token.split('.')[1]).toMatch(/[-_]/);
    expect(getTokenExpiry(token)).toBe(expiresAtSeconds * 1000);
    expect(isConnected(token)).toBe(true);
  });

  it('refreshes tokens before they are too close to expiry', () => {
    const token = makeToken(Math.floor(Date.now() / 1000) + 20);

    expect(isConnected(token)).toBe(true);
    expect(isConnected(token, 30_000)).toBe(false);
  });

  it('rejects malformed and expired tokens', () => {
    const expired = makeToken(Math.floor(Date.now() / 1000) - 1);

    expect(getTokenExpiry('not-a-jwt')).toBeNull();
    expect(isConnected('not-a-jwt')).toBe(false);
    expect(isConnected(expired)).toBe(false);
  });
});
