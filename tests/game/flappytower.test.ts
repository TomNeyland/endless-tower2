import { describe, expect, test } from 'vitest';
import type { LandEvent, WallBounceEvent } from '../../src/core/events';
import { PLAYER_BODY } from '../../src/core/movement/state';
import {
    FlappyTowerAutoRunner,
    type FlappyTowerTuning,
} from '../../src/game/systems/FlappyTowerAutoRunner';

const TUNING: FlappyTowerTuning = {
    edgeGuardPx: 84,
    edgeGuardRunwayFrac: 0.55,
    directionSeedSpeed: 90,
};

const PLATFORMS = [
    { id: 1, xCenter: 300, topY: 600, width: 320 },
    { id: 2, xCenter: 50, topY: 480, width: 128 },
];

function land(platformId: number, vx: number): LandEvent {
    return {
        type: 'movement/land',
        tick: 10,
        x: 300,
        y: 560,
        vx,
        vy: 0,
        speed: Math.abs(vx),
        grounded: true,
        floorIndex: 1,
        tier: 0,
        impactVy: 700,
        airTicks: 40,
        floorsGained: 1,
        platformId,
        momentumRetained: 1,
        bouncesDuringAir: 0,
        sameTickJump: false,
    };
}

function wallBounce(side: 'left' | 'right'): WallBounceEvent {
    const vx = side === 'left' ? 500 : -500;
    return {
        type: 'movement/wall_bounce',
        tick: 20,
        x: side === 'left' ? 86 : 938,
        y: 420,
        vx,
        vy: -300,
        speed: Math.abs(vx),
        grounded: false,
        floorIndex: 2,
        tier: 1,
        side,
        impactSpeedX: 500,
        exitSpeedX: 500,
        efficiency: 1,
        inputLeadTicks: 999,
        perfect: false,
        airborne: true,
        bounceIndexInAir: 1,
        timeSinceLastBounceMs: null,
        heightAtBounce: 200,
    };
}

function guardFor(width: number): number {
    return Math.min(TUNING.edgeGuardPx, (width / 2 - PLAYER_BODY.width / 2) * TUNING.edgeGuardRunwayFrac);
}

describe('FlappyTower auto-runner', () => {
    test('platforms behave like timing meters between edge guards', () => {
        const runner = new FlappyTowerAutoRunner(PLATFORMS);
        const platform = PLATFORMS[0];
        const bodyHalf = PLAYER_BODY.width / 2;
        const guard = guardFor(platform.width);

        expect(
            runner.axis({ x: platform.xCenter, vx: 0, grounded: false, platformId: null }, TUNING),
        ).toBe(1);
        expect(
            runner.axis(
                {
                    x: platform.xCenter + platform.width / 2 - bodyHalf - guard,
                    vx: 400,
                    grounded: true,
                    platformId: platform.id,
                },
                TUNING,
            ),
        ).toBe(-1);
        expect(
            runner.axis({ x: platform.xCenter, vx: -260, grounded: true, platformId: platform.id }, TUNING),
        ).toBe(-1);
        expect(
            runner.axis(
                {
                    x: platform.xCenter - platform.width / 2 + bodyHalf + guard,
                    vx: -400,
                    grounded: true,
                    platformId: platform.id,
                },
                TUNING,
            ),
        ).toBe(1);
    });

    test('narrow ledges compress the pacer runway without route targeting', () => {
        const runner = new FlappyTowerAutoRunner(PLATFORMS);
        const platform = PLATFORMS[1];
        const bodyHalf = PLAYER_BODY.width / 2;
        const guard = guardFor(platform.width);

        expect(
            runner.axis(
                {
                    x: platform.xCenter - platform.width / 2 + bodyHalf + guard,
                    vx: -100,
                    grounded: true,
                    platformId: platform.id,
                },
                TUNING,
            ),
        ).toBe(1);
        expect(
            runner.axis(
                {
                    x: platform.xCenter + platform.width / 2 - bodyHalf - guard,
                    vx: 100,
                    grounded: true,
                    platformId: platform.id,
                },
                TUNING,
            ),
        ).toBe(-1);
    });

    test('landing speed seeds commitment and walls flip away from the wall', () => {
        const runner = new FlappyTowerAutoRunner(PLATFORMS);
        runner.onLand(land(1, -200), TUNING);
        expect(
            runner.axis({ x: 300, vx: -200, grounded: false, platformId: null }, TUNING),
        ).toBe(-1);

        runner.onWallBounce(wallBounce('left'));
        expect(runner.axis({ x: 90, vx: 500, grounded: false, platformId: null }, TUNING)).toBe(1);

        runner.onWallBounce(wallBounce('right'));
        expect(runner.axis({ x: 934, vx: -500, grounded: false, platformId: null }, TUNING)).toBe(-1);
    });
});
