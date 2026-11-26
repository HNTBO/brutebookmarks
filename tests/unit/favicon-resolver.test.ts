import { describe, expect, it, vi } from 'vitest';
import { resolveFavicon } from '../../convex/favicons';
import { safeFetch } from '../../convex/ssrf_guard';

vi.mock('../../convex/ssrf_guard', async importOriginal => ({
  ...await importOriginal<typeof import('../../convex/ssrf_guard')>(),
  safeFetch: vi.fn(),
}));

const domain = 'fixture.example';
const horse = `https://icon.horse/icon/${domain}`;
const duck = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
const icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle r="8"/></svg>';

describe('favicon provider selection', () => {
  it.each([
    { probe: 'HEAD', fallback: 'true', expected: 'duckduckgo' },
    { probe: 'GET', fallback: 'true', expected: 'duckduckgo' },
    { probe: 'HEAD', fallback: 'false', expected: 'icon-horse' },
  ])('handles X-Icon-Fallback=$fallback on $probe', async ({ probe, fallback, expected }) => {
    vi.mocked(safeFetch).mockImplementation(async (url, options) => {
      if (url !== horse && url !== duck) return new Response(null, { status: 404 });
      if (url === horse && probe === 'GET' && options?.method === 'HEAD') {
        return new Response(null, { status: 405 });
      }
      const headers = new Headers({ 'content-type': 'image/svg+xml', 'content-length': String(icon.length) });
      if (url === horse) headers.set('X-Icon-Fallback', fallback);
      return new Response(options?.method === 'HEAD' ? null : icon, { headers });
    });
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: 'fixture' }) },
      runQuery: vi.fn().mockResolvedValue(null),
      runMutation: vi.fn(),
    };
    // Invoke the registered Convex action with a local auth/cache context.
    const action = resolveFavicon as typeof resolveFavicon & {
      _handler(context: typeof ctx, args: { url: string }): Promise<{ source: string; iconUrl: string }>;
    };
    const result = await action._handler(ctx, { url: `https://${domain}` });
    expect(result).toEqual({ source: expected, iconUrl: expected === 'duckduckgo' ? duck : horse });
    expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ domain, ...result }));
  });
});
