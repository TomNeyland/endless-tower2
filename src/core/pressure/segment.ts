/**
 * Segments: a bounded climb as pure data (docs/design/pressure.md).
 *
 * A SegmentSpec is authored by CHOICE-phase node types; PRESSURE builds the
 * runtime. This module owns the spec type, the floor budget, exit-door
 * placement, and the end conditions — all engine-free. The generator keeps a
 * small buffer of floors above the door purely for visual continuity, which
 * is also why crossing the door's floor IS the exit: the buffer is scenery,
 * never a place a finishing player can strand themselves.
 */
import { generateSandboxTower, type PlatformSpec, type TowerLayout } from '../tower';
import type { TuningKey, TuningOp, TuningStack } from '../tuning';
import type { LineMode, ProximityTierName } from './line';

/** One tuning repricing carried by a spec (line profile / node modifier). */
export interface SegmentTuningOverride {
    key: TuningKey;
    op: TuningOp;
    value: number;
}

export interface SegmentSpec {
    segmentId: string;
    /** The door's floor — the climb's win condition. */
    floors: number;
    /** Tower-generation seed; identical spec replays identically. */
    seed: number;
    /** Line repricing for this segment (e.g. Greedy Line), applied as layers. */
    lineProfile: SegmentTuningOverride[];
    /** CHOICE-phase mutators, applied as layers. Semantics arrive with CHOICE. */
    modifiers: SegmentTuningOverride[];
}

export interface DoorPlacement {
    platformId: number;
    xCenter: number;
    /** Walkable top of the door's platform — the exit altitude. */
    topY: number;
    halfWidth: number;
    floorIndex: number;
}

export interface SegmentBuild {
    layout: TowerLayout;
    door: DoorPlacement;
}

/** The bridge's no-argument segment: baseline floors, deterministic seed. */
export function defaultSegmentSpec(t: TuningStack, seed: number): SegmentSpec {
    const floors = t.value('segment.defaultFloors');
    return {
        segmentId: `segment-${seed}-${floors}`,
        floors,
        seed,
        lineProfile: [],
        modifiers: [],
    };
}

function floorIndexOf(topY: number, groundTopY: number, floorHeightPx: number): number {
    return Math.floor((groundTopY - topY) / floorHeightPx + 1e-6);
}

/**
 * Build the bounded tower for a spec: platforms up to floors + doorBufferFloors
 * (the visual-continuity budget), and the door on the first platform at or
 * above the door floor. Degenerate specs and unplaceable doors throw — a
 * broken segment is a bug, never a shrug.
 */
export function buildSegmentTower(
    spec: SegmentSpec,
    t: TuningStack,
    groundTopY: number,
): SegmentBuild {
    if (!Number.isFinite(spec.floors) || spec.floors < 1) {
        throw new Error(`segment ${spec.segmentId}: floors must be >= 1, got ${spec.floors}`);
    }
    const floorH = t.value('FLOOR_HEIGHT_PX');
    const budgetFloors = spec.floors + t.value('segment.doorBufferFloors');
    const budgetPx = budgetFloors * floorH;

    // The sandbox generator places platforms 100-160px apart, so this count
    // is guaranteed to reach the budget height; everything above it is
    // trimmed (a prefix of the reachability chain stays reachable).
    const platformCount = Math.ceil(budgetPx / 100) + 2;
    const full = generateSandboxTower(spec.seed, t, groundTopY, platformCount);
    const platforms = full.platforms.filter((p) => p.topY >= groundTopY - budgetPx);

    const doorAltitudeY = groundTopY - spec.floors * floorH;
    const doorPlatform: PlatformSpec | undefined = platforms.find(
        (p) => p.topY <= doorAltitudeY + 1e-6,
    );
    if (!doorPlatform) {
        throw new Error(
            `segment ${spec.segmentId}: no platform at or above door floor ${spec.floors}`,
        );
    }

    return {
        layout: { ...full, platforms },
        door: {
            platformId: doorPlatform.id,
            xCenter: doorPlatform.xCenter,
            topY: doorPlatform.topY,
            halfWidth: doorPlatform.width / 2,
            floorIndex: floorIndexOf(doorPlatform.topY, groundTopY, floorH),
        },
    };
}

/**
 * Exit condition: the player's feet at or above the door's floor. Walking
 * through suffices (the verbs stay pure — no up-press), and because the
 * condition is an altitude, it is un-missable at any speed: a five-floor
 * leap past the doorway still finishes the climb.
 */
export function doorReached(door: DoorPlacement, feetY: number): boolean {
    return feetY <= door.topY + 1e-6;
}

/** A segment armed for play: the spec plus its built door and arena bottom. */
export interface ActiveSegment {
    spec: SegmentSpec;
    door: DoorPlacement;
    groundTopY: number;
}

/** Debug-bridge snapshot of a running segment — diagnostics only, never
 *  read by the game. */
export interface PressureSnapshot {
    segmentId: string;
    lineMode: LineMode;
    lineY: number | null;
    gapPx: number | null;
    tier: ProximityTierName;
    hearts: number;
    heartsMax: number;
    invulnTicksLeft: number;
    floorsClimbed: number;
    doorFloorIndex: number;
    ended: 'exit' | 'death_line' | null;
}

/**
 * Run-scoped hearts — the minimal holder until IDENTITY builds RunState.
 * Plain data so the future owner can absorb it without ceremony.
 */
export interface HeartsState {
    count: number;
    max: number;
}

export function createHearts(t: TuningStack, carried: number | null): HeartsState {
    const max = t.value('hearts.max');
    const start = Math.min(t.value('hearts.start'), max);
    return { count: carried === null ? start : Math.min(carried, max), max };
}
