/**
 * The duel orchestrator at the Phaser boundary (EXAM). All rules live in
 * the engine-free core — BossBrain schedules, BossHealth counts — so this
 * system only routes: player kinematics in, brain outputs out (events to
 * the bus, commands through ExamFieldSystem's recorded door, tuning layers
 * onto the stack), and combo/banked into damage per the frozen contract.
 *
 * Banking IS attacking: the ONLY damage input is the payout authority.
 * The deliberate small-hop fizzle is a timed strike, and the openness
 * window (brain-owned timing) multiplies it.
 */
import { Physics, type Scene } from 'phaser';
import { BossBrain } from '../../core/boss/brain';
import { BossHealth } from '../../core/boss/damage';
import type { BossDef } from '../../core/boss/types';
import type { ComboBus } from '../../core/combo/bus';
import type { ComboBankedEvent } from '../../core/combo/types';
import type { EventBus } from '../../core/events';
import { fork } from '../../core/rng';
import type { TowerLayout } from '../../core/tower';
import type { TuningStack } from '../../core/tuning';
import type { PlayerSystem } from '../player/PlayerSystem';
import type { ExamFieldSystem } from '../systems/ExamFieldSystem';
import type { PressureSystem } from '../systems/PressureSystem';

export class BossSystem {
    readonly def: BossDef;
    readonly health: BossHealth;
    readonly brain: BossBrain;

    private readonly world: Physics.Arcade.World;
    private readonly player: PlayerSystem;
    private readonly examField: ExamFieldSystem;
    private readonly pressure: PressureSystem;
    private readonly bus: EventBus;
    private readonly comboBus: ComboBus;
    private readonly t: TuningStack;
    private readonly layout: TowerLayout;
    private readonly groundTopY: number;

    private spawned = false;
    private spawnTick = 0;
    private doorAtTick: number | null = null;
    private doorIssued = false;
    /** Defeat pops deferred to the step boundary: onBanked fires MID
     *  movement-tick emit (before this tick's frame is stamped), so a
     *  tuning pop there would replay one tick early headless. The step
     *  runs after pressure, at the same boundary the recorder stamps. */
    private pendingDefeatPops: string[] | null = null;

    private readonly onWorldStep = (): void => this.step();

    private readonly onBanked = (e: ComboBankedEvent): void => {
        if (this.health.defeated() || e.payout <= 0) {
            return;
        }
        const open = this.brain.isOpen(e.tick);
        const hit = this.health.applyBank(e, open, this.t);
        this.bus.emit({
            type: 'boss/hit',
            tick: e.tick,
            damage: hit.damage,
            hpRemaining: hit.hpRemaining,
            bankRef: hit.bankRef,
            loudness: hit.loudness,
            openness: hit.openness,
        });
        if (hit.phaseTurned) {
            this.brain.onPhaseTurn(hit.phase);
            this.bus.emit({
                type: 'boss/phase',
                tick: e.tick,
                phase: hit.phase,
                hpFrac: hit.hpRemaining / hit.hpMax,
            });
        }
        if (hit.defeated) {
            this.pendingDefeatPops = this.brain.onDefeated();
            this.bus.emit({
                type: 'boss/defeated',
                tick: e.tick,
                bossId: this.def.id,
                banks: this.health.banks(),
                biggestHit: this.health.biggestHit(),
                durationTicks: e.tick - this.spawnTick,
            });
            // The defeat beat plays out (it falls past you, into its own
            // line) — THEN the door lights, through the recorded channel.
            this.doorAtTick = e.tick + this.def.defeatBeatTicks;
        }
    };

    constructor(
        scene: Scene,
        def: BossDef,
        runSeed: string,
        segmentId: string,
        layout: TowerLayout,
        player: PlayerSystem,
        examField: ExamFieldSystem,
        pressure: PressureSystem,
        bus: EventBus,
        comboBus: ComboBus,
        tuning: TuningStack,
    ) {
        this.def = def;
        this.player = player;
        this.examField = examField;
        this.pressure = pressure;
        this.bus = bus;
        this.comboBus = comboBus;
        this.t = tuning;
        this.layout = layout;
        this.groundTopY = layout.groundTopY;
        this.health = new BossHealth(def, tuning);
        this.brain = new BossBrain(
            def,
            fork(runSeed, `boss:${segmentId}`),
            examField.field,
            layout.platforms,
            layout.groundTopY,
            tuning,
        );
        comboBus.on('combo/banked', this.onBanked);
        this.world = scene.physics.world;
        // After ExamFieldSystem's handler: the brain reads post-field state
        // and its commands land at the same frame boundary the headless
        // replay applies them (before the NEXT tick's collider).
        this.world.on(Physics.Arcade.Events.WORLD_STEP, this.onWorldStep);
    }

    private step(): void {
        if (!this.pressure.segmentActive()) {
            return; // run over or door walked — the duel narrates nothing
        }
        const kin = this.player.kinematics();
        if (!this.spawned) {
            this.spawned = true;
            this.spawnTick = kin.tick;
            this.bus.emit({
                type: 'boss/spawned',
                tick: kin.tick,
                bossId: this.def.id,
                name: this.def.name,
                hp: this.health.hpRemaining(),
                hpMax: this.health.hpMax,
                phase: this.health.phase(),
            });
        }

        if (this.pendingDefeatPops !== null) {
            for (const owner of this.pendingDefeatPops) {
                this.t.removeByOwner(owner);
            }
            this.pendingDefeatPops = null;
        }
        if (this.doorAtTick !== null && !this.doorIssued && kin.tick >= this.doorAtTick) {
            this.doorIssued = true;
            this.examField.issue({ op: 'door', platformId: this.pickDoorPlatform(kin.feetY) });
        }

        const floorH = this.t.value('FLOOR_HEIGHT_PX');
        const out = this.brain.step({
            tick: kin.tick,
            playerFloor: Math.floor((this.groundTopY - kin.feetY) / floorH + 1e-6),
            playerX: kin.x,
            playerY: kin.y,
        });
        for (const layer of out.tuningPushes) {
            this.t.pushLayer(layer);
        }
        for (const owner of out.tuningPops) {
            this.t.removeByOwner(owner);
        }
        for (const cmd of out.commands) {
            this.examField.issue(cmd);
        }
        for (const event of out.events) {
            this.bus.emit(event);
        }
    }

    /** The defeat door: the first intact ledge a few floors up — close
     *  enough to walk to, high enough to feel like leaving. */
    private pickDoorPlatform(feetY: number): number {
        const floorH = this.t.value('FLOOR_HEIGHT_PX');
        const playerFloor = Math.floor((this.groundTopY - feetY) / floorH + 1e-6);
        const minFloor = playerFloor + this.def.doorFloorsAbove;
        let best: { id: number; floor: number } | null = null;
        for (const p of this.layout.platforms) {
            if (p.id === 0 || this.examField.field.phase(p.id) !== 'intact') {
                continue;
            }
            const floor = Math.floor((this.groundTopY - p.topY) / floorH + 1e-6);
            if (floor >= minFloor && (best === null || floor < best.floor)) {
                best = { id: p.id, floor };
            }
        }
        if (best === null) {
            throw new Error('boss: no intact platform above the player for the door');
        }
        return best.id;
    }

    // --- Debug bridge surfaces (harness handles; never gameplay) ---

    debugSetHp(hp: number): void {
        this.health.debugSetHp(hp);
    }

    debugForceAttack(attackId: string): void {
        this.brain.debugForceAttack(attackId, this.player.currentTick);
    }

    debugForceOpenness(ticks: number): void {
        this.brain.debugForceOpenness(this.player.currentTick, ticks);
        this.bus.emit({
            type: 'boss/openness',
            tick: this.player.currentTick,
            state: 'entered',
            multiplier: this.t.value('boss.opennessMult'),
        });
    }

    destroy(): void {
        this.world.off(Physics.Arcade.Events.WORLD_STEP, this.onWorldStep);
        this.comboBus.off('combo/banked', this.onBanked);
    }
}
