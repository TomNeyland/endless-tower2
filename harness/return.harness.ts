/**
 * RETURN harness — engine-free assertions over the meta core
 * (docs/design/meta-progression.md). Run: `npx tsx harness/return.harness.ts`.
 *
 * Proves: feat-firing determinism over synthetic stat blocks and event
 * sequences (fire once ever, scoped counters reset), save round-trip +
 * migration machinery + corrupt/future-refusal policy, character layer
 * folds on the TuningStack (canonical order, hearts floor, pop-by-owner),
 * and pool filtering (16-of-24 relics, the locked modifier trio, seeded
 * generation never rolling locked content).
 */
import assert from 'node:assert/strict';
import type { ComboBankedEvent, SessionStats } from '../src/core/combo/types';
import type {
    EventEnvelope,
    MovementEvent,
    SegmentEndEvent,
    SegmentStartEvent,
    WallBounceEvent,
} from '../src/core/events';
import { INPUT_LEAD_NEVER } from '../src/core/events';
import { rollRelicReward, rollShopStock } from '../src/core/economy/shop';
import { generateActGraph } from '../src/core/map/gen';
import { applyCharacterLayers, characterById, CHARACTERS } from '../src/core/meta/characters';
import { FeatEngine, FEATS, featById } from '../src/core/meta/feats';
import { emptyLifetimeStats, foldRunIntoStats, type RunRecord } from '../src/core/meta/stats';
import {
    characterUnlocked,
    grantForFeat,
    modifierPool,
    relicPool,
    UNLOCKABLE_MODIFIERS,
    UNLOCKABLE_RELICS,
} from '../src/core/meta/unlocks';
import {
    freshSave,
    loadSaveDocument,
    MIGRATIONS,
    SAVE_SCHEMA_VERSION,
    serializeSave,
    withFeat,
    withRunEnd,
    withSettings,
} from '../src/core/persist/save';
import { RELICS } from '../src/core/relics/roster';
import { RunHost } from '../src/core/run/host';
import { RunState } from '../src/core/run/state';
import { DEFAULT_TUNING, TuningStack } from '../src/core/tuning';

let checks = 0;
function ok(name: string, fn: () => void): void {
    fn();
    checks += 1;
    console.log(`  ok ${name}`);
}

// --- Synthetic event builders (full payloads; the engine reads slices) ---

function env(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
    return {
        tick: 0,
        x: 512,
        y: 0,
        vx: 0,
        vy: 0,
        speed: 0,
        grounded: true,
        floorIndex: 0,
        tier: 0,
        ...overrides,
    };
}

function wallBounce(): WallBounceEvent {
    return {
        ...env({ grounded: false }),
        type: 'movement/wall_bounce',
        side: 'left',
        impactSpeedX: 600,
        exitSpeedX: 600,
        efficiency: 1,
        inputLeadTicks: INPUT_LEAD_NEVER,
        perfect: false,
        airborne: true,
        bounceIndexInAir: 0,
        timeSinceLastBounceMs: null,
        heightAtBounce: 0,
    };
}

function segmentStart(): SegmentStartEvent {
    return {
        ...env(),
        type: 'run/segment_start',
        segmentId: 'harness-seg',
        floors: 30,
        seed: 1,
        doorFloorIndex: 30,
        lineProfile: [],
        modifiers: [],
    };
}

function segmentEnd(heartsLost: number): SegmentEndEvent {
    return {
        ...env(),
        type: 'run/segment_end',
        reason: 'exit',
        segmentId: 'harness-seg',
        floorsClimbed: 30,
        timeTicks: 3600,
        heartsLost,
    };
}

function banked(tierReached: number, mult: number, bounces: number): ComboBankedEvent {
    return {
        type: 'combo/banked',
        tick: 100,
        chainId: 1,
        reason: 'fizzle',
        chainFloors: 40,
        links: 8,
        mult,
        basePoints: 16000,
        payout: Math.round(16000 * mult),
        tierReached,
        tierReachedName: null,
        spiceTotals: {
            bounces,
            perfects: 0,
            leaps: 0,
            hotLandings: 0,
            ceiling: false,
            multFromSpice: mult - 1,
        },
        startFloorIndex: 0,
        endFloorIndex: 40,
        startTick: 0,
        endTick: 100,
    };
}

function statBlock(overrides: Partial<SessionStats> = {}): SessionStats {
    return {
        bestChainFloors: 0,
        bestChainMult: 1,
        bestChainPayout: 0,
        bestChainFace: '',
        longestChainLinks: 0,
        tallestSingleLink: 0,
        totalScore: 0,
        heightPoints: 0,
        comboPoints: 0,
        banksByReason: { fizzle: 0, grace: 0, exit: 0, forced: 0 },
        voids: 0,
        perfectBounces: 0,
        bounceEfficiency: 0,
        comboUptime: 0,
        tierHistogram: [0, 0, 0, 0, 0, 0, 0, 0],
        bestLeapStreak: 0,
        assistShareInChains: 0,
        refarmedFloorShare: 0,
        ...overrides,
    };
}

function runRecord(overrides: Partial<RunRecord> = {}): RunRecord {
    return {
        seed: 'harness-seed',
        characterId: 'beige',
        reason: 'death_line',
        totalScore: 1000,
        coins: 10,
        floorsClimbed: 40,
        timeTicks: 7200,
        segments: 2,
        actsCompleted: 0,
        fastestActTicks: null,
        bestChainFloors: 10,
        bestChainMult: 1.5,
        bestChainPayout: 1500,
        bestChainFace: '10 FLOORS ×1.5 — 1,500',
        banks: 3,
        voids: 1,
        perfectBounces: 2,
        heartsLost: 2,
        tierHistogram: [1, 1, 0, 0, 0, 0, 0, 0],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
console.log('feat engine');
// ---------------------------------------------------------------------------

ok('session stat block fires exactly its matching feats, once ever', () => {
    const engine = new FeatEngine([]);
    const fires = engine.handleSessionStats(
        statBlock({ comboUptime: 0.6, perfectBounces: 5, tallestSingleLink: 6 }),
    );
    assert.deepEqual(
        fires.map((f) => f.featId),
        ['uptime-half', 'perfect-five', 'leap-six'],
    );
    // Once ever: an identical block fires nothing.
    assert.equal(engine.handleSessionStats(statBlock({ comboUptime: 0.9 })).length, 0);
});

ok('a SUPERNOVA bank fires every bank-tier feat it clears in one moment', () => {
    const engine = new FeatEngine([]);
    const fires = engine.handleCombo(banked(6, 3.2, 9));
    assert.deepEqual(
        fires.map((f) => f.featId).sort(),
        ['bank-comet', 'bank-meteoric', 'bank-supernova', 'deep-drink', 'mult-three'].sort(),
    );
    assert.match(fires[0].trigger, /combo\/banked/);
});

ok('feat firing is deterministic over identical sequences', () => {
    const run = (): string[] => {
        const engine = new FeatEngine([]);
        const fired: string[] = [];
        fired.push(...engine.handleMovement(segmentStart()).map((f) => f.featId));
        for (let i = 0; i < 25; i += 1) {
            fired.push(...engine.handleMovement(wallBounce()).map((f) => f.featId));
        }
        fired.push(...engine.handleCombo(banked(5, 2.0, 3)).map((f) => f.featId));
        fired.push(...engine.handleActCompleted(1).map((f) => f.featId));
        return fired;
    };
    assert.deepEqual(run(), run());
    // A COMET (tier 5) bank also clears the METEORIC (tier 4) feat.
    assert.deepEqual(run(), [
        'bounce-25-segment',
        'bank-comet',
        'bank-meteoric',
        'clean-act',
        'act1-complete',
    ]);
});

ok('segment bounce counter resets on segment start (24+24 never fires)', () => {
    const engine = new FeatEngine([]);
    engine.handleMovement(segmentStart());
    for (let i = 0; i < 24; i += 1) {
        assert.equal(engine.handleMovement(wallBounce()).length, 0);
    }
    engine.handleMovement(segmentStart());
    for (let i = 0; i < 24; i += 1) {
        assert.equal(engine.handleMovement(wallBounce()).length, 0);
    }
    // The 25th inside ONE segment fires.
    assert.deepEqual(
        engine.handleMovement(wallBounce()).map((f) => f.featId),
        ['bounce-25-segment'],
    );
});

ok('clean-act refuses after a heart loss (line catch or mystery)', () => {
    const lineCatch = new FeatEngine([]);
    lineCatch.handleMovement({ ...env(), type: 'run/heart_lost', heartsRemaining: 2, gapAtCatch: 0, catchFloorIndex: 3 });
    assert.deepEqual(
        lineCatch.handleActCompleted(1).map((f) => f.featId),
        ['act1-complete'],
    );
    const mystery = new FeatEngine(['act1-complete']);
    mystery.noteHeartLoss();
    assert.deepEqual(mystery.handleActCompleted(1), []);
    // The act scope resets: the NEXT act, played clean, fires clean-act.
    assert.deepEqual(
        mystery.handleActCompleted(2).map((f) => f.featId).sort(),
        ['act2-complete', 'clean-act'].sort(),
    );
});

ok('ceiling entry fires touch-ceiling; exit does not', () => {
    const engine = new FeatEngine([]);
    assert.equal(
        engine.handleMovement({ ...env(), type: 'movement/ceiling', state: 'exited', effectiveMaxSpeed: 1400, source: 'base' }).length,
        0,
    );
    assert.deepEqual(
        engine
            .handleMovement({ ...env(), type: 'movement/ceiling', state: 'entered', effectiveMaxSpeed: 1400, source: 'base' })
            .map((f) => f.featId),
        ['touch-ceiling'],
    );
});

ok('a two-catch climb exited fires hard-way-out; a clean exit does not', () => {
    const engine = new FeatEngine([]);
    assert.equal(engine.handleMovement(segmentEnd(1)).length, 0);
    assert.deepEqual(
        engine.handleMovement(segmentEnd(2)).map((f) => f.featId),
        ['hard-way-out'],
    );
});

ok('the earned set seeds from the save — a recorded feat never re-fires', () => {
    const engine = new FeatEngine(['bank-comet', 'bank-meteoric']);
    assert.deepEqual(
        engine.handleCombo(banked(5, 1.0, 0)).map((f) => f.featId),
        [],
    );
});

ok('every feat has a unique id and every grant resolves', () => {
    assert.equal(new Set(FEATS.map((f) => f.id)).size, FEATS.length);
    for (const feat of FEATS) {
        grantForFeat(feat.id); // throws on dangling references
        assert.equal(featById(feat.id), feat);
    }
    assert.deepEqual(grantForFeat('bank-comet'), { kind: 'character', id: 'green' });
    assert.deepEqual(grantForFeat('bank-supernova'), { kind: 'relic', id: 'compounder' });
    assert.deepEqual(grantForFeat('act3-complete'), { kind: 'modifier', id: 'tailwind' });
});

// ---------------------------------------------------------------------------
console.log('save document');
// ---------------------------------------------------------------------------

ok('round-trip: feats + run end + settings survive serialize/load exactly', () => {
    let doc = freshSave();
    doc = withFeat(doc, 'bank-comet', grantForFeat('bank-comet'));
    doc = withFeat(doc, 'deep-drink', grantForFeat('deep-drink'));
    doc = withRunEnd(doc, runRecord({ reason: 'summit', seed: 'roundtrip' }), ['echo-walls']);
    doc = withSettings(doc, { masterVolume: 0.4 });
    const loaded = loadSaveDocument(serializeSave(doc));
    assert.equal(loaded.outcome, 'loaded');
    assert.equal(loaded.writable, true);
    assert.equal(loaded.warning, null);
    assert.deepEqual(loaded.doc, doc);
    assert.equal(loaded.doc.lastSeed, 'roundtrip');
    assert.deepEqual(loaded.doc.unlocks.characters, ['green']);
    assert.deepEqual(loaded.doc.unlocks.relics, ['echo-walls']);
    assert.deepEqual(loaded.doc.unlocks.newRelics, ['echo-walls']);
});

ok('missing save -> fresh, writable, no warning noise beyond policy', () => {
    const loaded = loadSaveDocument(null);
    assert.equal(loaded.outcome, 'fresh-missing');
    assert.equal(loaded.writable, true);
    assert.deepEqual(loaded.doc, freshSave());
});

ok('corrupt saves -> fresh + one warning (never a throw, never a lie)', () => {
    for (const raw of [
        'not json at all {{{',
        JSON.stringify({ version: 'one' }),
        JSON.stringify({ version: 1, unlocks: { feats: 'nope' } }),
        JSON.stringify({ ...freshSave(), settings: { masterVolume: 9 } }),
        // An unlock naming a relic that does not exist is corrupt, not filtered.
        JSON.stringify({
            ...freshSave(),
            unlocks: { feats: [], characters: [], relics: ['ghost-relic'], modifiers: [], newRelics: [] },
        }),
    ]) {
        const loaded = loadSaveDocument(raw);
        assert.equal(loaded.outcome, 'fresh-corrupt', raw.slice(0, 40));
        assert.equal(loaded.writable, true);
        assert.notEqual(loaded.warning, null);
        assert.deepEqual(loaded.doc, freshSave());
    }
});

ok('future versions refuse to load and are never writable', () => {
    const loaded = loadSaveDocument(JSON.stringify({ version: SAVE_SCHEMA_VERSION + 1 }));
    assert.equal(loaded.outcome, 'refused-future');
    assert.equal(loaded.writable, false);
    assert.deepEqual(loaded.doc, freshSave());
});

ok('migration machinery: v1 loads with zero migrations; v0 has none and refuses', () => {
    assert.equal(Object.keys(MIGRATIONS).length, 0); // explicit functions arrive with v2
    const v0 = loadSaveDocument(JSON.stringify({ version: 0 }));
    assert.equal(v0.outcome, 'fresh-corrupt'); // pre-versioned saves never existed
});

ok('withFeat throws on a double record; withSettings validates its range', () => {
    let doc = freshSave();
    doc = withFeat(doc, 'touch-ceiling', grantForFeat('touch-ceiling'));
    assert.throws(() => withFeat(doc, 'touch-ceiling', null), /once ever/);
    assert.throws(() => withSettings(doc, { masterVolume: 1.2 }), /outside/);
});

// ---------------------------------------------------------------------------
console.log('character layers');
// ---------------------------------------------------------------------------

ok('green folds drag x0.7 and accel x0.9 over the base table', () => {
    const stack = new TuningStack();
    applyCharacterLayers(characterById('green'), stack, 0);
    assert.equal(stack.value('GROUND_DRAG'), DEFAULT_TUNING.GROUND_DRAG * 0.7);
    assert.equal(stack.value('RUN_ACCEL_LOW'), DEFAULT_TUNING.RUN_ACCEL_LOW * 0.9);
    assert.equal(stack.value('RUN_ACCEL_HIGH'), DEFAULT_TUNING.RUN_ACCEL_HIGH * 0.9);
});

ok('pink folds flip grace x1.5 and retention -0.04', () => {
    const stack = new TuningStack();
    applyCharacterLayers(characterById('pink'), stack, 0);
    assert.equal(stack.value('STICK_FLIP_GRACE_MS'), DEFAULT_TUNING.STICK_FLIP_GRACE_MS * 1.5);
    assert.ok(Math.abs(stack.value('JUMP_RETENTION') - (DEFAULT_TUNING.JUMP_RETENTION - 0.04)) < 1e-12);
});

ok('yellow folds accel x1.15 and a 12-tick hotter fuse', () => {
    const stack = new TuningStack();
    applyCharacterLayers(characterById('yellow'), stack, 0);
    assert.ok(Math.abs(stack.value('RUN_ACCEL_LOW') - DEFAULT_TUNING.RUN_ACCEL_LOW * 1.15) < 1e-9);
    assert.equal(stack.value('combo.groundGraceTicks'), DEFAULT_TUNING['combo.groundGraceTicks'] - 12);
});

ok('purple folds gravity x0.9 and hearts.max 2; a fresh purple run starts at 2', () => {
    const stack = new TuningStack();
    applyCharacterLayers(characterById('purple'), stack, 0);
    assert.equal(stack.value('GRAVITY_RISE'), DEFAULT_TUNING.GRAVITY_RISE * 0.9);
    assert.equal(stack.value('hearts.max'), 2);
    const run = new RunState({ seed: 'h', characterId: 'purple' }, stack, () => 0, () => {});
    assert.equal(run.hearts, 2); // hearts.start 3, clamped by the trait
    assert.equal(run.characterId, 'purple');
    // RunHost.begin does the same fold for the map side.
    const host = RunHost.begin('h', () => {}, 'purple');
    assert.equal(host.run.hearts, 2);
    assert.equal(host.tuning.value('hearts.max'), 2);
});

ok('hearts.max floors at 1: the stack THROWS and rolls back below it', () => {
    const stack = new TuningStack();
    applyCharacterLayers(characterById('purple'), stack, 0); // max 2
    stack.pushLayer({ id: 'b1', owner: 'boss:test', key: 'hearts.max', op: 'add', value: -1, tick: 0 });
    assert.equal(stack.value('hearts.max'), 1);
    assert.throws(
        () => stack.pushLayer({ id: 'b2', owner: 'boss:test', key: 'hearts.max', op: 'add', value: -1, tick: 0 }),
        /floors at 1/,
    );
    assert.equal(stack.value('hearts.max'), 1); // the bad layer rolled back
});

ok('canonical fold: character folds before relics regardless of push order', () => {
    const stack = new TuningStack();
    // Relic pushed FIRST, character second — the fold must still run
    // base -> character (mul) -> relic (set).
    stack.pushLayer({ id: 'r', owner: 'relic:test', key: 'GROUND_DRAG', op: 'set', value: 100, tick: 0 });
    applyCharacterLayers(characterById('green'), stack, 0);
    assert.equal(stack.value('GROUND_DRAG'), 100);
    // Pop the character by owner; the relic band survives untouched.
    assert.equal(stack.removeByOwner('character:green'), characterById('green').layers.length);
    assert.equal(stack.value('GROUND_DRAG'), 100);
    assert.equal(stack.value('RUN_ACCEL_LOW'), DEFAULT_TUNING.RUN_ACCEL_LOW);
});

ok('an unknown owner class still fails loud at push', () => {
    const stack = new TuningStack();
    assert.throws(
        () => stack.pushLayer({ id: 'x', owner: 'meta:test', key: 'GROUND_DRAG', op: 'mul', value: 1, tick: 0 }),
        /owner-tag contract/,
    );
});

ok('beige is the baseline: zero layers, always unlocked', () => {
    const beige = characterById('beige');
    assert.equal(beige.layers.length, 0);
    assert.equal(beige.unlockFeat, null);
    assert.equal(CHARACTERS.length, 5);
});

// ---------------------------------------------------------------------------
console.log('pool filtering');
// ---------------------------------------------------------------------------

ok('16 of 24 relics initial; unlocks grow the pool one grant at a time', () => {
    assert.equal(RELICS.length, 24);
    assert.equal(UNLOCKABLE_RELICS.length, 8);
    const initial = relicPool([]);
    assert.equal(initial.length, 16);
    for (const id of UNLOCKABLE_RELICS) {
        assert.ok(!initial.some((r) => r.id === id), `${id} leaked into the initial pool`);
    }
    assert.equal(relicPool(['compounder']).length, 17);
    assert.equal(relicPool([...UNLOCKABLE_RELICS]).length, 24);
});

ok('the locked modifier trio stays out of the roll pool until earned', () => {
    const initialIds = modifierPool([]).map((m) => m.id);
    // EXAM flipped brittle_rows and sticky_patches rollable (the boss
    // toolkit's hazards graduating to map modifiers); RETURN's locked trio
    // is orthogonal to that flip. The initial pool is the merged truth.
    assert.deepEqual(
        initialIds.sort(),
        ['brittle_rows', 'greedy_line', 'icy_floors', 'low_gravity', 'sticky_patches'].sort(),
    );
    for (const id of UNLOCKABLE_MODIFIERS) {
        assert.ok(!initialIds.includes(id));
    }
    assert.ok(
        modifierPool(['tailwind'])
            .map((m) => m.id)
            .includes('tailwind'),
    );
});

ok('seeded shop stock never contains a locked relic', () => {
    const pool = relicPool([]);
    const locked = new Set(UNLOCKABLE_RELICS);
    for (let s = 0; s < 8; s += 1) {
        for (let reroll = 0; reroll < 3; reroll += 1) {
            const stock = rollShopStock(`seed-${s}`, `node-${s}`, 1 + (s % 3), [], reroll, pool);
            assert.equal(stock.length, 3);
            for (const relic of stock) {
                assert.ok(!locked.has(relic.id), `${relic.id} rolled while locked`);
            }
        }
    }
});

ok('seeded elite rewards never grant a locked relic', () => {
    const pool = relicPool([]);
    const locked = new Set(UNLOCKABLE_RELICS);
    for (let s = 0; s < 40; s += 1) {
        const relic = rollRelicReward(`seed-${s}`, `elite-${s}`, 3, [], pool);
        assert.notEqual(relic, null);
        assert.ok(!locked.has((relic as { id: string }).id));
    }
});

ok('generated maps never roll a locked modifier from a filtered pool', () => {
    const pool = modifierPool([]);
    const locked = new Set(UNLOCKABLE_MODIFIERS);
    for (const seed of ['alpha', 'bravo', 'charlie', 'delta', 'echo']) {
        for (let act = 1; act <= 3; act += 1) {
            const graph = generateActGraph(seed, act, 16, pool);
            for (const row of graph.rows) {
                for (const node of row) {
                    for (const id of node.modifierIds) {
                        assert.ok(!locked.has(id), `${id} rolled on ${node.id} (${seed})`);
                    }
                }
            }
        }
    }
});

ok('same seed + same pool = same map offer (determinism holds under filtering)', () => {
    const pool = modifierPool([]);
    const a = generateActGraph('rematch', 1, 16, pool);
    const b = generateActGraph('rematch', 1, 16, pool);
    assert.deepEqual(a, b);
});

ok('character unlock gating: baseline free, colors earned', () => {
    assert.equal(characterUnlocked('beige', []), true);
    assert.equal(characterUnlocked('green', []), false);
    assert.equal(characterUnlocked('green', ['green']), true);
    assert.throws(() => characterUnlocked('mauve', []), /unknown character/);
});

// ---------------------------------------------------------------------------
console.log('lifetime stats');
// ---------------------------------------------------------------------------

ok('win streaks, per-character boards, and bests fold correctly', () => {
    let stats = emptyLifetimeStats();
    stats = foldRunIntoStats(stats, runRecord({ reason: 'summit', characterId: 'beige', totalScore: 5000, actsCompleted: 3, fastestActTicks: 9000 }));
    stats = foldRunIntoStats(stats, runRecord({ reason: 'summit', characterId: 'green', bestChainPayout: 45648, bestChainFace: '31 FLOORS ×4.75 — 45,648', fastestActTicks: 7000 }));
    stats = foldRunIntoStats(stats, runRecord({ reason: 'death_line', characterId: 'green' }));
    assert.equal(stats.runs, 3);
    assert.equal(stats.wins, 2);
    assert.equal(stats.deaths, 1);
    assert.equal(stats.winStreak, 0);
    assert.equal(stats.bestWinStreak, 2);
    assert.equal(stats.bestChainPayout, 45648);
    assert.equal(stats.bestChainFace, '31 FLOORS ×4.75 — 45,648');
    assert.equal(stats.bestChainCharacterId, 'green');
    assert.equal(stats.fastestActTicks, 7000);
    assert.equal(stats.bestRunScore, 5000);
    assert.equal(stats.perCharacter.green.runs, 2);
    assert.equal(stats.perCharacter.green.wins, 1);
    assert.equal(stats.perCharacter.beige.bestScore, 5000);
    assert.equal(stats.tierHistogram[0], 3);
    assert.equal(stats.totalFloors, 120);
});

ok('a run record with a malformed histogram fails loud', () => {
    assert.throws(
        () => foldRunIntoStats(emptyLifetimeStats(), runRecord({ tierHistogram: [1, 2] })),
        /rungs/,
    );
});

console.log(`\nRETURN harness: ${checks} checks passed`);
