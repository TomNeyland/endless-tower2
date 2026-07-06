import { describe, expect, test } from 'vitest';
import { fork, forkSeed } from '../../src/core/rng';

function draw(seed: string, label: string): number[] {
    const rng = fork(seed, label);
    return Array.from({ length: 12 }, () => rng());
}

describe('seeded forks', () => {
    test('the same seed and label reproduce byte-identical streams', () => {
        expect(draw('run-seed', 'map:act2')).toEqual(draw('run-seed', 'map:act2'));
        expect(forkSeed('run-seed', 'map:act2')).toBe(forkSeed('run-seed', 'map:act2'));
    });

    test('labels isolate streams from call order and from each other', () => {
        const mapBeforeShop = draw('run-seed', 'map:act2');
        draw('run-seed', 'shop:a2-r2-c1');
        const mapAfterShop = draw('run-seed', 'map:act2');
        expect(mapAfterShop).toEqual(mapBeforeShop);
        expect(draw('run-seed', 'map:act3')).not.toEqual(mapBeforeShop);
    });
});
