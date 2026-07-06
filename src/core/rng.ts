/**
 * Seeded RNG — determinism is sacred. One run RNG, seeded and forkable per
 * system, so runs are shareable and replayable.
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

/** Uniform float in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
    return min + rng() * (max - min);
}

/** Uniform integer in [min, max] inclusive. */
export function rangeInt(rng: Rng, min: number, max: number): number {
    return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Labeled child seed: the same (seed, label) always yields the same value and
 * distinct labels decorrelate — map-modifiers.md's labeled-stream contract
 * (`fork(seed, 'shop:<nodeId>')`), so any system can regenerate its own
 * stream independently. xmur3-style string mix folded over the parent seed.
 */
export function forkSeed(seed: number, label: string): number {
    let h = (seed >>> 0) ^ 0x9e3779b9;
    for (let i = 0; i < label.length; i += 1) {
        h = Math.imul(h ^ label.charCodeAt(i), 0x85ebca6b);
        h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return (h ^ (h >>> 16)) >>> 0;
}

/** A labeled child stream (see forkSeed). */
export function fork(seed: number, label: string): Rng {
    return mulberry32(forkSeed(seed, label));
}
