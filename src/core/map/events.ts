/**
 * Map events (MAP_SCHEMA_VERSION = 1, map-modifiers.md's table) — facts
 * only, same law as every other stream. These ride the run orchestrator's
 * own emitter (the movement bus is scene-scoped and the map lives between
 * scenes); the debug bridge keeps the ring.
 *
 * `run/ended {reason: summit}` is the victory twin playthrough-trace.md
 * finding 7 assigned to the orchestrator — pressure owns the death_line
 * reason on the movement bus; summit lives here.
 */
import type { SessionStats } from '../combo/types';
import type { SegmentSpec } from '../pressure/segment';
import type { NodeLabel } from './label';
import type { NodeRewards, NodeType } from './types';

export { MAP_SCHEMA_VERSION } from './types';

export interface MapGeneratedEvent {
    type: 'map/generated';
    actIndex: number;
    seed: string;
    forkLabel: string;
    regenCount: number;
    rowWidths: number[];
    countsByType: Record<NodeType, number>;
}

export interface MapNodePreviewedEvent {
    type: 'map/node_previewed';
    nodeId: string;
    label: NodeLabel;
}

export interface MapNodeCommittedEvent {
    type: 'map/node_committed';
    nodeId: string;
    nodeType: NodeType;
    modifiers: string[];
    rewards: NodeRewards;
    /** Handed to pressure verbatim (null for shop/mystery scenes). */
    segment: SegmentSpec | null;
}

export interface ActCompletedEvent {
    type: 'run/act_completed';
    actIndex: number;
    /** Node ids committed this act, in order. */
    path: string[];
    /** The boss segment's stat block (score/session_final's shape). */
    stats: SessionStats | null;
}

export interface RunSummitEvent {
    type: 'run/ended';
    reason: 'summit';
    seed: string;
    path: string[];
    totalScore: number;
    coins: number;
}

export type MapEvent =
    | MapGeneratedEvent
    | MapNodePreviewedEvent
    | MapNodeCommittedEvent
    | ActCompletedEvent
    | RunSummitEvent;

export type MapEventType = MapEvent['type'];
