/**
 * Seeded map sweep: generation guarantees, node-profile wiring, floor
 * ranges, and byte-exact offers across 500 complete three-act seeds.
 */
import assert from 'node:assert/strict';
import { generateActGraph } from '../src/core/map/gen';
import { NODE_PRESETS } from '../src/core/map/presets';

const SEED_COUNT = 500;
let graphs = 0;
let nodes = 0;

for (let seedIndex = 0; seedIndex < SEED_COUNT; seedIndex += 1) {
    const seed = `map-sweep-${seedIndex}`;
    for (let actIndex = 1; actIndex <= 3; actIndex += 1) {
        const first = generateActGraph(seed, actIndex);
        const second = generateActGraph(seed, actIndex);
        assert.deepEqual(first, second, `${seed} act ${actIndex} changed between identical rolls`);
        graphs += 1;

        for (const row of first.rows) {
            for (const node of row) {
                nodes += 1;
                const preset = NODE_PRESETS[node.type];
                if (preset.floors === null) {
                    assert.equal(node.segment, null);
                    assert.equal(preset.difficulty, null);
                    continue;
                }
                assert.notEqual(node.segment, null);
                assert.notEqual(preset.difficulty, null);
                const segment = node.segment;
                const difficulty = preset.difficulty;
                assert.ok(segment !== null);
                assert.ok(difficulty !== null);
                assert.ok(segment.floors >= preset.floors[0]);
                assert.ok(segment.floors <= preset.floors[1]);
                assert.equal(segment.difficulty.profile.id, difficulty.id);
                assert.equal(segment.difficulty.actIndex, actIndex);
            }
        }
    }
}

console.log(`map harness: ${graphs} graphs, ${nodes} nodes across ${SEED_COUNT} seeds passed`);
