/**
 * Difficulty-curve proof: 500 seeds across every profile at 100 and 200
 * floors. The harness exercises the real segment builder and live tuning
 * stack, including preset generation multipliers and periodic Narrow Ledges.
 */
import { bossForAct } from '../src/core/boss/defs';
import { modifierById } from '../src/core/map/modifiers';
import { LINE_PROFILES, NODE_PRESETS } from '../src/core/map/presets';
import type { NodeType } from '../src/core/map/types';
import { buildSegmentTower, type SegmentSpec } from '../src/core/pressure/segment';
import { forkSeed } from '../src/core/rng';
import { isPlatformReachable } from '../src/core/tower';
import { DEFAULT_TUNING, TuningStack } from '../src/core/tuning';

const GROUND_TOP_Y = 704;
const SEED_COUNT = 500;
const FLOOR_COUNTS = [100, 200] as const;
const PROFILE_TYPES = ['climb', 'coin_rush', 'challenge', 'elite', 'boss'] as const satisfies
    readonly NodeType[];
const EPSILON = 1e-12;

let checks = 0;
let configurations = 0;
let links = 0;
let phraseDrops = 0;
let bossTurns = 0;
let eliteSaturations = 0;

function assert(condition: boolean, message: string): void {
    checks += 1;
    if (!condition) {
        throw new Error(`difficulty harness: ${message}`);
    }
}

function tuningFor(
    segmentId: string,
    type: (typeof PROFILE_TYPES)[number],
    includeNarrow: boolean,
): { tuning: TuningStack; modifiers: SegmentSpec['modifiers'] } {
    const preset = NODE_PRESETS[type];
    const modifiers = preset.genOverrides.map((override) => ({ ...override }));
    if (includeNarrow && type !== 'boss') {
        modifiers.push(
            ...modifierById('narrow_ledges').tuningLayers.map((override) => ({ ...override })),
        );
    }
    const tuning = new TuningStack();
    const owner = `segment:${segmentId}`;
    const allOverrides = [
        ...LINE_PROFILES[preset.lineProfile].overrides,
        ...modifiers,
    ];
    allOverrides.forEach((override, index) => {
        tuning.pushLayer({
            id: `${owner}:${index}`,
            owner,
            key: override.key,
            op: override.op,
            value: override.value,
            tick: 0,
        });
    });
    return { tuning, modifiers };
}

function segmentSpec(
    type: (typeof PROFILE_TYPES)[number],
    actIndex: number,
    floors: number,
    seedIndex: number,
    modifiers: SegmentSpec['modifiers'],
): SegmentSpec {
    const preset = NODE_PRESETS[type];
    if (preset.difficulty === null) {
        throw new Error(`difficulty harness: ${type} has no profile`);
    }
    const seed = forkSeed('difficulty-harness', `${type}:${actIndex}:${floors}:${seedIndex}`);
    const base: SegmentSpec = {
        segmentId: `difficulty-${type}-${actIndex}-${floors}-${seedIndex}`,
        floors,
        seed,
        difficulty: { profile: { ...preset.difficulty }, actIndex },
        lineProfile: LINE_PROFILES[preset.lineProfile].overrides.map((override) => ({
            ...override,
        })),
        modifiers,
        loot: { coinsPerFloor: 0, powerupEveryFloors: 9 },
    };
    if (type === 'boss') {
        return { ...base, boss: bossForAct(actIndex).id };
    }
    return base;
}

function verifyTrace(spec: SegmentSpec, trace: ReturnType<typeof buildSegmentTower>['layout']['difficultyTrace']): void {
    assert(trace.length === spec.floors + 1, `${spec.segmentId} trace length`);
    const actLift =
        (spec.difficulty.actIndex - 1) * DEFAULT_TUNING['difficulty.actStep'];
    assert(
        Math.abs(trace[0].baselineIndex - (spec.difficulty.profile.startIndex + actLift)) <
            EPSILON,
        `${spec.segmentId} act lift`,
    );
    for (let floor = 1; floor < trace.length; floor += 1) {
        const previous = trace[floor - 1];
        const current = trace[floor];
        assert(current.floorIndex === floor, `${spec.segmentId} trace floor ${floor}`);
        assert(current.index <= current.frontier + EPSILON, `${spec.segmentId} crossed frontier`);
        if (spec.difficulty.profile.cycles === 0) {
            assert(
                current.baselineIndex + EPSILON >= previous.baselineIndex,
                `${spec.segmentId} baseline reversed at floor ${floor}`,
            );
            if (current.index + EPSILON < previous.index) {
                assert(current.breather, `${spec.segmentId} unphrased drop at floor ${floor}`);
                phraseDrops += 1;
            }
        } else if (current.baselineIndex + EPSILON < previous.baselineIndex) {
            bossTurns += 1;
        }
    }
}

for (let seedIndex = 0; seedIndex < SEED_COUNT; seedIndex += 1) {
    const actIndex = (seedIndex % 3) + 1;
    for (const type of PROFILE_TYPES) {
        for (const floors of FLOOR_COUNTS) {
            const includeNarrow = seedIndex % 4 === 0;
            const segmentId = `difficulty-${type}-${actIndex}-${floors}-${seedIndex}`;
            const firstSetup = tuningFor(segmentId, type, includeNarrow);
            const spec = segmentSpec(
                type,
                actIndex,
                floors,
                seedIndex,
                firstSetup.modifiers,
            );
            const first = buildSegmentTower(spec, firstSetup.tuning, GROUND_TOP_Y);
            const secondSetup = tuningFor(segmentId, type, includeNarrow);
            const second = buildSegmentTower(spec, secondSetup.tuning, GROUND_TOP_Y);
            configurations += 1;

            assert(
                JSON.stringify(first) === JSON.stringify(second),
                `${segmentId} was not byte-exact`,
            );
            verifyTrace(spec, first.layout.difficultyTrace);
            for (let i = 1; i < first.layout.platforms.length; i += 1) {
                assert(
                    isPlatformReachable(
                        first.layout.platforms[i - 1],
                        first.layout.platforms[i],
                        firstSetup.tuning,
                    ),
                    `${segmentId} unreachable link ${i - 1}->${i}`,
                );
                links += 1;
            }
            if (type === 'elite') {
                const end = first.layout.difficultyTrace[floors];
                assert(end.saturated, `${segmentId} elite endgame missed frontier`);
                assert(
                    Math.abs(end.index - end.frontier) < EPSILON,
                    `${segmentId} elite endgame did not saturate exactly`,
                );
                eliteSaturations += 1;
            }
        }
    }
}

assert(phraseDrops > 0, 'no breather relief appeared');
assert(bossTurns > 0, 'boss profile never cycled');
assert(
    eliteSaturations === SEED_COUNT * FLOOR_COUNTS.length,
    'not every Elite endgame saturated',
);
assert(
    configurations === SEED_COUNT * PROFILE_TYPES.length * FLOOR_COUNTS.length,
    'sweep configuration count drifted',
);

console.log(
    `difficulty harness: ${configurations} configurations, ${links} reachable links, ` +
        `${checks} checks passed`,
);
console.log(
    `phrasing: ${phraseDrops} relief drops; boss cycles: ${bossTurns}; ` +
        `Elite frontier saturations: ${eliteSaturations}`,
);
