/**
 * Tiny fuzzy matcher.
 *
 * Returns a score (higher = better) when every character of `query` appears
 * in `target` in order. Adjacent matches and start-of-word matches score
 * higher. Returns 0 if no subsequence match.
 *
 * Good enough for sidebar / palette filtering; not as tuned as fzf but
 * dependency-free and fast at the expected scale (≤500 items).
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!t) return 0;

  let score = 0;
  let qi = 0;
  let lastIdx = -2;
  let consecutive = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    const tc = t[ti];
    const qc = q[qi];
    if (tc === qc) {
      // Base hit.
      score += 1;
      // Adjacent boost.
      if (ti === lastIdx + 1) {
        consecutive++;
        score += consecutive * 2;
      } else {
        consecutive = 0;
      }
      // Start-of-word boost (preceded by non-letter or at index 0).
      if (ti === 0 || /[^a-z0-9]/i.test(t[ti - 1] ?? '')) {
        score += 3;
      }
      lastIdx = ti;
      qi++;
    }
  }

  if (qi < q.length) return 0;

  // Bias toward shorter targets (less noise per char).
  return score - t.length * 0.01;
}

export function fuzzyMatches(query: string, target: string): boolean {
  return fuzzyScore(query, target) > 0;
}
