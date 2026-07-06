/**
 * The CHOICE-phase run-state holder — DELIBERATELY MINIMAL, and clearly
 * marked for the integrator: IDENTITY is building the real RunState in
 * parallel (relics, economy, powerups). This structure carries only what
 * the map loop needs today: the seed, the position in the run, and the
 * passthrough currencies. Reconcile by absorbing these fields, not by
 * keeping both holders alive.
 */
import type { SessionStats } from '../combo/types';

export interface MapRunState {
    seed: string;
    /** 1-based act index. */
    act: number;
    /** Current committed node; null before the act's first commit. */
    nodeId: string | null;
    /** Every committed node id, all acts, in order. */
    path: string[];
    /** Coin passthrough until IDENTITY's economy owns it. */
    coins: number;
    /** Hearts carried between segments; null = fresh (hearts.start). */
    hearts: number | null;
    /** Score accumulated across segments (score stays segment-authoritative;
     *  this is the run-level sum of session finals). */
    totalScore: number;
    /** Best chain across the run — the flex stat, folded from session stats. */
    bestChainFace: string;
    bestChainPayout: number;
    /** Relic IOUs (node ids that promised one) — IDENTITY passthrough. */
    relicsOwed: string[];
    /** Mystery gifts folded into the next climbable commit. */
    pendingModifierIds: string[];
}

export function createRunState(seed: string): MapRunState {
    return {
        seed,
        act: 1,
        nodeId: null,
        path: [],
        coins: 0,
        hearts: null,
        totalScore: 0,
        bestChainFace: '',
        bestChainPayout: 0,
        relicsOwed: [],
        pendingModifierIds: [],
    };
}

/** What a finished segment reports back to the run loop. */
export interface SegmentOutcome {
    kind: 'exit' | 'death_line';
    floorsClimbed: number;
    timeTicks: number;
    heartsLost: number;
    heartsRemaining: number;
    stats: SessionStats;
}

/** The one seam the Sandbox scene needs to serve a run instead of looping
 *  itself: the orchestrator hands this in via scene boot data. */
export interface RunSegmentHandoff {
    onOutcome(outcome: SegmentOutcome): void;
}

/** Fold a segment's outcome into the run state (pure; the orchestrator's
 *  one bookkeeping step). Returns the coins earned for the toast. */
export function applySegmentOutcome(
    state: MapRunState,
    outcome: SegmentOutcome,
    clearBounty: number,
    coinsMul: number,
): number {
    state.totalScore += outcome.stats.totalScore;
    if (outcome.stats.bestChainPayout > state.bestChainPayout) {
        state.bestChainPayout = outcome.stats.bestChainPayout;
        state.bestChainFace = outcome.stats.bestChainFace;
    }
    if (outcome.kind !== 'exit') {
        return 0;
    }
    state.hearts = outcome.heartsRemaining;
    const coinsEarned = Math.round(clearBounty * coinsMul);
    state.coins += coinsEarned;
    return coinsEarned;
}
