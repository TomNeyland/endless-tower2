/** Movement-derived reachability proof and the difficulty frontier. */
import { geometryForDifficulty } from './difficulty/curve';
import { jumpVyForSpeed, minTakeoffSpeedForHeight, predictedApexPx } from './movement/jump';
import type { PlatformSpec } from './tower';
import { TILE } from './tower-constants';
import type { TuningStack } from './tuning';

/** Feet must clear a platform's top by this margin at the required speed. */
const CLEARANCE_PX = 40;
/** Runway margin: footing to land plus start the next run-up. */
const RUNWAY_MARGIN_PX = 96;
const FRONTIER_ITERATIONS = 32;

/** Distance needed to accelerate from rest to speed s under the two regimes. */
function runwayFor(s: number, t: TuningStack): number {
    const knee = t.value('RUN_REGIME_SPEED');
    const aLow = t.value('RUN_ACCEL_LOW');
    const aHigh = t.value('RUN_ACCEL_HIGH');
    if (s <= knee) {
        return (s * s) / (2 * aLow);
    }
    return (knee * knee) / (2 * aLow) + (s * s - knee * knee) / (2 * aHigh);
}

/** Speed reachable from rest on a runway of length d under the two regimes. */
function speedOnRunway(d: number, t: TuningStack): number {
    const knee = t.value('RUN_REGIME_SPEED');
    const aLow = t.value('RUN_ACCEL_LOW');
    const aHigh = t.value('RUN_ACCEL_HIGH');
    const kneeDist = (knee * knee) / (2 * aLow);
    if (d <= kneeDist) {
        return Math.sqrt(2 * aLow * d);
    }
    return Math.sqrt(knee * knee + 2 * aHigh * (d - kneeDist));
}

function timeToAltitude(vy: number, g: number, dy: number): number {
    const discriminant = vy * vy - 2 * g * dy;
    return (vy - Math.sqrt(discriminant)) / g;
}

/**
 * A player starting from rest on `from` can build enough speed on its
 * runway to clear `to`, vertically and horizontally, with real margins.
 */
export function isPlatformReachable(from: PlatformSpec, to: PlatformSpec, t: TuningStack): boolean {
    const needed = from.topY - to.topY + CLEARANCE_PX;
    const usable = from.width - RUNWAY_MARGIN_PX;
    if (usable <= 0) {
        return false;
    }
    const runwaySpeed = Math.min(speedOnRunway(usable, t), t.value('MAX_RUN_SPEED'));
    const takeoffSpeed = runwaySpeed < t.value('SPEED_DEADBAND') ? 0 : runwaySpeed;
    const jumpVy = jumpVyForSpeed(takeoffSpeed, t);
    if (predictedApexPx(jumpVy, t) < needed) {
        return false;
    }
    const requiredSpeed = minTakeoffSpeedForHeight(needed, t);
    if (requiredSpeed > 0 && usable < runwayFor(requiredSpeed, t)) {
        return false;
    }

    const fromLeft = from.xCenter - from.width / 2;
    const fromRight = from.xCenter + from.width / 2;
    const toLeft = to.xCenter - to.width / 2;
    const toRight = to.xCenter + to.width / 2;
    const horizontalGap = Math.max(0, toLeft - fromRight, fromLeft - toRight);
    if (horizontalGap === 0) {
        return true;
    }

    const ascentTime = timeToAltitude(jumpVy, t.value('GRAVITY_RISE'), needed);
    const carried = takeoffSpeed * t.value('JUMP_RETENTION');
    const reach = carried * ascentTime + 0.5 * t.value('AIR_ACCEL') * ascentTime * ascentTime;
    return horizontalGap <= reach - 20;
}

export function integerWidthBand(index: number, t: TuningStack): [number, number] {
    const geometry = geometryForDifficulty(index, t);
    const min = Math.ceil(geometry.widthMinTiles);
    const max = Math.floor(geometry.widthMaxTiles);
    if (min > max) {
        throw new Error(`tower generator: difficulty ${index} has no whole-tile width`);
    }
    return [min, max];
}

export function physicalPlatformWidth(baseTiles: number, t: TuningStack): number {
    const tiles = Math.round(baseTiles * t.value('tower.platformWidthMul'));
    if (tiles < 1) {
        throw new Error(`tower generator: post-curve width is ${tiles} tiles`);
    }
    return tiles * TILE;
}

function worstCaseReachable(index: number, t: TuningStack): boolean {
    const geometry = geometryForDifficulty(index, t);
    const [minTiles] = integerWidthBand(index, t);
    const width = physicalPlatformWidth(minTiles, t);
    const from: PlatformSpec = { id: 1, xCenter: 0, topY: 0, width };
    return [geometry.gapMinPx, geometry.gapMaxPx].every((gap) =>
        isPlatformReachable(
            from,
            {
                id: 2,
                xCenter: width + geometry.scatterPx,
                topY: -gap,
                width,
            },
            t,
        ),
    );
}

/**
 * Highest index whose worst gap, narrowest ledges, and widest scatter remain
 * reachable. The binary search returns its proven-reachable lower bound.
 */
export function reachabilityFrontier(t: TuningStack): number {
    if (!worstCaseReachable(0, t)) {
        throw new Error('tower generator: difficulty index 0 violates reachability');
    }
    if (worstCaseReachable(1, t)) {
        return 1;
    }
    let reachable = 0;
    let unreachable = 1;
    for (let i = 0; i < FRONTIER_ITERATIONS; i += 1) {
        const candidate = (reachable + unreachable) / 2;
        if (worstCaseReachable(candidate, t)) {
            reachable = candidate;
        } else {
            unreachable = candidate;
        }
    }
    return reachable;
}
