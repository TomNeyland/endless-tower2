/**
 * The save store — the ONLY place in the codebase that touches localStorage
 * (core stays IO-free; docs/design/meta-progression.md, Persistence). One
 * versioned document, written at run end and settings changes only — never
 * in the hot path. Corrupt/missing loads print exactly one console warning
 * and start fresh; a document from a FUTURE build version refuses to load
 * and is never overwritten.
 *
 * Module singleton by design: the save outlives every scene and every run,
 * and localStorage is itself a global. The debug bridge's grantUnlock /
 * resetSave / setMasterVolume land here (dev surfaces; grants persist
 * immediately so a harness-built save survives a reload).
 */
import type { MetaEvent } from '../../core/meta/events';
import type { RunRecord } from '../../core/meta/stats';
import type { UnlockGrant, UnlockKind } from '../../core/meta/unlocks';
import { characterById } from '../../core/meta/characters';
import { modifierById } from '../../core/map/modifiers';
import { relicById } from '../../core/relics/roster';
import {
    freshSave,
    loadSaveDocument,
    SAVE_SCHEMA_VERSION,
    type SaveDocument,
    type SaveSettings,
    serializeSave,
    withFeat,
    withRunEnd,
    withSettings,
} from '../../core/persist/save';

export const SAVE_STORAGE_KEY = 'et2.save';
const META_RING_SIZE = 128;

export class SaveStore {
    private document: SaveDocument;
    private readonly writable: boolean;
    private ring: MetaEvent[] = [];

    constructor(raw: string | null) {
        const result = loadSaveDocument(raw);
        if (result.warning !== null) {
            // The one console warning the design budgets for a broken load.
            console.warn(result.warning);
        }
        this.document = result.doc;
        this.writable = result.writable;
    }

    get doc(): SaveDocument {
        return this.document;
    }

    settings(): SaveSettings {
        return { ...this.document.settings };
    }

    /** Meta diagnostics ring (meta/feat, meta/unlocked, meta/save_written). */
    emit(event: MetaEvent): void {
        this.ring.push(event);
        if (this.ring.length > META_RING_SIZE) {
            this.ring.shift();
        }
    }

    recentEvents(count = 50): MetaEvent[] {
        return this.ring.slice(-count);
    }

    /** Record one fired feat + its grant (in-memory; the run-end commit
     *  writes). Emits the schema's meta/feat + meta/unlocked facts. */
    recordFeat(featId: string, trigger: string, grant: UnlockGrant | null): void {
        this.document = withFeat(this.document, featId, grant);
        this.emit({ type: 'meta/feat', featId, trigger });
        if (grant !== null) {
            this.emit({ type: 'meta/unlocked', kind: grant.kind, id: grant.id });
        }
    }

    /** THE run-end commit: fold the record, stamp the NEW-relic window,
     *  remember the seed, write once. */
    commitRunEnd(run: RunRecord, relicsUnlockedThisRun: readonly string[]): void {
        this.document = withRunEnd(this.document, run, relicsUnlockedThisRun);
        this.write();
    }

    /** The settings-change write trigger. */
    updateSettings(patch: Partial<SaveSettings>): void {
        this.document = withSettings(this.document, patch);
        this.write();
    }

    /** Dev-only (debug bridge): grant an unlock without its feat. Persists
     *  immediately — a harness-built save must survive a reload. */
    grantUnlock(kind: UnlockKind, id: string): void {
        // Validate against the live rosters — the bridge fails loud too.
        if (kind === 'character') {
            characterById(id);
        } else if (kind === 'relic') {
            relicById(id);
        } else {
            modifierById(id);
        }
        const list =
            kind === 'character'
                ? this.document.unlocks.characters
                : kind === 'relic'
                  ? this.document.unlocks.relics
                  : this.document.unlocks.modifiers;
        if (!list.includes(id)) {
            list.push(id);
        }
        this.emit({ type: 'meta/unlocked', kind, id });
        this.write();
    }

    /** Dev-only (debug bridge): wipe the save and start fresh. */
    resetSave(): void {
        localStorage.removeItem(SAVE_STORAGE_KEY);
        this.document = freshSave();
        this.ring = [];
    }

    private write(): void {
        if (!this.writable) {
            console.warn('save: write refused — a newer save version is on disk');
            return;
        }
        const serialized = serializeSave(this.document);
        localStorage.setItem(SAVE_STORAGE_KEY, serialized);
        this.emit({
            type: 'meta/save_written',
            version: SAVE_SCHEMA_VERSION,
            bytes: serialized.length,
        });
    }
}

let instance: SaveStore | null = null;

/** The lazy singleton — first touch loads (and warns at most once). */
export function saveStore(): SaveStore {
    if (instance === null) {
        instance = new SaveStore(localStorage.getItem(SAVE_STORAGE_KEY));
    }
    return instance;
}
