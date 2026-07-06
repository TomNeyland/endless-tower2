/**
 * The meta tracker — one per run, owned by the RunOrchestrator. It watches
 * the run through the vocabularies that already exist (segment scene buses,
 * segment outcomes, act completions), runs the deterministic FeatEngine over
 * them, records fired feats + grants on the save (in memory — the ONE write
 * happens at the run-end commit), and folds the run's RunRecord for the
 * lifetime stats.
 *
 * Announcement discipline (the celebration budget): feats FIRE the moment
 * their condition is met, but the unlock MOMENTS are presented at run end by
 * the ResultsScene — mid-climb, the tower is the show.
 */
import type { ComboBus } from '../../core/combo/bus';
import type { AnyComboEvent } from '../../core/combo/types';
import type { EventBus, MovementEvent } from '../../core/events';
import { featById, FeatEngine, type FeatFire } from '../../core/meta/feats';
import { TIER_HISTOGRAM_SIZE, type RunRecord } from '../../core/meta/stats';
import { grantForFeat, type UnlockGrant } from '../../core/meta/unlocks';
import type { SegmentOutcome } from '../../core/run/loop';
import type { RunSnapshot } from '../../core/run/state';
import type { SaveStore } from './SaveStore';

/** The narrow face a segment scene sees — attach/detach, nothing else. */
export interface MetaFeed {
    attachSegment(bus: EventBus, comboBus: ComboBus): void;
    detachSegment(): void;
}

/** One fired feat, ready for the results scene's unlock moment. */
export interface FeatFireRecord {
    featId: string;
    name: string;
    blurb: string;
    trigger: string;
    grant: UnlockGrant | null;
}

/** What the run-end flow consumes: the folded record + the moments. */
export interface RunResultsData {
    record: RunRecord;
    fires: FeatFireRecord[];
}

export class MetaTracker implements MetaFeed {
    private readonly store: SaveStore;
    private readonly engine: FeatEngine;
    private readonly fires: FeatFireRecord[] = [];

    private bus: EventBus | null = null;
    private comboBus: ComboBus | null = null;

    // Run aggregates (folded from outcomes — facts the segments reported).
    private floors = 0;
    private ticks = 0;
    private segments = 0;
    private heartsLost = 0;
    private banks = 0;
    private voids = 0;
    private perfectBounces = 0;
    private tierHistogram: number[] = new Array(TIER_HISTOGRAM_SIZE).fill(0);
    private bestChainFloors = 0;
    private bestChainMult = 0;
    private bestChainPayout = 0;
    private bestChainFace = '';
    private actsCompleted = 0;
    private actTicks = 0;
    private fastestActTicks: number | null = null;

    private readonly onMovement = (event: MovementEvent): void => {
        this.record(this.engine.handleMovement(event));
    };

    private readonly onCombo = (event: AnyComboEvent): void => {
        this.record(this.engine.handleCombo(event));
    };

    constructor(store: SaveStore) {
        this.store = store;
        this.engine = new FeatEngine(store.doc.unlocks.feats);
    }

    // --- MetaFeed (the segment scene's two calls) ---

    attachSegment(bus: EventBus, comboBus: ComboBus): void {
        this.detachSegment();
        this.bus = bus;
        this.comboBus = comboBus;
        bus.onAny(this.onMovement);
        comboBus.onAny(this.onCombo);
    }

    detachSegment(): void {
        this.bus?.offAny(this.onMovement);
        this.comboBus?.offAny(this.onCombo);
        this.bus = null;
        this.comboBus = null;
    }

    // --- Orchestrator notes (facts the buses cannot carry) ---

    /** Fold a finished segment's outcome into the run aggregates. */
    noteOutcome(outcome: SegmentOutcome): void {
        const stats = outcome.stats;
        this.floors += outcome.floorsClimbed;
        this.ticks += outcome.timeTicks;
        this.actTicks += outcome.timeTicks;
        this.segments += 1;
        this.heartsLost += outcome.heartsLost;
        this.banks += Object.values(stats.banksByReason).reduce((a, b) => a + b, 0);
        this.voids += stats.voids;
        this.perfectBounces += stats.perfectBounces;
        this.tierHistogram = this.tierHistogram.map((n, i) => n + (stats.tierHistogram[i] ?? 0));
        if (stats.bestChainPayout > this.bestChainPayout) {
            this.bestChainFloors = stats.bestChainFloors;
            this.bestChainMult = stats.bestChainMult;
            this.bestChainPayout = stats.bestChainPayout;
            this.bestChainFace = stats.bestChainFace;
        }
    }

    /** An act is done (boss cleared): evaluate act-scope feats, fold pace. */
    noteActCompleted(actIndex: number): void {
        this.record(this.engine.handleActCompleted(actIndex));
        this.actsCompleted += 1;
        this.fastestActTicks =
            this.fastestActTicks === null
                ? this.actTicks
                : Math.min(this.fastestActTicks, this.actTicks);
        this.actTicks = 0;
    }

    /** A heart lost outside the movement stream (mystery outcomes). */
    noteMysteryHeartLoss(): void {
        this.engine.noteHeartLoss();
        this.heartsLost += 1;
    }

    /** Fold the finished run. The caller (orchestrator) hands the result to
     *  SaveStore.commitRunEnd and the ResultsScene, in that order. */
    finish(reason: RunRecord['reason'], snap: RunSnapshot): RunResultsData {
        this.detachSegment();
        const record: RunRecord = {
            seed: snap.seed,
            characterId: snap.characterId,
            reason,
            totalScore: snap.totalScore,
            coins: snap.coins,
            floorsClimbed: this.floors,
            timeTicks: this.ticks,
            segments: this.segments,
            actsCompleted: this.actsCompleted,
            fastestActTicks: this.fastestActTicks,
            bestChainFloors: this.bestChainFloors,
            bestChainMult: this.bestChainMult,
            bestChainPayout: this.bestChainPayout,
            bestChainFace: this.bestChainFace,
            banks: this.banks,
            voids: this.voids,
            perfectBounces: this.perfectBounces,
            heartsLost: this.heartsLost,
            tierHistogram: [...this.tierHistogram],
        };
        return { record, fires: [...this.fires] };
    }

    /** Relic ids unlocked this run — the shop's NEW-stamp window. */
    relicsUnlockedThisRun(): string[] {
        return this.fires
            .filter((f) => f.grant !== null && f.grant.kind === 'relic')
            .map((f) => (f.grant as UnlockGrant).id);
    }

    private record(fired: FeatFire[]): void {
        for (const fire of fired) {
            const feat = featById(fire.featId);
            const grant = grantForFeat(fire.featId);
            this.store.recordFeat(fire.featId, fire.trigger, grant);
            this.fires.push({
                featId: feat.id,
                name: feat.name,
                blurb: feat.blurb,
                trigger: fire.trigger,
                grant,
            });
        }
    }
}
