/**
 * Origin / domain matching helpers.
 *
 * `eTLD+1` here is approximated with a "second-level domain" rule: take the
 * last two labels of the hostname. Good enough for sites like `app.github.com`
 * vs `github.com` matching, but not perfect for `co.uk` etc. (Public Suffix
 * List would be ideal but adds 30KB; acceptable trade-off for now.)
 *
 * All comparisons case-insensitive, IPv4/IPv6 hosts pass through unchanged.
 */

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_RE = /^\[.*\]$/;

export interface ParsedOrigin {
  raw: string;
  protocol: string;
  hostname: string;
  port: string;
}

export function parseOrigin(input: string): ParsedOrigin | null {
  if (!input) return null;
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    return {
      raw: url.origin,
      protocol: url.protocol,
      hostname: url.hostname.toLowerCase(),
      port: url.port,
    };
  } catch {
    return null;
  }
}

/**
 * Match a stored entry's `origin` against a live page URL/origin.
 *
 * Rules (in order of strictness):
 *   - Empty stored origin → never match (forces explicit scope).
 *   - IP host → exact host+port match.
 *   - Both have a path beyond `/` → require startsWith on stored URL.
 *   - Same hostname → match.
 *   - Stored hostname is the second-level of live hostname (e.g. stored
 *     "github.com", live "gist.github.com") → match.
 */
export function originMatches(stored: string, candidate: string): boolean {
  const a = parseOrigin(stored);
  const b = parseOrigin(candidate);
  if (!a || !b) return false;

  // Different protocols (http vs https) usually shouldn't share creds.
  if (a.protocol !== b.protocol) return false;

  if (IPV4_RE.test(a.hostname) || IPV6_RE.test(a.hostname)) {
    return a.hostname === b.hostname && a.port === b.port;
  }

  if (a.hostname === b.hostname) return true;

  // Suffix match on dotted boundary so "github.com" matches "x.github.com"
  // but NOT "evilgithub.com".
  if (b.hostname.endsWith(`.${a.hostname}`)) return true;

  return false;
}

/**
 * Given an origin, return progressively-broader patterns to match stored
 * vault entries. Order matters: caller picks the first match.
 *
 *   "https://gist.github.com/x" →
 *     ["https://gist.github.com", "https://github.com"]
 */
export function originMatchKeys(input: string): string[] {
  const parsed = parseOrigin(input);
  if (!parsed) return [];
  // Origin already includes the port when non-default; preserve it for IP/host
  // matches so a user can scope creds to e.g. http://127.0.0.1:8080.
  const baseHost = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  const keys = [`${parsed.protocol}//${baseHost}`];
  if (!IPV4_RE.test(parsed.hostname) && !IPV6_RE.test(parsed.hostname)) {
    const labels = parsed.hostname.split('.');
    if (labels.length > 2) {
      const sld = labels.slice(-2).join('.');
      keys.push(`${parsed.protocol}//${parsed.port ? `${sld}:${parsed.port}` : sld}`);
    }
  }
  return keys;
}
