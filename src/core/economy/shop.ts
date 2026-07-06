/**
 * Shop stock and pricing, pure (docs/design/relics-economy.md). The scene
 * only renders what this module rolls.
 *
 * Stock is seeded from fork(seed, 'shop:<nodeId>:<reroll>'): 3 relics
 * rarity-weighted by act (act 1 leans common, act 3 leans rare), 1 heart
 * with a price that escalates per heart bought this run, 1 reroll whose
 * price doubles per use within the visit. Prices are tuning rows — the real
 * difficulty dial of the roguelite, tuned against full-run playtests.
 */
import type { RelicRarity } from '../events';
import { RELICS } from '../relics/roster';
import type { RelicDef } from '../relics/types';
import { fork } from '../rng';
import type { TuningStack } from '../tuning';

export const SHOP_RELIC_SLOTS = 3;

/** Rarity weights per act index (clamped to the last row past act 3). */
const ACT_RARITY_WEIGHTS: readonly Record<RelicRarity, number>[] = [
    { common: 0.55, uncommon: 0.3, rare: 0.12, legendary: 0.03 }, // act 1 leans common
    { common: 0.35, uncommon: 0.35, rare: 0.22, legendary: 0.08 },
    { common: 0.18, uncommon: 0.32, rare: 0.34, legendary: 0.16 }, // act 3 leans rare
];

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
 * Roll the relic slots: weighted rarity pick, then a uniform pick within
 * that rarity's still-available pool. Weights are renormalized over the
 * rarities that still have unowned, un-rolled relics — the weighted pick
 * must land somewhere real, and the redistribution is part of the sampling
 * definition, deterministic under the fork. Fewer than 3 slots means the
 * pool genuinely ran dry (24 relics; late-run shops may thin out).
 */
export function rollShopStock(
    seed: number,
    nodeId: string,
    actIndex: number,
    ownedIds: readonly string[],
    reroll: number,
): RelicDef[] {
    const rng = fork(seed, `shop:${nodeId}:${reroll}`);
    const weights = ACT_RARITY_WEIGHTS[Math.min(actIndex, ACT_RARITY_WEIGHTS.length - 1)];
    const owned = new Set(ownedIds);
    const pool = RELICS.filter((r) => !owned.has(r.id));

    const stock: RelicDef[] = [];
    while (stock.length < SHOP_RELIC_SLOTS) {
        const taken = new Set(stock.map((r) => r.id));
        const available = pool.filter((r) => !taken.has(r.id));
        if (available.length === 0) {
            break;
        }
        const byRarity = new Map<RelicRarity, RelicDef[]>();
        for (const relic of available) {
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
        stock.push(candidates[Math.floor(rng() * candidates.length)]);
    }
    return stock;
}
