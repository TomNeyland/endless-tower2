/**
 * The player's physics presence: an invisible carrier body (44x58 world
 * units, bottom-aligned, never scaled — visuals ride on top and can squash
 * freely without touching the hitbox), the one-way platform bodies, and the
 * WORLD_STEP pump that feeds the movement core and applies its Actions.
 *
 * Boundary law: core decides, Phaser detects. Walls are core-owned planes;
 * one-way platforms are engine-side (collider + processCallback: land only
 * when falling and previous-tick feet were above the top — verified against
 * Phaser 4.2 source: processCallback runs pre-separation, so impact velocity
 * is captured there, never in the collide callback).
 */
import { type GameObjects, Physics, type Scene } from 'phaser';
import { EVENT_SCHEMA_VERSION, type EventBus } from '../../core/events';
import type { InputRecorder, Recording, ReplayReport } from '../../core/input/recorder';
import { emitSpawn, stepMovement } from '../../core/movement/logic';
import {
    createMovementState,
    type InputFrame,
    type MovementEnv,
    type MovementState,
    PLAYER_BODY,
} from '../../core/movement/state';
import type { TowerLayout } from '../../core/tower';
import type { TuningKey, TuningStack } from '../../core/tuning';
import type { InputMap } from '../systems/InputMap';

/** Never a gameplay clamp (v1's silent symmetric-clamp bug, refused). */
const BODY_MAX_VELOCITY = 4000;
const PLATFORM_BODY_HEIGHT = 40;

export interface PlayerKinematics {
    x: number;
    y: number;
    feetY: number;
    vx: number;
    vy: number;
    grounded: boolean;
    tick: number;
}

interface PendingLanding {
    platformId: number;
    impactVy: number;
}

export class PlayerSystem {
    readonly seed: number;

    private readonly scene: Scene;
    private readonly tuning: TuningStack;
    private readonly bus: EventBus;
    private readonly recorder: InputRecorder;
    private readonly inputMap: InputMap;
    private readonly env: MovementEnv;
    private readonly spawnX: number;
    private readonly spawnFeetY: number;

    private readonly world: Physics.Arcade.World;
    private carrier!: GameObjects.Rectangle;
    private body!: Physics.Arcade.Body;
    private state: MovementState = createMovementState();
    private pendingLanding: PendingLanding | null = null;
    private replayReport: ReplayReport | null = null;

    private readonly onWorldStep = (): void => this.step();
    private readonly onTuningMutation = (key: TuningKey, value: number): void => {
        this.recorder.recordMutation(key, value);
    };

    constructor(
        scene: Scene,
        layout: TowerLayout,
        tuning: TuningStack,
        bus: EventBus,
        recorder: InputRecorder,
        inputMap: InputMap,
        seed: number,
    ) {
        this.scene = scene;
        this.tuning = tuning;
        this.bus = bus;
        this.recorder = recorder;
        this.inputMap = inputMap;
        this.seed = seed;
        this.env = {
            wallLeftX: layout.wallLeftX,
            wallRightX: layout.wallRightX,
            groundTopY: layout.groundTopY,
        };
        this.spawnX = (layout.wallLeftX + layout.wallRightX) / 2;
        this.spawnFeetY = layout.groundTopY;

        this.createCarrier();
        this.createPlatforms(layout);
        // Keep the world reference: the physics plugin nulls its own handle
        // during scene shutdown before our teardown runs.
        this.world = scene.physics.world;
        this.world.on(Physics.Arcade.Events.WORLD_STEP, this.onWorldStep);
        tuning.onMutation(this.onTuningMutation);

        this.state.floorIndex = 0;
        emitSpawn(this.state, this.env, tuning, this.emit, this.spawnX, this.spawnFeetY, 'initial');
    }

    private readonly emit = (event: Parameters<EventBus['emit']>[0]): void => {
        this.bus.emit(event);
    };

    private createCarrier(): void {
        const centerY = this.spawnFeetY - PLAYER_BODY.height / 2;
        this.carrier = this.scene.add
            .rectangle(this.spawnX, centerY, PLAYER_BODY.width, PLAYER_BODY.height)
            .setVisible(false);
        this.scene.physics.add.existing(this.carrier);
        const body = this.carrier.body as Physics.Arcade.Body;
        body.setMaxVelocity(BODY_MAX_VELOCITY, BODY_MAX_VELOCITY);
        body.setAllowDrag(false);
        body.setAllowGravity(false);
        this.body = body;
    }

    private createPlatforms(layout: TowerLayout): void {
        const statics: GameObjects.Rectangle[] = [];
        for (const p of layout.platforms) {
            const rect = this.scene.add
                .rectangle(p.xCenter, p.topY + PLATFORM_BODY_HEIGHT / 2, p.width, PLATFORM_BODY_HEIGHT)
                .setVisible(false);
            rect.setData('id', p.id);
            rect.setData('topY', p.topY);
            this.scene.physics.add.existing(rect, true);
            statics.push(rect);
        }
        this.scene.physics.add.collider(
            this.carrier,
            statics,
            undefined,
            (playerObj, platformObj) => this.processOneWay(playerObj, platformObj),
        );
    }

    /**
     * One-way platform idiom: pass through unless falling onto the top.
     * Runs pre-separation, so velocity here is the true impact velocity.
     */
    private processOneWay(_playerObj: unknown, platformObj: unknown): boolean {
        const body = this.body;
        if (body.velocity.y <= 0) {
            return false;
        }
        const platform = platformObj as GameObjects.Rectangle;
        const topY = platform.getData('topY') as number;
        const prevFeetY = body.prev.y + body.height;
        if (prevFeetY > topY + 2) {
            return false;
        }
        this.pendingLanding = {
            platformId: platform.getData('id') as number,
            impactVy: body.velocity.y,
        };
        return true;
    }

    /** One fixed step: latch input, run the core, apply Actions verbatim. */
    private step(): void {
        const live = this.inputMap.sample();
        let frame: InputFrame = live;

        if (this.recorder.mode === 'replaying') {
            const next = this.recorder.nextReplayFrame();
            if (next === null) {
                this.replayReport = this.recorder.finishReplay();
            } else {
                for (const m of next.mutations) {
                    this.tuning.setBase(m.key, m.value, this.state.tick);
                }
                frame = next.frame;
            }
        }

        const body = this.body;
        const io = {
            input: frame,
            body: {
                x: body.center.x,
                y: body.center.y,
                feetY: body.bottom,
                vx: body.velocity.x,
                vy: body.velocity.y,
            },
            contact: {
                grounded: body.touching.down,
                landedPlatformId: this.pendingLanding?.platformId ?? null,
                impactVy: this.pendingLanding?.impactVy ?? null,
                prevFeetY: body.prev.y + body.height,
            },
        };
        this.pendingLanding = null;

        const actions = stepMovement(this.state, io, this.env, this.tuning, this.emit);

        body.velocity.x = actions.vx;
        body.velocity.y = actions.vy;
        if (actions.snapX !== null) {
            body.position.x = actions.snapX - body.halfWidth;
            body.updateCenter();
        }

        if (this.recorder.mode === 'recording') {
            this.recorder.recordFrame(frame, body.center.x, body.bottom);
        } else if (this.recorder.mode === 'replaying') {
            this.recorder.recordReplayPosition(body.center.x, body.bottom);
        }
    }

    kinematics(): PlayerKinematics {
        const body = this.body;
        return {
            x: body.center.x,
            y: body.center.y,
            feetY: body.bottom,
            vx: body.velocity.x,
            vy: body.velocity.y,
            grounded: this.state.grounded,
            tick: this.state.tick,
        };
    }

    counters(): {
        lockoutBlocked: number;
        wallDedupHits: number;
        totalJumps: number;
        coyoteJumps: number;
    } {
        return {
            lockoutBlocked: this.state.lockoutBlocked,
            wallDedupHits: this.state.wallDedupHits,
            totalJumps: this.state.totalJumps,
            coyoteJumps: this.state.coyoteJumps,
        };
    }

    get currentTick(): number {
        return this.state.tick;
    }

    reset(reason: 'initial' | 'reset'): void {
        this.body.reset(this.spawnX, this.spawnFeetY - PLAYER_BODY.height / 2);
        this.pendingLanding = null;
        this.state = createMovementState();
        emitSpawn(this.state, this.env, this.tuning, this.emit, this.spawnX, this.spawnFeetY, reason);
    }

    /** Start recording live play from a clean spawn. */
    beginRecording(): void {
        this.reset('reset');
        this.recorder.startRecording(this.seed, this.tuning.baseSnapshot(), EVENT_SCHEMA_VERSION);
    }

    stopRecording(): Recording {
        return this.recorder.stopRecording();
    }

    /** Replay a recording from a clean spawn with its exact base tuning. */
    beginReplay(recording: Recording): void {
        this.tuning.restoreBase(recording.baseTuning);
        this.reset('reset');
        this.replayReport = null;
        this.recorder.startReplay(recording);
    }

    lastReplayReport(): ReplayReport | null {
        return this.replayReport;
    }

    destroy(): void {
        this.world.off(Physics.Arcade.Events.WORLD_STEP, this.onWorldStep);
        this.tuning.offMutation(this.onTuningMutation);
    }
}
