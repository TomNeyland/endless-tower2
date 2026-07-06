import { describe, expect, test } from 'vitest';
import { DEFAULT_TUNING, TuningStack } from '../../src/core/tuning';

describe('TuningStack contracts', () => {
    test('owner classes fold in canonical order regardless of push order', () => {
        const tuning = new TuningStack();
        tuning.pushLayer({
            id: 'boss',
            owner: 'boss:test',
            key: 'GROUND_DRAG',
            op: 'mul',
            value: 2,
            tick: 4,
        });
        tuning.pushLayer({
            id: 'relic',
            owner: 'relic:test',
            key: 'GROUND_DRAG',
            op: 'set',
            value: 100,
            tick: 2,
        });
        tuning.pushLayer({
            id: 'character',
            owner: 'character:test',
            key: 'GROUND_DRAG',
            op: 'mul',
            value: 0.5,
            tick: 1,
        });

        expect(tuning.value('GROUND_DRAG')).toBe(200);
        expect(tuning.removeByOwner('relic:test')).toBe(1);
        expect(tuning.value('GROUND_DRAG')).toBe(DEFAULT_TUNING.GROUND_DRAG);
    });

    test('invalid owners and degenerate resolved values throw without poisoning the stack', () => {
        const tuning = new TuningStack();
        expect(() =>
            tuning.pushLayer({
                id: 'unknown',
                owner: 'meta:test',
                key: 'GROUND_DRAG',
                op: 'mul',
                value: 1,
                tick: 0,
            }),
        ).toThrow(/owner/);
        expect(() =>
            tuning.pushLayer({
                id: 'density',
                owner: 'segment:test',
                key: 'tower.densityMul',
                op: 'set',
                value: 2,
                tick: 0,
            }),
        ).toThrow(/density/);
        expect(tuning.layerList()).toEqual([]);
    });
});
