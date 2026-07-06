/**
 * The exchange: run speed is spent on height along a convex curve with a
 * self-repricing soft knee and an absolute tanh hard cap. Plus the jump
 * family's forgiveness: buffer, coyote, jump-cut — each named, tagged, and
 * counted, with the structural anti-cascade rules.
 */
import type { TuningStack } from '../tuning';
import { envelopeOf, FIXED_DT, msToTicks, type StepCtx } from './state';

/** Takeoff speed after the deadband: sub-deadband speeds convert as zero. */
export function effectiveTakeoffSpeed(vx: number, t: TuningStack): number {
    const s = Math.abs(vx);
    return s < t.value('SPEED_DEADBAND') ? 0 : s;
}

/**
 * vy for a takeoff speed. Identity in natural play (raw <= knee); above the
 * knee the tanh span compresses toward the absolute hard cap. The knee tracks
 * the effective ceiling so relic-era play is never compressed prematurely.
 */
export function jumpVyForSpeed(speedX: number, t: TuningStack): number {
    const base = t.value('JUMP_BASE');
    const k = t.value('EXCHANGE_K');
    const span = t.value('JUMP_SPAN');
    const hardCap = t.value('JUMP_HARD_CAP');
    const maxEff = t.value('MAX_RUN_SPEED');
    const raw = base + k * speedX;
    const knee = Math.min(base + k * maxEff, hardCap - span);
    if (raw <= knee) {
        return raw;
    }
    return knee + span * Math.tanh((raw - knee) / span);
}

/** Ballistic apex height for a takeoff vy under rise gravity. */
export function predictedApexPx(vyJump: number, t: TuningStack): number {
    return (vyJump * vyJump) / (2 * t.value('GRAVITY_RISE'));
}

/**
 * Inverse of the curve below the knee: the minimum |vx| at takeoff that
 * clears `heightPx`. Returns 0 when the base jump already clears it. Used by
 * the tower generator's reachability contract.
 */
export function minTakeoffSpeedForHeight(heightPx: number, t: TuningStack): number {
    const vyNeed = Math.sqrt(2 * t.value('GRAVITY_RISE') * heightPx);
    const base = t.value('JUMP_BASE');
    if (vyNeed <= base) {
        return 0;
    }
    const s = (vyNeed - base) / t.value('EXCHANGE_K');
    // Speeds inside the deadband convert as zero, so the real requirement
    // is at least the deadband.
    return Math.max(s, t.value('SPEED_DEADBAND'));
}

function executeJump(ctx: StepCtx, wasBuffered: boolean, wasCoyote: boolean): void {
    const { state, t, emit } = ctx;
    const launchSpeedX = Math.abs(ctx.vx);
    const s = effectiveTakeoffSpeed(ctx.vx, t);
    const vyJump = jumpVyForSpeed(s, t);
    const retention = t.value('JUMP_RETENTION');
    const maxEff = t.value('MAX_RUN_SPEED');

    ctx.vy = -vyJump;
    ctx.vx *= retention;
    ctx.jumpedThisTick = true;

    state.bufferTicksLeft = 0; // consumed atomically — one press, one jump
    state.coyoteTicksLeft = 0;
    state.jumpLatch = true;
    state.departedByJump = true;
    state.grounded = false;
    state.lockoutTicksLeft = t.value('REGROUND_LOCKOUT_TICKS');
    state.airTicks = 0;
    state.riseTicks = 0;
    state.jumpCutUsed = false;
    state.apexEmitted = false;
    state.bounceIndexInAir = 0;
    state.takeoffSpeed = Math.abs(ctx.vx);
    state.takeoffFeetY = ctx.feetY;
    state.takeoffFloorIndex = state.floorIndex;
    state.takeoffPlatformId = state.groundedPlatformId ?? -1;

    emit({
        type: 'movement/jump',
        ...envelopeOf(ctx),
        launchSpeedX,
        vyJump,
        conversionFraction: Math.min(1, s / maxEff),
        retainedSpeedX: Math.abs(ctx.vx),
        predictedHeightPx: predictedApexPx(vyJump, t),
        wasBuffered,
        wasCoyote,
        takeoffPlatformId: state.takeoffPlatformId,
    });
    emit({
        type: 'movement/left_ground',
        ...envelopeOf(ctx),
        reason: 'jump',
        takeoffSpeed: state.takeoffSpeed,
    });
}

/**
 * The jump phase of the fixed op order. Runs after landing so a buffered
 * press consumes on the landing tick with landing-tick vx (the honest
 * buffer), and a same-tick bhop escapes ground drag entirely.
 */
export function jumpPhase(ctx: StepCtx): void {
    const { state, input, t } = ctx;

    if (state.grounded) {
        const pressed = input.jumpPressedEdge;
        const buffered = !pressed && state.bufferTicksLeft > 0;
        if ((pressed || buffered) && !state.jumpLatch) {
            executeJump(ctx, buffered, false);
            return;
        }
        if (pressed || buffered) {
            // Latched: one jump per grounded episode. Press evaporates.
            state.bufferTicksLeft = 0;
        }
        return;
    }

    // Airborne press: coyote first (walk-off only, jump departures blocked),
    // otherwise edge-stamp the one-press buffer.
    if (input.jumpPressedEdge) {
        if (state.coyoteTicksLeft > 0 && !state.departedByJump && !state.jumpLatch) {
            executeJump(ctx, false, true);
            return;
        }
        state.bufferTicksLeft = msToTicks(t.value('BUFFER_MS'));
    }

    jumpCutPhase(ctx);
}

/**
 * Jump-cut: releasing while rising cuts vy once, allowed only after a
 * minimum ascent — commitment is priced, v1-style fixed jumps refused.
 */
function jumpCutPhase(ctx: StepCtx): void {
    const { state, input, t, emit } = ctx;
    const released = state.jumpHeldPrev && !input.jumpHeld;
    if (
        !released ||
        ctx.vy >= 0 ||
        state.jumpCutUsed ||
        !state.departedByJump ||
        state.riseTicks < msToTicks(t.value('JUMP_CUT_MIN_RISE_MS'))
    ) {
        return;
    }
    const vyBefore = ctx.vy;
    ctx.vy = vyBefore * t.value('JUMP_CUT_MULT');
    state.jumpCutUsed = true;
    const g = t.value('GRAVITY_RISE');
    const remainingBefore = (vyBefore * vyBefore) / (2 * g);
    const remainingAfter = (ctx.vy * ctx.vy) / (2 * g);
    emit({
        type: 'movement/jump_cut',
        ...envelopeOf(ctx),
        vyBefore,
        vyAfter: ctx.vy,
        riseMs: state.riseTicks * FIXED_DT * 1000,
        floorsForfeited: (remainingBefore - remainingAfter) / t.value('FLOOR_HEIGHT_PX'),
    });
}
