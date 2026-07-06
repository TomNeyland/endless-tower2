/**
 * The death line's state machine — pure, engine-free (docs/design/pressure.md).
 *
 * Its job is tempo, not execution: dormant start, announced ignition via the
 * dual trigger (grace time OR grace floors, whichever first), speed =
 * max(base, catch-up) with a designed per-floor ramp and NO pity slowdown
 * (the line never slows to spare a struggling player — hearts are the mercy
 * system, not the line), and proximity broadcast at tier boundaries with
 * hysteresis. The line reads player position and emits facts; it never
 * touches camera or movement internals.
 */
import { FIXED_DT, msToTicks } from '../movement/state';
import type { TuningStack } from '../tuning';

export type LineMode = 'dormant' | 'active';
export type IgnitionTrigger = 'time' | 'floors';
export type ProximityDirection = 'closing' | 'receding';

/** Tier names, indexed by proximity zone (zone 4+ clamps to critical). */
export const PROXIMITY_TIER_NAMES = ['safe', 'aware', 'danger', 'critical'] as const;
export type ProximityTierName = (typeof PROXIMITY_TIER_NAMES)[number];

export interface DeathLineState {
    mode: LineMode;
    /** World y of the fire's leading edge. Meaningful only when active. */
    y: number;
    /** Arena bottom (segment ground top) the line ignites from. */
    arenaBottomY: number;
    /** Ticks since the segment began — the grace-time clock. */
    ticksSinceStart: number;
    /**
     * Proximity zone index: 0 safe, 1 aware, 2 danger, 3 critical, 4 inside
     * the critical marker. Zones 3+ both read as 'critical' — each tuning
     * boundary broadcasts, the names stay a closed set of four.
     */
    zoneIndex: number;
    /** Debug-bridge exact speed pin (px/s). Null in real play, always. */
    speedOverride: number | null;
}

export interface LineStepIo {
    /** Player feet world y — read from the same surface the camera reads. */
    feetY: number;
    /** High-water floors climbed this segment — drives ramp and ignition. */
    highWaterFloors: number;
    /** Segment length makes the floor trigger a progress fraction. */
    totalFloors: number;
    /** Rescue invulnerability: the line cannot catch (but never pauses). */
    invulnerable: boolean;
}

export interface ProximityCrossing {
    tier: ProximityTierName;
    direction: ProximityDirection;
    gapPx: number;
}

export interface LineStepFacts {
    /** Non-null on the ignition tick: which half of the dual trigger fired. */
    ignited: IgnitionTrigger | null;
    /** Non-null when a tier boundary was crossed (highest zone this tick). */
    proximity: ProximityCrossing | null;
    /** True when the line reached the player's body this tick (not invuln). */
    caught: boolean;
    /** Signed gap (px): line edge y minus feet y; <= 0 means contact. */
    gapPx: number;
    /** The rise speed applied this tick (px/s), for diagnostics. */
    speed: number;
}

export function createDeathLine(arenaBottomY: number): DeathLineState {
    return {
        mode: 'dormant',
        y: arenaBottomY,
        arenaBottomY,
        ticksSinceStart: 0,
        zoneIndex: 0,
        speedOverride: null,
    };
}

/** Broadcast boundaries, outermost first — each is a named tier's outer edge. */
export function proximityThresholds(t: TuningStack): number[] {
    return [
        t.value('line.proximitySafePx'),
        t.value('line.proximityAwarePx'),
        t.value('line.proximityDangerPx'),
        t.value('line.proximityCriticalPx'),
    ];
}

export function tierNameOfZone(zoneIndex: number): ProximityTierName {
    return PROXIMITY_TIER_NAMES[Math.min(Math.max(zoneIndex, 0), PROXIMITY_TIER_NAMES.length - 1)];
}

/**
 * Base rise speed after the designed per-floor ramp — late floors are hotter
 * than early ones, as data, so modifiers and boss surges reprice it.
 */
export function rampedBaseSpeed(highWaterFloors: number, t: TuningStack): number {
    return t.value('line.baseSpeed') + t.value('line.rampPerFloor') * highWaterFloors;
}

/**
 * Effective speed = max(base, catch-up). Catch-up engages only while the gap
 * exceeds the slack leash (relevance on god-runs); the max() makes a pity
 * slowdown structurally impossible.
 */
export function lineSpeed(gapPx: number, highWaterFloors: number, t: TuningStack): number {
    const base = rampedBaseSpeed(highWaterFloors, t);
    const catchUp = gapPx > t.value('line.slackPx') ? base * t.value('line.catchUpFactor') : 0;
    return Math.max(base, catchUp);
}

function zoneFor(gapPx: number, previousZone: number, t: TuningStack): number {
    const thresholds = proximityThresholds(t);
    const hysteresis = t.value('line.proximityHysteresisPx');
    let zone = previousZone;
    while (zone < thresholds.length && gapPx <= thresholds[zone]) {
        zone += 1;
    }
    while (zone > 0 && gapPx > thresholds[zone - 1] + hysteresis) {
        zone -= 1;
    }
    return zone;
}

/** One fixed tick of line physics. Mutates state; returns the tick's facts. */
export function stepDeathLine(
    state: DeathLineState,
    io: LineStepIo,
    t: TuningStack,
): LineStepFacts {
    state.ticksSinceStart += 1;

    let ignited: IgnitionTrigger | null = null;
    if (state.mode === 'dormant') {
        if (io.highWaterFloors / io.totalFloors >= t.value('line.graceFraction')) {
            ignited = 'floors';
        } else if (state.ticksSinceStart >= msToTicks(t.value('line.graceMs'))) {
            ignited = 'time';
        }
        if (ignited === null) {
            return { ignited: null, proximity: null, caught: false, gapPx: 0, speed: 0 };
        }
        // Announced ignition at the bottom of the arena — offset one floor
        // below the ground so activation is a visible moment, never an
        // instant catch on a player standing at the base (pillar 2).
        state.mode = 'active';
        state.y = state.arenaBottomY + t.value('line.igniteOffsetPx');
        state.zoneIndex = 0;
    }

    const speed = state.speedOverride ?? lineSpeed(state.y - io.feetY, io.highWaterFloors, t);
    state.y -= speed * FIXED_DT;

    const gapPx = state.y - io.feetY;
    let proximity: ProximityCrossing | null = null;
    const zone = zoneFor(gapPx, state.zoneIndex, t);
    if (zone !== state.zoneIndex) {
        proximity = {
            tier: tierNameOfZone(zone),
            direction: zone > state.zoneIndex ? 'closing' : 'receding',
            gapPx,
        };
        state.zoneIndex = zone;
    }

    const caught = !io.invulnerable && gapPx <= 0;
    return { ignited, proximity, caught, gapPx, speed };
}
