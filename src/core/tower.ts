/**
 * Seeded sandbox tower generator. Varied spacing and widths, and one binding
 * promise: reachability versus the jump curve is the GENERATOR's contract,
 * with real clearance margins. If a layout cannot satisfy the contract it
 * throws — an unreachable tower is a bug, never a shrug.
 */
import type { LandClassification } from './events';
import { jumpVyForSpeed, minTakeoffSpeedForHeight, predictedApexPx } from './movement/jump';
import { mulberry32, range, rangeInt } from './rng';
import type { TuningStack } from './tuning';

export const TILE = 64;
export const TOWER_WIDTH = 1024;
/** Inner faces of the wall planes — the tower is exactly canvas-wide. */
export const WALL_LEFT_X = TILE;
export const WALL_RIGHT_X = TOWER_WIDTH - TILE;
/** The ground platform's id — the spawn floor. */
export const GROUND_PLATFORM_ID = 0;

/** Feet must clear a platform's top by this margin at the required speed. */
const CLEARANCE_PX = 40;
/** Runway margin: footing to land plus start the next run-up. */
const RUNWAY_MARGIN_PX = 96;
const MAX_ATTEMPTS = 60;

export interface PlatformSpec {
    id: number;
    /** Body-center x. */
    xCenter: number;
    /** World y of the walkable top. */
    topY: number;
    width: number;
    /**
     * Initial landing classification (EXAM / movement.md Amendment 1c):
     * rolled at segment build from the spec's field fractions (Brittle Rows,
     * Sticky Patches). Absent = ordinary ledge. Embedded in recordings with
     * the rest of the layout, so the headless field starts identically.
     */
    landClass?: LandClassification;
}

export interface TowerLayout {
    platforms: PlatformSpec[];
    groundTopY: number;
    wallLeftX: number;
    wallRightX: number;
}

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

/** Time to first reach altitude dy on a jump with takeoff vy, rise gravity g. */
function timeToAltitude(vy: number, g: number, dy: number): number {
    const disc = vy * vy - 2 * g * dy;
    return (vy - Math.sqrt(Math.max(0, disc))) / g;
}

/**
 * The contract: a player starting from REST on `from` (worst case — never
 * lean on carried momentum or wall routing) can build enough speed on the
 * usable runway to clear `to` with real margins, vertically and horizontally.
 */
function isReachable(from: PlatformSpec, to: PlatformSpec, t: TuningStack): boolean {
    const dy = from.topY - to.topY;
    const needed = dy + CLEARANCE_PX;

    // Best takeoff speed the source platform's runway can honestly provide.
    const usable = Math.max(0, from.width - RUNWAY_MARGIN_PX);
    const sRunway = Math.min(speedOnRunway(usable, t), t.value('MAX_RUN_SPEED'));
    const sEff = sRunway < t.value('SPEED_DEADBAND') ? 0 : sRunway;

    // Vertical: achievable apex must clear the spacing plus margin. Also
    // demand the *required* speed fits the runway (same fact, kept explicit
    // so tuning changes fail loudly here rather than in play).
    if (predictedApexPx(jumpVyForSpeed(sEff, t), t) < needed) {
        return false;
    }
    const sReq = minTakeoffSpeedForHeight(needed, t);
    if (sReq > 0 && usable < runwayFor(sReq, t)) {
        return false;
    }

    // Horizontal: the edge gap must be coverable during the ascent with the
    // retained speed plus air accel.
    const fromLeft = from.xCenter - from.width / 2;
    const fromRight = from.xCenter + from.width / 2;
    const toLeft = to.xCenter - to.width / 2;
    const toRight = to.xCenter + to.width / 2;
    const gapX = Math.max(0, toLeft - fromRight, fromLeft - toRight);
    if (gapX === 0) {
        return true;
    }

    const vy = jumpVyForSpeed(sEff, t);
    const tUp = timeToAltitude(vy, t.value('GRAVITY_RISE'), needed);
    const carried = sEff * t.value('JUMP_RETENTION');
    const reach = carried * tUp + 0.5 * t.value('AIR_ACCEL') * tUp * tUp;
    return gapX <= Math.max(40, reach - 20);
}

export function generateSandboxTower(
    seed: number,
    t: TuningStack,
    groundTopY: number,
    platformCount = 300,
): TowerLayout {
    const rng = mulberry32(seed);
    const platforms: PlatformSpec[] = [];

    const ground: PlatformSpec = {
        id: GROUND_PLATFORM_ID,
        xCenter: (WALL_LEFT_X + WALL_RIGHT_X) / 2,
        topY: groundTopY,
        width: WALL_RIGHT_X - WALL_LEFT_X,
    };
    platforms.push(ground);

    let prev = ground;
    for (let i = 1; i <= platformCount; i += 1) {
        let placed: PlatformSpec | null = null;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            const spacing = range(rng, 100, 160);
            const widthTiles = rangeInt(rng, 3, 7);
            // Width is repriceable data (CHOICE: Narrow Ledges ×0.7, Coin
            // Rush ×1.25). Applied AFTER the roll so the rng draw count —
            // and therefore every existing recording — is unchanged at ×1,
            // and quantized to whole tiles so the rendered ledge is exactly
            // the physics ledge (TowerView draws tile-grain caps).
            const widthMul = t.value('tower.platformWidthMul');
            const width = Math.max(2, Math.round(widthTiles * widthMul)) * TILE;
            const minX = WALL_LEFT_X + width / 2;
            const maxX = WALL_RIGHT_X - width / 2;
            const candidate: PlatformSpec = {
                id: i,
                xCenter: range(rng, minX, maxX),
                topY: prev.topY - spacing,
                width,
            };
            if (isReachable(prev, candidate, t)) {
                placed = candidate;
                break;
            }
        }
        if (!placed) {
            throw new Error(
                `tower generator: reachability contract unsatisfiable at platform ${i} (seed ${seed})`,
            );
        }
        platforms.push(placed);
        prev = placed;
    }

    return {
        platforms,
        groundTopY,
        wallLeftX: WALL_LEFT_X,
        wallRightX: WALL_RIGHT_X,
    };
}
