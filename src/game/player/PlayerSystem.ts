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
 *
 * Grounding is per-step collider evidence (pendingLanding), NEVER
 * body.touching: Phaser 4.2 resets touching flags once per render frame
 * (Body.preUpdate, willStep), not per physics step, so on multi-step frames
 * the flags go stale and the sim stops being a pure function of per-tick
 * inputs — replay divergence under frame jitter, false lockout tripwires.
 */
import { type GameObjects, Physics, type Scene, Scenes } from 'phaser';
import type { EventBus, LandClassification } from '../../core/events';
import type { Recording, ReplayReport } from '../../core/input/recorder';
import { emitSpawn, stepMovement } from '../../core/movement/logic';
import {
    createMovementState,
    type LandingContact,
    type MovementEnv,
    type MovementState,
    PLAYER_BODY,
} from '../../core/movement/state';
import type { TowerLayout } from '../../core/tower';
import type { TuningStack } from '../../core/tuning';
import type { InputMap } from '../systems/InputMap';
import type { ReplayDriver } from './ReplayDriver';

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
    /** Speed-tier index — envelope law (Amendment 1a) for event emitters. */
    tier: number;
}

export class PlayerSystem {
    readonly seed: number;

    private readonly scene: Scene;
    private readonly tuning: TuningStack;
    private readonly bus: EventBus;
    private readonly replay: ReplayDriver;
    private readonly inputMap: InputMap;
    private readonly env: MovementEnv;
    private readonly spawnX: number;
    private readonly spawnFeetY: number;

    private readonly world: Physics.Arcade.World;
    private carrier!: GameObjects.Rectangle;
    private body!: Physics.Arcade.Body;
    private state: MovementState = createMovementState();
    private pendingLanding: LandingContact | null = null;
    private readonly platformRects = new Map<number, GameObjects.Rectangle>();
    /** The platform field's contact-time lookup (EXAM). Null = no field —
     *  every landing is an ordinary ledge (the endless sandbox). */
    private landClassifier: ((platformId: number) => LandClassification | undefined) | null = null;

    private readonly onWorldStep = (): void => this.step();

    /**
     * Exact transform re-sync, after the world's own postUpdate. Phaser's
     * Body.postUpdate nudges the gameObject by the frame delta (a lossy float
     * increment, once per RENDER frame) and Body.preUpdate re-derives
     * body.position from that transform — so the round-trip count would
     * depend on frame grouping, an ULP-level determinism leak (measured:
     * replays diverged under forced multi-step frames). With origin (0,0),
     * offset 0, scale 1, the derivation `position = transform` is the exact
     * identity, so overwriting the transform with the body's exact position
     * keeps tick state a pure function of per-tick inputs.
     */
    private readonly onPostUpdate = (): void => {
        this.carrier.setPosition(this.body.position.x, this.body.position.y);
    };

    constructor(
        scene: Scene,
        layout: TowerLayout,
        tuning: TuningStack,
        bus: EventBus,
        replay: ReplayDriver,
        inputMap: InputMap,
        seed: number,
    ) {
        this.scene = scene;
        this.tuning = tuning;
        this.bus = bus;
        this.replay = replay;
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
        scene.events.on(Scenes.Events.POST_UPDATE, this.onPostUpdate);

        this.state.floorIndex = 0;
        emitSpawn(this.state, this.env, tuning, this.emit, this.spawnX, this.spawnFeetY, 'initial');
    }

    private readonly emit = (event: Parameters<EventBus['emit']>[0]): void => {
        this.bus.emit(event);
    };

    private createCarrier(): void {
        // Origin (0,0): the body's position derivation from the transform is
        // then the exact identity (see onPostUpdate) — no float constants in
        // the loop.
        this.carrier = this.scene.add
            .rectangle(
                this.spawnX - PLAYER_BODY.width / 2,
                this.spawnFeetY - PLAYER_BODY.height,
                PLAYER_BODY.width,
                PLAYER_BODY.height,
            )
            .setOrigin(0, 0)
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
                .rectangle(
                    p.xCenter,
                    p.topY + PLATFORM_BODY_HEIGHT / 2,
                    p.width,
                    PLATFORM_BODY_HEIGHT,
                )
                .setVisible(false);
            rect.setData('id', p.id);
            rect.setData('topY', p.topY);
            this.scene.physics.add.existing(rect, true);
            statics.push(rect);
            this.platformRects.set(p.id, rect);
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
     * While grounded, the core's engagement trickle re-fires this every
     * physics step — pendingLanding is the per-step grounded evidence.
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
        const platformId = platform.getData('id') as number;
        this.pendingLanding = {
            platformId,
            impactVy: body.velocity.y,
            classification: this.landClassifier?.(platformId),
        };
        return true;
    }

    /**
     * Arm the platform field's contact-time lookup (EXAM, movement.md
     * Amendment 1c): the classification is a platform fact the detection
     * layer reports with the contact; core applies its physics and echoes
     * it on the land event. Headless mirror: HeadlessWorld.setPlatformField.
     */
    setLandClassifier(fn: (platformId: number) => LandClassification | undefined): void {
        this.landClassifier = fn;
    }

    /**
     * A crumbled ledge stops existing for physics: the static body is
     * disabled, so the collider never reaches the process callback again —
     * the same skip the headless mirror performs via PlatformField.isRemoved.
     */
    disablePlatform(platformId: number): void {
        const rect = this.platformRects.get(platformId);
        if (!rect) {
            throw new Error(`player: disablePlatform(${platformId}) — no such platform`);
        }
        (rect.body as Physics.Arcade.StaticBody).enable = false;
    }

    /** One fixed step: latch input, run the core, apply Actions verbatim. */
    private step(): void {
        const frame = this.replay.frameFor(this.inputMap.sample());

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
            contact: { landing: this.pendingLanding },
        };
        this.pendingLanding = null;

        const actions = stepMovement(this.state, io, this.env, this.tuning, this.emit);

        body.velocity.x = actions.vx;
        body.velocity.y = actions.vy;
        if (actions.snapX !== null) {
            body.position.x = actions.snapX - body.halfWidth;
            body.updateCenter();
        }

        this.replay.afterStep(frame, body.center.x, body.bottom);
    }

    /**
     * External launch (the hearts rescue): writes body velocity ONLY — the
     * same boundary surface collisions use. Core movement state is never
     * touched; next tick the core reads the new velocity as a kinematic fact
     * (BodySnapshot) exactly like any other external event. Runs after this
     * tick's Actions were applied (world-step handler order), so the launch
     * wins the tick it fires on.
     */
    applyExternalLaunch(vy: number, vxKeep: number): void {
        this.body.velocity.y = vy;
        this.body.velocity.x *= vxKeep;
    }

    /**
     * External horizontal impulse (relic-triggered effects, e.g. Second
     * Wind): the same body-velocity boundary as the launch — core state is
     * never touched; the core reads the new velocity next tick as a
     * kinematic fact. Not yet a recorded channel: see DEVIATIONS entry 13.
     */
    applyExternalImpulse(vxAdd: number): void {
        this.body.velocity.x += vxAdd;
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
            tier: this.state.tier,
        };
    }

    /** The live tripwires — these must read 0 forever. */
    counters(): { lockoutBlocked: number; wallDedupHits: number } {
        return {
            lockoutBlocked: this.state.lockoutBlocked,
            wallDedupHits: this.state.wallDedupHits,
        };
    }

    get currentTick(): number {
        return this.state.tick;
    }

    reset(reason: 'initial' | 'reset'): void {
        // Top-left coords: Body.reset positions the origin-(0,0) gameObject.
        this.body.reset(this.spawnX - PLAYER_BODY.width / 2, this.spawnFeetY - PLAYER_BODY.height);
        this.pendingLanding = null;
        this.state = createMovementState();
        emitSpawn(
            this.state,
            this.env,
            this.tuning,
            this.emit,
            this.spawnX,
            this.spawnFeetY,
            reason,
        );
    }

    /** Start recording live play from a clean spawn. */
    beginRecording(): void {
        this.reset('reset');
        this.replay.beginRecording();
    }

    stopRecording(): Recording {
        return this.replay.stopRecording();
    }

    /** Replay a recording from a clean spawn with its exact tuning state. */
    beginReplay(recording: Recording): void {
        this.replay.beginReplay(recording);
        this.reset('reset');
    }

    lastReplayReport(): ReplayReport | null {
        return this.replay.lastReplayReport();
    }

    destroy(): void {
        this.world.off(Physics.Arcade.Events.WORLD_STEP, this.onWorldStep);
        this.scene.events.off(Scenes.Events.POST_UPDATE, this.onPostUpdate);
    }
}
