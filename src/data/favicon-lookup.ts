import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { isPrivateHost } from '../../convex/ssrf_guard';

interface Candidate {
  iconUrl: string | null;
  source: string;
}

// Older cache entries and servers used this source for an unconditional suggestion.
export function discoveredIcon(result: Candidate | undefined): string | null {
  return result && result.source !== 'google-s2' ? result.iconUrl : null;
}

export async function cachedFavicons(domains: string[]): Promise<Map<string, string>> {
  const icons = new Map<string, string>();
  const endpoint = import.meta.env.VITE_CONVEX_URL;
  if (!endpoint || !domains.length) return icons;
  const client = new ConvexHttpClient(endpoint);
  const entries = await client.query(api.faviconCache.lookupCachedFavicons, { domains });
  for (const entry of entries) {
    const url = discoveredIcon(entry);
    if (url) icons.set(entry.domain, url);
  }
  return icons;
}

export function localFavicon(domain: string): string | null {
  // Icon Horse's fallback=404 omits its generated letter tile on a miss.
  return isPrivateHost(domain) ? null : `https://icon.horse/icon/${encodeURIComponent(domain)}?fallback=404`;
}

type LookupResult = { status: 'found'; url: string } | { status: 'missing' | 'timeout' | 'cancelled' | 'error' };

// The same deadline covers discovery and loading the candidate in this browser.
export function loadFavicon(candidate: string | null | Promise<string | null>, signal?: AbortSignal): Promise<LookupResult> {
  return new Promise(resolve => {
    const image = new Image();
    let finished = false;
    const cancel = () => finish({ status: 'cancelled' });
    const timer = setTimeout(() => finish({ status: 'timeout' }), 5000);
    function finish(result: LookupResult) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      image.onload = image.onerror = null;
      image.removeAttribute('src');
      resolve(result);
    }
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    Promise.resolve(candidate).then(url => {
      if (finished) return;
      if (!url) return finish({ status: 'missing' });
      image.onload = () => finish({ status: 'found', url });
      image.onerror = () => finish({ status: 'missing' });
      image.src = url;
    }).catch(() => finish({ status: 'error' }));
  });
}
