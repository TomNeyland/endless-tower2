/**
 * The FEEL-phase movement sandbox. Composition root, nothing else: every
 * system is constructed here, wired through the event bus and tuning stack,
 * and torn down on shutdown. Raw climbing must be joyful in this empty room
 * before any system is layered on — this scene is the feel gate's venue.
 */
import { Scene } from 'phaser';
import { EventBus } from '../../core/events';
import { InputRecorder } from '../../core/input/recorder';
import {
    buildSegmentTower,
    defaultSegmentSpec,
    type SegmentSpec,
} from '../../core/pressure/segment';
import { generateSandboxTower, type TowerLayout } from '../../core/tower';
import { TuningStack } from '../../core/tuning';
import { ensureGeneratedTextures } from '../assets';
import { DebugBridge } from '../debug/Bridge';
import { MovementStats } from '../debug/Stats';
import { GAME_HEIGHT } from '../main';
import { PlayerAnimator } from '../player/PlayerAnimator';
import { PlayerSystem } from '../player/PlayerSystem';
import { ReplayDriver } from '../player/ReplayDriver';
import { AudioSystem } from '../systems/AudioSystem';
import { CameraRig } from '../systems/CameraRig';
import { ComboHud } from '../systems/ComboHud';
import { ComboRelay } from '../systems/ComboRelay';
import { InputMap } from '../systems/InputMap';
import { JuiceSystem } from '../systems/JuiceSystem';
import { ParallaxBackdrop } from '../systems/ParallaxBackdrop';
import { PressureAudio } from '../systems/PressureAudio';
import { PressureHud } from '../systems/PressureHud';
import { PressureSystem } from '../systems/PressureSystem';
import { PressureView } from '../systems/PressureView';
import { SessionLog } from '../systems/SessionLog';
import { TowerView } from '../systems/TowerView';

const SANDBOX_SEED = 20260705;

/** Scene (re)boot payload: absent segment = the endless feel-gate sandbox. */
export interface SandboxBootData {
    segment?: SegmentSpec;
    /** Run-scoped hearts carried across a segment loop; null = fresh run. */
    hearts?: number | null;
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

    private readonly onResetKey = (): void => this.resetRun();

    /** Segment loop: exit door -> the sandbox loops the segment (CHOICE owns
     *  the real handoff later); hearts are run-scoped and carry over. */
    private readonly onSegmentEnd = (): void => {
        const hearts = this.pressureSystem.heartsRemaining();
        this.time.delayedCall(1200, () => {
            this.scene.restart({
                segment: this.segmentSpec ?? undefined,
                hearts,
            } satisfies SandboxBootData);
        });
    };

    /** Zero-heart catch: run over; the loop restarts with fresh hearts. */
    private readonly onRunEnded = (): void => {
        this.time.delayedCall(1600, () => {
            this.scene.restart({
                segment: this.segmentSpec ?? undefined,
                hearts: null,
            } satisfies SandboxBootData);
        });
    };

    constructor() {
        super('Sandbox');
    }

    create(data: SandboxBootData = {}): void {
        ensureGeneratedTextures(this);

        this.tuning = new TuningStack();
        this.bus = new EventBus();
        const recorder = new InputRecorder();
        const groundTopY = GAME_HEIGHT - 64;

        // Segment mode: a bounded climb with line + door. The spec's line
        // profile and modifiers are tuning layers — repricing as data.
        this.segmentSpec = data.segment ?? null;
        const seed = this.segmentSpec ? this.segmentSpec.seed : SANDBOX_SEED;
        if (this.segmentSpec) {
            const overrides = [...this.segmentSpec.lineProfile, ...this.segmentSpec.modifiers];
            overrides.forEach((o, i) => {
                this.tuning.pushLayer({
                    id: `segment:${this.segmentSpec?.segmentId}:${i}`,
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
            layout = generateSandboxTower(seed, this.tuning, groundTopY);
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
        this.animator = new PlayerAnimator(this, this.playerSystem, this.bus, this.tuning);
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
        // Pressure registers its world-step hook after PlayerSystem's, so it
        // always reads post-movement kinematics. Inert without a segment.
        this.pressureSystem = new PressureSystem(
            this,
            this.playerSystem,
            this.tuning,
            this.bus,
            segment,
            data.hearts ?? null,
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
        this.stats = new MovementStats(this.bus, this.playerSystem);
        // The flight recorder: always on in dev, from scene start.
        this.sessionLog = new SessionLog(this, this.bus, recorder, this.playerSystem, layout);
        this.bridge = new DebugBridge({
            game: this.game,
            bus: this.bus,
            tuning: this.tuning,
            player: this.playerSystem,
            stats: this.stats,
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
        });

        if (this.segmentSpec) {
            this.bus.on('run/segment_end', this.onSegmentEnd);
            this.bus.on('run/ended', this.onRunEnded);
        }

        this.input.keyboard?.on('keydown-R', this.onResetKey);
        this.events.once('shutdown', () => this.teardown());
    }

    private resetRun(): void {
        if (this.segmentSpec) {
            // A pressured climb resets whole: fresh tower state, fresh line.
            // The flight recorder saves this session from its shutdown hook.
            this.scene.restart({
                segment: this.segmentSpec,
                hearts: null,
            } satisfies SandboxBootData);
            return;
        }
        // Auto-save the run that just ended, then restart from a clean spawn
        // (the session cycle resets the player as part of re-recording).
        this.sessionLog.cycle();
        this.cameraRig.snap();
    }

    /** Bridge-driven segment mode: __ET2__.pressure.startSegment(spec). */
    private startSegment(partial: Partial<SegmentSpec> = {}): SegmentSpec {
        const seed = partial.seed ?? SANDBOX_SEED;
        const defaults = defaultSegmentSpec(this.tuning, seed);
        const floors = partial.floors ?? defaults.floors;
        const spec: SegmentSpec = {
            segmentId: partial.segmentId ?? `segment-${seed}-${floors}`,
            floors,
            seed,
            lineProfile: partial.lineProfile ?? [],
            modifiers: partial.modifiers ?? [],
        };
        this.scene.restart({ segment: spec, hearts: null } satisfies SandboxBootData);
        return spec;
    }

    update(_time: number, delta: number): void {
        this.cameraRig.update();
        const scrollY = this.cameras.main.scrollY;
        this.backdrop.update(scrollY, delta);
        this.towerView.update(scrollY);
        this.animator.update(delta);
        this.juice.update();
        this.pressureView.update(scrollY);
        this.pressureHud.update();
        this.pressureAudio.update();
        this.sessionLog.update();
    }

    private teardown(): void {
        this.input.keyboard?.off('keydown-R', this.onResetKey);
        this.bus.off('run/segment_end', this.onSegmentEnd);
        this.bus.off('run/ended', this.onRunEnded);
        this.sessionLog.destroy();
        this.bridge.destroy();
        this.stats.destroy();
        this.pressureAudio.destroy();
        this.pressureHud.destroy();
        this.pressureView.destroy();
        this.pressureSystem.destroy();
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
