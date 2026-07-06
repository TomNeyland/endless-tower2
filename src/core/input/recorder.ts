/**
 * Per-tick input recorder and replay driver. Determinism is sacred: a
 * recording captures the seed, the full tuning state at start (base table +
 * layer stack), every InputFrame, and every live tuning change — base
 * mutations AND layer ops, THE relic/modifier substrate — replaying it must
 * reproduce identical per-tick positions, and the report says exactly where
 * it didn't.
 */
import type { ExamCommand, ExamCommandRecord } from '../exam/commands';
import type { InputFrame } from '../movement/state';
import type { TuningChange, TuningLayer, TuningTable } from '../tuning';

export interface TuningMutationRecord {
    /** Frame index the change precedes — applied before that frame replays. */
    frameIndex: number;
    change: TuningChange;
}

/** The playtest vocabulary for quick marker tags (docs/design/session-logs.md). */
export type MarkerTag = 'felt-bad' | 'felt-great' | 'bug';

/**
 * A tick-pinned playtest remark. Markers are annotations riding inside the
 * recording — they never influence the simulation.
 */
export interface MarkerRecord {
    tick: number;
    tag: MarkerTag | null;
}

/**
 * Sparse index: event type -> tick stamps, in emission order. A convenience
 * for humans scanning a session and the replay CLI's divergence alarm —
 * never the source of truth (the replay regenerates ground truth).
 */
export type EventIndex = Record<string, number[]>;

export interface Recording {
    schemaVersion: number;
    seed: number;
    baseTuning: TuningTable;
    /** Layer stack active when the recording started. */
    baseLayers: TuningLayer[];
    frames: InputFrame[];
    mutations: TuningMutationRecord[];
    /**
     * Commanded world mutations (EXAM): boss-driven platform collapses,
     * goo classifications, swarm spawns, the defeat door — frame-stamped
     * exactly like tuning mutations (docs/DEVIATIONS.md entry 13's
     * run-command-timeline pattern, realized for the platform field).
     */
    examCommands: ExamCommandRecord[];
    /**
     * Per-tick [x, y] pairs captured after Actions applied. A synthetic
     * recording may ship without positions; its first replay stamps them
     * (the two-pass determinism harness).
     */
    positions: number[];
    /** Tick-pinned playtest markers (M key / bridge). */
    markers: MarkerRecord[];
    /** Sparse tick index of bus events heard while recording. */
    eventIndex: EventIndex;
}

export interface ReplayReport {
    ok: boolean;
    ticksCompared: number;
    divergedAtTick: number | null;
    /** True when the source had no baseline and this replay stamped one. */
    baselineAdopted: boolean;
}

export type RecorderMode = 'idle' | 'recording' | 'replaying';

export class InputRecorder {
    mode: RecorderMode = 'idle';

    private frames: InputFrame[] = [];
    private mutations: TuningMutationRecord[] = [];
    private examCommands: ExamCommandRecord[] = [];
    private positions: number[] = [];
    private markers: MarkerRecord[] = [];
    private eventIndex: EventIndex = {};
    private seed = 0;
    private baseTuning: TuningTable | null = null;
    private baseLayers: TuningLayer[] = [];

    private replaySource: Recording | null = null;
    private replayIndex = 0;
    private replayPositions: number[] = [];
    private schemaVersion = 1;

    startRecording(
        seed: number,
        baseTuning: TuningTable,
        baseLayers: TuningLayer[],
        schemaVersion: number,
    ): void {
        this.mode = 'recording';
        this.seed = seed;
        this.baseTuning = baseTuning;
        this.baseLayers = baseLayers;
        this.schemaVersion = schemaVersion;
        this.frames = [];
        this.mutations = [];
        this.examCommands = [];
        this.positions = [];
        this.markers = [];
        this.eventIndex = {};
    }

    recordFrame(frame: InputFrame, x: number, y: number): void {
        this.frames.push({ ...frame });
        this.positions.push(x, y);
    }

    recordChange(change: TuningChange): void {
        if (this.mode === 'recording') {
            this.mutations.push({ frameIndex: this.frames.length, change });
        }
    }

    /** Record a commanded world mutation (EXAM) — same frame semantics as
     *  tuning changes: applied before the stamped frame replays. */
    recordExamCommand(cmd: ExamCommand): void {
        if (this.mode === 'recording') {
            this.examCommands.push({ frameIndex: this.frames.length, cmd });
        }
    }

    /** Pin a playtest marker to a tick. Annotation only — never sim input. */
    addMarker(tick: number, tag: MarkerTag | null = null): void {
        if (this.mode !== 'recording') {
            throw new Error('recorder: addMarker without an active recording');
        }
        this.markers.push({ tick, tag });
    }

    /** Stamp a bus event's tick into the sparse index (game layer feeds this). */
    recordIndexTick(type: string, tick: number): void {
        if (this.mode !== 'recording') {
            return;
        }
        let list = this.eventIndex[type];
        if (list === undefined) {
            list = [];
            this.eventIndex[type] = list;
        }
        list.push(tick);
    }

    stopRecording(): Recording {
        if (this.mode !== 'recording' || this.baseTuning === null) {
            throw new Error('recorder: stopRecording without an active recording');
        }
        this.mode = 'idle';
        return {
            schemaVersion: this.schemaVersion,
            seed: this.seed,
            baseTuning: this.baseTuning,
            baseLayers: this.baseLayers,
            frames: this.frames,
            mutations: this.mutations,
            examCommands: this.examCommands,
            positions: this.positions,
            markers: this.markers,
            eventIndex: this.eventIndex,
        };
    }

    /**
     * Non-destructive copy of the in-progress recording — the F9 export path
     * captures the live session without interrupting it.
     */
    snapshot(): Recording {
        if (this.mode !== 'recording' || this.baseTuning === null) {
            throw new Error('recorder: snapshot without an active recording');
        }
        return {
            schemaVersion: this.schemaVersion,
            seed: this.seed,
            baseTuning: { ...this.baseTuning },
            baseLayers: this.baseLayers.map((l) => ({ ...l })),
            frames: this.frames.map((f) => ({ ...f })),
            mutations: this.mutations.map((m) => ({ ...m })),
            examCommands: this.examCommands.map((c) => ({ ...c })),
            positions: [...this.positions],
            markers: this.markers.map((m) => ({ ...m })),
            eventIndex: Object.fromEntries(
                Object.entries(this.eventIndex).map(([k, v]) => [k, [...v]]),
            ),
        };
    }

    startReplay(recording: Recording): void {
        this.mode = 'replaying';
        this.replaySource = recording;
        this.replayIndex = 0;
        this.replayPositions = [];
    }

    /** Frames remaining in the active replay. */
    get replayRemaining(): number {
        if (this.replaySource === null) {
            return 0;
        }
        return this.replaySource.frames.length - this.replayIndex;
    }

    /**
     * Next frame of the replay, plus any tuning changes stamped for this
     * frame index. Returns null when the replay is exhausted.
     */
    nextReplayFrame(): { frame: InputFrame; mutations: TuningMutationRecord[] } | null {
        const src = this.replaySource;
        if (src === null || this.replayIndex >= src.frames.length) {
            return null;
        }
        const index = this.replayIndex;
        this.replayIndex += 1;
        return {
            frame: src.frames[index],
            mutations: src.mutations.filter((m) => m.frameIndex === index),
        };
    }

    recordReplayPosition(x: number, y: number): void {
        this.replayPositions.push(x, y);
    }

    finishReplay(): ReplayReport {
        const src = this.replaySource;
        if (src === null) {
            throw new Error('recorder: finishReplay without an active replay');
        }
        this.mode = 'idle';
        this.replaySource = null;

        if (src.positions.length === 0) {
            src.positions = this.replayPositions;
            return {
                ok: true,
                ticksCompared: 0,
                divergedAtTick: null,
                baselineAdopted: true,
            };
        }

        const ticks = Math.min(src.positions.length, this.replayPositions.length) / 2;
        for (let i = 0; i < ticks; i += 1) {
            if (
                src.positions[i * 2] !== this.replayPositions[i * 2] ||
                src.positions[i * 2 + 1] !== this.replayPositions[i * 2 + 1]
            ) {
                return {
                    ok: false,
                    ticksCompared: ticks,
                    divergedAtTick: i,
                    baselineAdopted: false,
                };
            }
        }
        return {
            ok: src.positions.length === this.replayPositions.length,
            ticksCompared: ticks,
            divergedAtTick: null,
            baselineAdopted: false,
        };
    }
}
