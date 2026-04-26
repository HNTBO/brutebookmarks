"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { isPrivateHost, safeFetch } from "./ssrf_guard";

const FETCH_TIMEOUT = 4000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const USER_AGENT = "Mozilla/5.0 (compatible; BruteBookmarks/1.0)";
const SVGL_API_URL = "https://api.svgl.app";

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function getRegistrableDomain(hostname: string): string {
  const normalized = normalizeHostname(hostname);
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length <= 2) return normalized;
  return parts.slice(-2).join(".");
}

function normalizeBrandToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getDomainLabel(domain: string): string {
  return normalizeBrandToken(getRegistrableDomain(domain).split(".")[0] ?? "");
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  return safeFetch(url, {
    ...options,
    headers: { "User-Agent": USER_AGENT, ...options.headers },
    timeout: FETCH_TIMEOUT,
  });
}

// Check if a URL points to a valid image (HEAD then GET fallback)
async function isValidIcon(url: string): Promise<boolean> {
  try {
    const resp = await fetchWithTimeout(url, { method: "HEAD" });
    if (!resp.ok) return false;
    const ct = resp.headers.get("content-type") || "";
    const cl = parseInt(resp.headers.get("content-length") || "0", 10);
    // content-type must be image, content-length >= 100 bytes (avoid empty/placeholder)
    return ct.startsWith("image/") && (cl >= 100 || cl === 0); // cl=0 means unknown size, still try
  } catch {
    return false;
  }
}

// Parse <link> tags from HTML to find icon declarations
function parseIconLinks(
  html: string,
  baseUrl: string,
): { href: string; size: number }[] {
  const results: { href: string; size: number }[] = [];
  // Match <link> tags with rel containing "icon" or "apple-touch-icon"
  const linkRegex =
    /<link\s[^>]*rel\s*=\s*["'](?:[^"']*\b(?:icon|apple-touch-icon)\b[^"']*)["'][^>]*>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    // Extract href
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    let href = hrefMatch[1];

    // Resolve relative URLs
    try {
      href = new URL(href, baseUrl).href;
    } catch {
      continue;
    }

    // Extract sizes (e.g. "180x180", "any")
    const sizesMatch = tag.match(/sizes\s*=\s*["']([^"']+)["']/i);
    let size = 0;
    if (sizesMatch) {
      const sizeStr = sizesMatch[1];
      const dimMatch = sizeStr.match(/(\d+)x(\d+)/);
      if (dimMatch) {
        size = Math.max(parseInt(dimMatch[1], 10), parseInt(dimMatch[2], 10));
      }
    }

    results.push({ href, size });
  }

  // Sort by size descending (largest first), unknown (0) last
  results.sort((a, b) => {
    if (a.size === 0 && b.size === 0) return 0;
    if (a.size === 0) return 1;
    if (b.size === 0) return -1;
    return b.size - a.size;
  });

  return results;
}

// Parse web app manifest for icons
function parseManifestIcons(
  json: string,
  manifestUrl: string,
): { href: string; size: number }[] {
  try {
    const manifest = JSON.parse(json);
    if (!Array.isArray(manifest.icons)) return [];
    const results: { href: string; size: number }[] = [];
    for (const icon of manifest.icons) {
      if (!icon.src) continue;
      let href: string;
      try {
        href = new URL(icon.src, manifestUrl).href;
      } catch {
        continue;
      }
      let size = 0;
      if (icon.sizes && typeof icon.sizes === "string") {
        const dimMatch = icon.sizes.match(/(\d+)x(\d+)/);
        if (dimMatch) {
          size = Math.max(
            parseInt(dimMatch[1], 10),
            parseInt(dimMatch[2], 10),
          );
        }
      }
      results.push({ href, size });
    }
    results.sort((a, b) => {
      if (a.size === 0 && b.size === 0) return 0;
      if (a.size === 0) return 1;
      if (b.size === 0) return -1;
      return b.size - a.size;
    });
    return results;
  } catch {
    return [];
  }
}

type FaviconResult = { iconUrl: string; source: string };

type SvglRoute = string | { light?: string; dark?: string };

interface SvglIcon {
  title?: string;
  route?: SvglRoute;
  url?: string;
  brandUrl?: string;
}

function getSvglRoute(route: SvglRoute | undefined): string | null {
  if (!route) return null;
  if (typeof route === "string") return route;
  return route.dark ?? route.light ?? null;
}

function extractHostname(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return null;
  }
}

function svglDomainMatches(icon: SvglIcon, domain: string): boolean {
  const targetDomain = getRegistrableDomain(domain);
  const hostnames = [
    extractHostname(icon.url),
    extractHostname(icon.brandUrl),
  ].filter((hostname): hostname is string => !!hostname);

  return hostnames.some((hostname) => getRegistrableDomain(hostname) === targetDomain);
}

function svglTitleMatches(icon: SvglIcon, domain: string): boolean {
  if (!icon.title) return false;
  const domainLabel = getDomainLabel(domain);
  if (!domainLabel || domainLabel.length < 3) return false;
  return normalizeBrandToken(icon.title) === domainLabel;
}

function pickSvglIcon(icons: SvglIcon[], domain: string): SvglIcon | null {
  return (
    icons.find((icon) => svglDomainMatches(icon, domain)) ??
    icons.find((icon) => svglTitleMatches(icon, domain)) ??
    null
  );
}

async function searchSvglIcon(domain: string): Promise<FaviconResult | null> {
  try {
    const query = getDomainLabel(domain);
    if (!query || query.length < 3) return null;

    const resp = await fetchWithTimeout(
      `${SVGL_API_URL}?search=${encodeURIComponent(query)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!resp.ok) return null;

    const icons = await resp.json() as SvglIcon[];
    if (!Array.isArray(icons)) return null;

    const icon = pickSvglIcon(icons, domain);
    const iconUrl = getSvglRoute(icon?.route);
    if (!iconUrl) return null;

    return { iconUrl, source: "svgl" };
  } catch {
    return null;
  }
}

async function resolveForDomain(domain: string): Promise<FaviconResult> {
  const baseUrl = `https://${domain}`;

  // Tier 1: apple-touch-icon.png
  const ati = `${baseUrl}/apple-touch-icon.png`;
  if (await isValidIcon(ati)) {
    return { iconUrl: ati, source: "apple-touch-icon" };
  }

  // Tier 2: apple-touch-icon-precomposed.png
  const atip = `${baseUrl}/apple-touch-icon-precomposed.png`;
  if (await isValidIcon(atip)) {
    return { iconUrl: atip, source: "apple-touch-icon" };
  }

  // Tier 3: Fetch HTML, parse <link> icons
  let html = "";
  try {
    const resp = await fetchWithTimeout(baseUrl, {
      headers: { Accept: "text/html" },
    });
    if (
      resp.ok &&
      resp.headers.get("content-type")?.includes("text/html")
    ) {
      const reader = resp.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (html.length < 16384) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
        }
        reader.cancel();
      }
    }
  } catch {
    // Page fetch failed — continue to fallback tiers
  }

  if (html) {
    // Parse <link> icon tags
    const icons = parseIconLinks(html, baseUrl);
    for (const icon of icons) {
      if (await isValidIcon(icon.href)) {
        return { iconUrl: icon.href, source: "html-link" };
      }
    }

    // Tier 4: Web App Manifest
    const manifestMatch = html.match(
      /<link\s[^>]*rel\s*=\s*["']manifest["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i,
    ) ?? html.match(
      /<link\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']manifest["'][^>]*>/i,
    );
    if (manifestMatch) {
      try {
        const manifestUrl = new URL(manifestMatch[1], baseUrl).href;
        const mResp = await fetchWithTimeout(manifestUrl);
        if (mResp.ok) {
          const mText = await mResp.text();
          const mIcons = parseManifestIcons(mText, manifestUrl);
          for (const icon of mIcons) {
            if (await isValidIcon(icon.href)) {
              return { iconUrl: icon.href, source: "manifest" };
            }
          }
        }
      } catch {
        // Manifest fetch failed — continue
      }
    }
  }

  // Tier 5: SVGL brand logo library
  const svgl = await searchSvglIcon(domain);
  if (svgl) {
    return svgl;
  }

  // Tier 6: Icon Horse
  const iconHorse = `https://icon.horse/icon/${domain}`;
  if (await isValidIcon(iconHorse)) {
    return { iconUrl: iconHorse, source: "icon-horse" };
  }

  // Tier 7: DuckDuckGo
  const ddg = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  if (await isValidIcon(ddg)) {
    return { iconUrl: ddg, source: "duckduckgo" };
  }

  // Tier 8: Google S2 (always available, even for garbage domains)
  return {
    iconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
    source: "google-s2",
  };
}

// --- Public actions ---

export const resolveFavicon = action({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<FaviconResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const domain = extractDomain(url);
    if (!domain || isPrivateHost(domain)) {
      return {
        iconUrl: `https://www.google.com/s2/favicons?domain=unknown&sz=64`,
        source: "google-s2",
      };
    }

    // Check cache
    const cached = await ctx.runQuery(internal.faviconCache.getCachedFavicon, { domain });
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { iconUrl: cached.iconUrl, source: cached.source };
    }

    // Resolve
    const result = await resolveForDomain(domain);

    // Cache result
    await ctx.runMutation(internal.faviconCache.upsertFaviconCache, {
      domain,
      iconUrl: result.iconUrl,
      source: result.source,
      fetchedAt: Date.now(),
    });

    return result;
  },
});

export const resolveFaviconBulk = action({
  args: {
    bookmarks: v.array(
      v.object({
        bookmarkId: v.string(),
        url: v.string(),
      }),
    ),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { bookmarks, forceRefresh },
  ): Promise<{ bookmarkId: string; iconUrl: string; source: string }[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Deduplicate by domain
    const domainMap = new Map<string, string[]>(); // domain -> bookmarkIds
    const bookmarkDomain = new Map<string, string>(); // bookmarkId -> domain
    for (const bk of bookmarks) {
      const domain = extractDomain(bk.url);
      if (!domain || isPrivateHost(domain)) continue;
      bookmarkDomain.set(bk.bookmarkId, domain);
      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain)!.push(bk.bookmarkId);
    }

    // Resolve each unique domain
    const domainResults = new Map<string, FaviconResult>();
    for (const domain of domainMap.keys()) {
      // Check cache (unless force refresh)
      if (!forceRefresh) {
        const cached = await ctx.runQuery(internal.faviconCache.getCachedFavicon, { domain });
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
          domainResults.set(domain, {
            iconUrl: cached.iconUrl,
            source: cached.source,
          });
          continue;
        }
      }

      const result = await resolveForDomain(domain);
      domainResults.set(domain, result);

      // Cache
      await ctx.runMutation(internal.faviconCache.upsertFaviconCache, {
        domain,
        iconUrl: result.iconUrl,
        source: result.source,
        fetchedAt: Date.now(),
      });
    }

    // Map results back to bookmarkIds
    const results: { bookmarkId: string; iconUrl: string; source: string }[] =
      [];
    for (const bk of bookmarks) {
      const domain = bookmarkDomain.get(bk.bookmarkId);
      if (!domain) continue;
      const result = domainResults.get(domain);
      if (result) {
        results.push({
          bookmarkId: bk.bookmarkId,
          iconUrl: result.iconUrl,
          source: result.source,
        });
      }
    }

    return results;
  },
});
