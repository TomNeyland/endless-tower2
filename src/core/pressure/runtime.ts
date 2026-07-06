/**
 * PRESSURE's run-scoped state machine — pure, engine-free, and REPLAYABLE.
 *
 * This is the single authority for a pressured segment: ignition, the catch
 * test, hearts, the rescue decision, invulnerability, the exit check, and
 * every pressure event's payload. The game layer (PressureSystem) and the
 * headless replay (simulateSession) both step this exact code once per
 * fixed tick, so a pressured session is a pure function of the recording —
 * session-logs.md's contract ("run-scoped state changes must flow through
 * recorded channels") made executable rather than aspirational.
 *
 * The one world write pressure ever performs — the rescue launch — is
 * returned as data (RescueLaunch) and applied by the caller to its body
 * surface: PlayerSystem.applyExternalLaunch in the browser, the headless
 * world's velocity mirror in Node. Both apply it after this tick's Actions,
 * so the launch wins the tick it fires on, identically everywhere.
 *
 * The debug surfaces (forceCatch/forceExit/teleport/speed pin) mutate state
 * OUTSIDE the recorded channels by design — they are harness handles, not
 * gameplay. A session that exercised them will (correctly) trip the replay
 * divergence alarm; that alarm is telling the truth.
 */
import type { EventEnvelope, PressureEvent } from '../events';
import { msToTicks } from '../movement/state';
import type { TuningStack } from '../tuning';
import {
    createDeathLine,
    type DeathLineState,
    type ProximityTierName,
    stepDeathLine,
    tierNameOfZone,
} from './line';
import {
    type ActiveSegment,
    type DoorPlacement,
    doorReached,
    type HeartsPort,
    type PressureSnapshot,
} from './segment';

/** Player kinematics for one pressure step — PlayerSystem.kinematics' shape. */
export interface PressureKinematics {
    x: number;
    y: number;
    feetY: number;
    vx: number;
    vy: number;
    grounded: boolean;
    tick: number;
    tier: number;
}

/** The rescue launch as data: the caller writes it to its body surface. */
export interface RescueLaunch {
    vy: number;
    vxKeep: number;
}

export interface PressureStepResult {
    events: PressureEvent[];
    launch: RescueLaunch | null;
}

export class PressureRuntime {
    private readonly segment: ActiveSegment;
    private readonly t: TuningStack;
    private readonly hearts: HeartsPort;
    private readonly line: DeathLineState;

    private started = false;
    private startTick = 0;
    private highWaterFloor = 0;
    private heartsLostThisSegment = 0;
    private invulnTicksLeft = 0;
    private lastGapPx: number | null = null;
    private ended: 'exit' | 'death_line' | null = null;

    constructor(segment: ActiveSegment, tuning: TuningStack, hearts: HeartsPort) {
        // Own copy: setDoor (boss defeat) mutates the armed segment, and the
        // caller's object is ALSO the one the flight recorder embeds — the
        // recording must keep the arena's tick-0 truth (door absent), or a
        // replay would arm with a door AND apply the door command.
        this.segment = { spec: segment.spec, door: segment.door, groundTopY: segment.groundTopY };
        this.t = tuning;
        this.hearts = hearts;
        this.line = createDeathLine(segment.groundTopY);
    }

    /** One fixed tick, stepped on post-movement kinematics. */
    step(kin: PressureKinematics): PressureStepResult {
        if (this.ended !== null) {
            return { events: [], launch: null };
        }
        const events: PressureEvent[] = [];

        if (!this.started) {
            this.started = true;
            this.startTick = kin.tick;
            const { spec } = this.segment;
            events.push({
                type: 'run/segment_start',
                ...this.envelope(kin),
                segmentId: spec.segmentId,
                floors: spec.floors,
                seed: spec.seed,
                doorFloorIndex: this.segment.door === null ? null : this.segment.door.floorIndex,
                lineProfile: spec.lineProfile.map((o) => ({ ...o })),
                modifiers: spec.modifiers.map((o) => ({ ...o })),
            });
        }

        this.highWaterFloor = Math.max(this.highWaterFloor, this.floorOf(kin.feetY));
        if (this.invulnTicksLeft > 0) {
            this.invulnTicksLeft -= 1;
        }

        // The exit is checked before the catch: never punish finishing.
        // A boss arena has no door until the duel resolves (setDoor).
        if (this.segment.door !== null && doorReached(this.segment.door, kin.feetY)) {
            events.push(this.endSegment(kin));
            return { events, launch: null };
        }

        const facts = stepDeathLine(
            this.line,
            {
                feetY: kin.feetY,
                highWaterFloors: this.highWaterFloor,
                totalFloors: this.segment.spec.floors,
                // The Ghost powerup holds the catch through the same shield
                // the rescue uses — the line still rises, the world stays
                // honest, only the bite is stayed (line.ghost is a temporary
                // `powerup:ghost` tuning layer, auto-popped on expiry).
                invulnerable: this.invulnTicksLeft > 0 || this.t.value('line.ghost') >= 1,
            },
            this.t,
        );
        this.lastGapPx = this.line.mode === 'active' ? facts.gapPx : null;

        if (facts.ignited !== null) {
            events.push({
                type: 'line/state',
                ...this.envelope(kin),
                state: 'active',
                trigger: facts.ignited,
                igniteTick: kin.tick,
                lineY: this.line.y,
            });
        }
        if (facts.proximity !== null) {
            events.push({
                type: 'line/proximity',
                ...this.envelope(kin),
                zone: facts.proximity.tier,
                gapPx: facts.proximity.gapPx,
                direction: facts.proximity.direction,
                lineY: this.line.y,
            });
        }
        if (facts.caught) {
            const caught = this.handleCatch(kin, facts.gapPx);
            events.push(...caught.events);
            return { events, launch: caught.launch };
        }
        return { events, launch: null };
    }

    private handleCatch(kin: PressureKinematics, gapAtCatch: number): PressureStepResult {
        const remaining = this.hearts.loseHeart();
        this.heartsLostThisSegment += 1;
        const events: PressureEvent[] = [
            {
                type: 'run/heart_lost',
                ...this.envelope(kin),
                heartsRemaining: remaining,
                gapAtCatch,
                catchFloorIndex: this.floorOf(kin.feetY),
            },
        ];
        if (remaining > 0) {
            // Hurt, then hope: the skyward mercy with the momentum story
            // intact. The line does not pause — invulnerability is the shield.
            this.invulnTicksLeft = msToTicks(this.t.value('hearts.invulnMs'));
            return {
                events,
                launch: {
                    vy: this.t.value('hearts.rescueVy'),
                    vxKeep: this.t.value('hearts.rescueVxKeep'),
                },
            };
        }
        this.ended = 'death_line';
        events.push({
            type: 'run/ended',
            ...this.envelope(kin),
            reason: 'death_line',
            segmentId: this.segment.spec.segmentId,
            floorsClimbed: this.highWaterFloor,
            timeTicks: kin.tick - this.startTick,
            heartsLost: this.heartsLostThisSegment,
        });
        return { events, launch: null };
    }

    private endSegment(kin: PressureKinematics): PressureEvent {
        this.ended = 'exit';
        return {
            type: 'run/segment_end',
            ...this.envelope(kin),
            reason: 'exit',
            segmentId: this.segment.spec.segmentId,
            floorsClimbed: this.highWaterFloor,
            timeTicks: kin.tick - this.startTick,
            heartsLost: this.heartsLostThisSegment,
        };
    }

    private floorOf(feetY: number): number {
        const floorH = this.t.value('FLOOR_HEIGHT_PX');
        return Math.floor((this.segment.groundTopY - feetY) / floorH + 1e-6);
    }

    private envelope(kin: PressureKinematics): EventEnvelope {
        return {
            tick: kin.tick,
            x: kin.x,
            y: kin.y,
            vx: kin.vx,
            vy: kin.vy,
            speed: Math.abs(kin.vx),
            grounded: kin.grounded,
            floorIndex: this.floorOf(kin.feetY),
            tier: kin.tier,
        };
    }

    /**
     * Materialize the exit door (boss defeat — bosses.md: "the door
     * materializes on defeat, lit"). Arrives through the recorded
     * exam-command channel so the headless replay ends the segment on the
     * same tick. Setting a door twice, or into a doored climb, is a caller
     * bug — fail loud.
     */
    setDoor(door: DoorPlacement): void {
        if (this.segment.door !== null) {
            throw new Error(`pressure: segment ${this.segment.spec.segmentId} already has a door`);
        }
        this.segment.door = door;
    }

    // --- Read surfaces (presentation layers and the bridge; never writes) ---

    segmentActive(): boolean {
        return this.ended === null;
    }

    door(): DoorPlacement | null {
        return this.segment.door;
    }

    lineY(): number | null {
        return this.line.mode === 'active' ? this.line.y : null;
    }

    gapPx(): number | null {
        return this.ended === null ? this.lastGapPx : null;
    }

    tier(): ProximityTierName {
        return tierNameOfZone(this.line.zoneIndex);
    }

    heartsRemaining(): number {
        return this.hearts.heartsRemaining();
    }

    heartsMax(): number {
        return this.hearts.heartsMax();
    }

    snapshot(): PressureSnapshot {
        return {
            segmentId: this.segment.spec.segmentId,
            lineMode: this.line.mode,
            lineY: this.lineY(),
            gapPx: this.lastGapPx,
            tier: this.tier(),
            hearts: this.hearts.heartsRemaining(),
            heartsMax: this.hearts.heartsMax(),
            invulnTicksLeft: this.invulnTicksLeft,
            floorsClimbed: this.highWaterFloor,
            doorFloorIndex: this.segment.door === null ? null : this.segment.door.floorIndex,
            ended: this.ended,
        };
    }

    // --- Debug/harness surfaces (unrecorded by design — see module doc) ---

    debugLineTeleport(y: number): void {
        if (this.line.mode === 'active') {
            this.line.y = y;
        }
    }

    debugLineSpeedOverride(pxPerSec: number | null): void {
        this.line.speedOverride = pxPerSec;
    }

    /**
     * Force a catch attempt NOW. `landed` is false while invulnerable — the
     * harness's one-catch-per-invuln invariant: an invulnerable stationary
     * player cannot lose a second heart.
     */
    forceCatch(kin: PressureKinematics): PressureStepResult & { landed: boolean } {
        if (this.ended !== null || this.invulnTicksLeft > 0) {
            return { events: [], launch: null, landed: false };
        }
        const caught = this.handleCatch(kin, this.lastGapPx ?? 0);
        return { ...caught, landed: true };
    }

    forceExit(kin: PressureKinematics): PressureStepResult & { landed: boolean } {
        if (this.ended !== null) {
            return { events: [], launch: null, landed: false };
        }
        return { events: [this.endSegment(kin)], launch: null, landed: true };
    }
}
