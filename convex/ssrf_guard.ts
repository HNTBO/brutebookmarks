/**
 * Shared SSRF protection utilities for Convex actions.
 * Used by favicons.ts and metadata.ts.
 */

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

export function isPrivateHost(hostname: string): boolean {
  if (PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))) return true;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "169.254.169.254") return true;
  return false;
}

const MAX_REDIRECTS = 5;

/**
 * Follow redirects manually, validating each hop against isPrivateHost().
 * Prevents mid-chain redirects to private/internal hosts.
 */
export async function safeFetch(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = 4000, ...fetchOpts } = options;
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    let resp: Response;
    try {
      resp = await fetch(currentUrl, {
        ...fetchOpts,
        signal: controller.signal,
        redirect: "manual",
      });
    } finally {
      clearTimeout(timer);
    }

    // Not a redirect — return the response
    if (resp.status < 300 || resp.status >= 400) {
      return resp;
    }

    // Redirect — validate the Location header
    const location = resp.headers.get("location");
    if (!location) {
      return resp; // No Location header — treat as final response
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new Error("Blocked: invalid redirect URL");
    }

    if (isPrivateHost(nextUrl.hostname)) {
      throw new Error("Blocked: redirect to private host");
    }

    currentUrl = nextUrl.href;
  }

  throw new Error("Blocked: too many redirects");
}
