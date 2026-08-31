"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { isPrivateHost, safeFetch } from "./ssrf_guard";

const FETCH_TIMEOUT = 4000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FALLBACK_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // Retry provider fallbacks promptly
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

function isFreshCacheEntry(cached: { fetchedAt: number; source: string }): boolean {
  const isProviderFallback = ["icon-horse", "duckduckgo", "google-s2"].includes(cached.source);
  const ttl = isProviderFallback ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS;
  return Date.now() - cached.fetchedAt < ttl;
}

async function readResponsePrefix(resp: Response, limit = 4096): Promise<Uint8Array> {
  const reader = resp.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = limit - length;
      const chunk = value.length > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      length += chunk.length;
      if (value.length > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const prefix = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    prefix.set(chunk, offset);
    offset += chunk.length;
  }
  return prefix;
}

function hasImageSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const ascii = new TextDecoder().decode(bytes);
  return (
    // PNG
    (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ||
    // JPEG
    (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    // GIF
    ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a") ||
    // ICO / CUR
    (bytes[0] === 0 && bytes[1] === 0 && (bytes[2] === 1 || bytes[2] === 2) && bytes[3] === 0) ||
    // WebP
    (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") ||
    // AVIF
    ascii.slice(4, 12).includes("ftypavif") ||
    // SVG, optionally preceded by an XML declaration/comments/whitespace
    /<svg[\s>]/i.test(ascii.slice(0, 1024))
  );
}

// Check if a URL points to a valid image (HEAD, then a bounded GET fallback).
async function isValidIcon(url: string): Promise<boolean> {
  try {
    const head = await fetchWithTimeout(url, { method: "HEAD" });
    const contentType = head.headers.get("content-type") || "";
    const contentLength = Number(head.headers.get("content-length") || "0");
    if (head.ok && contentType.startsWith("image/") && contentLength > 0) {
      return true;
    }
  } catch {
    // HEAD is frequently unsupported for otherwise valid favicon files.
  }

  try {
    const resp = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Accept: "image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8",
        Range: "bytes=0-4095",
      },
    });
    if (!resp.ok) return false;

    const bytes = await readResponsePrefix(resp);
    if (bytes.length === 0) return false;
    const contentType = (resp.headers.get("content-type") || "").toLowerCase();
    return contentType.startsWith("image/") || hasImageSignature(bytes);
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
  const linkRegex = /<link\b[^>]*>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const relMatch = tag.match(/\brel\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/i);
    const rel = (relMatch?.[1] ?? relMatch?.[2] ?? "").toLowerCase().split(/\s+/);
    if (!rel.some((token) => token === "icon" || token === "apple-touch-icon" || token === "apple-touch-icon-precomposed" || token === "mask-icon")) {
      continue;
    }
    // Extract href
    const hrefMatch = tag.match(/\bhref\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/i);
    if (!hrefMatch) continue;
    let href = hrefMatch[1] ?? hrefMatch[2];

    // Resolve relative URLs
    try {
      href = new URL(href, baseUrl).href;
    } catch {
      continue;
    }

    // Extract sizes (e.g. "180x180", "any")
    const sizesMatch = tag.match(/\bsizes\s*=\s*["']([^"']+)["']/i);
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
  let pageUrl = baseUrl;

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
      pageUrl = resp.url || baseUrl;
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
    const icons = parseIconLinks(html, pageUrl);
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
        const manifestUrl = new URL(manifestMatch[1], pageUrl).href;
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

  // Tier 5: Browser-standard implicit favicon path. Browsers try this even
  // when a page has no explicit <link rel="icon"> declaration.
  const conventionalFavicon = new URL("/favicon.ico", pageUrl).href;
  if (await isValidIcon(conventionalFavicon)) {
    return { iconUrl: conventionalFavicon, source: "favicon-ico" };
  }

  // Tier 6: SVGL brand logo library
  const svgl = await searchSvglIcon(domain);
  if (svgl) {
    return svgl;
  }

  // Tier 7: Icon Horse
  const iconHorse = `https://icon.horse/icon/${domain}`;
  if (await isValidIcon(iconHorse)) {
    return { iconUrl: iconHorse, source: "icon-horse" };
  }

  // Tier 8: DuckDuckGo
  const ddg = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  if (await isValidIcon(ddg)) {
    return { iconUrl: ddg, source: "duckduckgo" };
  }

  // Tier 9: Google S2 (always available, even for garbage domains)
  return {
    iconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
    source: "google-s2",
  };
}

// --- Public actions ---

export const resolveFavicon = action({
  args: { url: v.string(), forceRefresh: v.optional(v.boolean()) },
  handler: async (ctx, { url, forceRefresh }): Promise<FaviconResult> => {
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
    if (!forceRefresh && cached && isFreshCacheEntry(cached)) {
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
        if (cached && isFreshCacheEntry(cached)) {
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
