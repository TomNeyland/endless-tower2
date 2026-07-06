/**
 * The EXAM harness — engine-free proof of the duel core, in Node, with
 * assertions (`npm run exam`). No Phaser, no browser: the same core the
 * scene composes is exercised directly, and the headless replay is driven
 * over synthetic v5 sessions so the recorded-channel plumbing is proven
 * end-to-end. Any failed assertion exits 1 — a broken exam is a stopped
 * line, never a shrug.
 */
import { BossBrain } from '../core/boss/brain';
import { bankDamage, bankLoudness, BossHealth, bossHpFor } from '../core/boss/damage';
import { BOSS_ROSTER, SLIME_SOVEREIGN, SUMMIT_KEEPER } from '../core/boss/defs';
import { basePoints, payoutOf } from '../core/combo/spice';
import { DIFFICULTY_PROFILES } from '../core/difficulty/profiles';
import type { BossEvent, LandEvent } from '../core/events';
import type { ExamCommand } from '../core/exam/commands';
import { PlatformField, rollFieldClassifications } from '../core/exam/field';
import { seedPassiveSwarm } from '../core/exam/passive-swarm';
import { SwarmRuntime } from '../core/exam/swarm';
import { generateActGraph } from '../core/map/gen';
import { rollableModifiers } from '../core/map/modifiers';
import { emitSpawn, stepMovement } from '../core/movement/logic';
import { createMovementState, msToTicks } from '../core/movement/state';
import { buildSegmentTower, type SegmentSpec } from '../core/pressure/segment';
import { relicById } from '../core/relics/roster';
import { simulateSession } from '../core/replay/simulate';
import { fork, mulberry32 } from '../core/rng';
import type { PlatformSpec } from '../core/tower';
import { TuningStack } from '../core/tuning';
import { climbFrames, GROUND_TOP_Y, syntheticSession } from './exam-sessions';

let failures = 0;
let checks = 0;
function assert(cond: boolean, name: string): void {
    checks += 1;
    if (cond) {
        console.log(`  ok      ${name}`);
    } else {
        failures += 1;
        console.error(`  FAILED  ${name}`);
    }
}
function section(name: string): void {
    console.log(`\n== ${name}`);
}

// ---------------------------------------------------------------------------
section('damage: the frozen contract');
{
    const t = new TuningStack();
    assert(bankDamage(1000, false, t) === 1000, 'damage = payout × damagePerPoint (flat curve)');
    assert(bankDamage(1000, true, t) === 1500, 'openness multiplies ×1.5');
    assert(bankLoudness(499, t) === 'whisper', 'loudness: whisper below 500');
    assert(bankLoudness(4999, t) === 'voice', 'loudness: voice below 5000');
    assert(bankLoudness(5000, t) === 'roar', 'loudness: roar at 5000');

    const health = new BossHealth(SLIME_SOVEREIGN, t);
    const bank = (payout: number) =>
        health.applyBank(
            {
                type: 'combo/banked',
                tick: 1,
                chainId: 1,
                reason: 'fizzle',
                chainFloors: 10,
                links: 3,
                mult: 2,
                basePoints: payout / 2,
                payout,
                tierReached: 2,
                tierReachedName: 'BLAZING',
                spiceTotals: {
                    bounces: 0,
                    perfects: 0,
                    leaps: 0,
                    hotLandings: 0,
                    ceiling: false,
                    multFromSpice: 0,
                },
                startFloorIndex: 0,
                endFloorIndex: 10,
                startTick: 0,
                endTick: 1,
            },
            false,
            t,
        );
    const hpMax = health.hpMax;
    const hit1 = bank(Math.round(hpMax * 0.25)); // -> 75%: still fresh
    assert(hit1.phase === 1 && !hit1.phaseTurned, 'phase 1 holds above 2/3');
    const hit2 = bank(Math.round(hpMax * 0.17)); // -> ~58%: cracked
    assert(hit2.phase === 2 && hit2.phaseTurned, 'phase turns at 2/3');
    const hit3 = bank(Math.round(hpMax * 0.3)); // -> ~28%: failing
    assert(hit3.phase === 3 && hit3.phaseTurned, 'phase turns at 1/3');
    const hit4 = bank(health.hpRemaining());
    assert(hit4.defeated && health.defeated(), 'zero hp = defeated');
    const biggest = Math.max(hit1.damage, hit2.damage, hit3.damage, hit4.damage);
    assert(health.banks() === 4 && health.biggestHit() === biggest, 'duel stats accumulate');
}

// ---------------------------------------------------------------------------
section('hp budgets: sized in expected boss-strike banks, priced by real payout math');
{
    const t = new TuningStack();
    // The raw decent chain is still real payout math, but no longer the HP
    // reference: live play showed the tutorial boss evaporated before it
    // taught banking. The boss-strike reference is the data row.
    const rawDecentBank = payoutOf(basePoints(25, t), 2.0);
    const bossStrikeBank = t.value('boss.decentBankPayout');
    const meteoricOpener = payoutOf(basePoints(30, t), 3.0);
    const hpAct1 = bossHpFor(SLIME_SOVEREIGN, t);
    const hpAct3 = bossHpFor(SUMMIT_KEEPER, t);
    assert(
        SLIME_SOVEREIGN.hpBanks >= 3 && SLIME_SOVEREIGN.hpBanks <= 4,
        'act 1 budget: 3-4 boss-strike banks',
    );
    assert(
        SUMMIT_KEEPER.hpBanks >= 5 && SUMMIT_KEEPER.hpBanks <= 6,
        'act 3 budget: 5-6 boss-strike banks',
    );
    assert(
        Math.ceil(hpAct1 / bankDamage(bossStrikeBank, true, t)) >= 3,
        `well-timed boss strikes need >= 3 banks on act 1 (strike ${bossStrikeBank}, hp ${hpAct1})`,
    );
    assert(
        bankDamage(meteoricOpener, true, t) * 2 < hpAct1,
        `act 1 survives a normal METEORIC opener (raw decent ${rawDecentBank}, opener ${meteoricOpener}, hp ${hpAct1})`,
    );
    assert(hpAct3 > hpAct1 * 1.4, 'the summit exam is meaningfully longer than the tutorial');

    // The full-stack perma-combo recipe (relics-economy.md's named target):
    // Momentum Lock + Echo Walls + Slow Fuse. Real roster layers pushed onto
    // the real stack; the arena chain shape is the recipe's promise — a long
    // 45-floor endless-arena chain, bounces at HALF the Echo Walls escrow
    // cap (conservative), ceiling spice once.
    const recipe = new TuningStack();
    for (const id of ['momentum-lock', 'echo-walls', 'slow-fuse']) {
        const relic = relicById(id);
        relic.layers.forEach((layer, i) => {
            recipe.pushLayer({ id: `relic:${id}:${i}`, owner: `relic:${id}`, tick: 0, ...layer });
        });
    }
    const floors = 45;
    const bounces = Math.floor((floors * recipe.value('combo.bounceFloorsCapRatio')) / 2);
    const mult =
        1 + bounces * recipe.value('combo.multWallBounce') + recipe.value('combo.multCeiling');
    const recipeBank = payoutOf(basePoints(floors, recipe), mult);
    assert(recipeBank >= recipe.value('hud.bankVoice'), 'the recipe bank is roar-class');
    const roars = Math.ceil(
        bossHpFor(SLIME_SOVEREIGN, recipe) / bankDamage(recipeBank, false, recipe),
    );
    assert(roars <= 2, `full-stack recipe kills act 1 in <= 2 roars (took ${roars})`);
}

// ---------------------------------------------------------------------------
section('brain: seeded, deterministic, telegraphed');
{
    const t = new TuningStack();
    const spec: SegmentSpec = {
        segmentId: 'brain-arena',
        floors: 60,
        seed: 991,
        difficulty: { profile: DIFFICULTY_PROFILES.boss, actIndex: 1 },
        lineProfile: [],
        modifiers: [],
        loot: { coinsPerFloor: 0, powerupEveryFloors: 9 },
        boss: 'slime-sovereign',
    };
    const build = buildSegmentTower(spec, t, GROUND_TOP_Y);

    const run = (label: string, def = SLIME_SOVEREIGN, phase = 1, ticks = 4000) => {
        const field = new PlatformField(build.layout.platforms);
        const brain = new BossBrain(
            def,
            fork('harness', label),
            field,
            build.layout.platforms,
            GROUND_TOP_Y,
            t,
        );
        brain.onPhaseTurn(phase);
        const events: BossEvent[] = [];
        const commands: ExamCommand[] = [];
        const openTicks: number[] = [];
        for (let tick = 1; tick <= ticks; tick += 1) {
            const floor = Math.floor(tick / 90); // a steady climb
            const out = brain.step({
                tick,
                playerFloor: floor,
                playerX: 512,
                playerY: GROUND_TOP_Y - floor * 128 - 29,
            });
            // Commands feed the field so removals constrain later targeting,
            // exactly as ExamFieldSystem would.
            for (const cmd of out.commands) {
                if (cmd.op === 'collapse') {
                    field.commandCollapse(cmd.platformId, tick, cmd.delayTicks);
                }
                if (cmd.op === 'classify') {
                    field.commandClassify(cmd.platformId, cmd.classification);
                }
                commands.push(cmd);
            }
            field.step(tick);
            events.push(...out.events);
            if (brain.isOpen(tick)) {
                openTicks.push(tick);
            }
        }
        return { events, commands, openTicks, brain };
    };

    const a = run('boss:one');
    const b = run('boss:one');
    const c = run('boss:two');
    assert(
        JSON.stringify(a.events) === JSON.stringify(b.events) &&
            JSON.stringify(a.commands) === JSON.stringify(b.commands),
        'same fork => identical schedule, targets, and commands',
    );
    assert(
        JSON.stringify(a.events) !== JSON.stringify(c.events),
        'different fork label => different schedule',
    );

    const telegraphs = a.events.filter((e) => e.type === 'boss/telegraph');
    const attacks = a.events.filter((e) => e.type === 'boss/attack');
    assert(telegraphs.length > 0 && attacks.length > 0, 'the brain swings');
    let everyAttackTelegraphed = true;
    for (const attack of attacks) {
        const tel = telegraphs.find(
            (e) => e.type === 'boss/telegraph' && e.attackId === attack.attackId,
        );
        if (
            tel?.type !== 'boss/telegraph' ||
            tel.resolveTick !== attack.tick ||
            tel.tick >= attack.tick
        ) {
            everyAttackTelegraphed = false;
        }
    }
    assert(everyAttackTelegraphed, 'every attack telegraphs first and resolves exactly on time');

    const opens = a.events.filter((e) => e.type === 'boss/openness' && e.state === 'entered');
    assert(opens.length >= attacks.length / 2, 'openness windows follow resolutions');
    const windowTicks = msToTicks(t.value('boss.opennessMs'));
    const firstOpen = opens[0];
    assert(
        a.brain.isOpen(firstOpen.tick + windowTicks - 1) === false &&
            a.openTicks.includes(firstOpen.tick + 10),
        'act 1 openness closes after the stance-change window',
    );

    // Sustained openness — the Summit Keeper's final invitation at 1/3.
    const keeper = run('boss:keeper', SUMMIT_KEEPER, 3, 5000);
    const kOpen = keeper.events.filter((e) => e.type === 'boss/openness' && e.state === 'entered');
    const kTel = keeper.events.filter((e) => e.type === 'boss/telegraph');
    const openAfter = kOpen[0];
    const nextTel = kTel.find((e) => e.tick > openAfter.tick);
    assert(
        openAfter !== undefined &&
            nextTel !== undefined &&
            keeper.openTicks.includes(nextTel.tick - 1),
        'act 3 phase 3 holds the window open until the next telegraph (sustained)',
    );

    // Attack kinds leave the right commands: the Sovereign's phase-1 spits
    // splat goo; the Keeper's phase-3 volleys and slams collapse ledges.
    assert(
        a.commands.some((cmd) => cmd.op === 'classify' && cmd.classification === 'sticky'),
        'sticky spit commands goo classifications',
    );
    assert(
        keeper.commands.some((cmd) => cmd.op === 'collapse'),
        'volleys/slams command collapses',
    );
    const swarmCmds = a.commands.filter((cmd) => cmd.op === 'swarm');
    assert(
        swarmCmds.length === 0 ||
            a.events.some((e) => e.type === 'boss/attack' && e.kind === 'swarm'),
        'recorded swarm commands come from resolved swarm attacks',
    );
}

// ---------------------------------------------------------------------------
section('platform field: touch-armed crumbles, commands, the adjacency law');
{
    const t = new TuningStack();
    const delay = t.value('land.crumbleDelayTicks');
    const field = new PlatformField([
        { id: 1 },
        { id: 2, landClass: 'crumble' },
        { id: 3, landClass: 'sticky' },
    ]);
    field.handleLand(3, 50, delay);
    field.handleLand(1, 50, delay);
    assert(field.step(50).length === 0, 'sticky/plain landings arm nothing');
    field.handleLand(2, 100, delay);
    const armed = field.step(100);
    assert(
        armed.length === 1 &&
            armed[0].kind === 'collapse_started' &&
            armed[0].collapseAtTick === 100 + delay,
        'a crumble touch arms the collapse at tick + delay',
    );
    field.step(100 + delay - 1);
    assert(!field.isRemoved(2), 'the ledge holds through the whole glow');
    const removed = field.step(100 + delay);
    assert(
        removed.length === 1 && removed[0].kind === 'removed' && field.isRemoved(2),
        'the ledge goes exactly at the deadline',
    );
    field.commandCollapse(2, 200, 10);
    assert(field.step(210).length === 0, 'collapsing the gone is a no-op');
    field.commandClassify(1, 'sticky');
    assert(field.classification(1) === 'sticky', 'commanded goo classifies');

    const platforms: PlatformSpec[] = [];
    for (let i = 0; i <= 200; i += 1) {
        platforms.push({ id: i, xCenter: 512, topY: 704 - i * 128, width: 256 });
    }
    rollFieldClassifications(
        platforms,
        mulberry32(7),
        { crumbleFraction: 1, stickyFraction: 0 },
        [],
    );
    let adjacent = false;
    let crumbles = 0;
    for (let i = 1; i < platforms.length; i += 1) {
        if (platforms[i].landClass === 'crumble') {
            crumbles += 1;
            if (platforms[i - 1].landClass === 'crumble') {
                adjacent = true;
            }
        }
    }
    assert(!adjacent && crumbles >= 60, `never-adjacent rule holds (${crumbles} crumbles rolled)`);
}

// ---------------------------------------------------------------------------
section('movement core: the sticky drain is physics, at the landing');
{
    const t = new TuningStack();
    const env = { wallLeftX: 64, wallRightX: 960, groundTopY: 704 };
    const run = (classification?: 'sticky' | 'crumble') => {
        const state = createMovementState();
        const events: LandEvent[] = [];
        emitSpawn(state, env, t, () => {}, 512, 704, 'initial');
        const actions = stepMovement(
            state,
            {
                input: { axisX: 0, jumpPressedEdge: false, jumpHeld: false },
                body: { x: 512, y: 375, feetY: 404, vx: 600, vy: 0 },
                contact: { landing: { platformId: 5, impactVy: 500, classification } },
            },
            env,
            t,
            (e) => {
                if (e.type === 'movement/land') {
                    events.push(e);
                }
            },
        );
        return { actions, land: events[0] };
    };
    const drag = t.value('GROUND_DRAG') / 60;
    const sticky = run('sticky');
    assert(sticky.land.classification === 'sticky', 'land event carries the classification');
    assert(
        Math.abs(sticky.actions.vx - (600 * t.value('land.stickyKeep') - drag)) < 1e-9,
        'sticky landing drains vx by land.stickyKeep before drag',
    );
    const plain = run();
    assert(plain.land.classification === undefined, 'plain landings carry no classification');
    assert(Math.abs(plain.actions.vx - (600 - drag)) < 1e-9, 'plain landings keep their speed');
}

// ---------------------------------------------------------------------------
section('swarm: a deterministic tax on momentum, never hearts');
{
    const t = new TuningStack();
    const swarm = new SwarmRuntime();
    const cooldown = t.value('exam.swarmHitCooldownTicks');
    swarm.spawn({
        critterId: 1,
        skin: 'bee',
        pattern: 'drift',
        scale: 0.6,
        radiusPx: t.value('exam.swarmRadiusPx'),
        x0: 500,
        y0: 300,
        ampX: 0,
        omega: 1,
        phase: 0,
        vy: 0,
        lifeTicks: 600,
        spawnTick: 100,
    });
    const at = (tick: number) => swarm.step(tick, { x: 500, y: 300 }, cooldown);
    assert(at(100).contacts.length === 1, 'overlap connects');
    assert(at(101).contacts.length === 0, 'the re-hit cooldown holds');
    assert(at(100 + cooldown).contacts.length === 1, 'and releases exactly on time');
    assert(
        swarm.step(700, { x: 500, y: 300 }, cooldown).expiredIds.length === 1,
        'lifetimes expire',
    );
    assert(swarm.count() === 0, 'expired critters despawn');
}

// ---------------------------------------------------------------------------
section('passive swarm: the map modifier seeds replayable moving obstacles');
{
    const t = new TuningStack();
    const swarmSpec = { seed: 12345, skin: 'saw' as const };
    const spec: SegmentSpec = {
        segmentId: 'swarm-proof',
        floors: 60,
        seed: 991,
        difficulty: { profile: DIFFICULTY_PROFILES.climb, actIndex: 1 },
        lineProfile: [],
        modifiers: [],
        loot: { coinsPerFloor: 0, powerupEveryFloors: 999 },
        swarm: swarmSpec,
    };
    const build = buildSegmentTower(spec, t, GROUND_TOP_Y);
    const a = new SwarmRuntime();
    const b = new SwarmRuntime();
    seedPassiveSwarm(a, build.layout, spec, t);
    seedPassiveSwarm(b, build.layout, spec, t);
    const tick = 180;
    assert(
        a.count() === Math.round(spec.floors * t.value('exam.passiveSwarmPerFloor')),
        'density prices a real critter count',
    );
    assert(
        JSON.stringify(a.positions(tick)) === JSON.stringify(b.positions(tick)),
        'the passive swarm is seeded and replayable',
    );
    assert(
        a
            .positions(tick)
            .every(
                (c) =>
                    c.scale === t.value('exam.passiveSwarmScale') &&
                    c.skin === swarmSpec.skin &&
                    c.critterId < 0,
            ),
        'passive critters are small, saw-skinned, and id-separated from boss spawns',
    );
}

// ---------------------------------------------------------------------------
section('map: the boss row is real, the flipped prices roll');
{
    for (const act of [1, 2, 3]) {
        const graph = generateActGraph('harness-seed', act);
        const boss = graph.rows[6][0];
        assert(
            boss.segment !== null && boss.segment.boss === BOSS_ROSTER[act - 1].id,
            `act ${act} boss node carries its examiner's arena`,
        );
    }
    const pool = rollableModifiers().map((m) => m.id);
    assert(pool.includes('brittle_rows'), 'Brittle Rows is in the roll pool');
    assert(pool.includes('sticky_patches'), 'Sticky Patches is in the roll pool');
    assert(pool.includes('swarm'), 'Swarm is in the roll pool');
}

// ---------------------------------------------------------------------------
section('tuning: degenerate exam values fail loud at layer-push');
{
    const t = new TuningStack();
    const throws = (key: 'land.stickyKeep' | 'boss.opennessMult', value: number) => {
        try {
            t.pushLayer({ id: 'x', owner: 'boss:x', key, op: 'set', value, tick: 0 });
            return false;
        } catch {
            return true;
        }
    };
    assert(throws('land.stickyKeep', 1.5), 'stickyKeep above 1 throws');
    assert(throws('boss.opennessMult', 0.5), 'openness below 1 throws');
    assert(t.layerList().length === 0, 'the poisoned layers rolled back');
}

// ---------------------------------------------------------------------------
section('headless replay: classifications, crumbles, and the commanded door');
{
    // Sticky-everything arena: every classified landing must say so.
    const stickySpec: SegmentSpec = {
        segmentId: 'sticky-proof',
        floors: 24,
        seed: 4242,
        difficulty: { profile: DIFFICULTY_PROFILES.climb, actIndex: 1 },
        lineProfile: [],
        modifiers: [],
        loot: { coinsPerFloor: 0, powerupEveryFloors: 9 },
        field: { crumbleFraction: 0, stickyFraction: 1 },
    };
    const sticky = syntheticSession(stickySpec, climbFrames(1500), []);
    const result = simulateSession(sticky.session);
    const lands = result.events.filter(
        (e): e is LandEvent =>
            e.type === 'movement/land' &&
            e.platformId !== 0 &&
            e.platformId !== sticky.doorPlatformId,
    );
    assert(lands.length > 0, `the scripted climb lands on ledges (${lands.length} landings)`);
    assert(
        lands.every((e) => e.classification === 'sticky'),
        'every non-door ledge landing carries the sticky classification',
    );
    const again = simulateSession(sticky.session);
    assert(
        JSON.stringify(again.endPosition) === JSON.stringify(result.endPosition) &&
            JSON.stringify(again.eventIndex) === JSON.stringify(result.eventIndex),
        'the sticky session replays deterministically (twice, bit-identical)',
    );

    // Crumble arena: a touched ledge must never be landed on after its
    // deadline — the collider forgets it in the headless world too.
    const crumbleSpec: SegmentSpec = {
        segmentId: 'crumble-proof',
        floors: 24,
        seed: 2026,
        difficulty: { profile: DIFFICULTY_PROFILES.climb, actIndex: 1 },
        lineProfile: [],
        modifiers: [],
        loot: { coinsPerFloor: 0, powerupEveryFloors: 9 },
        field: { crumbleFraction: 1, stickyFraction: 0 },
    };
    const crumble = syntheticSession(crumbleSpec, climbFrames(2400), []);
    const crumbleResult = simulateSession(crumble.session);
    const t = new TuningStack();
    const delay = t.value('land.crumbleDelayTicks');
    const firstTouch = new Map<number, number>();
    let landedAfterGone = false;
    let crumbleLands = 0;
    for (const e of crumbleResult.events) {
        if (e.type !== 'movement/land' || e.platformId === 0) {
            continue;
        }
        if (e.classification === 'crumble') {
            crumbleLands += 1;
            if (!firstTouch.has(e.platformId)) {
                firstTouch.set(e.platformId, e.tick);
            }
        }
        const armedAt = firstTouch.get(e.platformId);
        if (armedAt !== undefined && e.tick > armedAt + delay) {
            landedAfterGone = true;
        }
    }
    assert(crumbleLands > 0, `crumble ledges were touched (${crumbleLands} touches)`);
    assert(!landedAfterGone, 'no landing on a crumbled ledge after its deadline');

    // The commanded door: an arena has no exit until the timeline says so —
    // then run/segment_end regenerates headless from the command alone.
    const arenaSpec: SegmentSpec = {
        segmentId: 'door-proof',
        floors: 40,
        seed: 31337,
        difficulty: { profile: DIFFICULTY_PROFILES.boss, actIndex: 1 },
        lineProfile: [],
        modifiers: [],
        loot: { coinsPerFloor: 0, powerupEveryFloors: 9 },
        boss: 'slime-sovereign',
    };
    const doorFrame = 300;
    const arena = syntheticSession(arenaSpec, climbFrames(600), [
        { frameIndex: doorFrame, cmd: { op: 'door', platformId: 0 } },
    ]);
    assert(arena.doorPlatformId === null, 'a boss arena builds without a door');
    const arenaResult = simulateSession(arena.session);
    const end = arenaResult.events.find((e) => e.type === 'run/segment_end');
    assert(
        end !== undefined && end.tick > doorFrame,
        'the door command materializes the exit and the segment ends headless',
    );
    const starts = arenaResult.events.filter((e) => e.type === 'run/segment_start');
    assert(
        starts.length === 1 &&
            starts[0].type === 'run/segment_start' &&
            starts[0].doorFloorIndex === null,
        'run/segment_start reports the doorless arena honestly',
    );
}

// ---------------------------------------------------------------------------
console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) {
    throw new Error(`EXAM harness failed ${failures} of ${checks} checks`);
}
