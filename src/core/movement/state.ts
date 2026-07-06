/**
 * Core movement state and the boundary types between core (decides) and the
 * game layer (detects). Engine-free by law.
 */
import type { EventEnvelope, MovementEvent, WallSide } from '../events';
import type { TuningStack } from '../tuning';

export const TICK_HZ = 60;
export const FIXED_DT = 1 / TICK_HZ;

/** World-unit physics body — independent of sprite scale by design. */
export const PLAYER_BODY = { width: 44, height: 58 } as const;

export function msToTicks(ms: number): number {
    return Math.round((ms * TICK_HZ) / 1000);
}

/** Per-tick input, latched per physics step (never per render frame). */
export interface InputFrame {
    axisX: -1 | 0 | 1;
    jumpPressedEdge: boolean;
    jumpHeld: boolean;
}

/** Post-integration, post-collision kinematics read from the engine body. */
export interface BodySnapshot {
    x: number;
    y: number;
    feetY: number;
    vx: number;
    vy: number;
}

/** A one-way platform separation the engine performed this step. */
export interface LandingContact {
    platformId: number;
    /** Captured in the collider's processCallback, pre-separation — the only
     *  honest impact velocity (Phaser zeroes velocity during separation). */
    impactVy: number;
}

/**
 * What the engine detected this step. `landing` is per-step collider
 * evidence: non-null exactly when a one-way separation held the body on a
 * platform top during THIS physics step (the grounded engagement trickle
 * re-fires the collider every grounded step). Grounding is never derived
 * from `body.touching` — Phaser 4.2 resets touching flags once per render
 * frame (Body.preUpdate, willStep), not per physics step, so on multi-step
 * frames the flags go stale and tick state stops being a pure function of
 * inputs (the determinism law). The single nullable record also makes a
 * half-populated landing unrepresentable: grounded implies a platform id
 * AND an impact velocity, by type.
 */
export interface ContactReport {
    landing: LandingContact | null;
}

/** What core decided this step. The game layer applies it verbatim. */
export interface Actions {
    vx: number;
    vy: number;
    /** Wall-plane snap: new body-center x, or null when no plane contact. */
    snapX: number | null;
    /** Informational: the gravity multiplier in effect (1 rise, fall mult, hang mult). */
    gravityScale: number;
}

/** Static facts about the sandbox geometry core needs. */
export interface MovementEnv {
    /** Inner face of the left wall plane (world x). */
    wallLeftX: number;
    /** Inner face of the right wall plane (world x). */
    wallRightX: number;
    /** World y of the ground platform's top — floor 0. */
    groundTopY: number;
}

export interface StepIo {
    input: InputFrame;
    body: BodySnapshot;
    contact: ContactReport;
}

export type EmitFn = (event: MovementEvent) => void;

/**
 * Working context threaded through the fixed per-tick op order. Phases mutate
 * the kinematics; logic.ts turns the final values into Actions.
 */
export interface StepCtx {
    state: MovementState;
    input: InputFrame;
    env: MovementEnv;
    t: TuningStack;
    emit: EmitFn;
    x: number;
    y: number;
    feetY: number;
    vx: number;
    vy: number;
    snapX: number | null;
    gravityScale: number;
    jumpedThisTick: boolean;
}

/** Envelope snapshot at the moment of emission — current working kinematics. */
export function envelopeOf(ctx: StepCtx): EventEnvelope {
    return {
        tick: ctx.state.tick,
        x: ctx.x,
        y: ctx.y,
        vx: ctx.vx,
        vy: ctx.vy,
        speed: Math.abs(ctx.vx),
        grounded: ctx.state.grounded,
        floorIndex: ctx.state.floorIndex,
    };
}

export interface MovementState {
    tick: number;

    // Grounding & episodes
    grounded: boolean;
    groundedPlatformId: number | null;
    /** One jump per grounded episode — the structural anti-cascade latch. */
    jumpLatch: boolean;
    departedByJump: boolean;
    airTicks: number;

    // Forgiveness windows (ticks remaining)
    coyoteTicksLeft: number;
    bufferTicksLeft: number;
    lockoutTicksLeft: number;

    // Tripwire counters — these must read 0 forever
    lockoutBlocked: number;
    wallDedupHits: number;

    // Jump arc bookkeeping
    riseTicks: number;
    jumpCutUsed: boolean;
    takeoffSpeed: number;
    takeoffFeetY: number;
    takeoffFloorIndex: number;
    takeoffPlatformId: number;
    prevTickVy: number;
    apexEmitted: boolean;
    hangActive: boolean;

    // Input latch bookkeeping
    axisXPrev: number;
    jumpHeldPrev: boolean;
    /** Tick of the most recent edge onto each axis direction: [left, right]. */
    lastAxisEdgeTick: [number, number];

    // Walls
    graceTicksLeft: number;
    graceBlockedDir: number;
    wallContactSide: WallSide | null;
    lastBounceTick: number;
    lastBounceSide: WallSide | null;
    lastBounceAnyTick: number;
    bounceIndexInAir: number;

    // Facts machines
    floorIndex: number;
    tier: number;
    ceilingActive: boolean;
    stallTicks: number;
    stallActive: boolean;
    turnStartSpeed: number | null;
}

export function createMovementState(): MovementState {
    return {
        tick: 0,
        grounded: false,
        groundedPlatformId: null,
        jumpLatch: false,
        departedByJump: false,
        airTicks: 0,
        coyoteTicksLeft: 0,
        bufferTicksLeft: 0,
        lockoutTicksLeft: 0,
        lockoutBlocked: 0,
        wallDedupHits: 0,
        riseTicks: 0,
        jumpCutUsed: false,
        takeoffSpeed: 0,
        takeoffFeetY: 0,
        takeoffFloorIndex: 0,
        takeoffPlatformId: -1,
        prevTickVy: 0,
        apexEmitted: false,
        hangActive: false,
        axisXPrev: 0,
        jumpHeldPrev: false,
        lastAxisEdgeTick: [-10000, -10000],
        graceTicksLeft: 0,
        graceBlockedDir: 0,
        wallContactSide: null,
        lastBounceTick: -10000,
        lastBounceSide: null,
        lastBounceAnyTick: -1,
        bounceIndexInAir: 0,
        floorIndex: 0,
        tier: 0,
        ceilingActive: false,
        stallTicks: 0,
        stallActive: false,
        turnStartSpeed: null,
    };
}
