/**
 * The PRESSURE orchestrator at the Phaser boundary. All rules live in the
 * engine-free PressureRuntime (core/pressure/runtime.ts) — the same code the
 * headless replay steps — so this system only (1) pumps the runtime once per
 * fixed tick on post-movement kinematics, (2) broadcasts the facts it minted
 * through the bus, and (3) applies the rescue launch through PlayerSystem's
 * one sanctioned body-velocity surface.
 *
 * Boundary law: pressure reads player position from the same surface the
 * camera does (kinematics()) and never touches camera or movement internals.
 * Rendering lives in PressureView; sound in PressureAudio; HUD in
 * PressureHud — all consumers of the broadcast events.
 */
import { Physics, type Scene } from 'phaser';
import type { EventBus } from '../../core/events';
import type { ProximityTierName } from '../../core/pressure/line';
import { PressureRuntime, type PressureStepResult } from '../../core/pressure/runtime';
import type {
    ActiveSegment,
    DoorPlacement,
    HeartsPort,
    PressureSnapshot,
} from '../../core/pressure/segment';
import type { TuningStack } from '../../core/tuning';
import type { PlayerSystem } from '../player/PlayerSystem';

export class PressureSystem {
    /** Kept directly: the physics plugin nulls its handle before teardown. */
    private readonly world: Physics.Arcade.World;
    private readonly player: PlayerSystem;
    private readonly bus: EventBus;
    private readonly rt: PressureRuntime | null;

    private readonly onWorldStep = (): void => this.step();

    constructor(
        scene: Scene,
        player: PlayerSystem,
        tuning: TuningStack,
        bus: EventBus,
        segment: ActiveSegment | null,
        hearts: HeartsPort,
    ) {
        this.player = player;
        this.bus = bus;
        // RunState (the single source of run truth) is the hearts port —
        // pressure spends and reads through it, never owns it.
        this.rt = segment ? new PressureRuntime(segment, tuning, hearts) : null;
        this.world = scene.physics.world;
        // Registered after PlayerSystem's handler (construction order in the
        // scene), so pressure always steps on post-movement kinematics.
        this.world.on(Physics.Arcade.Events.WORLD_STEP, this.onWorldStep);
    }

    private step(): void {
        if (this.rt) {
            this.dispatch(this.rt.step(this.player.kinematics()));
        }
    }

    /** Broadcast the runtime's facts, then apply its one world write. */
    private dispatch(out: PressureStepResult): void {
        for (const event of out.events) {
            this.bus.emit(event);
        }
        if (out.launch) {
            this.player.applyExternalLaunch(out.launch.vy, out.launch.vxKeep);
        }
    }

    /** The boss-defeat door (EXAM): materialize the exit mid-segment. The
     *  ONE caller is the exam-command applicator — recorded by construction. */
    setDoor(door: DoorPlacement): void {
        this.runtime().setDoor(door);
    }

    // --- Read surfaces for the presentation layers (they never write) ---

    /** True while the scene runs a segment at all — ended or not. */
    inSegmentMode(): boolean {
        return this.rt !== null;
    }

    segmentActive(): boolean {
        return this.rt ? this.rt.segmentActive() : false;
    }

    door(): DoorPlacement | null {
        return this.rt ? this.rt.door() : null;
    }

    lineY(): number | null {
        return this.rt ? this.rt.lineY() : null;
    }

    gapPx(): number | null {
        return this.rt ? this.rt.gapPx() : null;
    }

    tier(): ProximityTierName {
        return this.rt ? this.rt.tier() : 'safe';
    }

    heartsRemaining(): number {
        return this.runtime().heartsRemaining();
    }

    heartsMax(): number {
        return this.runtime().heartsMax();
    }

    // --- Debug bridge surfaces (diagnostics and the scripted harness) ---

    snapshot(): PressureSnapshot | null {
        return this.rt ? this.rt.snapshot() : null;
    }

    debugLineTeleport(y: number): void {
        this.rt?.debugLineTeleport(y);
    }

    debugLineSpeedOverride(pxPerSec: number | null): void {
        this.rt?.debugLineSpeedOverride(pxPerSec);
    }

    /**
     * Force a catch attempt NOW. Returns whether it landed — false while
     * invulnerable, which is the harness's one-catch-per-invuln invariant:
     * an invulnerable stationary player cannot lose a second heart.
     */
    debugForceCatch(): boolean {
        if (!this.rt) {
            return false;
        }
        const out = this.rt.forceCatch(this.player.kinematics());
        this.dispatch(out);
        return out.landed;
    }

    debugForceExit(): boolean {
        if (!this.rt) {
            return false;
        }
        const out = this.rt.forceExit(this.player.kinematics());
        this.dispatch(out);
        return out.landed;
    }

    /** Hearts reads outside segment mode are a caller bug — fail loud. */
    private runtime(): PressureRuntime {
        if (!this.rt) {
            throw new Error('pressure: hearts read without an active segment');
        }
        return this.rt;
    }

    destroy(): void {
        this.world.off(Physics.Arcade.Events.WORLD_STEP, this.onWorldStep);
    }
}
