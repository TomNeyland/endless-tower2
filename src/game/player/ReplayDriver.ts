/**
 * Owns the record/replay harness at the Phaser boundary: resolves each fixed
 * step's input frame (live or recorded), applies the recorded tuning timeline
 * during replay, and captures per-tick positions for the determinism gate.
 *
 * Determinism law: the sim is a pure function of seed + tuning timeline +
 * per-tick inputs. Every one of those is captured here — including TuningStack
 * layer ops (THE relic/modifier substrate), which the debug bridge can push
 * mid-recording.
 */
import { EVENT_SCHEMA_VERSION } from '../../core/events';
import type { InputRecorder, Recording, ReplayReport } from '../../core/input/recorder';
import type { InputFrame } from '../../core/movement/state';
import type { TuningChange, TuningStack } from '../../core/tuning';

export class ReplayDriver {
    private readonly recorder: InputRecorder;
    private readonly tuning: TuningStack;
    private readonly seed: number;
    private replayReport: ReplayReport | null = null;

    private readonly onTuningChange = (change: TuningChange): void => {
        this.recorder.recordChange(change);
    };

    constructor(recorder: InputRecorder, tuning: TuningStack, seed: number) {
        this.recorder = recorder;
        this.tuning = tuning;
        this.seed = seed;
        tuning.onChange(this.onTuningChange);
    }

    /** The input frame for this step: the recording's during replay (with its
     *  tuning changes applied first), the live sample otherwise. */
    frameFor(live: InputFrame): InputFrame {
        if (this.recorder.mode !== 'replaying') {
            return live;
        }
        const next = this.recorder.nextReplayFrame();
        if (next === null) {
            this.replayReport = this.recorder.finishReplay();
            return live;
        }
        for (const m of next.mutations) {
            this.apply(m.change);
        }
        return next.frame;
    }

    /** Capture the applied frame and the post-Actions position. */
    afterStep(frame: InputFrame, x: number, y: number): void {
        if (this.recorder.mode === 'recording') {
            this.recorder.recordFrame(frame, x, y);
        } else if (this.recorder.mode === 'replaying') {
            this.recorder.recordReplayPosition(x, y);
        }
    }

    beginRecording(): void {
        this.recorder.startRecording(
            this.seed,
            this.tuning.baseSnapshot(),
            this.tuning.layersSnapshot(),
            EVENT_SCHEMA_VERSION,
        );
    }

    stopRecording(): Recording {
        return this.recorder.stopRecording();
    }

    /** Restore the recording's exact tuning state (base + layers) and arm
     *  the replay. Fails loud on a cross-tower recording — replaying against
     *  the wrong geometry would masquerade as a determinism divergence. */
    beginReplay(recording: Recording): void {
        if (recording.seed !== this.seed) {
            throw new Error(
                `replay: seed mismatch — recording is for tower ${recording.seed}, ` +
                    `sandbox is ${this.seed}`,
            );
        }
        this.tuning.restoreBase(recording.baseTuning);
        this.tuning.restoreLayers(recording.baseLayers);
        this.replayReport = null;
        this.recorder.startReplay(recording);
    }

    lastReplayReport(): ReplayReport | null {
        return this.replayReport;
    }

    private apply(change: TuningChange): void {
        switch (change.op) {
            case 'setBase':
                this.tuning.setBase(change.key, change.value);
                break;
            case 'pushLayer':
                this.tuning.pushLayer({ ...change.layer });
                break;
            case 'removeLayer':
                this.tuning.removeLayer(change.id);
                break;
            case 'clearLayers':
                this.tuning.clearLayers();
                break;
        }
    }

    destroy(): void {
        this.tuning.offChange(this.onTuningChange);
    }
}
