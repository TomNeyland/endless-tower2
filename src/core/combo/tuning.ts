/**
 * DEFAULT_COMBO_TUNING — merged into the movement TuningTable so relics and
 * modifiers work with zero combo-specific plumbing — and the validation that
 * THROWS on degenerate values at layer-push time (economist graft #3: a
 * modifier typo fails loud, never perma-chains silently).
 *
 * The TuningTable is numbers-only by construction (mul/add/set layer ops are
 * numeric), so the ladder array from combo-scoring.md is flattened into
 * indexed keys `combo.ladderFloors0..7` — which is also the more
 * relic-friendly shape (a relic can lower one threshold without touching the
 * rest). Booleans are 0/1 by the same rule (`combo.highWaterGate`).
 */

export const COMBO_LADDER_SIZE = 8;

/** SPARK -> BEYOND display faces, indexed by tier. Light is the theme: a
 *  god-run is a comet. */
export const COMBO_TIER_NAMES = [
    'SPARK',
    'KINDLED',
    'BLAZING',
    'SOARING',
    'METEORIC',
    'COMET',
    'SUPERNOVA',
    'BEYOND',
] as const;

export const DEFAULT_COMBO_TUNING = {
    // --- The grammar ---
    'combo.linkMinFloors': 2, // fixed px-free floors — deliberately NOT self-repricing: perma-combo is the named power fantasy
    'combo.groundGraceTicks': 48, // 0.80s: the ONE window; the visible fuse
    // --- Payout: BASE (how far) x MULT (how well) ---
    'combo.floorValue': 10, // base = 10 x floors^2 — Icy Tower's exact formula, cited
    'combo.chainExponent': 2.0, // increasing marginal floor value; itself relic substrate
    // --- Spice (style -> mult; never plain continuation) ---
    'combo.multWallBounce': 0.25, // counted airborne bounce
    'combo.multPerfect': 0.25, // combo-perfect bounce, +0.25 MORE on a counted bounce
    'combo.bounceFloorsCapRatio': 1.0, // escrow cap: counted <= ratio x landing floorsGained ("Echo Walls" sets 2.0)
    'combo.perfectWindowTicks': 5, // combo's OWN window on raw inputLeadTicks, anticipation-sided [0,+5] (relic-widenable)
    'combo.leapFloors': 4, // a LEAP link climbs at least this
    'combo.multLeap': 0.5,
    'combo.multLeapStreak': 0.25, // consecutive leaps beyond the first (back-to-back)
    'combo.hotLandingTier': 3, // self-reprices via movement's TIER_FRACS
    'combo.multHotLanding': 0.25,
    'combo.multCeiling': 1.0, // once per chain
    // --- The escalation ladder (chainFloors thresholds, SPARK -> BEYOND) ---
    'combo.ladderFloors0': 4,
    'combo.ladderFloors1': 8,
    'combo.ladderFloors2': 14,
    'combo.ladderFloors3': 21,
    'combo.ladderFloors4': 30,
    'combo.ladderFloors5': 40,
    'combo.ladderFloors6': 55,
    'combo.ladderFloors7': 75,
    'combo.ladderRepeatEvery': 20, // BEYOND x2, x3 ... cadence (stinger and card only)
    // --- The wager's soften knobs ---
    'combo.voidRefundFraction': 0.0, // "Safety Net" relic substrate
    'combo.stumblesAllowed': 0, // relic-purchasable fizzle-forgiveness charges
    'combo.highWaterGate': 0, // pre-specified refarm contingency — NOT implemented until evidence (combo-scoring.md ruling)
    // --- Score (sibling consumer) ---
    'score.heightPointsPerFloor': 10, // segment high-water only — deliberately small
    // --- Presentation constants (data like everything else) ---
    'juice.comboShakeMinTier': 2, // BLAZING: first tier crossing that spends shake (and the warm grading push)
    'juice.comboShakeAmpPx': 3,
    'juice.comboShakeMs': 120,
    'juice.bankShakeAmpPx': 2, // roar-class banks: graft #6 gives bank shakes first-class standing
    'juice.bankShakeMs': 100,
    'audio.glorySustainMs': 4000, // glory-layer gate at sustained tier >= SOARING
    'hud.bankWhisper': 500, // payout below this whispers
    'hud.bankVoice': 5000, // payout below this speaks; at-or-above roars
} satisfies Record<string, number>;

export type ComboTuningKey = keyof typeof DEFAULT_COMBO_TUNING;

function fail(key: string, value: number, why: string): never {
    throw new Error(`combo tuning degenerate: ${key} = ${value} (${why})`);
}

/**
 * Throws on degenerate effective values. Called by TuningStack.pushLayer on
 * the post-push effective table — crash at layer-push time, by design.
 */
export function validateComboTuning(t: Record<string, number>): void {
    const v = (key: ComboTuningKey): number => t[key];

    if (v('combo.linkMinFloors') < 1) {
        fail('combo.linkMinFloors', v('combo.linkMinFloors'), 'a 0-floor link perma-chains');
    }
    if (v('combo.groundGraceTicks') < 1) {
        fail('combo.groundGraceTicks', v('combo.groundGraceTicks'), 'the fuse must exist');
    }
    if (v('combo.floorValue') < 0) {
        fail('combo.floorValue', v('combo.floorValue'), 'negative payout');
    }
    if (v('combo.chainExponent') < 0) {
        fail('combo.chainExponent', v('combo.chainExponent'), 'decaying floor value');
    }
    for (const key of [
        'combo.multWallBounce',
        'combo.multPerfect',
        'combo.multLeap',
        'combo.multLeapStreak',
        'combo.multHotLanding',
        'combo.multCeiling',
        'combo.bounceFloorsCapRatio',
        'combo.perfectWindowTicks',
    ] as const) {
        if (v(key) < 0) {
            fail(key, v(key), 'negative cap or spice');
        }
    }
    if (v('combo.leapFloors') < 1) {
        fail('combo.leapFloors', v('combo.leapFloors'), 'every link would be a leap');
    }
    for (let i = 0; i < COMBO_LADDER_SIZE; i += 1) {
        const key = `combo.ladderFloors${i}` as ComboTuningKey;
        const prev = i === 0 ? 1 : v(`combo.ladderFloors${i - 1}` as ComboTuningKey);
        if (v(key) < 1 || v(key) < prev) {
            fail(key, v(key), 'ladder must be positive and non-decreasing');
        }
    }
    if (v('combo.ladderRepeatEvery') < 1) {
        fail('combo.ladderRepeatEvery', v('combo.ladderRepeatEvery'), 'BEYOND repeat spam');
    }
    const refund = v('combo.voidRefundFraction');
    if (refund < 0 || refund > 1) {
        fail('combo.voidRefundFraction', refund, 'refund must be a fraction');
    }
    if (v('combo.stumblesAllowed') < 0) {
        fail('combo.stumblesAllowed', v('combo.stumblesAllowed'), 'negative charges');
    }
    if (v('combo.highWaterGate') !== 0) {
        // The refarm contingency is pre-specified but deliberately NOT
        // implemented until segment evidence (combo-scoring.md ruling). A
        // relic/modifier flipping it would change nothing — a silently inert
        // knob is a lie, so flipping it fails loud instead.
        fail(
            'combo.highWaterGate',
            v('combo.highWaterGate'),
            'reserved contingency, not implemented until refarm evidence',
        );
    }
    if (v('combo.hotLandingTier') < 0) {
        fail('combo.hotLandingTier', v('combo.hotLandingTier'), 'negative tier');
    }
    if (v('score.heightPointsPerFloor') < 0) {
        fail('score.heightPointsPerFloor', v('score.heightPointsPerFloor'), 'negative height pay');
    }
    if (v('hud.bankWhisper') > v('hud.bankVoice')) {
        fail('hud.bankWhisper', v('hud.bankWhisper'), 'whisper boundary above voice boundary');
    }
}
