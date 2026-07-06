/**
 * Coins — the economy, distinct from score (docs/design/relics-economy.md).
 * Score is glory; coins buy things and never measure skill. Sources: placed
 * pickups in segments (density from the spec's loot profile), node bounties
 * and Mystery outcomes (CHOICE's to grant through RunState.addCoins). There
 * is deliberately NO coin drip from combos — separate streams stay legible.
 *
 * Placement is seeded from fork(spec.seed, 'coins:<segmentId>') so identical
 * specs place identical coins. Collection is a pure proximity test against
 * the player's center: everything inside coins.magnetPx collects; anything
 * collected beyond body-contact distance is flagged `magnetized` so the
 * presentation can sell the pull. The wallet itself lives in RunState.
 */
import { fork } from '../rng';
import { GROUND_PLATFORM_ID, type TowerLayout } from '../tower';
import type { TuningStack } from '../tuning';
import type { SegmentSpec } from '../pressure/segment';

export interface CoinSpec {
    id: number;
    x: number;
    y: number;
    value: number;
}

export interface CoinCollection {
    coin: CoinSpec;
    magnetized: boolean;
}

/** Collection inside this radius reads as body contact, not magnet pull. */
const CONTACT_PX = 34;
/** Coins float this far above a platform's walkable top. */
const COIN_HOVER_PX = 46;
/** Keep coins off the caps so they read on the platform, not past its edge. */
const EDGE_MARGIN_PX = 36;

/**
 * Place a segment's coins on its platforms, seeded. Density is expected
 * coins per floor climbed (the spec's loot profile); each platform's span
 * since the previous platform carries that expectation, with the fraction
 * resolved by one seeded roll. Buffer floors above the door are scenery and
 * get no loot.
 */
export function placeSegmentCoins(
    spec: SegmentSpec,
    layout: TowerLayout,
    t: TuningStack,
): CoinSpec[] {
    const rng = fork(spec.seed, `coins:${spec.segmentId}`);
    const floorH = t.value('FLOOR_HEIGHT_PX');
    const value = t.value('coins.pickupValue');
    const doorAltitudeY = layout.groundTopY - spec.floors * floorH;

    const coins: CoinSpec[] = [];
    let id = 0;
    let prevTopY = layout.groundTopY;
    for (const p of layout.platforms) {
        if (p.id === GROUND_PLATFORM_ID) {
            continue;
        }
        const spanFloors = (prevTopY - p.topY) / floorH;
        prevTopY = p.topY;
        if (p.topY < doorAltitudeY - 1e-6) {
            continue; // above the door: visual-continuity buffer, never loot
        }
        const expected = spec.loot.coinsPerFloor * spanFloors;
        let count = Math.floor(expected);
        if (rng() < expected - count) {
            count += 1;
        }
        const usable = Math.max(0, p.width - EDGE_MARGIN_PX * 2);
        for (let i = 0; i < count; i += 1) {
            coins.push({
                id: id++,
                x: p.xCenter - usable / 2 + rng() * usable,
                y: p.topY - COIN_HOVER_PX,
                value,
            });
        }
    }
    return coins;
}

/** The live pickup field: placed coins minus what the run has collected. */
export class CoinField {
    private live: Map<number, CoinSpec>;
    private nextTransientId: number;

    constructor(coins: readonly CoinSpec[]) {
        this.live = new Map(coins.map((c) => [c.id, c]));
        this.nextTransientId = coins.length > 0 ? Math.max(...coins.map((c) => c.id)) + 1 : 0;
    }

    remaining(): number {
        return this.live.size;
    }

    coins(): CoinSpec[] {
        return [...this.live.values()];
    }

    /** Add a transient coin (Coin Storm's shower). Returns its spec. */
    spawnTransient(x: number, y: number, value: number): CoinSpec {
        const coin: CoinSpec = { id: this.nextTransientId++, x, y, value };
        this.live.set(coin.id, coin);
        return coin;
    }

    /** Drop a transient that fell out of play uncollected. */
    expire(id: number): void {
        this.live.delete(id);
    }

    /** Move a live coin (storm coins fall); unknown ids are a caller bug. */
    move(id: number, x: number, y: number): void {
        const coin = this.live.get(id);
        if (!coin) {
            throw new Error(`coins: move on unknown coin ${id}`);
        }
        coin.x = x;
        coin.y = y;
    }

    /** One proximity pass against the player's center. Collected coins leave
     *  the field; the caller feeds the wallet and the presentation. */
    step(playerX: number, playerY: number, magnetPx: number): CoinCollection[] {
        const collected: CoinCollection[] = [];
        const magnetSq = magnetPx * magnetPx;
        const contactSq = CONTACT_PX * CONTACT_PX;
        for (const coin of this.live.values()) {
            const dx = coin.x - playerX;
            const dy = coin.y - playerY;
            const distSq = dx * dx + dy * dy;
            if (distSq <= magnetSq) {
                this.live.delete(coin.id);
                collected.push({ coin, magnetized: distSq > contactSq });
            }
        }
        return collected;
    }
}
