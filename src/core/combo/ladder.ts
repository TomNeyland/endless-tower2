/**
 * The escalation ladder: eight named tiers on chainFloors, crossed live
 * mid-chain, plus the BEYOND xN repeat cadence. Light is the theme — the
 * ladder climbs toward "a god-run is a comet". Multiple thresholds crossed
 * in one leap fire only the highest (one card, one stinger).
 */
import type { TuningStack } from '../tuning';
import { COMBO_LADDER_SIZE, COMBO_TIER_NAMES, type ComboTuningKey } from './tuning';

export interface TierCrossing {
    tierIndex: number;
    tierName: string;
    isRepeat: boolean;
    /** 0 = the plain tier; for BEYOND, 1 = x2, 2 = x3 ... */
    repeatIndex: number;
}

/** The ladder thresholds, read live from tuning (relic-mutable per rung). */
export function ladderFloors(t: TuningStack): number[] {
    const floors: number[] = [];
    for (let i = 0; i < COMBO_LADDER_SIZE; i += 1) {
        floors.push(t.value(`combo.ladderFloors${i}` as ComboTuningKey));
    }
    return floors;
}

export function tierName(tierIndex: number): string {
    return COMBO_TIER_NAMES[Math.min(tierIndex, COMBO_TIER_NAMES.length - 1)];
}

/** Display face for a tier crossing: "BLAZING", "BEYOND x3". */
export function tierFace(crossing: TierCrossing): string {
    return crossing.repeatIndex > 0
        ? `${crossing.tierName} x${crossing.repeatIndex + 1}`
        : crossing.tierName;
}

/**
 * The highest ladder threshold newly crossed when chainFloors grows from
 * `prevFloors` to `newFloors` (floors are monotonic within a chain — links
 * only add). Null when no rung was crossed.
 */
export function highestCrossing(
    prevFloors: number,
    newFloors: number,
    t: TuningStack,
): TierCrossing | null {
    const floors = ladderFloors(t);
    const beyondAt = floors[COMBO_LADDER_SIZE - 1];

    if (newFloors >= beyondAt) {
        const every = t.value('combo.ladderRepeatEvery');
        const repeatOf = (f: number): number =>
            f < beyondAt ? -1 : Math.floor((f - beyondAt) / every);
        const newRepeat = repeatOf(newFloors);
        const prevRepeat = repeatOf(prevFloors);
        if (newRepeat > prevRepeat) {
            return {
                tierIndex: COMBO_LADDER_SIZE - 1,
                tierName: tierName(COMBO_LADDER_SIZE - 1),
                isRepeat: newRepeat > 0,
                repeatIndex: newRepeat,
            };
        }
        return null;
    }

    for (let i = COMBO_LADDER_SIZE - 2; i >= 0; i -= 1) {
        if (newFloors >= floors[i] && prevFloors < floors[i]) {
            return { tierIndex: i, tierName: tierName(i), isRepeat: false, repeatIndex: 0 };
        }
    }
    return null;
}
