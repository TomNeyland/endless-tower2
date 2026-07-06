/**
 * Synthetic session builders for the EXAM harness — engine-free fixtures
 * that exercise the headless replay end-to-end: a segment spec becomes a
 * real tower (the same buildSegmentTower the scene runs), scripted inputs
 * become a v4 session file shape, and recorded exam commands ride the
 * timeline exactly as a browser duel would have stamped them.
 */
import { EVENT_SCHEMA_VERSION } from '../core/events';
import type { ExamCommandRecord } from '../core/exam/commands';
import type { InputFrame } from '../core/movement/state';
import {
    encodeInputRle,
    SESSION_SCHEMA_VERSION,
    type SessionRecording,
} from '../core/input/session';
import { buildSegmentTower, type SegmentSpec } from '../core/pressure/segment';
import { TuningStack } from '../core/tuning';

/** The scene's arena bottom: GAME_HEIGHT (768) minus the ground row (64). */
export const GROUND_TOP_Y = 704;

/** Scripted climb: run right, jump on a fixed cadence — enough motion to
 *  land on classified ledges without any knowledge of the layout. */
export function climbFrames(ticks: number, jumpEvery = 80, holdTicks = 14): InputFrame[] {
    const frames: InputFrame[] = [];
    for (let i = 0; i < ticks; i += 1) {
        const phase = i % jumpEvery;
        frames.push({
            axisX: 1,
            jumpPressedEdge: phase === 0 && i > 0,
            jumpHeld: phase < holdTicks && i > 0,
        });
    }
    return frames;
}

export function idleFrames(ticks: number): InputFrame[] {
    const frames: InputFrame[] = [];
    for (let i = 0; i < ticks; i += 1) {
        frames.push({ axisX: 0, jumpPressedEdge: false, jumpHeld: false });
    }
    return frames;
}

export interface SyntheticSession {
    session: SessionRecording;
    doorPlatformId: number | null;
}

/** Build a v4 session file around a spec + inputs + command timeline. */
export function syntheticSession(
    spec: SegmentSpec,
    frames: InputFrame[],
    examCommands: ExamCommandRecord[],
): SyntheticSession {
    const tuning = new TuningStack();
    const build = buildSegmentTower(spec, tuning, GROUND_TOP_Y);
    return {
        session: {
            version: SESSION_SCHEMA_VERSION,
            eventSchemaVersion: EVENT_SCHEMA_VERSION,
            startedAt: 'harness',
            savedAt: 'harness',
            endReason: 'live-export',
            seed: spec.seed,
            ticks: frames.length,
            tower: build.layout,
            segment: { spec, door: build.door, groundTopY: GROUND_TOP_Y },
            heartsCarried: null,
            baseTuning: tuning.baseSnapshot(),
            baseLayers: [],
            tuningTimeline: [],
            examCommands,
            inputRle: encodeInputRle(frames),
            markers: [],
            eventIndex: {},
            endPosition: null,
        },
        doorPlatformId: build.door === null ? null : build.door.platformId,
    };
}
