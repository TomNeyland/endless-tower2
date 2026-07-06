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
import { rollFieldClassifications } from '../exam/field';
import { fork } from '../rng';
import { generateSandboxTower, type PlatformSpec, type TowerLayout } from '../tower';
import type { TuningKey, TuningOp, TuningStack } from '../tuning';
import type { LineMode, ProximityTierName } from './line';

/** One tuning repricing carried by a spec (line profile / node modifier). */
export interface SegmentTuningOverride {
    key: TuningKey;
    op: TuningOp;
    value: number;
}

/**
 * Loot placement parameters — the node type's loot profile arrives here
 * (IDENTITY's coordination point with CHOICE: Coin Rush scales
 * coinsPerFloor ×2.5, Elite tightens it, etc. — density by node type).
 */
export interface SegmentLoot {
    /** Expected placed coins per floor climbed. */
    coinsPerFloor: number;
    /** One visible timed-powerup spawn roughly every N floors. */
    powerupEveryFloors: number;
}

/** Initial platform-field roll fractions (EXAM): Brittle Rows and Sticky
 *  Patches arrive here as data folded from the node's genPatch. */
export interface SegmentFieldSpec {
    crumbleFraction: number;
    stickyFraction: number;
}

export interface SegmentSpec {
    segmentId: string;
    /** The door's floor — the climb's win condition. In a boss arena this is
     *  the tower's generation budget instead: there is no door until the
     *  boss falls, and the duel ends long before the budget runs out. */
    floors: number;
    /** Tower-generation seed; identical spec replays identically. */
    seed: number;
    /** Line repricing for this segment (e.g. Greedy Line), applied as layers. */
    lineProfile: SegmentTuningOverride[];
    /** CHOICE-phase mutators, applied as layers. Semantics arrive with CHOICE. */
    modifiers: SegmentTuningOverride[];
    /** Coin/powerup placement densities (see SegmentLoot). */
    loot: SegmentLoot;
    /** Platform-field roll (crumble/sticky fractions); absent = clean tower. */
    field?: SegmentFieldSpec;
    /** Boss id (EXAM): present = this segment is a duel arena — endless
     *  upward, no exit door until `boss/defeated` commands one. */
    boss?: string;
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
    /** Null in a boss arena — the door materializes on defeat (setDoor). */
    door: DoorPlacement | null;
}

/** The baseline loot profile — node types (CHOICE) scale these. */
export function defaultSegmentLoot(t: TuningStack): SegmentLoot {
    return {
        coinsPerFloor: t.value('coins.perFloor'),
        powerupEveryFloors: t.value('powerup.everyFloors'),
    };
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
        loot: defaultSegmentLoot(t),
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
 *
 * Boss arenas (spec.boss) build the same tower with NO door — the arena is
 * endless upward and the exit materializes on defeat (setDoor). The field
 * roll (crumble/sticky classifications) draws from its own labeled fork so
 * platform GEOMETRY is byte-identical with or without a field.
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

    let door: DoorPlacement | null = null;
    if (spec.boss === undefined) {
        const doorAltitudeY = groundTopY - spec.floors * floorH;
        const doorPlatform: PlatformSpec | undefined = platforms.find(
            (p) => p.topY <= doorAltitudeY + 1e-6,
        );
        if (!doorPlatform) {
            throw new Error(
                `segment ${spec.segmentId}: no platform at or above door floor ${spec.floors}`,
            );
        }
        door = {
            platformId: doorPlatform.id,
            xCenter: doorPlatform.xCenter,
            topY: doorPlatform.topY,
            halfWidth: doorPlatform.width / 2,
            floorIndex: floorIndexOf(doorPlatform.topY, groundTopY, floorH),
        };
    }

    if (spec.field !== undefined) {
        rollFieldClassifications(
            platforms,
            fork(spec.seed, 'field'),
            spec.field,
            door === null ? [] : [door.platformId],
        );
    }

    return { layout: { ...full, platforms }, door };
}

/**
 * A door placement on a named platform — the boss-defeat door (the exam
 * command carries the platform id; both worlds derive the same placement).
 * Throws on an unknown platform: a door on nothing is a caller bug.
 */
export function doorPlacementFor(
    layout: TowerLayout,
    platformId: number,
    floorHeightPx: number,
): DoorPlacement {
    const platform = layout.platforms.find((p) => p.id === platformId);
    if (!platform) {
        throw new Error(`segment: door platform ${platformId} does not exist`);
    }
    return {
        platformId: platform.id,
        xCenter: platform.xCenter,
        topY: platform.topY,
        halfWidth: platform.width / 2,
        floorIndex: floorIndexOf(platform.topY, layout.groundTopY, floorHeightPx),
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

/** A segment armed for play: the spec plus its built door and arena bottom.
 *  A boss arena arms with door null; PressureRuntime.setDoor materializes
 *  the exit on defeat (through the recorded exam-command channel). */
export interface ActiveSegment {
    spec: SegmentSpec;
    door: DoorPlacement | null;
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
    /** Null while a boss arena's door does not exist yet. */
    doorFloorIndex: number | null;
    ended: 'exit' | 'death_line' | null;
}

/**
 * Hearts, consumed through a narrow port — RunState (core/run/state.ts) is
 * the single source of run truth and implements this structurally; pressure
 * only spends and reads. `loseHeart` returns hearts remaining and throws at
 * zero (a catch after run end is a caller bug, never a shrug).
 */
export interface HeartsPort {
    heartsRemaining(): number;
    heartsMax(): number;
    loseHeart(): number;
}
