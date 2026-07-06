/**
 * The FEEL-phase movement sandbox. Composition root, nothing else: every
 * system is constructed here, wired through the event bus and tuning stack,
 * and torn down on shutdown. Raw climbing must be joyful in this empty room
 * before any system is layered on — this scene is the feel gate's venue.
 */
import { Scene } from 'phaser';
import { EventBus } from '../../core/events';
import { InputRecorder } from '../../core/input/recorder';
import { generateSandboxTower } from '../../core/tower';
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
import { TowerView } from '../systems/TowerView';

const SANDBOX_SEED = 20260705;

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
    private bridge!: DebugBridge;
    private comboRelay!: ComboRelay;
    private comboHud!: ComboHud;

    private readonly onResetKey = (): void => this.resetRun();

    constructor() {
        super('Sandbox');
    }

    create(): void {
        ensureGeneratedTextures(this);

        this.tuning = new TuningStack();
        this.bus = new EventBus();
        const recorder = new InputRecorder();
        const groundTopY = GAME_HEIGHT - 64;
        const layout = generateSandboxTower(SANDBOX_SEED, this.tuning, groundTopY);

        this.backdrop = new ParallaxBackdrop(this);
        this.towerView = new TowerView(this, layout);
        this.inputMap = new InputMap(this);
        this.replayDriver = new ReplayDriver(recorder, this.tuning, SANDBOX_SEED);
        this.playerSystem = new PlayerSystem(
            this,
            layout,
            this.tuning,
            this.bus,
            this.replayDriver,
            this.inputMap,
            SANDBOX_SEED,
        );
        this.animator = new PlayerAnimator(this, this.playerSystem, this.bus, this.tuning);
        this.cameraRig = new CameraRig(this, this.playerSystem, this.tuning);
        // The combo pipeline: relay pumps movement -> engine/score -> comboBus.
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
        this.stats = new MovementStats(this.bus, this.playerSystem);
        this.bridge = new DebugBridge({
            bus: this.bus,
            tuning: this.tuning,
            player: this.playerSystem,
            stats: this.stats,
            combo: this.comboRelay,
            resetSandbox: () => this.resetRun(),
        });

        this.input.keyboard?.on('keydown-R', this.onResetKey);
        this.events.once('shutdown', () => this.teardown());
    }

    private resetRun(): void {
        this.playerSystem.reset('reset');
        this.cameraRig.snap();
    }

    update(_time: number, delta: number): void {
        this.cameraRig.update();
        const scrollY = this.cameras.main.scrollY;
        this.backdrop.update(scrollY, delta);
        this.towerView.update(scrollY);
        this.animator.update(delta);
        this.juice.update();
    }

    private teardown(): void {
        this.input.keyboard?.off('keydown-R', this.onResetKey);
        this.bridge.destroy();
        this.stats.destroy();
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
