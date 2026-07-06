import { describe, expect, test } from 'vitest';
import {
    jumpVyForSpeed,
    minTakeoffSpeedForHeight,
    predictedApexPx,
} from '../../src/core/movement/jump';
import { DEFAULT_TUNING, TuningStack } from '../../src/core/tuning';

describe('jump exchange', () => {
    test('natural-play speed converts linearly before the soft knee', () => {
        const tuning = new TuningStack();
        expect(jumpVyForSpeed(0, tuning)).toBe(DEFAULT_TUNING.JUMP_BASE);
        expect(jumpVyForSpeed(900, tuning)).toBe(
            DEFAULT_TUNING.JUMP_BASE + DEFAULT_TUNING.EXCHANGE_K * 900,
        );
    });

    test('the inverse curve recovers the takeoff speed used for reachability', () => {
        const tuning = new TuningStack();
        const speed = 900;
        const height = predictedApexPx(jumpVyForSpeed(speed, tuning), tuning);
        expect(minTakeoffSpeedForHeight(height, tuning)).toBeCloseTo(speed, 10);
    });

    test('relic-era velocity approaches but never reaches the hard cap', () => {
        const tuning = new TuningStack();
        const launch = jumpVyForSpeed(5_000, tuning);
        expect(launch).toBeLessThan(DEFAULT_TUNING.JUMP_HARD_CAP);
        expect(launch).toBeGreaterThan(
            DEFAULT_TUNING.JUMP_BASE + DEFAULT_TUNING.EXCHANGE_K * DEFAULT_TUNING.MAX_RUN_SPEED,
        );
    });
});
