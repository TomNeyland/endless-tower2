/**
 * Meta events (RETURN_SCHEMA_VERSION = 1, docs/design/meta-progression.md's
 * table) — facts only, same law as every stream. These ride the meta layer's
 * own diagnostics ring (the save and the tracker live outside any scene, like
 * the run orchestrator's events); the debug bridge exposes the ring.
 */
import type { UnlockKind } from './unlocks';

export const RETURN_SCHEMA_VERSION = 1;

export interface MetaFeatEvent {
    type: 'meta/feat';
    featId: string;
    /** The stat reference that tripped the condition (audit trail). */
    trigger: string;
}

export interface MetaUnlockedEvent {
    type: 'meta/unlocked';
    kind: UnlockKind;
    id: string;
}

export interface MetaSaveWrittenEvent {
    type: 'meta/save_written';
    version: number;
    bytes: number;
}

export type MetaEvent = MetaFeatEvent | MetaUnlockedEvent | MetaSaveWrittenEvent;
