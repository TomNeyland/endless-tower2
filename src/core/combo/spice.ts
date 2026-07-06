/**
 * Spice and pricing, pure. The provisional per-air ledger's confirmation
 * (with the escrow cap: counted bounces <= bounceFloorsCapRatio x that
 * landing's floorsGained — the cap IS the refusal of shaft ping-pong), the
 * mult arithmetic, and the payout math (base = floorValue x floors^exponent,
 * Icy Tower's exact formula; payout = round(base x mult), integers always).
 *
 * The state machine in engine.ts contains zero point math by design — the
 * economist's grammar/payout seam, pre-approved in combo-scoring.md.
 */
import { INPUT_LEAD_NEVER } from '../events';
import type { TuningStack } from '../tuning';
import type { ChainCore, LinkSpice, SpiceLedger, SpiceTotals } from './types';

export function zeroTotals(): SpiceTotals {
    return { bounces: 0, perfects: 0, leaps: 0, hotLandings: 0, ceiling: false, multFromSpice: 0 };
}

/**
 * Combo's OWN perfect verdict on the raw signed inputLeadTicks — the
 * re-windowing gift movement.md grafted verbatim. Anticipation-sided by
 * design (movement.md Amendment 2): window [0, +perfectWindowTicks];
 * sentinel INPUT_LEAD_NEVER never qualifies.
 */
export function isComboPerfect(inputLeadTicks: number, t: TuningStack): boolean {
    return (
        inputLeadTicks !== INPUT_LEAD_NEVER &&
        inputLeadTicks >= 0 &&
        inputLeadTicks <= t.value('combo.perfectWindowTicks')
    );
}

/** Provisional mult delta of one just-accrued bounce (for combo/spice). */
export function bounceProvisionalDelta(perfect: boolean, t: TuningStack): number {
    return t.value('combo.multWallBounce') + (perfect ? t.value('combo.multPerfect') : 0);
}

/** The whole ledger's provisional value, uncapped (the cap needs a landing). */
export function ledgerProvisionalTotal(ledger: SpiceLedger, t: TuningStack): number {
    let total = 0;
    for (const b of ledger.bounces) {
        total += bounceProvisionalDelta(b.perfect, t);
    }
    if (ledger.ceiling) {
        total += t.value('combo.multCeiling');
    }
    return total;
}

/**
 * Confirm one link: escrow-cap the air's bounces against this landing's
 * floorsGained, price the leap (+multLeap; consecutive leaps beyond the
 * first earn +multLeapStreak more — back-to-back), the hot landing (speed
 * tier at the land, self-repricing via movement's TIER_FRACS), and the
 * once-per-chain ceiling. Pure: mutates nothing; the engine applies it.
 */
export function confirmLink(
    chain: ChainCore,
    ledger: SpiceLedger,
    floorsGained: number,
    landingTier: number,
    t: TuningStack,
): LinkSpice {
    // Escrow cap (anti-degeneracy #1): even a +2 link confirms at most
    // ratio x 2 bounces; a fizzle never reaches here — its ledger evaporated.
    const cap = Math.floor(t.value('combo.bounceFloorsCapRatio') * floorsGained + 1e-9);
    const counted = Math.min(ledger.bounces.length, cap);
    let perfects = 0;
    for (let i = 0; i < counted; i += 1) {
        if (ledger.bounces[i].perfect) {
            perfects += 1;
        }
    }

    const leap = floorsGained >= t.value('combo.leapFloors');
    const leapStreak = leap ? chain.leapStreak + 1 : 0;
    const hotLanding = landingTier >= t.value('combo.hotLandingTier');
    const ceiling = ledger.ceiling && !chain.ceilingUsed;

    let multDelta = counted * t.value('combo.multWallBounce');
    multDelta += perfects * t.value('combo.multPerfect');
    if (leap) {
        multDelta += t.value('combo.multLeap');
        if (leapStreak > 1) {
            multDelta += t.value('combo.multLeapStreak');
        }
    }
    if (hotLanding) {
        multDelta += t.value('combo.multHotLanding');
    }
    if (ceiling) {
        multDelta += t.value('combo.multCeiling');
    }

    return { bounces: counted, perfects, leap, leapStreak, hotLanding, ceiling, multDelta };
}

/** BASE (how far): round(floorValue x chainFloors^chainExponent). */
export function basePoints(chainFloors: number, t: TuningStack): number {
    if (chainFloors <= 0) {
        return 0;
    }
    return Math.round(t.value('combo.floorValue') * chainFloors ** t.value('combo.chainExponent'));
}

/** PAYOUT = round(base x mult) — integers always; no ceiling, by choice. */
export function payoutOf(base: number, mult: number): number {
    return Math.round(base * mult);
}
