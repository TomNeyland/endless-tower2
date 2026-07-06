/**
 * The run loop's seams (wave-2 reconciliation of CHOICE and IDENTITY):
 * what a finished segment reports back to the orchestrator, and how the
 * map's own moments (mystery outcomes) fold into the one RunState.
 *
 * The outcome carries facts; the truth travels beside it as a RunSnapshot —
 * hearts spent to the line, coins picked up, relics bought mid-segment are
 * already IN the snapshot, so the orchestrator adopts it whole and folds
 * only what the segment could not know (run-level score totals, bounties,
 * the elite's relic).
 */
import type { SessionStats } from '../combo/types';
import { modifierById } from '../map/modifiers';
import type { MysteryEffect } from '../map/mystery';
import type { NodeSpec } from '../map/types';
import type { SegmentSpec } from '../pressure/segment';
import type { RunSnapshot, RunState } from './state';

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
 *  itself: the orchestrator hands this in via scene boot data, and the
 *  scene returns the outcome facts plus the run truth it mutated. */
export interface RunSegmentHandoff {
    onOutcome(outcome: SegmentOutcome, run: RunSnapshot): void;
}

/**
 * The committed segment spec, gifts folded in: a deep copy of the node's
 * rolled spec plus any queued gift modifiers' layers (Double Fuse) — the
 * node's own data stays pristine for regeneration and the bridge.
 */
export function specWithGifts(node: NodeSpec, giftIds: readonly string[]): SegmentSpec {
    if (node.segment === null) {
        throw new Error(`run: ${node.id} has no segment`);
    }
    const spec: SegmentSpec = {
        ...node.segment,
        difficulty: {
            profile: { ...node.segment.difficulty.profile },
            actIndex: node.segment.difficulty.actIndex,
        },
        lineProfile: node.segment.lineProfile.map((o) => ({ ...o })),
        modifiers: node.segment.modifiers.map((o) => ({ ...o })),
        loot: { ...node.segment.loot },
    };
    for (const giftId of giftIds) {
        spec.modifiers.push(...modifierById(giftId).tuningLayers.map((o) => ({ ...o })));
    }
    return spec;
}

/** Modifier ids as committed — gifts ride climbable commits only. */
export function committedModifierIds(node: NodeSpec, giftIds: readonly string[]): string[] {
    return node.segment === null ? [...node.modifierIds] : [...node.modifierIds, ...giftIds];
}

/**
 * Fold a mystery outcome into the run. Heart swings are ±1 by the mystery
 * roster's own validation, and a loss floors at 1 — a mystery never ends a
 * run (pillar 1). Gift ids are checked against the modifier roster so a
 * data typo fails loud at resolution, not at the next commit.
 */
export function applyMysteryEffect(run: RunState, effect: MysteryEffect): void {
    if (effect.coinsDelta) {
        run.adjustCoins(effect.coinsDelta);
    }
    if (effect.heartsDelta) {
        if (effect.heartsDelta > 0) {
            run.gainHeart('mystery');
        } else if (run.hearts > 1) {
            run.loseHeart();
        }
    }
    if (effect.giftModifierId) {
        modifierById(effect.giftModifierId); // throws on a data typo
        run.queueGiftModifier(effect.giftModifierId);
    }
}
