/**
 * Seeded sandbox tower generator. Varied spacing and widths, and one binding
 * promise: reachability versus the jump curve is the GENERATOR's contract,
 * with real clearance margins. If a layout cannot satisfy the contract it
 * throws — an unreachable tower is a bug, never a shrug.
 */
import { buildDifficultyTrace, evaluateDifficulty } from './difficulty/curve';
import type { DifficultyTracePoint, SegmentDifficulty } from './difficulty/types';
import type { LandClassification } from './events';
import { fork, range, rangeInt } from './rng';
import {
    integerWidthBand,
    isPlatformReachable,
    physicalPlatformWidth,
    reachabilityFrontier,
} from './tower-reachability';
import { GROUND_PLATFORM_ID, WALL_LEFT_X, WALL_RIGHT_X } from './tower-constants';
import type { TuningStack } from './tuning';

export {
    GROUND_PLATFORM_ID,
    TILE,
    TOWER_WIDTH,
    WALL_LEFT_X,
    WALL_RIGHT_X,
} from './tower-constants';
export { isPlatformReachable, reachabilityFrontier } from './tower-reachability';

export interface PlatformSpec {
    id: number;
    /** Body-center x. */
    xCenter: number;
    /** World y of the walkable top. */
    topY: number;
    width: number;
    /** Curve diagnostics embedded with the layout for replay/debug truth. */
    difficultyIndex?: number;
    /** True when this ledge sits inside an actual seeded relief phrase. */
    breather?: boolean;
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
    difficultyTrace: DifficultyTracePoint[];
}

export interface TowerGenerationSpec {
    /** Progress denominator: the door floor (or arena generation budget). */
    totalFloors: number;
    /** Geometry altitude, including any visual buffer above the door. */
    heightFloors: number;
    difficulty: SegmentDifficulty;
}

export function generateSandboxTower(
    seed: number,
    t: TuningStack,
    groundTopY: number,
    spec: TowerGenerationSpec,
): TowerLayout {
    if (
        !Number.isInteger(spec.totalFloors) ||
        spec.totalFloors < 1 ||
        !Number.isFinite(spec.heightFloors) ||
        spec.heightFloors < spec.totalFloors
    ) {
        throw new Error(
            `tower generator: invalid floor budget ${spec.totalFloors}/${spec.heightFloors}`,
        );
    }
    const rng = fork(seed, 'tower:geometry');
    const platforms: PlatformSpec[] = [];
    const frontier = reachabilityFrontier(t);
    const difficultyTrace = buildDifficultyTrace(
        spec.difficulty,
        seed,
        spec.totalFloors,
        frontier,
        t,
    );

    const ground: PlatformSpec = {
        id: GROUND_PLATFORM_ID,
        xCenter: (WALL_LEFT_X + WALL_RIGHT_X) / 2,
        topY: groundTopY,
        width: WALL_RIGHT_X - WALL_LEFT_X,
    };
    platforms.push(ground);

    let prev = ground;
    const floorHeight = t.value('FLOOR_HEIGHT_PX');
    const targetY = groundTopY - spec.heightFloors * floorHeight;
    while (prev.topY > targetY) {
        const climbedFloors = Math.min(spec.totalFloors, (groundTopY - prev.topY) / floorHeight);
        const difficulty = evaluateDifficulty(
            spec.difficulty,
            seed,
            spec.totalFloors,
            climbedFloors,
            frontier,
            t,
        );
        const denseHalf = rng() < difficulty.geometry.density;
        const gapT = (denseHalf ? 0 : 0.5) + rng() * 0.5;
        const spacing =
            difficulty.geometry.gapMinPx +
            (difficulty.geometry.gapMaxPx - difficulty.geometry.gapMinPx) * gapT;
        const [widthMin, widthMax] = integerWidthBand(difficulty.index, t);
        const width = physicalPlatformWidth(rangeInt(rng, widthMin, widthMax), t);
        const wallMinX = WALL_LEFT_X + width / 2;
        const wallMaxX = WALL_RIGHT_X - width / 2;
        if (wallMinX > wallMaxX) {
            throw new Error(`tower generator: ${width}px platform exceeds the tower interior`);
        }
        const centerDelta = (prev.width + width) / 2 + difficulty.geometry.scatterPx;
        const minX = Math.max(wallMinX, prev.xCenter - centerDelta);
        const maxX = Math.min(wallMaxX, prev.xCenter + centerDelta);
        const placed: PlatformSpec = {
            id: platforms.length,
            xCenter: range(rng, minX, maxX),
            topY: prev.topY - spacing,
            width,
            difficultyIndex: difficulty.index,
            breather: difficulty.breather,
        };
        if (!isPlatformReachable(prev, placed, t)) {
            throw new Error(
                `tower generator: frontier proof failed at platform ${placed.id} ` +
                    `(seed ${seed}, index ${difficulty.index}, frontier ${frontier}, ` +
                    `fromWidth ${prev.width}, toWidth ${width}, gap ${spacing}, ` +
                    `scatter ${difficulty.geometry.scatterPx})`,
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
        difficultyTrace,
    };
}
