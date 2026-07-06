/**
 * DEFAULT_IDENTITY_TUNING — the IDENTITY-phase rows (coins, shop, powerups),
 * merged into the movement TuningTable exactly like the combo rows so relics
 * and modifiers reprice the economy with zero new plumbing — and the
 * validation that THROWS on degenerate values at layer-push time (the same
 * economist law combo-scoring.md graft #3 established: a typo fails loud).
 *
 * The values are the starting table, not the truth: shop pricing is "the
 * real difficulty dial of the roguelite — tune against full-run playtests,
 * not sandbox intuition" (relics-economy.md, risks).
 */

export const DEFAULT_IDENTITY_TUNING = {
    // --- Coins (economy, distinct from score — coins never measure skill) ---
    'coins.magnetPx': 48, // collection radius around the player's center
    'coins.pickupValue': 1, // wallet value of one placed coin
    'coins.perFloor': 0.3, // 100-floor climbs preserve the old 30-floor wallet arc
    'coins.stormRate': 0, // coins/sec raining near the player; >0 only under Coin Storm
    // --- The Ghost powerup's substrate: the line rises but cannot catch ---
    'line.ghost': 0, // 0 or 1; a temporary `powerup:ghost` set-layer holds it at 1
    // --- Timed powerup spawns (in-segment spice, visible and seeded) ---
    'powerup.everyFloors': 9, // one visible spawn roughly every N floors
    // --- Shop (prices tuned so a normal act affords ~1.5 relics) ---
    'shop.priceCommon': 45,
    'shop.priceUncommon': 70,
    'shop.priceRare': 110,
    'shop.priceLegendary': 180,
    'shop.heartBasePrice': 40,
    'shop.heartPriceStep': 20, // escalation per heart bought this run
    'shop.rerollBasePrice': 15, // doubles per reroll within a shop visit
} satisfies Record<string, number>;

export type IdentityTuningKey = keyof typeof DEFAULT_IDENTITY_TUNING;

function fail(key: string, value: number, why: string): never {
    throw new Error(`identity tuning degenerate: ${key} = ${value} (${why})`);
}

/**
 * Throws on degenerate effective values. Called by TuningStack.pushLayer on
 * the post-push effective table, alongside the combo validation.
 */
export function validateIdentityTuning(t: Record<string, number>): void {
    const v = (key: IdentityTuningKey): number => t[key];

    const ghost = v('line.ghost');
    if (ghost !== 0 && ghost !== 1) {
        fail('line.ghost', ghost, 'the catch is held or it is not — 0 or 1 only');
    }
    for (const key of [
        'coins.magnetPx',
        'coins.pickupValue',
        'coins.perFloor',
        'coins.stormRate',
        'shop.priceCommon',
        'shop.priceUncommon',
        'shop.priceRare',
        'shop.priceLegendary',
        'shop.heartBasePrice',
        'shop.heartPriceStep',
        'shop.rerollBasePrice',
    ] as const) {
        if (v(key) < 0) {
            fail(key, v(key), 'negative economy value');
        }
    }
    if (v('powerup.everyFloors') < 1) {
        fail('powerup.everyFloors', v('powerup.everyFloors'), 'powerup spam per floor');
    }
    // hearts.max's finding-7 floor (playthrough-trace.md) lived here when
    // IDENTITY was the only wave stacking layers on it; RETURN moved the
    // rule to its natural table — validatePressureTuning (pressure/tuning.ts)
    // now holds the floor, called by the same pushLayer validation chain.
    // One rule, one authority: no duplicate check here.
}
