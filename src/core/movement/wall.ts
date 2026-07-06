/**
 * Walls: the routing law. The two walls are axis-aligned planes resolved
 * inside the fixed step — snap to plane, reflect, emit. Arcade colliders are
 * not involved: zero latency, tunnel-proof at any speed, correct at any
 * efficiency. Lossless 1.0 base — never a tax, never a pump; wall efficiency
 * lives in the tuning table so sticky modifiers and pump relics arrive as
 * data.
 */
import { INPUT_LEAD_NEVER, type WallSide } from '../events';
import { envelopeOf, FIXED_DT, msToTicks, PLAYER_BODY, type StepCtx } from './state';

interface PlaneContact {
    side: WallSide;
    planeX: number;
    /** Body-center x when snapped to the plane. */
    snappedX: number;
    /** Direction of travel that produced the contact (+1 right, -1 left). */
    towardDir: -1 | 1;
}

function detectContact(ctx: StepCtx): PlaneContact | null {
    const half = PLAYER_BODY.width / 2;
    const leftX = ctx.env.wallLeftX;
    const rightX = ctx.env.wallRightX;
    if (ctx.x - half <= leftX && ctx.vx <= 0) {
        return { side: 'left', planeX: leftX, snappedX: leftX + half, towardDir: -1 };
    }
    if (ctx.x + half >= rightX && ctx.vx >= 0) {
        return { side: 'right', planeX: rightX, snappedX: rightX - half, towardDir: 1 };
    }
    return null;
}

/**
 * The walls phase of the fixed op order. Mutates working kinematics; emits
 * `wall_bounce` / `wall_touch` / `reversal`.
 */
export function wallPhase(ctx: StepCtx): void {
    const { state, t, emit } = ctx;
    const contact = detectContact(ctx);

    if (!contact) {
        state.wallContactSide = null;
        return;
    }

    const impactSpeedX = Math.abs(ctx.vx);
    ctx.snapX = contact.snappedX;
    ctx.x = contact.snappedX;

    if (impactSpeedX < t.value('WALL_MIN_BOUNCE_SPEED')) {
        // A lean, not a bounce: speed dies against the plane, no combo food.
        ctx.vx = 0;
        if (state.wallContactSide !== contact.side) {
            state.wallContactSide = contact.side;
            emit({
                type: 'movement/wall_touch',
                ...envelopeOf(ctx),
                side: contact.side,
                impactSpeedX,
            });
        }
        return;
    }

    // Dedup guard: a same-side re-fire within one tick means the reflection
    // failed to leave the plane — an input-path bug, never widen the window.
    if (contact.side === state.lastBounceSide && state.tick - state.lastBounceTick <= 1) {
        state.wallDedupHits += 1;
        return;
    }

    const efficiency = t.value('WALL_EFFICIENCY');
    ctx.vx = -ctx.vx * efficiency;

    // Perfect-timing detection (zero physics effect): ticks since the most
    // recent input edge toward the wall — the kick. Post-impact presses are
    // structurally unobservable at impact-tick emission; see WallBounceEvent
    // docs and docs/DEVIATIONS.md entry 1.
    const edgeTick = state.lastAxisEdgeTick[contact.towardDir === -1 ? 0 : 1];
    const lead = edgeTick <= -10000 ? INPUT_LEAD_NEVER : state.tick - edgeTick;
    const perfect = lead <= t.value('WALL_PERFECT_WINDOW_TICKS');

    const airborne = !state.grounded;
    if (airborne) {
        state.bounceIndexInAir += 1;
    }
    const timeSinceLastBounceMs =
        state.lastBounceAnyTick < 0
            ? null
            : (state.tick - state.lastBounceAnyTick) * FIXED_DT * 1000;

    emit({
        type: 'movement/wall_bounce',
        ...envelopeOf(ctx),
        side: contact.side,
        impactSpeedX,
        exitSpeedX: Math.abs(ctx.vx),
        efficiency,
        inputLeadTicks: lead,
        perfect,
        airborne,
        bounceIndexInAir: airborne ? state.bounceIndexInAir : 0,
        timeSinceLastBounceMs,
        heightAtBounce: ctx.env.groundTopY - ctx.feetY,
    });

    if (impactSpeedX >= t.value('REVERSAL_MIN_SPEED')) {
        emit({
            type: 'movement/reversal',
            ...envelopeOf(ctx),
            speedBefore: impactSpeedX,
            viaWallBounce: true,
        });
    }

    state.lastBounceTick = state.tick;
    state.lastBounceAnyTick = state.tick;
    state.lastBounceSide = contact.side;
    state.wallContactSide = contact.side;

    // Stick-flip grace: input toward the old direction reads neutral, so the
    // shuttle flip is teachable and never a physics tax.
    state.graceTicksLeft = msToTicks(t.value('STICK_FLIP_GRACE_MS'));
    state.graceBlockedDir = contact.towardDir;
}
