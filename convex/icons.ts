"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

export const searchWikimedia = action({
  args: { query: v.string() },
  handler: async (_ctx, { query }): Promise<{ icons: { thumbUrl: string; title: string }[] }> => {
    if (!query.trim()) return { icons: [] };

    const searchTerm = `${query.trim()} logo`;
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query` +
      `&generator=search&gsrsearch=${encodeURIComponent(searchTerm)}` +
      `&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=128` +
      `&format=json&gsrlimit=20`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "BruteBookmarks/1.0 (bookmark-manager; icon-search)",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) return { icons: [] };

      const data = await response.json();
      const pages = data?.query?.pages;
      if (!pages) return { icons: [] };

      const icons: { thumbUrl: string; title: string }[] = [];
      for (const page of Object.values(pages) as any[]) {
        const info = page.imageinfo?.[0];
        if (!info?.thumburl) continue;
        icons.push({
          thumbUrl: info.thumburl,
          title: (page.title || "").replace(/^File:/, "").replace(/\.[^.]+$/, ""),
        });
      }

      return { icons };
    } catch {
      return { icons: [] };
    }
  },
});
