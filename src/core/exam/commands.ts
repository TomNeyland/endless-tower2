/**
 * The exam command timeline — the recorded channel for COMMANDED world
 * mutations (docs/DEVIATIONS.md entry 13's "run-command timeline" pattern,
 * applied to the platform field and the swarm).
 *
 * The boss brain is deterministic but runs browser-side only; its decisions
 * that touch PHYSICS — collapsing ledges, splatting goo, spawning critters,
 * materializing the defeat door — are recorded frame-stamped exactly like
 * tuning mutations, and the headless replay applies them through this one
 * applicator. Tuning-shaped effects (line surges, gusts) don't appear here:
 * they are ordinary owner-tagged layers and ride the tuning timeline that
 * already exists. Regenerable field transitions (touch-armed crumbles)
 * don't appear here either — the field re-derives them from land events.
 *
 * One applicator, two callers (ExamFieldSystem in the browser,
 * simulateSession headless), so a recorded duel replays bit-for-bit.
 */
import type { LandClassification } from '../events';
import type { SwarmSpawn } from './swarm';
import type { PlatformField } from './field';
import type { SwarmRuntime } from './swarm';

export type ExamCommand =
    | { op: 'collapse'; platformId: number; delayTicks: number }
    | { op: 'classify'; platformId: number; classification: LandClassification | null }
    | { op: 'swarm'; spawn: SwarmSpawn }
    | { op: 'swarm_clear' }
    /** The defeat door: pressure materializes the exit on this platform. */
    | { op: 'door'; platformId: number };

export interface ExamCommandRecord {
    /** Frame index the command precedes — applied before that frame replays
     *  (identical semantics to TuningMutationRecord). */
    frameIndex: number;
    cmd: ExamCommand;
}

/** The door half is the caller's: pressure lives outside the field. */
export interface ExamCommandSinks {
    field: PlatformField;
    swarm: SwarmRuntime;
    /** Materialize the exit door on a platform (boss defeat). */
    setDoor: (platformId: number) => void;
}

export function applyExamCommand(sinks: ExamCommandSinks, cmd: ExamCommand, tick: number): void {
    switch (cmd.op) {
        case 'collapse':
            sinks.field.commandCollapse(cmd.platformId, tick, cmd.delayTicks);
            break;
        case 'classify':
            sinks.field.commandClassify(cmd.platformId, cmd.classification);
            break;
        case 'swarm':
            sinks.swarm.spawn({ ...cmd.spawn });
            break;
        case 'swarm_clear':
            sinks.swarm.clear();
            break;
        case 'door':
            sinks.setDoor(cmd.platformId);
            break;
    }
}
