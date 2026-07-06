/**
 * The PRESSURE orchestrator: steps the death line each fixed tick, runs the
 * catch test against the player body, fires the rescue launch, detects the
 * exit, and broadcasts every fact through the bus (docs/design/pressure.md).
 *
 * Boundary law: this system reads player position from the same surface the
 * camera does (kinematics()) and never touches camera or movement internals.
 * The one write it performs is the rescue launch, through PlayerSystem's
 * sanctioned body-velocity surface. Rendering lives in PressureView; sound in
 * PressureAudio; HUD in PressureHud — all consumers of these events.
 */
import { Physics, type Scene } from 'phaser';
import type { EventBus, EventEnvelope } from '../../core/events';
import { msToTicks } from '../../core/movement/state';
import {
    createDeathLine,
    type DeathLineState,
    type ProximityTierName,
    stepDeathLine,
    tierNameOfZone,
} from '../../core/pressure/line';
import {
    type ActiveSegment,
    createHearts,
    type DoorPlacement,
    doorReached,
    type HeartsState,
    type PressureSnapshot,
} from '../../core/pressure/segment';
import type { TuningStack } from '../../core/tuning';
import type { PlayerSystem } from '../player/PlayerSystem';

export class PressureSystem {
    /** Kept directly: the physics plugin nulls its handle before teardown. */
    private readonly world: Physics.Arcade.World;
    private readonly player: PlayerSystem;
    private readonly t: TuningStack;
    private readonly bus: EventBus;
    private readonly segment: ActiveSegment | null;
    private readonly hearts: HeartsState;
    private readonly line: DeathLineState | null;

    private started = false;
    private startTick = 0;
    private highWaterFloor = 0;
    private heartsLostThisSegment = 0;
    private invulnTicksLeft = 0;
    private lastGapPx: number | null = null;
    private ended: 'exit' | 'death_line' | null = null;

    private readonly onWorldStep = (): void => this.step();

    constructor(
        scene: Scene,
        player: PlayerSystem,
        tuning: TuningStack,
        bus: EventBus,
        segment: ActiveSegment | null,
        heartsCarried: number | null,
    ) {
        this.player = player;
        this.t = tuning;
        this.bus = bus;
        this.segment = segment;
        this.hearts = createHearts(tuning, heartsCarried);
        this.line = segment ? createDeathLine(segment.groundTopY) : null;
        this.world = scene.physics.world;
        // Registered after PlayerSystem's handler (construction order in the
        // scene), so pressure always steps on post-movement kinematics.
        this.world.on(Physics.Arcade.Events.WORLD_STEP, this.onWorldStep);
    }

    private floorOf(feetY: number): number {
        if (!this.segment) {
            return 0;
        }
        const floorH = this.t.value('FLOOR_HEIGHT_PX');
        return Math.floor((this.segment.groundTopY - feetY) / floorH + 1e-6);
    }

    private envelope(): EventEnvelope {
        const k = this.player.kinematics();
        return {
            tick: k.tick,
            x: k.x,
            y: k.y,
            vx: k.vx,
            vy: k.vy,
            speed: Math.abs(k.vx),
            grounded: k.grounded,
            floorIndex: this.floorOf(k.feetY),
        };
    }

    private step(): void {
        if (!this.segment || !this.line || this.ended !== null) {
            return;
        }
        const k = this.player.kinematics();

        if (!this.started) {
            this.started = true;
            this.startTick = k.tick;
            const { spec } = this.segment;
            this.bus.emit({
                type: 'run/segment_start',
                ...this.envelope(),
                segmentId: spec.segmentId,
                floors: spec.floors,
                seed: spec.seed,
                doorFloorIndex: this.segment.door.floorIndex,
                lineProfile: spec.lineProfile.map((o) => ({ ...o })),
                modifiers: spec.modifiers.map((o) => ({ ...o })),
            });
        }

        this.highWaterFloor = Math.max(this.highWaterFloor, this.floorOf(k.feetY));
        if (this.invulnTicksLeft > 0) {
            this.invulnTicksLeft -= 1;
        }

        // The exit is checked before the catch: never punish finishing.
        if (doorReached(this.segment.door, k.feetY)) {
            this.endSegment();
            return;
        }

        const facts = stepDeathLine(
            this.line,
            {
                feetY: k.feetY,
                highWaterFloors: this.highWaterFloor,
                invulnerable: this.invulnTicksLeft > 0,
            },
            this.t,
        );
        this.lastGapPx = this.line.mode === 'active' ? facts.gapPx : null;

        if (facts.ignited !== null) {
            this.bus.emit({
                type: 'line/state',
                ...this.envelope(),
                state: 'active',
                trigger: facts.ignited,
                igniteTick: k.tick,
                lineY: this.line.y,
            });
        }
        if (facts.proximity !== null) {
            this.bus.emit({
                type: 'line/proximity',
                ...this.envelope(),
                tier: facts.proximity.tier,
                gapPx: facts.proximity.gapPx,
                direction: facts.proximity.direction,
                lineY: this.line.y,
            });
        }
        if (facts.caught) {
            this.handleCatch(facts.gapPx);
        }
    }

    private handleCatch(gapAtCatch: number): void {
        const k = this.player.kinematics();
        this.hearts.count -= 1;
        this.heartsLostThisSegment += 1;
        this.bus.emit({
            type: 'run/heart_lost',
            ...this.envelope(),
            heartsRemaining: this.hearts.count,
            gapAtCatch,
            catchFloorIndex: this.floorOf(k.feetY),
        });
        if (this.hearts.count > 0) {
            // Hurt, then hope: the skyward mercy with the momentum story
            // intact. The line does not pause — invulnerability is the shield.
            this.player.applyExternalLaunch(
                this.t.value('hearts.rescueVy'),
                this.t.value('hearts.rescueVxKeep'),
            );
            this.invulnTicksLeft = msToTicks(this.t.value('hearts.invulnMs'));
            return;
        }
        this.ended = 'death_line';
        this.bus.emit({
            type: 'run/ended',
            ...this.envelope(),
            reason: 'death_line',
            segmentId: this.segment ? this.segment.spec.segmentId : '',
            floorsClimbed: this.highWaterFloor,
            timeTicks: this.player.currentTick - this.startTick,
            heartsLost: this.heartsLostThisSegment,
        });
    }

    private endSegment(): void {
        if (!this.segment) {
            return;
        }
        this.ended = 'exit';
        this.bus.emit({
            type: 'run/segment_end',
            ...this.envelope(),
            reason: 'exit',
            segmentId: this.segment.spec.segmentId,
            floorsClimbed: this.highWaterFloor,
            timeTicks: this.player.currentTick - this.startTick,
            heartsLost: this.heartsLostThisSegment,
        });
    }

    // --- Read surfaces for the presentation layers (they never write) ---

    segmentActive(): boolean {
        return this.segment !== null && this.ended === null;
    }

    door(): DoorPlacement | null {
        return this.segment ? this.segment.door : null;
    }

    lineY(): number | null {
        return this.line && this.line.mode === 'active' ? this.line.y : null;
    }

    gapPx(): number | null {
        return this.ended === null ? this.lastGapPx : null;
    }

    tier(): ProximityTierName {
        return this.line ? tierNameOfZone(this.line.zoneIndex) : 'safe';
    }

    heartsRemaining(): number {
        return this.hearts.count;
    }

    heartsMax(): number {
        return this.hearts.max;
    }

    invulnerable(): boolean {
        return this.invulnTicksLeft > 0;
    }

    // --- Debug bridge surfaces (diagnostics and the scripted harness) ---

    snapshot(): PressureSnapshot | null {
        if (!this.segment || !this.line) {
            return null;
        }
        return {
            segmentId: this.segment.spec.segmentId,
            lineMode: this.line.mode,
            lineY: this.lineY(),
            gapPx: this.lastGapPx,
            tier: this.tier(),
            hearts: this.hearts.count,
            heartsMax: this.hearts.max,
            invulnTicksLeft: this.invulnTicksLeft,
            floorsClimbed: this.highWaterFloor,
            doorFloorIndex: this.segment.door.floorIndex,
            ended: this.ended,
        };
    }

    debugLineTeleport(y: number): void {
        if (this.line && this.line.mode === 'active') {
            this.line.y = y;
        }
    }

    debugLineSpeedOverride(pxPerSec: number | null): void {
        if (this.line) {
            this.line.speedOverride = pxPerSec;
        }
    }

    /**
     * Force a catch attempt NOW. Returns whether it landed — false while
     * invulnerable, which is the harness's one-catch-per-invuln invariant:
     * an invulnerable stationary player cannot lose a second heart.
     */
    debugForceCatch(): boolean {
        if (!this.segment || this.ended !== null || this.invulnTicksLeft > 0) {
            return false;
        }
        this.handleCatch(this.lastGapPx ?? 0);
        return true;
    }

    debugForceExit(): boolean {
        if (!this.segment || this.ended !== null) {
            return false;
        }
        this.endSegment();
        return true;
    }

    destroy(): void {
        this.world.off(Physics.Arcade.Events.WORLD_STEP, this.onWorldStep);
    }
}
