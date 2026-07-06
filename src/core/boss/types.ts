/**
 * BossDef — a boss as data (docs/design/bosses.md). Act bosses are
 * compositions of the tower-attack toolkit, never code forks: hp budgets in
 * expected banks, phases at 2/3 and 1/3, attack patterns and cadences per
 * phase, presentation hints for the body. Engine-free by law.
 */
import type { BossAttackKind } from './events';
import type { SwarmPattern, SwarmSkin } from '../exam/swarm';

export const EXAM_SCHEMA_VERSION = 1;

/** Ticks are the canonical timebase everywhere; 60 ≈ one second. */
export interface BossAttackDef {
    id: string;
    kind: BossAttackKind;
    /** Windup on the tower before anything resolves (pillar 2: telegraphed). */
    telegraphTicks: number;
    /** Crumble volley / body slam / sticky spit: how many platforms. */
    platformCount?: number;
    /** Floor band relative to the player: [lo, hi] floors above. Negative
     *  lo reaches below (the Warden cuts your retreat). */
    bandFloors?: [number, number];
    /** Collapse glow once the attack resolves (slam/volley aftershock). */
    collapseDelayTicks?: number;
    /** Line surge: base-speed multiplier and how long the pulse holds. */
    surgeSpeedMul?: number;
    surgeDurationTicks?: number;
    /** Gust: airborne push (px/s², signed magnitude — direction is rolled). */
    gustAccelX?: number;
    gustDurationTicks?: number;
    /** Swarm: how many critters, their look, path family, lifetime. */
    swarmCount?: number;
    swarmSkin?: SwarmSkin;
    swarmPattern?: SwarmPattern;
    swarmLifeTicks?: number;
}

/**
 * One phase's schedule. `pattern` is cycled deterministically; an entry may
 * be a pair — the act-3 layered attack, resolved as staggered telegraphs
 * (the second starts mid-first). The doc's pre-registered readability cut
 * (sequenced-not-simultaneous) is the shipped shape: two telegraphs never
 * IGNITE on the same tick, each reads individually, both are live at once.
 */
export interface BossPhaseDef {
    /** Ticks between an attack ending (openness closing) and the next
     *  telegraph. The metronome knob: act 2 keeps it fixed; 1/3 jitter
     *  rides `cadenceJitterTicks` elsewhere. */
    cadenceTicks: number;
    /** Seeded ± jitter on the cadence; 0 = learnable rhythm (the Warden). */
    cadenceJitterTicks: number;
    pattern: (string | [string, string])[];
    /** Sustained openness (the Summit Keeper's final invitation): the
     *  openness window stays open the whole cadence gap, not just
     *  boss.opennessMs. */
    sustainedOpenness: boolean;
}

/** Presentation hints — the body view reads these; physics never does. */
export interface BossPresentation {
    /** Manifest frame-set id (src/game/assets.ts `bossFrames`): the body's
     *  rest/move/flat frames live in the asset manifest — core carries an
     *  id, never a raw atlas string (code law: assets only via the
     *  manifest; art must stay swappable). */
    frameSet: string;
    /** Body tint per phase (wear states: fresh, cracked, failing). */
    phaseTints: [number, number, number];
    /** Name card subtitle — one breath of identity. */
    epithet: string;
}

export interface BossDef {
    id: string;
    name: string;
    /** Which act's exam this is (1-3) — hp budgets and rosters key off it. */
    act: number;
    /** HP budget in expected decent banks (bosses.md: act 1 ≈ 3-4, act 3 ≈
     *  5-6). hp = hpBanks × tuning('boss.decentBankPayout'). */
    hpBanks: number;
    /** Entrance beat length — the arrival, the name card, the line igniting
     *  at its command (the arena's line grace is tuned to land inside it). */
    entranceTicks: number;
    /** Defeat beat: it falls past you into its own line, THEN the door. */
    defeatBeatTicks: number;
    /** Floors above the player where the door materializes on defeat. */
    doorFloorsAbove: number;
    attacks: BossAttackDef[];
    /** Index 0 = fresh, 1 = below 2/3, 2 = below 1/3. */
    phases: [BossPhaseDef, BossPhaseDef, BossPhaseDef];
    presentation: BossPresentation;
}

export function attackById(def: BossDef, attackId: string): BossAttackDef {
    const attack = def.attacks.find((a) => a.id === attackId);
    if (!attack) {
        throw new Error(`boss ${def.id}: unknown attack ${attackId}`);
    }
    return attack;
}

function fail(id: string, why: string): never {
    throw new Error(`boss def degenerate: ${id} (${why})`);
}

/** THROWS on degenerate defs at load — a data typo fails loud, never ships
 *  a silent lie (the roster law, fourth application). */
export function validateBossDef(def: BossDef): void {
    if (def.hpBanks < 1) {
        fail(def.id, 'hp budget below one bank');
    }
    if (def.act < 1 || def.act > 3) {
        fail(def.id, `act ${def.act} outside 1-3`);
    }
    if (def.attacks.length === 0) {
        fail(def.id, 'a boss with no attacks is a pinata');
    }
    for (const a of def.attacks) {
        if (a.telegraphTicks < 12) {
            fail(def.id, `${a.id} telegraph under 200ms — an ambush, not a price tag`);
        }
        if (a.kind === 'line_surge' && (a.surgeSpeedMul === undefined || a.surgeSpeedMul <= 1)) {
            fail(def.id, `${a.id} surge must multiply the line above 1`);
        }
        if (a.kind === 'gust' && (a.gustAccelX === undefined || a.gustAccelX === 0)) {
            fail(def.id, `${a.id} gust with no wind`);
        }
        if (a.kind === 'swarm' && (a.swarmCount === undefined || a.swarmCount < 1)) {
            fail(def.id, `${a.id} swarm with no critters`);
        }
        if (
            (a.kind === 'crumble_volley' || a.kind === 'sticky_spit' || a.kind === 'body_slam') &&
            (a.platformCount === undefined || a.platformCount < 1)
        ) {
            fail(def.id, `${a.id} targets no platforms`);
        }
    }
    for (const [i, phase] of def.phases.entries()) {
        if (phase.pattern.length === 0) {
            fail(def.id, `phase ${i + 1} has an empty pattern`);
        }
        if (phase.cadenceTicks < 30) {
            fail(def.id, `phase ${i + 1} cadence under half a second`);
        }
        for (const entry of phase.pattern) {
            for (const id of Array.isArray(entry) ? entry : [entry]) {
                attackById(def, id); // throws on unknown ids
            }
        }
    }
}
