/**
 * Fact machines: speed tiers (published as fractions of the effective
 * ceiling — the ladder self-reprices under relics), the ceiling signal,
 * stall detection (hesitation as a fact; the death line will tax it,
 * movement never knows), floor crossings, and the apex.
 */
import { envelopeOf, msToTicks, type StepCtx } from './state';

export function tierThresholds(ctx: StepCtx): number[] {
    const { t } = ctx;
    const maxEff = t.value('MAX_RUN_SPEED');
    return [
        t.value('TIER_FRAC_1') * maxEff,
        t.value('TIER_FRAC_2') * maxEff,
        t.value('TIER_FRAC_3') * maxEff,
        t.value('TIER_FRAC_4') * maxEff,
    ];
}

export function tierPhase(ctx: StepCtx): void {
    const { state, t, emit } = ctx;
    const speed = Math.abs(ctx.vx);
    const thresholds = tierThresholds(ctx);
    const hysteresis = t.value('TIER_HYSTERESIS');

    let tier = state.tier;
    while (tier < thresholds.length && speed >= thresholds[tier]) {
        tier += 1;
    }
    while (tier > 0 && speed < thresholds[tier - 1] - hysteresis) {
        tier -= 1;
    }
    if (tier !== state.tier) {
        const previousTier = state.tier;
        state.tier = tier;
        emit({
            type: 'movement/speed_tier',
            ...envelopeOf(ctx),
            tier,
            previousTier,
            thresholds,
        });
    }
}

export function ceilingPhase(ctx: StepCtx): void {
    const { state, t, emit } = ctx;
    const speed = Math.abs(ctx.vx);
    const maxEff = t.value('MAX_RUN_SPEED');
    const source: 'base' | 'stack' = maxEff === t.baseValue('MAX_RUN_SPEED') ? 'base' : 'stack';
    if (!state.ceilingActive && speed >= maxEff - 0.5) {
        state.ceilingActive = true;
        emit({
            type: 'movement/ceiling',
            ...envelopeOf(ctx),
            state: 'entered',
            effectiveMaxSpeed: maxEff,
            source,
        });
    } else if (state.ceilingActive && speed < maxEff - t.value('TIER_HYSTERESIS')) {
        state.ceilingActive = false;
        emit({
            type: 'movement/ceiling',
            ...envelopeOf(ctx),
            state: 'exited',
            effectiveMaxSpeed: maxEff,
            source,
        });
    }
}

export function stallPhase(ctx: StepCtx): void {
    const { state, t, emit } = ctx;
    const stalled = state.grounded && Math.abs(ctx.vx) < t.value('STALL_SPEED');
    if (stalled) {
        state.stallTicks += 1;
        if (!state.stallActive && state.stallTicks > msToTicks(t.value('STALL_MS'))) {
            state.stallActive = true;
            emit({
                type: 'movement/stall',
                ...envelopeOf(ctx),
                state: 'entered',
                durationTicks: state.stallTicks,
            });
        }
        return;
    }
    if (state.stallActive) {
        emit({
            type: 'movement/stall',
            ...envelopeOf(ctx),
            state: 'exited',
            durationTicks: state.stallTicks,
        });
    }
    state.stallActive = false;
    state.stallTicks = 0;
}

/** Every 128px line crossed is a fact; one line per tick at legal speeds. */
export function floorPhase(ctx: StepCtx): void {
    const { state, t, env, emit } = ctx;
    const floorH = t.value('FLOOR_HEIGHT_PX');
    const idx = Math.floor((env.groundTopY - ctx.feetY) / floorH + 1e-6);
    while (idx > state.floorIndex) {
        state.floorIndex += 1;
        emit({
            type: 'movement/floor_crossed',
            ...envelopeOf(ctx),
            direction: 'up',
            cumulativeThisAir: state.grounded ? 0 : state.floorIndex - state.takeoffFloorIndex,
            airborne: !state.grounded,
        });
    }
    while (idx < state.floorIndex) {
        state.floorIndex -= 1;
        emit({
            type: 'movement/floor_crossed',
            ...envelopeOf(ctx),
            direction: 'down',
            cumulativeThisAir: state.grounded ? 0 : state.floorIndex - state.takeoffFloorIndex,
            airborne: !state.grounded,
        });
    }
}

/** vy crossing zero while airborne — where spins and future shoutouts live. */
export function apexPhase(ctx: StepCtx): void {
    const { state, t, emit } = ctx;
    if (state.grounded || state.apexEmitted) {
        return;
    }
    if (state.prevTickVy < 0 && ctx.vy >= 0) {
        state.apexEmitted = true;
        const apexHeightPx = state.takeoffFeetY - ctx.feetY;
        emit({
            type: 'movement/apex',
            ...envelopeOf(ctx),
            apexHeightPx,
            floorsAboveTakeoff: Math.floor(apexHeightPx / t.value('FLOOR_HEIGHT_PX') + 1e-6),
            hangActive: state.hangActive,
        });
    }
}
