/**
 * RunState — the single source of run truth (docs/design/relics-economy.md).
 * Engine-free, serializable (save/continue and seed-sharing ride on this),
 * mutated only through typed commands, each emitting its event on the
 * game-wide bus.
 *
 * CHOICE's MapRunState was absorbed here at the wave-2 integration (its own
 * header demanded exactly that): the map position (act/node/path), the
 * wallet, the run-level score fold, and the mystery gift queue live on the
 * same holder the segment loop spends from — one authority per number.
 * Between scenes the truth travels as a RunSnapshot: the orchestrator's
 * RunHost owns the live instance on the map, a Sandbox scene restores its
 * own for play and returns the new truth with the segment outcome. One live
 * authority per moment, never two.
 *
 * Heart ownership, reconciled: PRESSURE's run-scoped HeartsState is absorbed
 * here — PressureRuntime consumes hearts through the narrow HeartsPort
 * (core/pressure/segment.ts), which RunState implements structurally. One
 * exception to command-emits-its-event: `loseHeart` emits nothing, because
 * `run/heart_lost` is PressureRuntime's event — it holds the kinematic facts
 * (gapAtCatch, catchFloorIndex) a wallet cannot know. One moment, one
 * authority. `adjustCoins` and `foldSegmentStats` follow the same precedent:
 * they are the map loop's bookkeeping, and the map's own surfaces (mystery
 * text, results toast, map event ring) carry those moments — coin/collected
 * and coin/spent stay pickup/purchase facts per the design's event table.
 *
 * `stumbleCharges` mirrors the build's granted fizzle-forgiveness (the combo
 * engine reads the real allowance from `combo.stumblesAllowed` tuning); it
 * is derived at acquisition from the relic's own layers so the snapshot
 * stays one command away from the truth, never a second bookkeeper.
 */
import type { SessionStats } from '../combo/types';
import type { MovementEvent, RelicSource } from '../events';
import type { RelicDef } from '../relics/types';
import type { TuningStack } from '../tuning';

/** v2 (RETURN): the snapshot learned its character — same seed + same
 *  character = same run offer, so the character is run truth, not scenery. */
export const RUN_SCHEMA_VERSION = 2;

/** The serializable face — plain data, JSON round-trippable. */
export interface RunSnapshot {
    version: number;
    /** The shareable run seed — every stream forks from it by label. */
    seed: string;
    /** The character this run is played as (RETURN); default 'beige'. The
     *  character's tuning layers are re-applied by whoever restores the
     *  snapshot, exactly like relic layers. */
    characterId: string;
    /** 1-based act index. */
    actIndex: number;
    /** Current committed node; null before the act's first commit. */
    nodeId: string | null;
    /** Node ids committed so far, all acts, in order. */
    path: string[];
    hearts: number;
    coins: number;
    /** Relic ids in acquisition order — acquisition order IS fold order. */
    relics: string[];
    stumbleCharges: number;
    /** Drives the shop's escalating heart price. */
    heartsBought: number;
    /** Score accumulated across segments (score stays segment-authoritative;
     *  this is the run-level sum of session finals). */
    totalScore: number;
    /** Best chain across the run — the flex stat, folded from session stats. */
    bestChainFace: string;
    bestChainPayout: number;
    /** Mystery gift modifiers folded into the next climbable commit. */
    pendingModifierIds: string[];
}

export type RunEmit = (event: MovementEvent) => void;

export interface RunInit {
    seed: string;
    /**
     * Hearts carried into a headless replay; null/absent = fresh (tuning
     * start). This is the session recording's channel (session-logs.md v2:
     * `heartsCarried` is a recorded run-scoped input) — live scene boots
     * carry the full RunSnapshot instead and never pass it.
     */
    heartsCarried?: number | null;
    /** The run's character (RETURN); absent = the Beige baseline. The
     *  CALLER pushes the character's layers (before construction, so a
     *  trait like Purple's hearts.max −1 shapes the starting clamp). */
    characterId?: string;
}

export class RunState {
    private readonly t: TuningStack;
    private readonly emit: RunEmit;
    private readonly clock: () => number;

    private readonly seed: string;
    private readonly _characterId: string;
    private actIndex = 1;
    private _nodeId: string | null = null;
    private path: string[] = [];
    private _hearts: number;
    private _coins = 0;
    private relics: string[] = [];
    private _stumbleCharges = 0;
    private _heartsBought = 0;
    private _totalScore = 0;
    private _bestChainFace = '';
    private _bestChainPayout = 0;
    private pendingModifierIds: string[] = [];

    constructor(init: RunInit, tuning: TuningStack, clock: () => number, emit: RunEmit) {
        this.t = tuning;
        this.emit = emit;
        this.clock = clock;
        this.seed = init.seed;
        this._characterId = init.characterId ?? 'beige';
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
        const run = new RunState(
            { seed: snap.seed, characterId: snap.characterId },
            tuning,
            clock,
            emit,
        );
        run.actIndex = snap.actIndex;
        run._nodeId = snap.nodeId;
        run.path = [...snap.path];
        run._hearts = snap.hearts;
        run._coins = snap.coins;
        run.relics = [...snap.relics];
        run._stumbleCharges = snap.stumbleCharges;
        run._heartsBought = snap.heartsBought;
        run._totalScore = snap.totalScore;
        run._bestChainFace = snap.bestChainFace;
        run._bestChainPayout = snap.bestChainPayout;
        run.pendingModifierIds = [...snap.pendingModifierIds];
        return run;
    }

    snapshot(): RunSnapshot {
        return {
            version: RUN_SCHEMA_VERSION,
            seed: this.seed,
            characterId: this._characterId,
            actIndex: this.actIndex,
            nodeId: this._nodeId,
            path: [...this.path],
            hearts: this._hearts,
            coins: this._coins,
            relics: [...this.relics],
            stumbleCharges: this._stumbleCharges,
            heartsBought: this._heartsBought,
            totalScore: this._totalScore,
            bestChainFace: this._bestChainFace,
            bestChainPayout: this._bestChainPayout,
            pendingModifierIds: [...this.pendingModifierIds],
        };
    }

    // --- Reads ---

    get runSeed(): string {
        return this.seed;
    }

    get characterId(): string {
        return this._characterId;
    }

    get act(): number {
        return this.actIndex;
    }

    get nodeId(): string | null {
        return this._nodeId;
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

    get totalScore(): number {
        return this._totalScore;
    }

    pathIds(): readonly string[] {
        return this.path;
    }

    relicIds(): readonly string[] {
        return this.relics;
    }

    owns(relicId: string): boolean {
        return this.relics.includes(relicId);
    }

    pendingGiftIds(): readonly string[] {
        return this.pendingModifierIds;
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

    // --- Typed commands (each emits its event; exceptions in module doc) ---

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
     *  attached the triggers — see RelicEffects.grantRelic / RunHost). */
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

    /**
     * Map-loop wallet bookkeeping: mystery outcomes and clear bounties.
     * Underflow throws exactly like spendCoins: mystery choices are
     * stake-gated before the roll (choiceCoinStake — the overlay disables
     * what the wallet cannot cover, the orchestrator backstops), so every
     * printed coin figure charges in full and a negative wallet is a wiring
     * bug, never mercy. Eventless like loseHeart: the mystery text and the
     * results toast carry the moment.
     */
    adjustCoins(delta: number): number {
        if (!Number.isFinite(delta)) {
            throw new Error(`run: adjustCoins(${delta})`);
        }
        if (this._coins + delta < 0) {
            throw new Error(
                `run: adjustCoins(${delta}) with ${this._coins} in the wallet — ` +
                    'stakes are gated before the roll, the wallet never goes negative',
            );
        }
        this._coins += delta;
        return this._coins;
    }

    /** The shop's heart purchase: one spend, one gain, one price step. */
    buyHeart(price: number): void {
        this.spendCoins(price, 'heart');
        this._heartsBought += 1;
        this.gainHeart('shop');
    }

    /** Fold a finished segment's session stats into the run totals.
     *  Eventless: `run/act_completed` and the toast carry the moment. */
    foldSegmentStats(stats: SessionStats): void {
        this._totalScore += stats.totalScore;
        if (stats.bestChainPayout > this._bestChainPayout) {
            this._bestChainPayout = stats.bestChainPayout;
            this._bestChainFace = stats.bestChainFace;
        }
    }

    /** Queue a mystery's gift modifier for the next climbable commit. The
     *  id is validated by the caller against the modifier roster. */
    queueGiftModifier(modifierId: string): void {
        this.pendingModifierIds.push(modifierId);
    }

    /** Drain the gift queue (segment launch folded them into the spec). */
    drainGiftModifiers(): string[] {
        const drained = this.pendingModifierIds;
        this.pendingModifierIds = [];
        return drained;
    }

    /** Map path bookkeeping (CHOICE's map/node_committed hands this its
     *  nodeId; the map event itself is CHOICE's to emit). */
    commitNode(nodeId: string): void {
        this._nodeId = nodeId;
        this.path.push(nodeId);
    }

    /** Enter an act: position resets to the new map's foot. */
    beginAct(actIndex: number): void {
        if (!Number.isInteger(actIndex) || actIndex < 1) {
            throw new Error(`run: beginAct(${actIndex})`);
        }
        this.actIndex = actIndex;
        this._nodeId = null;
    }

    /** Debug-bridge wallet pin — a harness handle, deliberately eventless. */
    debugSetCoins(coins: number): void {
        if (!Number.isFinite(coins) || coins < 0) {
            throw new Error(`run: debugSetCoins(${coins})`);
        }
        this._coins = coins;
    }
}
