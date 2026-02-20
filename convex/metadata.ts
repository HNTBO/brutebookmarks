"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { isPrivateHost, safeFetch } from "./ssrf_guard";

// Common title suffixes to strip (site names appended after separators)
const SUFFIX_PATTERN =
  /\s*[\-–—|·•]\s*(YouTube|Reddit|GitHub|Wikipedia|X|Twitter|Facebook|LinkedIn|Medium|Stack Overflow|Amazon|Google).*$/i;

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function domainFallback(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Capitalize first letter of each part: "github.com" -> "GitHub"
    const name = hostname.split(".")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
}

export const fetchPageTitle = action({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<{ title: string | null }> => {
    // Require authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Validate URL scheme
    if (!/^https?:\/\//i.test(url)) {
      return { title: domainFallback(url) };
    }

    // Block requests to private/internal IPs (SSRF protection)
    try {
      const parsed = new URL(url);
      if (isPrivateHost(parsed.hostname)) {
        return { title: domainFallback(url) };
      }
    } catch {
      return { title: domainFallback(url) };
    }

    try {
      const response = await safeFetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BruteBookmarks/1.0)",
          Accept: "text/html",
        },
        timeout: 4000,
      });

      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
        return { title: domainFallback(url) };
      }

      // Read only first 16KB
      const reader = response.body?.getReader();
      if (!reader) return { title: domainFallback(url) };

      let html = "";
      const decoder = new TextDecoder();
      while (html.length < 16384) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
      }
      reader.cancel();

      // Extract <title> via regex
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (!match) return { title: domainFallback(url) };

      let title = decodeHTMLEntities(match[1]).trim();
      // Collapse whitespace
      title = title.replace(/\s+/g, " ");

      if (!title) return { title: domainFallback(url) };

      // Strip common site-name suffixes
      title = title.replace(SUFFIX_PATTERN, "").trim();

      return { title: title || domainFallback(url) };
    } catch {
      return { title: domainFallback(url) };
    }
  },
});
