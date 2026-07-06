/**
 * Per-tick input recorder and replay driver. Determinism is sacred: a
 * recording captures the seed, the base tuning table, every InputFrame, and
 * every live tuning mutation — replaying it must reproduce identical per-tick
 * positions, and the report says exactly where it didn't.
 */
import type { InputFrame } from '../movement/state';
import type { TuningKey, TuningTable } from '../tuning';

export interface TuningMutationRecord {
    /** Frame index the mutation precedes — applied before that frame replays. */
    tick: number;
    key: TuningKey;
    value: number;
}

export interface Recording {
    schemaVersion: number;
    seed: number;
    baseTuning: TuningTable;
    frames: InputFrame[];
    mutations: TuningMutationRecord[];
    /**
     * Per-tick [x, y] pairs captured after Actions applied. A synthetic
     * recording may ship without positions; its first replay stamps them
     * (the two-pass determinism harness).
     */
    positions: number[];
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
    private positions: number[] = [];
    private seed = 0;
    private baseTuning: TuningTable | null = null;

    private replaySource: Recording | null = null;
    private replayIndex = 0;
    private replayPositions: number[] = [];
    private schemaVersion = 1;

    startRecording(seed: number, baseTuning: TuningTable, schemaVersion: number): void {
        this.mode = 'recording';
        this.seed = seed;
        this.baseTuning = baseTuning;
        this.schemaVersion = schemaVersion;
        this.frames = [];
        this.mutations = [];
        this.positions = [];
    }

    recordFrame(frame: InputFrame, x: number, y: number): void {
        this.frames.push({ ...frame });
        this.positions.push(x, y);
    }

    recordMutation(key: TuningKey, value: number): void {
        if (this.mode === 'recording') {
            this.mutations.push({ tick: this.frames.length, key, value });
        }
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
            frames: this.frames,
            mutations: this.mutations,
            positions: this.positions,
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
     * Next frame of the replay, plus any tuning mutations stamped for this
     * tick offset. Returns null when the replay is exhausted.
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
            mutations: src.mutations.filter((m) => m.tick === index),
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
