/**
 * RunState — the single source of run truth (docs/design/relics-economy.md).
 * Engine-free, serializable (save/continue and seed-sharing ride on this),
 * mutated only through typed commands, each emitting its event on the
 * game-wide bus.
 *
 * Heart ownership, reconciled: PRESSURE's run-scoped HeartsState is absorbed
 * here — PressureRuntime consumes hearts through the narrow HeartsPort
 * (core/pressure/segment.ts), which RunState implements structurally. One
 * exception to command-emits-its-event: `loseHeart` emits nothing, because
 * `run/heart_lost` is PressureRuntime's event — it holds the kinematic facts
 * (gapAtCatch, catchFloorIndex) a wallet cannot know. One moment, one
 * authority.
 *
 * `stumbleCharges` mirrors the build's granted fizzle-forgiveness (the combo
 * engine reads the real allowance from `combo.stumblesAllowed` tuning); it
 * is derived at acquisition from the relic's own layers so the snapshot
 * stays one command away from the truth, never a second bookkeeper.
 */
import type { MovementEvent, RelicSource } from '../events';
import type { RelicDef } from '../relics/types';
import type { TuningStack } from '../tuning';

export const RUN_SCHEMA_VERSION = 1;

/** The serializable face — plain data, JSON round-trippable. */
export interface RunSnapshot {
    version: number;
    seed: number;
    actIndex: number;
    nodeId: string | null;
    /** Node ids committed so far, in order. */
    path: string[];
    hearts: number;
    coins: number;
    /** Relic ids in acquisition order — acquisition order IS fold order. */
    relics: string[];
    stumbleCharges: number;
    /** Drives the shop's escalating heart price. */
    heartsBought: number;
}

export type RunEmit = (event: MovementEvent) => void;

export interface RunInit {
    seed: number;
    /** Hearts carried into this scene; null = fresh run (tuning start). */
    heartsCarried?: number | null;
}

export class RunState {
    private readonly t: TuningStack;
    private readonly emit: RunEmit;
    private readonly clock: () => number;

    private readonly seed: number;
    private actIndex = 0;
    private nodeId: string | null = null;
    private path: string[] = [];
    private _hearts: number;
    private _coins = 0;
    private relics: string[] = [];
    private _stumbleCharges = 0;
    private _heartsBought = 0;

    constructor(init: RunInit, tuning: TuningStack, clock: () => number, emit: RunEmit) {
        this.t = tuning;
        this.emit = emit;
        this.clock = clock;
        this.seed = init.seed;
        const max = tuning.value('hearts.max');
        const carried = init.heartsCarried ?? null;
        this._hearts =
            carried === null ? Math.min(tuning.value('hearts.start'), max) : Math.min(carried, max);
    }

    /**
     * Rebuild from a snapshot (scene create / save-continue). Hearts are NOT
     * re-clamped here: the snapshot may carry Thick-Skin hearts above the
     * base max, and relic layers re-apply after restore — clamping first
     * would eat a heart the player owns.
     */
    static restore(
        snap: RunSnapshot,
        tuning: TuningStack,
        clock: () => number,
        emit: RunEmit,
    ): RunState {
        if (snap.version !== RUN_SCHEMA_VERSION) {
            throw new Error(
                `run: snapshot schema ${snap.version} != supported ${RUN_SCHEMA_VERSION}`,
            );
        }
        const run = new RunState({ seed: snap.seed }, tuning, clock, emit);
        run.actIndex = snap.actIndex;
        run.nodeId = snap.nodeId;
        run.path = [...snap.path];
        run._hearts = snap.hearts;
        run._coins = snap.coins;
        run.relics = [...snap.relics];
        run._stumbleCharges = snap.stumbleCharges;
        run._heartsBought = snap.heartsBought;
        return run;
    }

    snapshot(): RunSnapshot {
        return {
            version: RUN_SCHEMA_VERSION,
            seed: this.seed,
            actIndex: this.actIndex,
            nodeId: this.nodeId,
            path: [...this.path],
            hearts: this._hearts,
            coins: this._coins,
            relics: [...this.relics],
            stumbleCharges: this._stumbleCharges,
            heartsBought: this._heartsBought,
        };
    }

    // --- Reads ---

    get runSeed(): number {
        return this.seed;
    }

    get act(): number {
        return this.actIndex;
    }

    get coins(): number {
        return this._coins;
    }

    get hearts(): number {
        return this._hearts;
    }

    get stumbleCharges(): number {
        return this._stumbleCharges;
    }

    get heartsBought(): number {
        return this._heartsBought;
    }

    relicIds(): readonly string[] {
        return this.relics;
    }

    owns(relicId: string): boolean {
        return this.relics.includes(relicId);
    }

    // --- HeartsPort (PressureRuntime's narrow consumption surface) ---

    heartsRemaining(): number {
        return this._hearts;
    }

    heartsMax(): number {
        return this.t.value('hearts.max');
    }

    /** Spend one heart; returns hearts remaining. The emitter of
     *  `run/heart_lost` is PressureRuntime (see module doc). */
    loseHeart(): number {
        if (this._hearts <= 0) {
            throw new Error('run: loseHeart at zero hearts — the run already ended');
        }
        this._hearts -= 1;
        return this._hearts;
    }

    // --- Typed commands (each emits its event) ---

    /** Gain one heart, clamped at the resolved hearts.max. Returns whether
     *  a heart was actually gained (full hearts refuse silently is a lie —
     *  the boolean is the caller's truth). */
    gainHeart(source: string): boolean {
        if (this._hearts >= this.heartsMax()) {
            return false;
        }
        this._hearts += 1;
        this.emit({
            type: 'run/heart_gained',
            tick: this.clock(),
            source,
            heartsNow: this._hearts,
        });
        return true;
    }

    /** Record an acquisition (the caller has already pushed the layers and
     *  attached the triggers — see RelicEffects.grantRelic). */
    acquireRelic(relic: RelicDef, source: RelicSource, layersPushed: number): void {
        if (this.owns(relic.id)) {
            throw new Error(
                `run: relic "${relic.id}" already owned — the roster has no duplicates`,
            );
        }
        this.relics.push(relic.id);
        // Stumble charges are the one build stat the doc names in RunState:
        // derived from the relic's own layer data, one truth path.
        for (const layer of relic.layers) {
            if (layer.key === 'combo.stumblesAllowed' && layer.op === 'add') {
                this._stumbleCharges += layer.value;
            }
        }
        this.emit({
            type: 'relic/acquired',
            tick: this.clock(),
            relicId: relic.id,
            rarity: relic.rarity,
            source,
            layersPushed,
        });
    }

    addCoins(value: number, magnetized: boolean): void {
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error(`run: addCoins(${value}) — a coin is worth something or it is a bug`);
        }
        this._coins += value;
        this.emit({
            type: 'coin/collected',
            tick: this.clock(),
            value,
            total: this._coins,
            magnetized,
        });
    }

    spendCoins(amount: number, item: string): void {
        if (amount > this._coins) {
            throw new Error(
                `run: spendCoins(${amount}) with ${this._coins} in the wallet — ` +
                    "affordability is the caller's gate, the wallet never goes negative",
            );
        }
        this._coins -= amount;
        this.emit({
            type: 'coin/spent',
            tick: this.clock(),
            amount,
            total: this._coins,
            item,
        });
    }

    /** The shop's heart purchase: one spend, one gain, one price step. */
    buyHeart(price: number): void {
        this.spendCoins(price, 'heart');
        this._heartsBought += 1;
        this.gainHeart('shop');
    }

    /** Map path bookkeeping (CHOICE's map/node_committed hands this its
     *  nodeId; the map event itself is CHOICE's to emit). */
    commitNode(nodeId: string): void {
        this.nodeId = nodeId;
        this.path.push(nodeId);
    }

    setActIndex(actIndex: number): void {
        this.actIndex = actIndex;
    }

    /** Debug-bridge wallet pin — a harness handle, deliberately eventless. */
    debugSetCoins(coins: number): void {
        if (!Number.isFinite(coins) || coins < 0) {
            throw new Error(`run: debugSetCoins(${coins})`);
        }
        this._coins = coins;
    }
}
