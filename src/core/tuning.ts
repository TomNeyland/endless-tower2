/**
 * The TuningStack — THE relic/modifier substrate.
 *
 * A base table (see ./tuning-table.ts) plus ordered {key, op, value} layers,
 * tick-stamped and OWNED, so future systems mutate physics as data instead
 * of code.
 *
 * Owner-tag contract (docs/design/playthrough-trace.md finding 6 — binding
 * for all implementation sessions): every layer carries an owner
 * (`relic:<id>` / `segment:<nodeId>` / `powerup:<id>` / `boss:<attackId>`),
 * pops are by-owner, and the fold order is canonical regardless of push
 * order: base -> relics (acquisition order) -> segment modifiers ->
 * powerups -> boss layers. Without ownership, a segment pop could eat a
 * relic; without the canonical order, push timing would reprice a build.
 * An owner outside the four classes throws — a mistagged layer fails loud
 * at push time, never folds in a surprising place.
 */
import { validateComboTuning } from './combo/tuning';
import { validateIdentityTuning } from './economy/tuning';
import { DEFAULT_TUNING, type TuningKey, type TuningTable } from './tuning-table';

export { DEFAULT_TUNING } from './tuning-table';
export type { TuningKey, TuningTable } from './tuning-table';

/** Canonical fold rank per owner class (base is implicit rank 0). */
const OWNER_CLASS_RANK = { relic: 1, segment: 2, powerup: 3, boss: 4 } as const;
export type TuningOwnerClass = keyof typeof OWNER_CLASS_RANK;

function ownerRank(owner: string): number {
    const cls = owner.split(':')[0] as TuningOwnerClass;
    const rank = OWNER_CLASS_RANK[cls];
    if (rank === undefined) {
        throw new Error(
            `tuning: layer owner "${owner}" is not relic:/segment:/powerup:/boss: ` +
                '(playthrough-trace.md finding 6 — the owner-tag contract)',
        );
    }
    return rank;
}

export type TuningOp = 'mul' | 'add' | 'set';

export interface TuningLayer {
    /** Unique handle so a single layer can be removed surgically. */
    id: string;
    /**
     * Owning system: `relic:<id>` / `segment:<nodeId>` / `powerup:<id>` /
     * `boss:<attackId>`. Drives the canonical fold order and pop-by-owner.
     */
    owner: string;
    key: TuningKey;
    op: TuningOp;
    value: number;
    /** Tick the layer was applied — the audit trail for replays. */
    tick: number;
}

/**
 * Every way the stack can change, as one closed union. The recorder captures
 * ALL of these: layer ops are part of the tuning timeline — a session that
 * pushes a mul layer mid-recording must replay identically (determinism law).
 */
export type TuningChange =
    | { op: 'setBase'; key: TuningKey; value: number }
    | { op: 'pushLayer'; layer: TuningLayer }
    | { op: 'removeLayer'; id: string }
    | { op: 'removeByOwner'; owner: string }
    | { op: 'clearLayers' };

export type TuningChangeListener = (change: TuningChange) => void;

export class TuningStack {
    private readonly base: TuningTable;
    private layers: TuningLayer[] = [];
    private cache: TuningTable;
    private dirty = false;
    private listeners: TuningChangeListener[] = [];

    constructor(defaults: TuningTable = { ...DEFAULT_TUNING }) {
        this.base = { ...defaults };
        this.cache = { ...defaults };
    }

    /** Effective value after the canonical fold (see module doc). */
    value(key: TuningKey): number {
        if (this.dirty) {
            this.recompute();
        }
        return this.cache[key];
    }

    baseValue(key: TuningKey): number {
        return this.base[key];
    }

    /** Full effective table (copied) — for the bridge and for consumers that batch-read. */
    snapshot(): TuningTable {
        if (this.dirty) {
            this.recompute();
        }
        return { ...this.cache };
    }

    baseSnapshot(): TuningTable {
        return { ...this.base };
    }

    /**
     * Mutate the base table — the FeelTuner path. Listeners (the recorder)
     * see every change so replays reproduce live tuning sessions.
     */
    setBase(key: TuningKey, value: number): void {
        this.base[key] = value;
        this.dirty = true;
        this.notify({ op: 'setBase', key, value });
    }

    /** Restore a full base table (replay setup). Does not notify listeners. */
    restoreBase(table: TuningTable): void {
        for (const key of Object.keys(this.base) as TuningKey[]) {
            this.base[key] = table[key];
        }
        this.dirty = true;
    }

    /** Restore a full layer list (replay setup). Does not notify listeners. */
    restoreLayers(layers: readonly TuningLayer[]): void {
        this.layers = layers.map((l) => ({ ...l }));
        this.dirty = true;
    }

    pushLayer(layer: TuningLayer): void {
        this.layers.push(layer);
        this.dirty = true;
        // Validation THROWS at layer-push time on a bad owner class or a
        // degenerate combo value (combo-scoring.md graft #3): a modifier typo
        // fails loud, never perma-chains silently. The bad layer is rolled
        // back before throwing so the stack is never left poisoned.
        try {
            ownerRank(layer.owner);
            const resolved = this.snapshot();
            validateComboTuning(resolved);
            validateIdentityTuning(resolved);
        } catch (error) {
            this.layers.pop();
            this.dirty = true;
            throw error;
        }
        this.notify({ op: 'pushLayer', layer: { ...layer } });
    }

    removeLayer(id: string): boolean {
        const before = this.layers.length;
        this.layers = this.layers.filter((l) => l.id !== id);
        const removed = this.layers.length !== before;
        if (removed) {
            this.dirty = true;
            this.notify({ op: 'removeLayer', id });
        }
        return removed;
    }

    /**
     * Pop every layer a system owns — the contract's pop primitive: a segment
     * ending pops `segment:<nodeId>` and can never eat a relic's layers.
     * Returns how many layers were removed.
     */
    removeByOwner(owner: string): number {
        const before = this.layers.length;
        this.layers = this.layers.filter((l) => l.owner !== owner);
        const removed = before - this.layers.length;
        if (removed > 0) {
            this.dirty = true;
            this.notify({ op: 'removeByOwner', owner });
        }
        return removed;
    }

    clearLayers(): void {
        if (this.layers.length === 0) {
            return;
        }
        this.layers = [];
        this.dirty = true;
        this.notify({ op: 'clearLayers' });
    }

    layerList(): readonly TuningLayer[] {
        return this.layers;
    }

    layersSnapshot(): TuningLayer[] {
        return this.layers.map((l) => ({ ...l }));
    }

    onChange(fn: TuningChangeListener): void {
        this.listeners.push(fn);
    }

    offChange(fn: TuningChangeListener): void {
        this.listeners = this.listeners.filter((l) => l !== fn);
    }

    private notify(change: TuningChange): void {
        for (const fn of this.listeners) {
            fn(change);
        }
    }

    private recompute(): void {
        // The canonical fold: owner-class rank decides application order;
        // within a class, push order is preserved (Array.sort is stable —
        // relics fold in acquisition order).
        const ordered = [...this.layers].sort((a, b) => ownerRank(a.owner) - ownerRank(b.owner));
        const next: TuningTable = { ...this.base };
        for (const layer of ordered) {
            switch (layer.op) {
                case 'mul':
                    next[layer.key] *= layer.value;
                    break;
                case 'add':
                    next[layer.key] += layer.value;
                    break;
                case 'set':
                    next[layer.key] = layer.value;
                    break;
            }
        }
        this.cache = next;
        this.dirty = false;
    }
}

/**
 * Apply one recorded TuningChange to a live stack — the single authority the
 * browser replay driver and the headless replay CLI both use, so a recorded
 * tuning timeline replays identically everywhere.
 */
export function applyTuningChange(stack: TuningStack, change: TuningChange): void {
    switch (change.op) {
        case 'setBase':
            stack.setBase(change.key, change.value);
            break;
        case 'pushLayer':
            stack.pushLayer({ ...change.layer });
            break;
        case 'removeLayer':
            stack.removeLayer(change.id);
            break;
        case 'removeByOwner':
            stack.removeByOwner(change.owner);
            break;
        case 'clearLayers':
            stack.clearLayers();
            break;
    }
}
