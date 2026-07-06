/**
 * The boss brain — a seeded, deterministic attack scheduler (bosses.md).
 * Telegraph → resolve → openness → cooldown, phases at 2/3 and 1/3, all
 * timing in ticks, all randomness from one labeled fork
 * (`fork(runSeed, 'boss:<nodeId>')`).
 *
 * The brain DECIDES; it never touches the world. Its decisions leave as
 * three kinds of output the game layer routes: boss events (the bus),
 * exam commands (the platform field / swarm / door — the recorded
 * channel), and tuning ops (surge and gust layers, owner-tagged
 * `boss:<attackId>` so pops are surgical and the fold order is canonical).
 * Every attack telegraphs on the tower before it resolves — pillar 2
 * holds mid-duel, enforced here by construction: effects only ever ship
 * at `resolveAt`, and crumble glows START at ignite because the glow IS
 * the telegraph.
 */
import type { BossEvent } from '../events';
import type { ExamCommand } from '../exam/commands';
import type { PlatformField } from '../exam/field';
import { msToTicks } from '../movement/state';
import type { Rng } from '../rng';
import { type PlatformSpec, WALL_LEFT_X, WALL_RIGHT_X } from '../tower';
import type { TuningLayer, TuningStack } from '../tuning';
import { attackById, type BossAttackDef, type BossDef } from './types';

export interface BrainInput {
    tick: number;
    playerFloor: number;
    playerX: number;
    playerY: number;
}

export interface BrainStepOutput {
    events: BossEvent[];
    commands: ExamCommand[];
    /** Fully-formed layers to push (recorded via the tuning timeline). */
    tuningPushes: TuningLayer[];
    /** Owner tags to pop (removeByOwner). */
    tuningPops: string[];
}

interface PendingAttack {
    def: BossAttackDef;
    /** Unique instance id — the owner tag for this swing's layers. */
    instanceId: string;
    igniteAt: number;
    resolveAt: number;
    targetPlatformIds: number[];
    band: { loFloor: number; hiFloor: number } | null;
    ignited: boolean;
}

const BAND_EXPAND_LIMIT = 6;

export class BossBrain {
    readonly def: BossDef;
    private readonly rng: Rng;
    private readonly field: PlatformField;
    private readonly platforms: readonly PlatformSpec[];
    private readonly groundTopY: number;
    private readonly floorH: number;
    private readonly t: TuningStack;

    private mode: 'entrance' | 'combat' | 'defeated' = 'entrance';
    private armTick: number | null = null;
    private phase = 1;
    private patternIndex = 0;
    private swings = 0;
    private critterSeq = 0;
    private pending: PendingAttack[] = [];
    private nextIgniteAt = 0;
    private opennessUntil: number | null = null;
    private layerPops: { owner: string; atTick: number }[] = [];

    constructor(
        def: BossDef,
        rng: Rng,
        field: PlatformField,
        platforms: readonly PlatformSpec[],
        groundTopY: number,
        tuning: TuningStack,
    ) {
        this.def = def;
        this.rng = rng;
        this.field = field;
        this.platforms = platforms;
        this.groundTopY = groundTopY;
        this.floorH = tuning.value('FLOOR_HEIGHT_PX');
        this.t = tuning;
    }

    currentPhase(): number {
        return this.phase;
    }

    /** Openness is a timing fact the damage conversion consults per bank. */
    isOpen(tick: number): boolean {
        return this.opennessUntil !== null && tick < this.opennessUntil;
    }

    /** Health crossed 2/3 or 1/3 — the schedule tightens; the pattern
     *  restarts on the new phase's roster. In-flight swings resolve. */
    onPhaseTurn(phase: number): void {
        this.phase = phase;
        this.patternIndex = 0;
    }

    /** The duel is over: pending telegraphs die unresolved (a dead boss
     *  swings nothing), every boss-owned layer pops NOW. Returns the pops. */
    onDefeated(): string[] {
        this.mode = 'defeated';
        this.pending = [];
        this.opennessUntil = null;
        const pops = this.layerPops.map((p) => p.owner);
        this.layerPops = [];
        return pops;
    }

    /** One fixed tick. Deterministic in (constructor args, input sequence). */
    step(input: BrainInput): BrainStepOutput {
        const out: BrainStepOutput = { events: [], commands: [], tuningPushes: [], tuningPops: [] };
        const tick = input.tick;

        // Timed layer pops fire in every mode — a gust outlives nothing.
        this.layerPops = this.layerPops.filter((p) => {
            if (tick >= p.atTick) {
                out.tuningPops.push(p.owner);
                return false;
            }
            return true;
        });

        if (this.mode === 'defeated') {
            return out;
        }

        if (this.armTick === null) {
            // The arrival beat begins: combat waits out the entrance (the
            // arena's line grace is data-tuned to ignite inside it — the
            // line lights at the boss's command). `boss/spawned` is the
            // caller's to emit: health owns the hp numbers.
            this.armTick = tick;
        }
        if (this.mode === 'entrance') {
            if (tick - this.armTick < this.def.entranceTicks) {
                return out;
            }
            this.mode = 'combat';
            this.nextIgniteAt = tick + this.phaseDef().cadenceTicks;
        }

        // Openness closes on schedule (entered is emitted at resolve).
        if (this.opennessUntil !== null && tick >= this.opennessUntil) {
            this.opennessUntil = null;
            out.events.push({
                type: 'boss/openness',
                tick,
                state: 'exited',
                multiplier: 1,
            });
        }

        if (this.pending.length === 0 && tick >= this.nextIgniteAt) {
            this.scheduleNextSwing(tick);
        }

        for (const attack of this.pending) {
            if (!attack.ignited && tick >= attack.igniteAt) {
                this.ignite(attack, input, out);
            }
            if (attack.ignited && tick >= attack.resolveAt) {
                this.resolve(attack, input, out);
            }
        }
        const hadPending = this.pending.length > 0;
        this.pending = this.pending.filter((a) => !(a.ignited && tick >= a.resolveAt));
        if (hadPending && this.pending.length === 0) {
            this.openWindow(tick, out);
        }
        return out;
    }

    // --- Scheduling ---

    private phaseDef() {
        return this.def.phases[this.phase - 1];
    }

    private scheduleNextSwing(tick: number): void {
        const phase = this.phaseDef();
        const entry = phase.pattern[this.patternIndex % phase.pattern.length];
        this.patternIndex += 1;
        const ids = Array.isArray(entry) ? entry : [entry];
        let igniteAt = tick;
        for (const id of ids) {
            const def = attackById(this.def, id);
            this.swings += 1;
            this.pending.push({
                def,
                instanceId: `${def.id}#${this.swings}`,
                igniteAt,
                resolveAt: igniteAt + def.telegraphTicks,
                targetPlatformIds: [],
                band: null,
                ignited: false,
            });
            // The layered pair (act 3): the second telegraph ignites mid-first
            // — sequenced ignitions, concurrent threats, each reads alone
            // (the doc's pre-registered readability shape).
            igniteAt += Math.floor(def.telegraphTicks / 2);
        }
    }

    private openWindow(tick: number, out: BrainStepOutput): void {
        const phase = this.phaseDef();
        const opennessTicks = msToTicks(this.t.value('boss.opennessMs'));
        const jitter =
            phase.cadenceJitterTicks > 0
                ? Math.floor(this.rng() * (2 * phase.cadenceJitterTicks + 1)) -
                  phase.cadenceJitterTicks
                : 0;
        this.nextIgniteAt = tick + opennessTicks + Math.max(30, phase.cadenceTicks + jitter);
        // Sustained openness (the final invitation): the window holds until
        // the next telegraph ignites, not just the stance-change beat.
        this.opennessUntil = phase.sustainedOpenness ? this.nextIgniteAt : tick + opennessTicks;
        out.events.push({
            type: 'boss/openness',
            tick,
            state: 'entered',
            multiplier: this.t.value('boss.opennessMult'),
        });
    }

    // --- Ignite: the telegraph lands on the tower ---

    private ignite(attack: PendingAttack, input: BrainInput, out: BrainStepOutput): void {
        attack.ignited = true;
        const def = attack.def;
        if (def.bandFloors !== undefined) {
            attack.band = {
                loFloor: input.playerFloor + def.bandFloors[0],
                hiFloor: input.playerFloor + def.bandFloors[1],
            };
            attack.targetPlatformIds = this.pickTargets(def, attack.band);
        }
        out.events.push({
            type: 'boss/telegraph',
            tick: input.tick,
            attackId: attack.instanceId,
            kind: def.kind,
            targetBand: attack.band,
            targetPlatformIds: [...attack.targetPlatformIds],
            resolveTick: attack.resolveAt,
        });
        if (def.kind === 'crumble_volley') {
            // The glow IS the telegraph: the field's collapsing state starts
            // now and the ledges go exactly at resolve.
            for (const id of attack.targetPlatformIds) {
                out.commands.push({
                    op: 'collapse',
                    platformId: id,
                    delayTicks: attack.resolveAt - input.tick,
                });
            }
        }
    }

    // --- Resolve: the attack lands ---

    private resolve(attack: PendingAttack, input: BrainInput, out: BrainStepOutput): void {
        const def = attack.def;
        const owner = `boss:${attack.instanceId}`;
        out.events.push({
            type: 'boss/attack',
            tick: input.tick,
            attackId: attack.instanceId,
            kind: def.kind,
        });
        switch (def.kind) {
            case 'crumble_volley':
                break; // commanded at ignite; the ledges just went
            case 'sticky_spit':
                for (const id of attack.targetPlatformIds) {
                    out.commands.push({ op: 'classify', platformId: id, classification: 'sticky' });
                }
                break;
            case 'body_slam':
                for (const id of attack.targetPlatformIds) {
                    out.commands.push({
                        op: 'collapse',
                        platformId: id,
                        delayTicks: def.collapseDelayTicks ?? 12,
                    });
                }
                break;
            case 'line_surge':
                this.pushTimedLayer(
                    owner,
                    { key: 'line.baseSpeed', op: 'mul', value: def.surgeSpeedMul ?? 2 },
                    input.tick,
                    def.surgeDurationTicks ?? 180,
                    out,
                );
                break;
            case 'gust': {
                const direction = this.rng() < 0.5 ? -1 : 1;
                this.pushTimedLayer(
                    owner,
                    { key: 'wind.accelX', op: 'add', value: direction * (def.gustAccelX ?? 700) },
                    input.tick,
                    def.gustDurationTicks ?? 150,
                    out,
                );
                break;
            }
            case 'swarm':
                this.spawnSwarm(def, input, out);
                break;
        }
    }

    private pushTimedLayer(
        owner: string,
        layer: { key: TuningLayer['key']; op: TuningLayer['op']; value: number },
        tick: number,
        durationTicks: number,
        out: BrainStepOutput,
    ): void {
        out.tuningPushes.push({ id: `${owner}:0`, owner, tick, ...layer });
        this.layerPops.push({ owner, atTick: tick + durationTicks });
    }

    private spawnSwarm(def: BossAttackDef, input: BrainInput, out: BrainStepOutput): void {
        const count = def.swarmCount ?? 2;
        const pattern = def.swarmPattern ?? 'drift';
        const innerWidth = WALL_RIGHT_X - WALL_LEFT_X;
        for (let i = 0; i < count; i += 1) {
            this.critterSeq += 1;
            const wallSide = this.rng() < 0.5 ? WALL_LEFT_X + 32 : WALL_RIGHT_X - 32;
            out.commands.push({
                op: 'swarm',
                spawn: {
                    critterId: this.critterSeq,
                    skin: def.swarmSkin ?? 'bee',
                    pattern,
                    x0:
                        pattern === 'wall'
                            ? wallSide
                            : WALL_LEFT_X + innerWidth * (0.2 + this.rng() * 0.6),
                    y0: input.playerY - (3 + this.rng() * 4) * this.floorH,
                    ampX: pattern === 'wall' ? 24 : 140 + this.rng() * 160,
                    omega: 1.2 + this.rng() * 1.4,
                    phase: this.rng() * Math.PI * 2,
                    vy: pattern === 'wall' ? 90 + this.rng() * 60 : 45 + this.rng() * 45,
                    lifeTicks: def.swarmLifeTicks ?? 480,
                    spawnTick: input.tick,
                },
            });
        }
    }

    // --- Targeting: intact ledges in the band, never the ground, and
    //     collapse-kind picks keep one solid ledge between removals (the
    //     generator's chain survives to one-gap jumps; two would softlock).
    private pickTargets(def: BossAttackDef, band: { loFloor: number; hiFloor: number }): number[] {
        const count = def.platformCount ?? 1;
        const collapses = def.kind === 'crumble_volley' || def.kind === 'body_slam';
        for (let expand = 0; expand <= BAND_EXPAND_LIMIT; expand += 2) {
            const candidates = this.platforms.filter((p) => {
                if (p.id === 0 || this.field.phase(p.id) !== 'intact') {
                    return false;
                }
                const floor = Math.floor((this.groundTopY - p.topY) / this.floorH + 1e-6);
                return floor >= band.loFloor && floor <= band.hiFloor + expand;
            });
            if (candidates.length === 0) {
                continue;
            }
            const shuffled = [...candidates];
            for (let i = shuffled.length - 1; i > 0; i -= 1) {
                const j = Math.floor(this.rng() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            const picked: number[] = [];
            for (const p of shuffled) {
                if (picked.length >= count) {
                    break;
                }
                if (collapses && picked.some((id) => Math.abs(id - p.id) <= 1)) {
                    continue; // the never-adjacent rule
                }
                picked.push(p.id);
            }
            if (picked.length > 0) {
                return picked.sort((a, b) => a - b);
            }
        }
        return [];
    }
}
