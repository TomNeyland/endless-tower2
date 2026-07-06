import { describe, expect, test } from 'vitest';
import { ComboEngine } from '../../src/core/combo/engine';
import type { EventEnvelope, LandEvent, LeftGroundEvent } from '../../src/core/events';
import { TuningStack } from '../../src/core/tuning';

function envelope(tick: number, floorIndex: number, grounded: boolean): EventEnvelope {
    return {
        tick,
        x: 512,
        y: 704 - floorIndex * 128,
        vx: 600,
        vy: 0,
        speed: 600,
        grounded,
        floorIndex,
        tier: 2,
    };
}

function leftGround(tick: number, floorIndex: number): LeftGroundEvent {
    return {
        ...envelope(tick, floorIndex, false),
        type: 'movement/left_ground',
        reason: 'jump',
        takeoffSpeed: 600,
    };
}

function land(tick: number, floorIndex: number, floorsGained: number): LandEvent {
    return {
        ...envelope(tick, floorIndex, true),
        type: 'movement/land',
        impactVy: 500,
        airTicks: 60,
        floorsGained,
        platformId: floorIndex,
        momentumRetained: 0.8,
        bouncesDuringAir: 0,
        sameTickJump: true,
    };
}

describe('combo grammar', () => {
    test('a rescue launch is inert for exactly one air', () => {
        const engine = new ComboEngine(new TuningStack());
        expect(engine.handle({ type: 'run/heart_lost', tick: 1 })).toEqual([]);
        expect(engine.handle(land(20, 4, 4))).toEqual([]);
        expect(engine.summary().kind).toBe('IDLE_GROUND');

        expect(engine.handle(leftGround(21, 4))).toEqual([]);
        const events = engine.handle(land(80, 8, 4));
        expect(events.map((event) => event.type)).toContain('combo/started');
        expect(engine.summary().kind).toBe('CHAIN_GROUND');
    });

    test('land-before-left-ground preserves a same-tick bhop chain beyond its fuse', () => {
        const tuning = new TuningStack();
        const engine = new ComboEngine(tuning);
        engine.handle(land(10, 3, 3));
        expect(engine.summary().kind).toBe('CHAIN_GROUND');

        engine.handle(leftGround(10, 3));
        expect(engine.summary().kind).toBe('CHAIN_AIR');
        expect(engine.step(10 + tuning.value('combo.groundGraceTicks') + 1)).toEqual([]);

        const events = engine.handle(land(90, 6, 3));
        expect(events.map((event) => event.type)).toContain('combo/link');
        expect(events.map((event) => event.type)).not.toContain('combo/banked');
        expect(engine.summary().chainFloors).toBe(6);
    });
});
