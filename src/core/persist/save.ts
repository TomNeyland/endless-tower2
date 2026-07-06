/**
 * The save document (docs/design/meta-progression.md, Persistence): ONE
 * versioned document — `{SAVE_SCHEMA_VERSION, unlocks, stats, settings,
 * lastSeed}` — written at run end and settings changes only (no hot-path
 * IO, ever).
 *
 * Core is IO-free by law: this module owns the document SHAPE, the explicit
 * per-version migration functions, and the pure update logic; localStorage
 * itself is touched only by the game layer (src/game/meta/SaveStore.ts).
 *
 * Load policy, exactly as designed: corrupt/missing -> fresh save + one
 * console warning (fail loud in dev; a player's first run must never be
 * blocked by a broken save); unknown FUTURE versions refuse to load rather
 * than silently truncate — the loader hands back a fresh in-memory document
 * marked non-writable so the newer save on disk is never clobbered.
 */
import { characterById } from '../meta/characters';
import { modifierById } from '../map/modifiers';
import { relicById } from '../relics/roster';
import {
    emptyLifetimeStats,
    foldRunIntoStats,
    type LifetimeStats,
    type RunRecord,
    TIER_HISTOGRAM_SIZE,
} from '../meta/stats';
import type { UnlockGrant } from '../meta/unlocks';

export const SAVE_SCHEMA_VERSION = 1;
export const DEFAULT_MASTER_VOLUME = 0.7;

export interface SaveUnlocks {
    /** Feat ids earned, ever — the fire-once-ever set. */
    feats: string[];
    /** Character ids granted beyond the always-unlocked baseline. */
    characters: string[];
    /** Relic ids granted into the pool beyond the 16 initials. */
    relics: string[];
    /** Modifier ids granted into the roll pool beyond the initials. */
    modifiers: string[];
    /** Relics unlocked in the most recent completed run — stamped NEW in
     *  shops for one run, then superseded by the next run's grants. */
    newRelics: string[];
}

export interface SaveSettings {
    /** audio.md owns the level; the save persists the player's choice. */
    masterVolume: number;
}

export interface SaveDocument {
    version: number;
    unlocks: SaveUnlocks;
    stats: LifetimeStats;
    settings: SaveSettings;
    /** The last run's seed — prefills the title screen's seeded-run entry. */
    lastSeed: string | null;
}

export function freshSave(): SaveDocument {
    return {
        version: SAVE_SCHEMA_VERSION,
        unlocks: { feats: [], characters: [], relics: [], modifiers: [], newRelics: [] },
        stats: emptyLifetimeStats(),
        settings: { masterVolume: DEFAULT_MASTER_VOLUME },
        lastSeed: null,
    };
}

/**
 * Explicit migration functions, one per version bump: MIGRATIONS[n]
 * upgrades a version-n document to version n+1. Empty today (v1 is the
 * first shipped schema); the machinery exists so the day version 2 lands,
 * the upgrade is a named function here, never an ad-hoc patch at load.
 */
export const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> =
    {};

export type SaveLoadOutcome = 'loaded' | 'fresh-missing' | 'fresh-corrupt' | 'refused-future';

export interface SaveLoadResult {
    doc: SaveDocument;
    /** False when a newer save was refused — never write over it. */
    writable: boolean;
    outcome: SaveLoadOutcome;
    /** The one console warning's text; null when the load was clean. */
    warning: string | null;
}

function isStringArray(v: unknown): v is string[] {
    return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

/** Structural check for a parsed current-version document. Throws on lies. */
function assertSaveShape(raw: Record<string, unknown>): SaveDocument {
    const u = raw.unlocks as Record<string, unknown> | undefined;
    if (
        u === undefined ||
        !isStringArray(u.feats) ||
        !isStringArray(u.characters) ||
        !isStringArray(u.relics) ||
        !isStringArray(u.modifiers) ||
        !isStringArray(u.newRelics)
    ) {
        throw new Error('save: unlocks block malformed');
    }
    // Unlock ids must resolve against the live rosters — a save naming a
    // relic that no longer exists is corrupt, not quietly filtered.
    for (const id of u.characters) {
        characterById(id);
    }
    for (const id of [...u.relics, ...u.newRelics]) {
        relicById(id);
    }
    for (const id of u.modifiers) {
        modifierById(id);
    }
    // The stats block is checked field-for-field against what the museum
    // and foldRunIntoStats actually consume — a truncated or hand-edited
    // block is CORRUPT (fresh save + warning), never quietly rendered as
    // NaN/undefined.
    const stats = raw.stats as Partial<LifetimeStats> | undefined;
    if (stats === undefined || stats === null || typeof stats !== 'object') {
        throw new Error('save: stats block malformed');
    }
    const numericStatFields = [
        'runs',
        'wins',
        'deaths',
        'winStreak',
        'bestWinStreak',
        'totalFloors',
        'totalBanks',
        'totalVoids',
        'totalPerfectBounces',
        'totalSegments',
        'bestChainFloors',
        'bestChainMult',
        'bestChainPayout',
        'bestRunScore',
        'bestRunFloors',
    ] as const;
    for (const field of numericStatFields) {
        if (typeof stats[field] !== 'number' || !Number.isFinite(stats[field])) {
            throw new Error(`save: stats.${field} malformed`);
        }
    }
    if (typeof stats.bestChainFace !== 'string') {
        throw new Error('save: stats.bestChainFace malformed');
    }
    if (stats.bestChainCharacterId !== null && typeof stats.bestChainCharacterId !== 'string') {
        throw new Error('save: stats.bestChainCharacterId malformed');
    }
    if (stats.fastestActTicks !== null && typeof stats.fastestActTicks !== 'number') {
        throw new Error('save: stats.fastestActTicks malformed');
    }
    if (
        !Array.isArray(stats.tierHistogram) ||
        stats.tierHistogram.length !== TIER_HISTOGRAM_SIZE ||
        !stats.tierHistogram.every((n) => typeof n === 'number' && Number.isFinite(n))
    ) {
        throw new Error('save: stats.tierHistogram malformed');
    }
    if (typeof stats.perCharacter !== 'object' || stats.perCharacter === null) {
        throw new Error('save: stats.perCharacter malformed');
    }
    for (const [characterId, record] of Object.entries(stats.perCharacter)) {
        if (
            typeof record.runs !== 'number' ||
            typeof record.wins !== 'number' ||
            typeof record.bestChainPayout !== 'number' ||
            typeof record.bestChainFace !== 'string' ||
            typeof record.bestScore !== 'number'
        ) {
            throw new Error(`save: stats.perCharacter.${characterId} malformed`);
        }
    }
    const settings = raw.settings as SaveSettings | undefined;
    if (
        settings === undefined ||
        typeof settings.masterVolume !== 'number' ||
        settings.masterVolume < 0 ||
        settings.masterVolume > 1
    ) {
        throw new Error('save: settings block malformed');
    }
    if (raw.lastSeed !== null && typeof raw.lastSeed !== 'string') {
        throw new Error('save: lastSeed malformed');
    }
    return raw as unknown as SaveDocument;
}

/**
 * Parse + migrate + validate a raw localStorage string (or null for a
 * missing key). Never throws — the outcome carries the verdict, the warning
 * carries the single console line the game layer prints.
 */
export function loadSaveDocument(raw: string | null): SaveLoadResult {
    if (raw === null) {
        return { doc: freshSave(), writable: true, outcome: 'fresh-missing', warning: null };
    }
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed !== 'object' || parsed === null) {
            throw new Error('save: not a JSON object');
        }
    } catch (error) {
        return {
            doc: freshSave(),
            writable: true,
            outcome: 'fresh-corrupt',
            warning: `save: corrupt document — starting fresh (${String(error)})`,
        };
    }
    const version = parsed.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
        return {
            doc: freshSave(),
            writable: true,
            outcome: 'fresh-corrupt',
            warning: `save: unusable version ${String(version)} — starting fresh`,
        };
    }
    if (version > SAVE_SCHEMA_VERSION) {
        return {
            doc: freshSave(),
            writable: false,
            outcome: 'refused-future',
            warning:
                `save: document version ${version} is newer than this build's ` +
                `${SAVE_SCHEMA_VERSION} — refusing to load (and never overwriting it)`,
        };
    }
    let doc = parsed;
    for (let v = version; v < SAVE_SCHEMA_VERSION; v += 1) {
        const migrate = MIGRATIONS[v];
        if (!migrate) {
            return {
                doc: freshSave(),
                writable: true,
                outcome: 'fresh-corrupt',
                warning: `save: no migration from version ${v} — starting fresh`,
            };
        }
        doc = migrate(doc);
    }
    try {
        return { doc: assertSaveShape(doc), writable: true, outcome: 'loaded', warning: null };
    } catch (error) {
        return {
            doc: freshSave(),
            writable: true,
            outcome: 'fresh-corrupt',
            warning: `save: corrupt document — starting fresh (${String(error)})`,
        };
    }
}

export function serializeSave(doc: SaveDocument): string {
    return JSON.stringify(doc);
}

/** Record a feat + its grant. Pure — returns a new document. */
export function withFeat(
    doc: SaveDocument,
    featId: string,
    grant: UnlockGrant | null,
): SaveDocument {
    if (doc.unlocks.feats.includes(featId)) {
        throw new Error(`save: feat ${featId} recorded twice — feats fire once ever`);
    }
    const unlocks: SaveUnlocks = {
        ...doc.unlocks,
        feats: [...doc.unlocks.feats, featId],
    };
    if (grant !== null) {
        // Copy-then-assign, never push: the spread above is shallow, and a
        // push would mutate the array the PREVIOUS document still holds —
        // "pure" must mean the old snapshot stays true.
        const key =
            grant.kind === 'character'
                ? 'characters'
                : grant.kind === 'relic'
                  ? 'relics'
                  : 'modifiers';
        if (!unlocks[key].includes(grant.id)) {
            unlocks[key] = [...unlocks[key], grant.id];
        }
    }
    return { ...doc, unlocks };
}

/** Fold a finished run: stats, lastSeed, and the NEW-relic stamp window
 *  (this run's relic grants replace the previous run's). Pure. */
export function withRunEnd(
    doc: SaveDocument,
    run: RunRecord,
    relicsUnlockedThisRun: readonly string[],
): SaveDocument {
    return {
        ...doc,
        stats: foldRunIntoStats(doc.stats, run),
        unlocks: { ...doc.unlocks, newRelics: [...relicsUnlockedThisRun] },
        lastSeed: run.seed,
    };
}

/** Settings change — the other sanctioned write trigger. Pure. */
export function withSettings(doc: SaveDocument, patch: Partial<SaveSettings>): SaveDocument {
    const settings = { ...doc.settings, ...patch };
    if (settings.masterVolume < 0 || settings.masterVolume > 1) {
        throw new Error(`save: masterVolume ${settings.masterVolume} outside [0, 1]`);
    }
    return { ...doc, settings };
}
