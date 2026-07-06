/**
 * Deterministic display formatting — no locale dependence anywhere a replay
 * or a screenshot might read (score.ts set the law; this makes it shared).
 */

/** Thousands separators: 45648 -> "45,648". */
export function groupDigits(n: number): string {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
