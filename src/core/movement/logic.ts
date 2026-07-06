/**
 * The movement core's per-tick orchestrator. Fixed op order, by law:
 * latch input -> walls -> landing -> jump -> run -> timers/tiers -> emit.
 * Core decides; the game layer detects and applies Actions verbatim.
 */
import type { TuningStack } from '../tuning';
import { jumpPhase } from './jump';
import { gravityPhase, runPhase } from './run';
import { apexPhase, ceilingPhase, floorPhase, stallPhase, tierPhase } from './tiers';
import {
    type Actions,
    type EmitFn,
    envelopeOf,
    type MovementEnv,
    type MovementState,
    msToTicks,
    PLAYER_BODY,
    type StepCtx,
    type StepIo,
} from './state';
import { wallPhase } from './wall';

function latchInputPhase(ctx: StepCtx): void {
    const { state, input } = ctx;
    if (input.axisX !== state.axisXPrev && input.axisX !== 0) {
        state.lastAxisEdgeTick[input.axisX === -1 ? 0 : 1] = state.tick;
    }
}

interface StepCtxWithIo extends StepCtx {
    io: StepIo;
}

function landingPhase(ctx: StepCtxWithIo): void {
    const { state, input, emit } = ctx;

    // Per-step collider evidence — grounded exactly when a one-way
    // separation held the body on a platform top this step.
    let landing = ctx.io.contact.landing;
    if (landing !== null && state.lockoutTicksLeft > 0) {
        // Engineering guard against separation jitter. This firing means the
        // input path is broken — diagnose loudly, never widen the window.
        landing = null;
        state.lockoutBlocked += 1;
    }

    if (!state.grounded && landing !== null) {
        state.grounded = true;
        state.groundedPlatformId = landing.platformId;
        // Exact floors gained: feet are separated onto the platform top by
        // the time core sees the contact, so derive from feet directly.
        const landFloor = Math.floor(
            (ctx.env.groundTopY - ctx.feetY) / ctx.t.value('FLOOR_HEIGHT_PX') + 1e-6,
        );
        emit({
            type: 'movement/land',
            ...envelopeOf(ctx),
            impactVy: landing.impactVy,
            airTicks: state.airTicks,
            floorsGained: landFloor - state.takeoffFloorIndex,
            platformId: landing.platformId,
            momentumRetained:
                state.takeoffSpeed > 0 ? Math.abs(ctx.vx) / state.takeoffSpeed : 1,
            bouncesDuringAir: state.bounceIndexInAir,
            sameTickJump: state.bufferTicksLeft > 0 || input.jumpPressedEdge,
        });
        state.jumpLatch = false;
        state.departedByJump = false;
        state.jumpCutUsed = false;
        state.airTicks = 0;
        state.riseTicks = 0;
        state.bounceIndexInAir = 0;
        state.coyoteTicksLeft = 0;
        state.apexEmitted = false;
        return;
    }

    if (state.grounded && landing === null) {
        // Walk-off (jump departures leave ground inside the jump phase).
        state.grounded = false;
        state.departedByJump = false;
        state.airTicks = 0;
        state.riseTicks = 0;
        state.jumpCutUsed = false;
        state.apexEmitted = false;
        state.bounceIndexInAir = 0;
        state.coyoteTicksLeft = msToTicks(ctx.t.value('COYOTE_MS'));
        state.takeoffSpeed = Math.abs(ctx.vx);
        state.takeoffFeetY = ctx.feetY;
        state.takeoffFloorIndex = state.floorIndex;
        state.takeoffPlatformId = state.groundedPlatformId ?? -1;
        emit({
            type: 'movement/left_ground',
            ...envelopeOf(ctx),
            reason: 'walkoff',
            takeoffSpeed: state.takeoffSpeed,
        });
    }
}

function timersPhase(ctx: StepCtx): void {
    const { state } = ctx;
    if (state.coyoteTicksLeft > 0) {
        state.coyoteTicksLeft -= 1;
    }
    if (state.bufferTicksLeft > 0) {
        state.bufferTicksLeft -= 1;
    }
    if (state.lockoutTicksLeft > 0) {
        state.lockoutTicksLeft -= 1;
    }
    if (state.graceTicksLeft > 0) {
        state.graceTicksLeft -= 1;
    }
    if (!state.grounded) {
        state.airTicks += 1;
        if (ctx.vy < 0) {
            state.riseTicks += 1;
        }
    }
}

export function stepMovement(
    state: MovementState,
    io: StepIo,
    env: MovementEnv,
    t: TuningStack,
    emit: EmitFn,
): Actions {
    state.tick += 1;

    const ctx: StepCtxWithIo = {
        state,
        input: io.input,
        env,
        t,
        emit,
        io,
        x: io.body.x,
        y: io.body.y,
        feetY: io.body.feetY,
        vx: io.body.vx,
        vy: io.body.vy,
        snapX: null,
        gravityScale: 1,
        jumpedThisTick: false,
    };

    latchInputPhase(ctx);
    wallPhase(ctx);
    landingPhase(ctx);
    jumpPhase(ctx);
    runPhase(ctx);
    gravityPhase(ctx);
    timersPhase(ctx);
    apexPhase(ctx);
    floorPhase(ctx);
    tierPhase(ctx);
    ceilingPhase(ctx);
    stallPhase(ctx);

    emit({
        type: 'movement/tick',
        ...envelopeOf(ctx),
        axisX: ctx.input.axisX,
        jumpHeld: ctx.input.jumpHeld,
        gravityScale: ctx.gravityScale,
        tier: state.tier,
        hangActive: state.hangActive,
        coyoteTicksLeft: state.coyoteTicksLeft,
        bufferTicksLeft: state.bufferTicksLeft,
        graceTicksLeft: state.graceTicksLeft,
        lockoutBlocked: state.lockoutBlocked,
        wallDedupHits: state.wallDedupHits,
    });

    state.axisXPrev = ctx.input.axisX;
    state.jumpHeldPrev = ctx.input.jumpHeld;
    state.prevTickVy = ctx.vy;

    return { vx: ctx.vx, vy: ctx.vy, snapX: ctx.snapX, gravityScale: ctx.gravityScale };
}

/** Emit the spawn fact — consumers clear their state on this. */
export function emitSpawn(
    state: MovementState,
    env: MovementEnv,
    t: TuningStack,
    emit: EmitFn,
    x: number,
    feetY: number,
    reason: 'initial' | 'reset',
): void {
    emit({
        type: 'movement/spawn',
        tick: state.tick,
        x,
        // Envelope y is the body center on every event — spawn included.
        y: feetY - PLAYER_BODY.height / 2,
        vx: 0,
        vy: 0,
        speed: 0,
        grounded: false,
        floorIndex: Math.floor((env.groundTopY - feetY) / t.value('FLOOR_HEIGHT_PX')),
        reason,
    });
}
