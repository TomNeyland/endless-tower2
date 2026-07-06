/**
 * The session-log file format (docs/design/session-logs.md): what a player
 * hands over after a playtest. Determinism makes the input recording the
 * complete log — everything else (events, velocities, arcs, stats) is
 * regenerable from it, bit-for-bit, anywhere the engine-free core runs.
 *
 * The file is self-contained by design ("a file you can email is the 1.0
 * bar"): it embeds the exact tower geometry the session played on, because
 * the tower is a function of the seed AND the tuning table at scene create —
 * a live-tuned session would otherwise regenerate a different tower and
 * masquerade as a determinism divergence. JSON round-trips doubles exactly
 * (shortest round-trip number serialization is the ECMA contract), so the
 * embedded floats are bit-identical on load.
 *
 * Engine-free by law. Wall-clock stamps are parameters supplied by the game
 * layer at the export boundary — core never reads a clock.
 */
import type { ExamCommandRecord } from '../exam/commands';
import type { TowerLayout } from '../tower';
import type { TuningLayer, TuningTable } from '../tuning';
import type { InputFrame } from '../movement/state';
import type { ActiveSegment } from '../pressure/segment';
import type { EventIndex, MarkerRecord, Recording, TuningMutationRecord } from './recorder';

/**
 * v2: PRESSURE extends the recording per the session-logs.md contract
 * ("run-scoped state changes must flow through recorded channels") —
 * `segment` + `heartsCarried` make a pressured session replayable, and
 * TuningLayer gained its owner tag. The bump is honest versioning: a v1
 * file has ownerless layers and unrepresentable pressure state, so it is
 * refused loudly rather than replayed wrongly.
 *
 * v3: EXAM adds the `examCommands` timeline (commanded platform-field /
 * swarm / door mutations, frame-stamped like tuning changes) and the tower's
 * per-platform `landClass`. Same precedent as v2: a v2 file cannot represent
 * a duel's world mutations and its `segment.door` shape predates boss
 * arenas, so it is refused loudly rather than replayed wrongly.
 */
export const SESSION_SCHEMA_VERSION = 3;

/**
 * One run-length-encoded stretch of identical input:
 * [tickCount, axisX, jumpPressedEdge, jumpHeld]. Idle stretches compress to
 * a single run; press edges are one-tick runs by nature.
 */
export type RleRun = [number, -1 | 0 | 1, 0 | 1, 0 | 1];

export interface SessionRecording {
    version: number;
    eventSchemaVersion: number;
    /** Wall-clock stamps, supplied by the game layer at the export boundary. */
    startedAt: string;
    savedAt: string;
    /** Why the session ended — the auto-save trigger or a live export. */
    endReason: 'reset' | 'shutdown' | 'live-export';
    seed: number;
    /** Frames recorded; frame i drives tick i+1 (tick 0 is the spawn). */
    ticks: number;
    /** The exact geometry the session played on (see module doc). */
    tower: TowerLayout;
    /**
     * Segment mode: the armed segment (spec + built door + arena bottom) the
     * session played under, or null for the endless sandbox. Embedded like
     * the tower and for the same reason — self-contained files; the replay
     * steps the same PressureRuntime the browser ran.
     */
    segment: ActiveSegment | null;
    /** Hearts carried into the segment at scene create; null = fresh run. */
    heartsCarried: number | null;
    baseTuning: TuningTable;
    baseLayers: TuningLayer[];
    tuningTimeline: TuningMutationRecord[];
    /** Commanded world mutations (EXAM) — see core/exam/commands.ts. */
    examCommands: ExamCommandRecord[];
    inputRle: RleRun[];
    markers: MarkerRecord[];
    eventIndex: EventIndex;
    /**
     * [centerX, feetY] after the last tick — a bit-exact end-state check the
     * replay CLI verifies alongside the eventIndex. Null for empty sessions.
     */
    endPosition: [number, number] | null;
}

export function encodeInputRle(frames: readonly InputFrame[]): RleRun[] {
    const runs: RleRun[] = [];
    for (const f of frames) {
        const edge: 0 | 1 = f.jumpPressedEdge ? 1 : 0;
        const held: 0 | 1 = f.jumpHeld ? 1 : 0;
        const last = runs[runs.length - 1];
        if (last && last[1] === f.axisX && last[2] === edge && last[3] === held) {
            last[0] += 1;
        } else {
            runs.push([1, f.axisX, edge, held]);
        }
    }
    return runs;
}

export function decodeInputRle(runs: readonly RleRun[]): InputFrame[] {
    const frames: InputFrame[] = [];
    for (const [count, axisX, edge, held] of runs) {
        if (!Number.isInteger(count) || count < 1) {
            throw new Error(`session: malformed RLE run count ${count}`);
        }
        if (axisX !== -1 && axisX !== 0 && axisX !== 1) {
            throw new Error(`session: malformed RLE axisX ${axisX}`);
        }
        for (let i = 0; i < count; i += 1) {
            frames.push({
                axisX,
                jumpPressedEdge: edge === 1,
                jumpHeld: held === 1,
            });
        }
    }
    return frames;
}

/**
 * Which bus events the sparse index stamps. One predicate, shared verbatim
 * by the in-browser recorder and the headless replay so the divergence
 * comparison is symmetric by construction. The tick firehose is excluded
 * (it IS the session, not an index of it); spawn is excluded because it
 * fires at tick 0 before recording starts.
 *
 * Run-economy events (coin/relic/shop/powerup, run/heart_gained) are also
 * excluded: they are wallet/orchestration facts the physics replay does not
 * regenerate — indexing them would make every coin pickup a false
 * determinism alarm. Their physics side effects (tuning layers) ride the
 * recorded tuning timeline and DO replay; the unrecorded remainder is
 * docs/DEVIATIONS.md entry 13.
 */
const RUN_ECONOMY_PREFIXES = ['coin/', 'relic/', 'shop/', 'powerup/'];

/**
 * Boss events are excluded for the same reason as run-economy events: the
 * brain runs browser-side only, so the physics replay does not regenerate
 * its facts — every physics consequence it causes DOES replay, through the
 * tuning timeline (surges, gusts) and the exam-command timeline (collapses,
 * goo, swarm, the defeat door). Indexing boss/* would turn every duel into
 * a false determinism alarm.
 */
const BOSS_PREFIX = 'boss/';

export function shouldIndexEvent(type: string): boolean {
    return (
        type !== 'movement/tick' &&
        type !== 'movement/spawn' &&
        type !== 'run/heart_gained' &&
        !type.startsWith(BOSS_PREFIX) &&
        !RUN_ECONOMY_PREFIXES.some((prefix) => type.startsWith(prefix))
    );
}

export interface SessionStamp {
    startedAt: string;
    savedAt: string;
    endReason: SessionRecording['endReason'];
}

/** Fold a live Recording into the export file format. */
export function sessionFromRecording(
    recording: Recording,
    tower: TowerLayout,
    stamp: SessionStamp,
    segment: ActiveSegment | null,
    heartsCarried: number | null,
): SessionRecording {
    const positions = recording.positions;
    const endPosition: [number, number] | null =
        positions.length >= 2
            ? [positions[positions.length - 2], positions[positions.length - 1]]
            : null;
    return {
        version: SESSION_SCHEMA_VERSION,
        eventSchemaVersion: recording.schemaVersion,
        startedAt: stamp.startedAt,
        savedAt: stamp.savedAt,
        endReason: stamp.endReason,
        seed: recording.seed,
        ticks: recording.frames.length,
        tower,
        segment,
        heartsCarried,
        baseTuning: recording.baseTuning,
        baseLayers: recording.baseLayers,
        tuningTimeline: recording.mutations,
        examCommands: recording.examCommands,
        inputRle: encodeInputRle(recording.frames),
        markers: recording.markers,
        eventIndex: recording.eventIndex,
        endPosition,
    };
}

/**
 * Unfold a session file back into a replayable Recording (positions empty —
 * the replay regenerates them; the eventIndex is the divergence alarm).
 */
export function recordingFromSession(session: SessionRecording): Recording {
    return {
        schemaVersion: session.eventSchemaVersion,
        seed: session.seed,
        baseTuning: session.baseTuning,
        baseLayers: session.baseLayers,
        frames: decodeInputRle(session.inputRle),
        mutations: session.tuningTimeline,
        examCommands: session.examCommands,
        positions: [],
        markers: session.markers,
        eventIndex: session.eventIndex,
    };
}

/** Loud structural check for a freshly parsed session file. */
export function assertSessionShape(raw: unknown): SessionRecording {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('session: file is not a JSON object');
    }
    const s = raw as SessionRecording;
    if (s.version !== SESSION_SCHEMA_VERSION) {
        throw new Error(
            `session: schema version ${s.version} != supported ${SESSION_SCHEMA_VERSION}`,
        );
    }
    if (typeof s.seed !== 'number' || !Array.isArray(s.inputRle)) {
        throw new Error('session: missing seed or inputRle');
    }
    if (typeof s.tower !== 'object' || !Array.isArray(s.tower.platforms)) {
        throw new Error('session: missing embedded tower layout');
    }
    if (s.segment === undefined || (s.segment !== null && typeof s.segment.spec !== 'object')) {
        throw new Error('session: missing segment field (null for the endless sandbox)');
    }
    if (s.heartsCarried === undefined) {
        throw new Error('session: missing heartsCarried field (null for a fresh run)');
    }
    if (typeof s.baseTuning !== 'object' || s.baseTuning === null) {
        throw new Error('session: missing baseTuning');
    }
    if (!Array.isArray(s.examCommands)) {
        throw new Error('session: missing examCommands timeline (empty for duel-free sessions)');
    }
    if (typeof s.eventIndex !== 'object' || s.eventIndex === null) {
        throw new Error('session: missing eventIndex');
    }
    if (!Array.isArray(s.markers)) {
        throw new Error('session: missing markers');
    }
    const frames = decodeInputRle(s.inputRle);
    if (frames.length !== s.ticks) {
        throw new Error(`session: RLE decodes to ${frames.length} ticks, header says ${s.ticks}`);
    }
    return s;
}
