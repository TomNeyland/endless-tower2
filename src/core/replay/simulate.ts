/**
 * Headless re-simulation of a session recording over the engine-free core.
 * The recording is the complete log: seed + tower + segment + tuning
 * timeline + per-tick input frames regenerate every event and every float,
 * bit-for-bit. Divergence from the recording's own eventIndex (or its end
 * position) is a determinism alarm and fails loud — never a shrug.
 *
 * Segment sessions replay whole: the same PressureRuntime the browser
 * stepped runs here after each movement tick, on post-Actions kinematics —
 * the exact WORLD_STEP handler order the scene uses — and its rescue launch
 * lands on the headless body through the same one-write channel.
 */
import type { MovementEvent } from '../events';
import type { EventIndex } from '../input/recorder';
import { recordingFromSession, type SessionRecording, shouldIndexEvent } from '../input/session';
import { emitSpawn, stepMovement } from '../movement/logic';
import { createMovementState, type MovementEnv } from '../movement/state';
import { PressureRuntime } from '../pressure/runtime';
import { applyTuningChange, TuningStack } from '../tuning';
import { HeadlessWorld } from './world';

export interface SimulationResult {
    /** Every regenerated event, tick firehose included, in emission order. */
    events: MovementEvent[];
    /** Rebuilt with the same predicate the browser recorder used. */
    eventIndex: EventIndex;
    ticks: number;
    /** [centerX, feetY] after the last tick; null for an empty session. */
    endPosition: [number, number] | null;
}

/** Re-run a session from tick 0 and collect the regenerated ground truth. */
export function simulateSession(session: SessionRecording): SimulationResult {
    const recording = recordingFromSession(session);
    const tuning = new TuningStack();
    tuning.restoreBase(recording.baseTuning);
    tuning.restoreLayers(recording.baseLayers);

    const tower = session.tower;
    const env: MovementEnv = {
        wallLeftX: tower.wallLeftX,
        wallRightX: tower.wallRightX,
        groundTopY: tower.groundTopY,
    };
    const world = new HeadlessWorld(tower);
    const state = createMovementState();

    const events: MovementEvent[] = [];
    const eventIndex: EventIndex = {};
    const emit = (event: MovementEvent): void => {
        events.push(event);
        if (shouldIndexEvent(event.type)) {
            let list = eventIndex[event.type];
            if (list === undefined) {
                list = [];
                eventIndex[event.type] = list;
            }
            list.push(event.tick);
        }
    };

    // PressureSystem's construction mirror: armed before the first step.
    const pressure =
        session.segment !== null
            ? new PressureRuntime(session.segment, tuning, session.heartsCarried)
            : null;

    // PlayerSystem.beginRecording: reset to spawn, emit the spawn fact.
    const spawnX = (tower.wallLeftX + tower.wallRightX) / 2;
    emitSpawn(state, env, tuning, emit, spawnX, tower.groundTopY, 'reset');

    let endPosition: [number, number] | null = null;
    for (let i = 0; i < recording.frames.length; i += 1) {
        // ReplayDriver semantics: changes stamped for frame i apply before it.
        for (const m of recording.mutations) {
            if (m.frameIndex === i) {
                applyTuningChange(tuning, m.change);
            }
        }
        const landing = world.step();
        const actions = stepMovement(
            state,
            { input: recording.frames[i], body: world.bodySnapshot(), contact: { landing } },
            env,
            tuning,
            emit,
        );
        world.applyActions(actions);
        if (pressure) {
            // PressureSystem.onWorldStep mirror: post-movement kinematics in,
            // events out, the rescue launch applied after this tick's Actions.
            const out = pressure.step({
                ...world.bodySnapshot(),
                grounded: state.grounded,
                tick: state.tick,
                tier: state.tier,
            });
            for (const event of out.events) {
                emit(event);
            }
            if (out.launch) {
                world.applyRescueLaunch(out.launch.vy, out.launch.vxKeep);
            }
        }
        endPosition = world.positionPair();
    }

    return { events, eventIndex, ticks: recording.frames.length, endPosition };
}

export interface DivergenceReport {
    ok: boolean;
    /** Human-readable findings, empty when the replay matches the recording. */
    findings: string[];
}

/**
 * The determinism alarm: the regenerated eventIndex and end position must
 * match the recording's exactly — same event types, same tick stamps, same
 * floats. Any mismatch means the sim is no longer a pure function of the
 * recording, and that is a stop-the-line fact.
 */
export function compareAgainstRecording(
    session: SessionRecording,
    result: SimulationResult,
): DivergenceReport {
    const findings: string[] = [];
    if (result.ticks !== session.ticks) {
        findings.push(`ticks: replay ran ${result.ticks}, recording says ${session.ticks}`);
    }

    const recorded = session.eventIndex;
    const regenerated = result.eventIndex;
    const types = new Set([...Object.keys(recorded), ...Object.keys(regenerated)]);
    for (const type of [...types].sort()) {
        const a = recorded[type] ?? [];
        const b = regenerated[type] ?? [];
        if (a.length !== b.length) {
            findings.push(`${type}: recorded ${a.length} events, replay produced ${b.length}`);
        }
        const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i += 1) {
            if (a[i] !== b[i]) {
                findings.push(
                    `${type}[${i}]: recorded tick ${a[i]}, replay tick ${b[i]} — first drift`,
                );
                break;
            }
        }
    }

    const rec = session.endPosition;
    const sim = result.endPosition;
    if ((rec === null) !== (sim === null)) {
        findings.push(
            `endPosition: recorded ${JSON.stringify(rec)}, replay ${JSON.stringify(sim)}`,
        );
    } else if (rec !== null && sim !== null && (rec[0] !== sim[0] || rec[1] !== sim[1])) {
        findings.push(
            `endPosition: recorded [${rec[0]}, ${rec[1]}], replay [${sim[0]}, ${sim[1]}]`,
        );
    }

    return { ok: findings.length === 0, findings };
}
