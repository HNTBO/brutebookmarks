export type HtmlIconKind = "favicon" | "apple-touch-icon" | "mask-icon";

export interface HtmlIconCandidate {
  href: string;
  size: number;
  scalable: boolean;
  kind: HtmlIconKind;
}

const TARGET_ICON_SIZE = 64;

function candidateDistance(candidate: HtmlIconCandidate): number {
  if (candidate.scalable) return -1;
  if (candidate.size <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.log2(candidate.size / TARGET_ICON_SIZE));
}

function compareCandidates(a: HtmlIconCandidate, b: HtmlIconCandidate): number {
  const kindPriority: Record<HtmlIconKind, number> = {
    favicon: 0,
    "apple-touch-icon": 1,
    "mask-icon": 2,
  };
  const kindDifference = kindPriority[a.kind] - kindPriority[b.kind];
  if (kindDifference !== 0) return kindDifference;

  const distanceDifference = candidateDistance(a) - candidateDistance(b);
  if (distanceDifference !== 0) return distanceDifference;

  // At equal distance, prefer the larger bitmap to avoid upscaling.
  return b.size - a.size;
}

/**
 * Parse page-declared icons in browser-oriented order. Normal favicons are
 * deliberately ranked ahead of Apple/PWA artwork, which commonly bakes in an
 * opaque tile background that browser tabs and sidebars do not use.
 */
export function parseIconLinks(html: string, baseUrl: string): HtmlIconCandidate[] {
  const results: HtmlIconCandidate[] = [];
  const linkRegex = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const relMatch = tag.match(/\brel\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/i);
    const relTokens = (relMatch?.[1] ?? relMatch?.[2] ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    let kind: HtmlIconKind | null = null;
    if (relTokens.includes("icon")) {
      kind = "favicon";
    } else if (
      relTokens.includes("apple-touch-icon") ||
      relTokens.includes("apple-touch-icon-precomposed")
    ) {
      kind = "apple-touch-icon";
    } else if (relTokens.includes("mask-icon")) {
      kind = "mask-icon";
    }
    if (!kind) continue;

    const hrefMatch = tag.match(/\bhref\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/i);
    if (!hrefMatch) continue;

    let href: string;
    try {
      href = new URL(hrefMatch[1] ?? hrefMatch[2], baseUrl).href;
    } catch {
      continue;
    }

    const sizesMatch = tag.match(/\bsizes\s*=\s*["']([^"']+)["']/i);
    const sizes = sizesMatch?.[1] ?? "";
    const dimensions = Array.from(sizes.matchAll(/(\d+)x(\d+)/gi));
    const size = dimensions.reduce(
      (largest, dimension) => Math.max(largest, Number(dimension[1]), Number(dimension[2])),
      0,
    );
    const typeMatch = tag.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = (typeMatch?.[1] ?? "").toLowerCase();
    const scalable = /\bany\b/i.test(sizes) || type.includes("svg") || /\.svg(?:$|[?#])/i.test(href);

    results.push({ href, size, scalable, kind });
  }

  return results.sort(compareCandidates);
}
