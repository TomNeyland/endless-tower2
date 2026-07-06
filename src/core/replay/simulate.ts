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
import { applyExamCommand, type ExamCommandSinks } from '../exam/commands';
import { PlatformField } from '../exam/field';
import { seedPassiveSwarm } from '../exam/passive-swarm';
import { SwarmRuntime } from '../exam/swarm';
import type { EventIndex } from '../input/recorder';
import { recordingFromSession, type SessionRecording, shouldIndexEvent } from '../input/session';
import { emitSpawn, stepMovement } from '../movement/logic';
import { createMovementState, type MovementEnv } from '../movement/state';
import { doorPlacementFor } from '../pressure/segment';
import { PressureRuntime } from '../pressure/runtime';
import { RunState } from '../run/state';
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
    // RunState is the single heart source everywhere (IDENTITY); headless it
    // is seeded from the recorded heartsCarried exactly like scene create.
    // Relic-triggered heart GAINS are not in the recording yet — a session
    // that exercised them replays with an honest divergence alarm
    // (docs/DEVIATIONS.md entry 13).
    const pressure =
        session.segment !== null
            ? new PressureRuntime(
                  session.segment,
                  tuning,
                  new RunState(
                      // The headless run seed is provenance only (no shop
                      // forks here); hearts come from the recorded channel.
                      { seed: String(session.seed), heartsCarried: session.heartsCarried },
                      tuning,
                      () => state.tick,
                      () => {},
                  ),
              )
            : null;

    // ExamFieldSystem's construction mirror: the platform field starts from
    // the embedded tower's landClass roll; passive swarm critters seed from
    // the segment spec; commanded mutations arrive from the recorded
    // exam-command timeline; touch-armed crumbles regenerate from land events.
    const field = session.segment !== null ? new PlatformField(tower.platforms) : null;
    const swarm = session.segment !== null ? new SwarmRuntime() : null;
    if (swarm !== null && session.segment !== null) {
        seedPassiveSwarm(swarm, tower, session.segment.spec, tuning);
    }
    if (field !== null) {
        world.setPlatformField(field);
    }
    const sinks: ExamCommandSinks | null =
        field !== null && swarm !== null
            ? {
                  field,
                  swarm,
                  setDoor: (platformId: number) => {
                      if (pressure === null) {
                          throw new Error('replay: door command without a segment');
                      }
                      pressure.setDoor(
                          doorPlacementFor(tower, platformId, tuning.value('FLOOR_HEIGHT_PX')),
                      );
                  },
              }
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
        // Exam commands share the frame-boundary semantics: in the browser
        // they were issued during tick i's exam step (after that tick's
        // field.step), which is exactly this boundary.
        if (sinks !== null) {
            for (const c of recording.examCommands) {
                if (c.frameIndex === i) {
                    applyExamCommand(sinks, c.cmd, state.tick);
                }
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
        // ExamFieldSystem's bus mirror: a landing arms a crumble ledge the
        // moment the land event fires (regenerable channel, never recorded).
        if (field !== null && landing !== null) {
            field.handleLand(
                landing.platformId,
                state.tick,
                tuning.value('land.crumbleDelayTicks'),
            );
        }
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
        // ExamFieldSystem's step mirror, after pressure exactly like the
        // scene's handler order: collapse timers expire (the world consults
        // the field live, so removal binds from the next tick's collider),
        // then the swarm taxes momentum through the one body surface.
        if (field !== null && swarm !== null) {
            field.step(state.tick);
            const body = world.bodySnapshot();
            const contacts = swarm.step(
                state.tick,
                { x: body.x, y: body.y },
                tuning.value('exam.swarmHitCooldownTicks'),
            );
            if (contacts.contacts.length > 0) {
                world.applySpeedKeep(tuning.value('exam.swarmSpeedKeep'));
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
