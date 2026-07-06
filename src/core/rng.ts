/**
 * Seeded RNG — determinism is sacred. One run RNG, seeded and forkable per
 * system, so runs are shareable and replayable.
 *
 * Labeled forks (map-modifiers.md): all run randomness forks from one
 * shareable seed string by labeled stream — `fork(runSeed, 'map:act2')`,
 * `fork(runSeed, 'segment:<nodeId>')` — so any system can regenerate its own
 * stream independently and a seed reproduces the entire run offer.
 *
 * Prior-art call (recorded per the design doc's instruction): `pure-rand`
 * was considered and declined — it adds a dependency for distribution
 * machinery this use never touches. The existing mulberry32 (public-domain,
 * bryc's PRNG collection; passes gjrand's core battery) is statistically
 * adequate for coarse discrete map rolls, and its canonical companion hash
 * xmur3 (same source) turns labels into well-mixed 32-bit stream seeds.
 */

export type Rng = () => number;

/** mulberry32: tiny, fast, good-enough distribution, fully deterministic. */
export function mulberry32(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** xmur3 string hash — mulberry32's canonical seeding companion. */
function xmur3(str: string): number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i += 1) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Derive a 32-bit stream seed from the run seed and a stream label. The
 * separator is a control character so `('a:b', 'c')` and `('a', 'b:c')`
 * can never collide through label punctuation.
 */
export function forkSeed(runSeed: string, label: string): number {
    return xmur3(`${runSeed}\u001f${label}`);
}

/** A labeled, independent stream forked from the run seed. */
export function fork(runSeed: string, label: string): Rng {
    return mulberry32(forkSeed(runSeed, label));
}

/** Uniform float in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
    return min + rng() * (max - min);
}

/** Uniform integer in [min, max] inclusive. */
export function rangeInt(rng: Rng, min: number, max: number): number {
    return min + Math.floor(rng() * (max - min + 1));
}

/** Uniform pick from a non-empty list; throws on empty (a caller bug). */
export function pick<T>(rng: Rng, items: readonly T[]): T {
    if (items.length === 0) {
        throw new Error('rng: pick from an empty list');
    }
    return items[Math.floor(rng() * items.length)];
}

/**
 * Weighted index pick. Weights must be non-negative with a positive sum —
 * degenerate weights throw (a data bug fails loud, never skews silently).
 */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
    let sum = 0;
    for (const w of weights) {
        if (w < 0 || !Number.isFinite(w)) {
            throw new Error(`rng: degenerate weight ${w}`);
        }
        sum += w;
    }
    if (sum <= 0) {
        throw new Error('rng: weights sum to zero');
    }
    let roll = rng() * sum;
    for (let i = 0; i < weights.length; i += 1) {
        roll -= weights[i];
        if (roll < 0) {
            return i;
        }
    }
    return weights.length - 1;
}
