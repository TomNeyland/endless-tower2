/**
 * Shop stock, pricing, and the elite's relic reward — pure
 * (docs/design/relics-economy.md). The scene only renders what this rolls.
 *
 * Stock is seeded from fork(runSeed, 'shop:<nodeId>:<reroll>') at VISIT
 * time, against the live owned set — a declared deviation from both docs'
 * generation-time roll and bare 'shop:<nodeId>' label (docs/DEVIATIONS.md
 * entry 15): 3 relics rarity-weighted by act (act 1 leans common, act 3
 * leans rare), 1 heart with a price that escalates per heart bought this
 * run, 1 reroll whose price doubles per use within the visit. Prices are
 * tuning rows — the real difficulty dial of the roguelite, tuned against
 * full-run playtests.
 *
 * An Elite's guaranteed relic rolls from fork(runSeed, 'relic:<nodeId>')
 * with the same act weighting (one rarity authority) — granted on the spot
 * at segment clear (docs/DEVIATIONS.md entry 11).
 */
import type { RelicRarity } from '../events';
import { RELICS } from '../relics/roster';
import type { RelicDef } from '../relics/types';
import { fork, type Rng } from '../rng';
import type { TuningStack } from '../tuning';

export const SHOP_RELIC_SLOTS = 3;

/** Rarity weights per act (1-based; clamped to the last row past act 3). */
const ACT_RARITY_WEIGHTS: readonly Record<RelicRarity, number>[] = [
    { common: 0.55, uncommon: 0.3, rare: 0.12, legendary: 0.03 }, // act 1 leans common
    { common: 0.35, uncommon: 0.35, rare: 0.22, legendary: 0.08 },
    { common: 0.18, uncommon: 0.32, rare: 0.34, legendary: 0.16 }, // act 3 leans rare
];

function actRarityWeights(act: number): Record<RelicRarity, number> {
    if (!Number.isInteger(act) || act < 1) {
        throw new Error(`shop: act ${act} — acts are 1-based`);
    }
    return ACT_RARITY_WEIGHTS[Math.min(act, ACT_RARITY_WEIGHTS.length) - 1];
}

const PRICE_KEY: Record<
    RelicRarity,
    'shop.priceCommon' | 'shop.priceUncommon' | 'shop.priceRare' | 'shop.priceLegendary'
> = {
    common: 'shop.priceCommon',
    uncommon: 'shop.priceUncommon',
    rare: 'shop.priceRare',
    legendary: 'shop.priceLegendary',
};

export function relicPrice(t: TuningStack, rarity: RelicRarity): number {
    return Math.round(t.value(PRICE_KEY[rarity]));
}

/** Escalates per heart bought THIS RUN (RunState.heartsBought). */
export function heartPrice(t: TuningStack, heartsBought: number): number {
    return Math.round(
        t.value('shop.heartBasePrice') + t.value('shop.heartPriceStep') * heartsBought,
    );
}

/** Doubles per reroll within one shop visit. */
export function rerollPrice(t: TuningStack, rerollsUsed: number): number {
    return Math.round(t.value('shop.rerollBasePrice') * 2 ** rerollsUsed);
}

/**
 * Weighted rarity pick, then a uniform pick within that rarity's pool.
 * Weights are renormalized over the rarities that still have candidates —
 * the pick must land somewhere real, and the redistribution is part of the
 * sampling definition, deterministic under the fork. Non-empty pool is the
 * caller's contract.
 */
function pickByRarity(
    rng: Rng,
    pool: readonly RelicDef[],
    weights: Record<RelicRarity, number>,
): RelicDef {
    const byRarity = new Map<RelicRarity, RelicDef[]>();
    for (const relic of pool) {
        const list = byRarity.get(relic.rarity) ?? [];
        list.push(relic);
        byRarity.set(relic.rarity, list);
    }
    let totalWeight = 0;
    for (const rarity of byRarity.keys()) {
        totalWeight += weights[rarity];
    }
    let roll = rng() * totalWeight;
    let chosenRarity: RelicRarity = [...byRarity.keys()][0];
    for (const rarity of byRarity.keys()) {
        roll -= weights[rarity];
        if (roll <= 0) {
            chosenRarity = rarity;
            break;
        }
    }
    const candidates = byRarity.get(chosenRarity) as RelicDef[];
    return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * Roll the relic slots. Fewer than 3 means the pool genuinely ran dry
 * (24 relics; late-run shops may thin out). `unlockedPool` is the save's
 * relic pool (RETURN's 16-plus-earned — core/meta/unlocks.ts); defaults to
 * the full roster so pool-agnostic callers (harnesses) stay unchanged.
 */
export function rollShopStock(
    runSeed: string,
    nodeId: string,
    act: number,
    ownedIds: readonly string[],
    reroll: number,
    unlockedPool: readonly RelicDef[] = RELICS,
): RelicDef[] {
    const rng = fork(runSeed, `shop:${nodeId}:${reroll}`);
    const weights = actRarityWeights(act);
    const owned = new Set(ownedIds);
    const pool = unlockedPool.filter((r) => !owned.has(r.id));

    const stock: RelicDef[] = [];
    while (stock.length < SHOP_RELIC_SLOTS) {
        const taken = new Set(stock.map((r) => r.id));
        const available = pool.filter((r) => !taken.has(r.id));
        if (available.length === 0) {
            break;
        }
        stock.push(pickByRarity(rng, available, weights));
    }
    return stock;
}

/**
 * The Elite's guaranteed relic, rolled at clear against the live build.
 * Null means the unowned pool ran dry — the same thinning rule as shop
 * slots (a 24-relic roster cannot out-promise itself; the toast says so
 * out loud rather than granting a duplicate).
 */
export function rollRelicReward(
    runSeed: string,
    nodeId: string,
    act: number,
    ownedIds: readonly string[],
    unlockedPool: readonly RelicDef[] = RELICS,
): RelicDef | null {
    const rng = fork(runSeed, `relic:${nodeId}`);
    const owned = new Set(ownedIds);
    const pool = unlockedPool.filter((r) => !owned.has(r.id));
    if (pool.length === 0) {
        return null;
    }
    return pickByRarity(rng, pool, actRarityWeights(act));
}
