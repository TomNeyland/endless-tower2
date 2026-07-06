/**
 * The FEEL-phase movement sandbox. Composition root, nothing else: every
 * system is constructed here, wired through the event bus and tuning stack,
 * and torn down on shutdown. Raw climbing must be joyful in this empty room
 * before any system is layered on — this scene is the feel gate's venue.
 */
import { Scene } from 'phaser';
import { bossById } from '../../core/boss/defs';
import { DIFFICULTY_PROFILES } from '../../core/difficulty/profiles';
import type { RunEndedEvent, SegmentEndEvent } from '../../core/events';
import { EventBus } from '../../core/events';
import { InputRecorder } from '../../core/input/recorder';
import { LINE_PROFILES } from '../../core/map/presets';
import type { RunSegmentHandoff, SegmentOutcome } from '../../core/run/loop';
import {
    buildSegmentTower,
    defaultSegmentLoot,
    defaultSegmentSpec,
    type SegmentSpec,
} from '../../core/pressure/segment';
import { applyCharacterLayers, characterById } from '../../core/meta/characters';
import { relicPool } from '../../core/meta/unlocks';
import { applyOwnedRelicLayers } from '../../core/relics/effects';
import { relicById } from '../../core/relics/roster';
import { RunState, type RunSnapshot } from '../../core/run/state';
import { generateSandboxTower, type TowerLayout } from '../../core/tower';
import { TuningStack } from '../../core/tuning';
import { characterFrames, ensureGeneratedTextures } from '../assets';
import { BossAttackViews } from '../boss/BossAttackViews';
import { BossAudio } from '../boss/BossAudio';
import { BossBody } from '../boss/BossBody';
import { BossHud } from '../boss/BossHud';
import { BossSystem } from '../boss/BossSystem';
import { SwarmView } from '../boss/SwarmView';
import type { MetaFeed } from '../meta/MetaTracker';
import { saveStore } from '../meta/SaveStore';
import { DebugBridge } from '../debug/Bridge';
import { MovementStats } from '../debug/Stats';
import { GAME_HEIGHT } from '../main';
import { PlayerAnimator } from '../player/PlayerAnimator';
import { PlayerSystem } from '../player/PlayerSystem';
import { ReplayDriver } from '../player/ReplayDriver';
import { AudioSystem } from '../systems/AudioSystem';
import { CameraRig } from '../systems/CameraRig';
import { CoinPickups } from '../systems/CoinPickups';
import { ExamFieldSystem } from '../systems/ExamFieldSystem';
import { ComboHud } from '../systems/ComboHud';
import { ComboRelay } from '../systems/ComboRelay';
import { InputMap } from '../systems/InputMap';
import { JuiceSystem } from '../systems/JuiceSystem';
import { ParallaxBackdrop } from '../systems/ParallaxBackdrop';
import { PowerupSystem } from '../systems/PowerupSystem';
import { PressureAudio } from '../systems/PressureAudio';
import { PressureHud } from '../systems/PressureHud';
import { PressureSystem } from '../systems/PressureSystem';
import { PressureView } from '../systems/PressureView';
import { RelicBelt } from '../systems/RelicBelt';
import { RelicEffects } from '../systems/RelicEffects';
import { RelicTells } from '../systems/RelicTells';
import { SessionLog } from '../systems/SessionLog';
import { TowerView } from '../systems/TowerView';
import type { ShopLaunchData } from './ShopScene';

const SANDBOX_SEED = 20260705;

/** Scene (re)boot payload: absent segment = the endless feel-gate sandbox. */
export interface SandboxBootData {
    segment?: SegmentSpec;
    /** Serialized run truth carried across a segment loop; absent = fresh
     *  run (hearts, coins, relics, charges all ride this — IDENTITY). */
    run?: RunSnapshot;
    /** CHOICE's run loop: when present, segment outcomes return to the
     *  orchestrator (with the new snapshot) instead of the sandbox's own
     *  restart loop. */
    handoff?: RunSegmentHandoff;
    /** RETURN's feat watcher: when present (run segments only), the scene
     *  attaches its buses so feat conditions see the existing vocabulary. */
    meta?: MetaFeed;
}

export class Sandbox extends Scene {
    private tuning!: TuningStack;
    private bus!: EventBus;
    private replayDriver!: ReplayDriver;
    private playerSystem!: PlayerSystem;
    private animator!: PlayerAnimator;
    private cameraRig!: CameraRig;
    private juice!: JuiceSystem;
    private audio!: AudioSystem;
    private inputMap!: InputMap;
    private backdrop!: ParallaxBackdrop;
    private towerView!: TowerView;
    private stats!: MovementStats;
    private sessionLog!: SessionLog;
    private bridge!: DebugBridge;
    private pressureSystem!: PressureSystem;
    private pressureView!: PressureView;
    private pressureHud!: PressureHud;
    private pressureAudio!: PressureAudio;
    private segmentSpec: SegmentSpec | null = null;
    private comboRelay!: ComboRelay;
    private comboHud!: ComboHud;
    private runState!: RunState;
    private relicEffects!: RelicEffects;
    private relicBelt!: RelicBelt;
    private relicTells!: RelicTells;
    private coinPickups: CoinPickups | null = null;
    private powerups: PowerupSystem | null = null;
    private runHandoff: RunSegmentHandoff | null = null;
    // EXAM: the platform field runs in every segment; the duel roster only
    // in arenas (spec.boss). All nullable — the endless sandbox stays naked.
    private examField: ExamFieldSystem | null = null;
    private bossSystem: BossSystem | null = null;
    private bossBody: BossBody | null = null;
    private bossAttackViews: BossAttackViews | null = null;
    private swarmView: SwarmView | null = null;
    private bossHud: BossHud | null = null;
    private bossAudio: BossAudio | null = null;
    private metaFeed: MetaFeed | null = null;

    private readonly onResetKey = (): void => this.resetRun();

    /** Segment end: a run hands its outcome AND the new run truth to the
     *  orchestrator (CHOICE ↔ IDENTITY, one contract); the bridge-driven
     *  sandbox loops the segment, the whole run — hearts, coins, relics —
     *  carrying over as a RunState snapshot. */
    private readonly onSegmentEnd = (e: SegmentEndEvent): void => {
        if (this.runHandoff) {
            const outcome = this.segmentOutcome('exit', e, this.runState.hearts);
            const handoff = this.runHandoff;
            this.time.delayedCall(1200, () => handoff.onOutcome(outcome, this.runState.snapshot()));
            return;
        }
        this.time.delayedCall(1200, () => {
            this.scene.restart({
                segment: this.segmentSpec ?? undefined,
                run: this.runState.snapshot(),
            } satisfies SandboxBootData);
        });
    };

    /** Zero-heart catch: run over. A run reports the death to the
     *  orchestrator; the sandbox loop restarts with a fresh run. */
    private readonly onRunEnded = (e: RunEndedEvent): void => {
        if (this.runHandoff) {
            const outcome = this.segmentOutcome('death_line', e, 0);
            const handoff = this.runHandoff;
            this.time.delayedCall(1600, () => handoff.onOutcome(outcome, this.runState.snapshot()));
            return;
        }
        this.time.delayedCall(1600, () => {
            this.scene.restart({
                segment: this.segmentSpec ?? undefined,
            } satisfies SandboxBootData);
        });
    };

    /** Fold the segment-end facts + the score's session stats into the
     *  outcome the run loop consumes. */
    private segmentOutcome(
        kind: SegmentOutcome['kind'],
        e: Pick<SegmentEndEvent, 'floorsClimbed' | 'timeTicks' | 'heartsLost'>,
        heartsRemaining: number,
    ): SegmentOutcome {
        return {
            kind,
            floorsClimbed: e.floorsClimbed,
            timeTicks: e.timeTicks,
            heartsLost: e.heartsLost,
            heartsRemaining,
            stats: this.comboRelay.score.sessionStats(),
        };
    }

    constructor() {
        super('Sandbox');
    }

    create(data: SandboxBootData = {}): void {
        ensureGeneratedTextures(this);

        this.tuning = new TuningStack();
        // Persisted settings override (RETURN): audio.md still owns the
        // level's authority — the save carries the player's choice of it.
        this.tuning.setBase('MASTER_VOLUME', saveStore().settings().masterVolume);
        this.bus = new EventBus();
        const recorder = new InputRecorder();
        const groundTopY = GAME_HEIGHT - 64;

        // Segment mode: a bounded climb with line + door. The spec's line
        // profile and modifiers are tuning layers — repricing as data.
        this.segmentSpec = data.segment ?? null;
        this.runHandoff = data.handoff ?? null;
        this.metaFeed = data.meta ?? null;
        const seed = this.segmentSpec ? this.segmentSpec.seed : SANDBOX_SEED;

        // RunState — the single source of run truth (IDENTITY). Restored
        // from the boot snapshot when a run carries across scene restarts;
        // its relic layers re-apply BEFORE tower generation so the
        // reachability contract reads the effective jump curve.
        const emit = (event: Parameters<EventBus['emit']>[0]): void => this.bus.emit(event);
        this.runState = data.run
            ? RunState.restore(data.run, this.tuning, () => this.playerTick(), emit)
            : // A run's snapshot always arrives via boot data — a fresh
              // RunState here is the standalone sandbox, whose run seed is
              // simply the scene seed as a string (streams fork from it).
              new RunState({ seed: String(seed) }, this.tuning, () => this.playerTick(), emit);
        // The character's permanent layers fold in the base band (RETURN) —
        // before tower generation, so reachability reads the trait-shaped
        // jump curve exactly as it reads the relic-shaped one.
        applyCharacterLayers(characterById(this.runState.characterId), this.tuning, 0);
        applyOwnedRelicLayers(this.runState.relicIds(), relicById, this.tuning, 0);
        if (this.segmentSpec) {
            // Owner-tagged per the TuningStack contract (playthrough-trace.md
            // finding 6): a future segment pop is removeByOwner and can never
            // eat a relic's layers.
            const owner = `segment:${this.segmentSpec.segmentId}`;
            const overrides = [...this.segmentSpec.lineProfile, ...this.segmentSpec.modifiers];
            overrides.forEach((o, i) => {
                this.tuning.pushLayer({
                    id: `${owner}:${i}`,
                    owner,
                    key: o.key,
                    op: o.op,
                    value: o.value,
                    tick: 0,
                });
            });
        }
        let layout: TowerLayout;
        let segment: ConstructorParameters<typeof PressureSystem>[4] = null;
        if (this.segmentSpec) {
            const build = buildSegmentTower(this.segmentSpec, this.tuning, groundTopY);
            layout = build.layout;
            segment = { spec: this.segmentSpec, door: build.door, groundTopY };
        } else {
            const sandboxFloors = this.tuning.value('segment.sandboxFloors');
            layout = generateSandboxTower(seed, this.tuning, groundTopY, {
                totalFloors: sandboxFloors,
                heightFloors: sandboxFloors,
                difficulty: { profile: DIFFICULTY_PROFILES.climb, actIndex: 1 },
            });
        }

        this.backdrop = new ParallaxBackdrop(this);
        this.towerView = new TowerView(this, layout);
        this.inputMap = new InputMap(this);
        this.replayDriver = new ReplayDriver(recorder, this.tuning, seed);
        this.playerSystem = new PlayerSystem(
            this,
            layout,
            this.tuning,
            this.bus,
            this.replayDriver,
            this.inputMap,
            seed,
        );
        this.animator = new PlayerAnimator(
            this,
            this.playerSystem,
            this.bus,
            this.tuning,
            characterFrames(this.runState.characterId),
        );
        this.cameraRig = new CameraRig(this, this.playerSystem, this.tuning);
        // The combo pipeline: relay pumps movement -> engine/score -> comboBus.
        // Pressure's run signals (run/heart_lost, run/segment_end) reach the
        // relay by name over the same bus — no imports between the systems.
        this.comboRelay = new ComboRelay(this.bus, this.tuning);
        this.comboHud = new ComboHud(this, this.bus, this.comboRelay.comboBus, this.tuning);
        this.juice = new JuiceSystem(
            this,
            this.playerSystem,
            this.animator,
            this.bus,
            this.tuning,
            this.comboRelay.comboBus,
        );
        this.audio = new AudioSystem(this, this.bus, this.tuning, this.comboRelay.comboBus);
        // Relic effects: the triggered-surface pump (layers re-applied above;
        // triggers re-attach here, eventlessly). Belt + tells render the build.
        this.relicEffects = new RelicEffects(
            this.bus,
            this.comboRelay.comboBus,
            this.tuning,
            this.runState,
            this.playerSystem,
        );
        this.relicBelt = new RelicBelt(this, this.bus, this.runState);
        this.relicTells = new RelicTells(this, this.bus, this.runState, this.playerSystem);
        // Loot lives in segments only — the endless sandbox stays the naked
        // feel gate. Placement is seeded from the spec's loot profile.
        this.coinPickups = this.segmentSpec
            ? new CoinPickups(
                  this,
                  layout,
                  this.segmentSpec,
                  this.tuning,
                  this.runState,
                  this.playerSystem,
              )
            : null;
        this.powerups = this.segmentSpec
            ? new PowerupSystem(
                  this,
                  layout,
                  this.segmentSpec,
                  this.tuning,
                  this.bus,
                  this.playerSystem,
              )
            : null;
        // Pressure registers its world-step hook after PlayerSystem's, so it
        // always reads post-movement kinematics. Inert without a segment.
        // RunState is its hearts port — pressure spends, never owns.
        this.pressureSystem = new PressureSystem(
            this,
            this.playerSystem,
            this.tuning,
            this.bus,
            segment,
            this.runState,
        );
        this.pressureView = new PressureView(
            this,
            this.pressureSystem,
            this.animator,
            this.bus,
            this.tuning,
        );
        this.pressureHud = new PressureHud(this, this.pressureSystem, this.tuning);
        this.pressureAudio = new PressureAudio(this, this.bus);
        // EXAM: the platform field + swarm step after pressure (registration
        // order = the headless loop's order); the duel roster arms only in
        // arenas. The recorder is the same one the flight recorder runs —
        // commanded world mutations join the session file by construction.
        if (this.segmentSpec) {
            this.examField = new ExamFieldSystem(
                this,
                layout,
                this.playerSystem,
                this.pressureSystem,
                this.towerView,
                this.bus,
                this.tuning,
                recorder,
            );
            this.swarmView = new SwarmView(this, this.examField.swarm, this.examField, this.playerSystem);
            if (this.segmentSpec.boss !== undefined) {
                const def = bossById(this.segmentSpec.boss);
                this.bossSystem = new BossSystem(
                    this,
                    def,
                    this.runState.runSeed,
                    this.segmentSpec.segmentId,
                    layout,
                    this.playerSystem,
                    this.examField,
                    this.pressureSystem,
                    this.bus,
                    this.comboRelay.comboBus,
                    this.tuning,
                );
                this.bossBody = new BossBody(
                    this,
                    def,
                    this.playerSystem,
                    this.examField,
                    this.towerView,
                    this.juice,
                    this.bus,
                    this.comboRelay.comboBus,
                    this.tuning,
                );
                this.bossAttackViews = new BossAttackViews(
                    this,
                    def,
                    this.bus,
                    this.towerView,
                    this.pressureSystem,
                    this.tuning,
                );
                this.bossHud = new BossHud(this, this.bus, this.bossSystem);
                this.bossAudio = new BossAudio(this, this.bus);
            }
        }
        this.stats = new MovementStats(this.bus, this.playerSystem);
        // The flight recorder: always on in dev, from scene start. Segment +
        // carried hearts ride the recording (session-logs.md contract: every
        // run-scoped input to tick-0 state flows through recorded channels).
        this.sessionLog = new SessionLog(this, this.bus, recorder, this.playerSystem, layout, {
            segment,
            heartsCarried: data.run?.hearts ?? null,
            restartSegment: () => {
                // Preserve the run handoff and the BOOT snapshot: this path
                // is the recorder-idle resume — the segment re-enters as it
                // began, never a free retry, never a mid-run dupe of loot.
                this.scene.restart({
                    segment: this.segmentSpec ?? undefined,
                    run: this.runHandoff ? data.run : undefined,
                    handoff: this.runHandoff ?? undefined,
                    meta: this.metaFeed ?? undefined,
                } satisfies SandboxBootData);
            },
        });
        this.bridge = new DebugBridge({
            game: this.game,
            bus: this.bus,
            tuning: this.tuning,
            player: this.playerSystem,
            stats: this.stats,
            difficultyTrace: layout.difficultyTrace,
            combo: this.comboRelay,
            session: this.sessionLog,
            resetSandbox: () => this.resetRun(),
            pressure: {
                system: this.pressureSystem,
                startSegment: (spec) => this.startSegment(spec),
                stopSegment: () => {
                    this.scene.restart({} satisfies SandboxBootData);
                },
            },
            identity: {
                run: this.runState,
                relics: this.relicEffects,
                enterShop: (nodeId?: string) => this.enterShop(nodeId),
            },
            exam: {
                spawnArena: (bossId: string) => this.startArena(bossId),
                boss: () => this.bossSystem,
                field: () => this.examField,
            },
        });

        if (this.segmentSpec) {
            this.bus.on('run/segment_end', this.onSegmentEnd);
            this.bus.on('run/ended', this.onRunEnded);
        }
        // RETURN's feat watcher rides the same buses everything else does.
        this.metaFeed?.attachSegment(this.bus, this.comboRelay.comboBus);

        this.input.keyboard?.on('keydown-R', this.onResetKey);
        this.events.once('shutdown', () => this.teardown());
    }

    private resetRun(): void {
        if (this.runHandoff) {
            // Inside a run, R is not a free retry — the segment's price
            // stays priced (pillar 2). Death and the door are the exits.
            return;
        }
        if (this.segmentSpec) {
            // A pressured climb resets whole: fresh tower state, fresh line,
            // fresh run (a manual reset is a new run, not a continue).
            // The flight recorder saves this session from its shutdown hook.
            this.scene.restart({
                segment: this.segmentSpec,
            } satisfies SandboxBootData);
            return;
        }
        // Auto-save the run that just ended, then restart from a clean spawn
        // (the session cycle resets the player as part of re-recording).
        this.sessionLog.cycle();
        this.cameraRig.snap();
    }

    /** Bridge-driven segment mode: __ET2__.pressure.startSegment(spec). */
    private startSegment(spec: SegmentSpec = defaultSegmentSpec(this.tuning, SANDBOX_SEED)): SegmentSpec {
        this.scene.restart({ segment: spec } satisfies SandboxBootData);
        return spec;
    }

    /** Bridge-driven duel: __ET2__.boss.spawn(bossId) — a real arena, the
     *  same spec shape the map's boss nodes commit (harness venue). */
    private startArena(bossId: string): SegmentSpec {
        const boss = bossById(bossId);
        return this.startSegment({
            segmentId: `arena-${bossId}`,
            floors: 220,
            seed: SANDBOX_SEED,
            difficulty: { profile: DIFFICULTY_PROFILES.boss, actIndex: boss.act },
            lineProfile: LINE_PROFILES.boss.overrides.map((o) => ({ ...o })),
            modifiers: [],
            loot: defaultSegmentLoot(this.tuning),
            boss: bossId,
        });
    }

    /** Tick provider for run-scoped events; 0 before the player exists. */
    private playerTick(): number {
        const player = this.playerSystem as PlayerSystem | undefined;
        return player ? player.currentTick : 0;
    }

    /**
     * Shop entry, bridge-driven (__ET2__.run.enterShop): pause play, overlay
     * the shop above it. The map's committed Shop nodes launch the same
     * scene through RunOrchestrator.shopLaunchData — one contract, two hosts.
     */
    private enterShop(nodeId?: string): void {
        const id = nodeId ?? `debug-shop-${this.playerTick()}`;
        if (!this.runHandoff) {
            // Sandbox-only path bookkeeping. Inside a run the path belongs
            // to the map — a debug shop must not pollute the snapshot the
            // orchestrator adopts at segment end.
            this.runState.commitNode(id);
        }
        const data: ShopLaunchData = {
            run: this.runState,
            tuning: this.tuning,
            emit: (event) => this.bus.emit(event),
            grantRelic: (relicId, source) => this.relicEffects.grantRelic(relicId, source),
            nodeId: id,
            act: this.runState.act,
            // The debug host stocks from the LIVE save pool — a bridge
            // surface, not gameplay (entry-14 honesty precedent); the run's
            // pinned pool lives on the orchestrator's map shops.
            relicPool: relicPool(saveStore().doc.unlocks.relics),
            tick: () => this.playerTick(),
            onLeave: () => this.scene.resume(),
        };
        this.scene.pause();
        this.scene.launch('Shop', data);
    }

    update(_time: number, delta: number): void {
        this.cameraRig.update();
        const scrollY = this.cameras.main.scrollY;
        this.backdrop.update(scrollY, delta);
        this.towerView.update(scrollY);
        this.animator.update(delta);
        this.juice.update();
        this.relicTells.update(delta);
        this.coinPickups?.update();
        this.powerups?.update();
        this.pressureView.update(scrollY);
        this.pressureHud.update();
        this.pressureAudio.update();
        this.swarmView?.update();
        this.bossBody?.update();
        this.bossAttackViews?.update(scrollY);
        this.bossHud?.update();
        this.sessionLog.update();
    }

    private teardown(): void {
        this.metaFeed?.detachSegment();
        this.input.keyboard?.off('keydown-R', this.onResetKey);
        this.bus.off('run/segment_end', this.onSegmentEnd);
        this.bus.off('run/ended', this.onRunEnded);
        this.sessionLog.destroy();
        this.bridge.destroy();
        this.stats.destroy();
        this.bossAudio?.destroy();
        this.bossHud?.destroy();
        this.bossAttackViews?.destroy();
        this.swarmView?.destroy();
        this.bossBody?.destroy();
        this.bossSystem?.destroy();
        this.examField?.destroy();
        this.pressureAudio.destroy();
        this.pressureHud.destroy();
        this.pressureView.destroy();
        this.pressureSystem.destroy();
        this.powerups?.destroy();
        this.coinPickups?.destroy();
        this.relicTells.destroy();
        this.relicBelt.destroy();
        this.relicEffects.destroy();
        this.audio.destroy();
        this.comboHud.destroy();
        this.comboRelay.destroy();
        this.juice.destroy();
        this.animator.destroy();
        this.playerSystem.destroy();
        this.replayDriver.destroy();
        this.inputMap.destroy();
        this.towerView.destroy();
        this.backdrop.destroy();
        this.bus.clear();
    }
}
