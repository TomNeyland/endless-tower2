/**
 * Run physics: two-regime grounded acceleration (tight first ten seconds,
 * expensive top end), crisp skids via TURN_ACCEL, the Icy Tower ground-drag
 * glide, and spent-not-earned air control. Plus the gravity family — applied
 * here in core (Phaser config gravity is 0) so a relic can someday mutate it.
 */
import { envelopeOf, FIXED_DT, type StepCtx } from './state';

/** Stick-flip grace: input toward the old direction reads neutral. */
function effectiveAxis(ctx: StepCtx): number {
    const { state, input } = ctx;
    if (state.graceTicksLeft > 0 && input.axisX === state.graceBlockedDir) {
        return 0;
    }
    return input.axisX;
}

/**
 * A reversal is a fact about a whole turn, not one tick: speedBefore is the
 * speed when the player first fought their own velocity, emitted when the
 * sign actually flips.
 */
function trackReversal(ctx: StepCtx, vxBefore: number, axis: number): void {
    const { state, t, emit } = ctx;
    const opposing = axis !== 0 && vxBefore !== 0 && Math.sign(vxBefore) !== axis;
    const flipped = vxBefore !== 0 && ctx.vx !== 0 && Math.sign(vxBefore) !== Math.sign(ctx.vx);
    if (opposing && state.turnStartSpeed === null) {
        state.turnStartSpeed = Math.abs(vxBefore);
    }
    if (flipped) {
        const speedBefore = state.turnStartSpeed ?? Math.abs(vxBefore);
        if (speedBefore >= t.value('REVERSAL_MIN_SPEED')) {
            emit({
                type: 'movement/reversal',
                ...envelopeOf(ctx),
                speedBefore,
                viaWallBounce: false,
            });
        }
        state.turnStartSpeed = null;
    } else if (!opposing) {
        state.turnStartSpeed = null;
    }
}

/** The run phase of the fixed op order: horizontal velocity. */
export function runPhase(ctx: StepCtx): void {
    const { state, t } = ctx;
    const axis = effectiveAxis(ctx);
    const dt = FIXED_DT;
    const vxBefore = ctx.vx;

    if (state.grounded) {
        if (axis === 0) {
            // The glide: ground drag only, a 900 px/s coast survives ~2.6s.
            const drop = t.value('GROUND_DRAG') * dt;
            ctx.vx = Math.abs(ctx.vx) <= drop ? 0 : ctx.vx - Math.sign(ctx.vx) * drop;
        } else if (ctx.vx !== 0 && Math.sign(ctx.vx) !== axis) {
            // The skid: input opposes velocity.
            ctx.vx += axis * t.value('TURN_ACCEL') * dt;
        } else {
            const accel =
                Math.abs(ctx.vx) < t.value('RUN_REGIME_SPEED')
                    ? t.value('RUN_ACCEL_LOW')
                    : t.value('RUN_ACCEL_HIGH');
            ctx.vx += axis * accel * dt;
        }
    } else if (axis !== 0) {
        // Air is spent, not earned; AIR_DRAG 0 — airborne momentum is sacred.
        ctx.vx += axis * t.value('AIR_ACCEL') * dt;
    }

    // Manual ceiling clamp — body.maxVelocity is never a gameplay clamp.
    const maxEff = t.value('MAX_RUN_SPEED');
    if (Math.abs(ctx.vx) > maxEff) {
        ctx.vx = Math.sign(ctx.vx) * maxEff;
    }

    trackReversal(ctx, vxBefore, axis);
}

/**
 * The gravity family: rise 1x, fall x1.35, hold-gated apex hang x0.6 while
 * |vy| is inside the band — float is earned, not ambient. Terminal fall is
 * clamped manually here in core.
 */
export function gravityPhase(ctx: StepCtx): void {
    const { state, input, t } = ctx;
    const dt = FIXED_DT;
    const g = t.value('GRAVITY_RISE');

    if (state.grounded) {
        // Engagement trickle: a small downward velocity keeps the one-way
        // separation re-engaging every step so grounded stays true.
        ctx.vy = g * dt;
        ctx.gravityScale = 1;
        state.hangActive = false;
        return;
    }

    if (ctx.jumpedThisTick) {
        // The executed jump vy must equal the curve's prediction (engine-fact
        // assertion #1) — gravity starts next tick.
        ctx.gravityScale = 1;
        return;
    }

    const inBand = Math.abs(ctx.vy) <= t.value('APEX_HANG_BAND');
    let mult: number;
    if (inBand && input.jumpHeld) {
        mult = t.value('APEX_HANG_MULT');
        state.hangActive = true;
    } else {
        mult = ctx.vy < 0 ? 1 : t.value('GRAVITY_FALL_MULT');
        state.hangActive = false;
    }
    ctx.vy += g * mult * dt;
    const terminal = t.value('TERMINAL_FALL');
    if (ctx.vy > terminal) {
        ctx.vy = terminal;
    }
    ctx.gravityScale = mult;
}
