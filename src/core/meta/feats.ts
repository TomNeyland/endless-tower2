/**
 * Feats — the achievement conditions that drive every unlock
 * (docs/design/meta-progression.md). Conditions are DATA over the existing
 * event/stat vocabulary (movement/combo events + score/session_final's stat
 * block — RETURN adds no new instrumentation to other systems), interpreted
 * by a small deterministic engine. A feat fires ONCE EVER: the earned set is
 * seeded from the save and grows monotonically.
 *
 * Thresholds are data and tuned late: the acceptance target is roughly one
 * character unlock per run across a player's first runs (playthrough-trace
 * finding 14) — if all five land in run 2, the breadth story collapses.
 */
import type { AnyComboEvent, SessionStats } from '../combo/types';
import type { MovementEvent } from '../events';

/** The closed condition grammar — exactly the shapes the roster needs. */
export type FeatCondition =
    /** A chain BANKED at or above a ladder tier index (combo/banked). */
    | { kind: 'bank-tier'; minTier: number }
    /** A chain banked with a multiplier at or above a floor. */
    | { kind: 'bank-mult'; min: number }
    /** A chain banked with at least N confirmed bounces in its spice. */
    | { kind: 'bank-bounces'; min: number }
    /** A session stat block crossing a floor (score/session_final). */
    | { kind: 'session-stat'; stat: NumericSessionStat; min: number }
    /** N wall bounces inside one segment (movement/wall_bounce, counted). */
    | { kind: 'segment-bounces'; count: number }
    /** A segment exited after losing at least N hearts inside it. */
    | { kind: 'segment-hearts-lost'; min: number }
    /** The speed ceiling entered (movement/ceiling, state 'entered'). */
    | { kind: 'ceiling' }
    /** An act completed with zero hearts lost anywhere inside it. */
    | { kind: 'clean-act' }
    /** An act completed, by index — the modifier-pool unlock cadence. */
    | { kind: 'act-completed'; actIndex: number };

/** Session stats a feat may gate on — numeric fields only, by construction. */
export type NumericSessionStat =
    | 'comboUptime'
    | 'tallestSingleLink'
    | 'perfectBounces'
    | 'bestChainFloors'
    | 'bestChainMult'
    | 'bestChainPayout'
    | 'longestChainLinks'
    | 'bestLeapStreak';

export interface FeatSpec {
    id: string;
    /** Display name for the unlock card. */
    name: string;
    /** The condition as a player-facing sentence ("bank a COMET chain"). */
    blurb: string;
    condition: FeatCondition;
}

/**
 * The roster: the doc's character feats verbatim, the relic-unlock feats
 * (each earned by approaching what its relic amplifies — the tools of
 * brokenness are earned by approaching brokenness), and the three act
 * completions that grow the modifier pool.
 */
export const FEATS: readonly FeatSpec[] = [
    // --- Character feats (meta-progression.md, verbatim) ---
    {
        id: 'bank-comet',
        name: 'COMET',
        blurb: 'bank a COMET chain',
        condition: { kind: 'bank-tier', minTier: 5 },
    },
    {
        id: 'bounce-25-segment',
        name: 'PINBALL',
        blurb: '25 wall bounces in one segment',
        condition: { kind: 'segment-bounces', count: 25 },
    },
    {
        id: 'clean-act',
        name: 'UNTOUCHED',
        blurb: 'finish an act without losing a heart',
        condition: { kind: 'clean-act' },
    },
    {
        id: 'touch-ceiling',
        name: 'TERMINAL',
        blurb: 'touch the speed ceiling in a run',
        condition: { kind: 'ceiling' },
    },
    // --- Relic-unlock feats ---
    {
        id: 'bank-supernova',
        name: 'SUPERNOVA',
        blurb: 'bank a SUPERNOVA chain',
        condition: { kind: 'bank-tier', minTier: 6 },
    },
    {
        id: 'bank-meteoric',
        name: 'METEORIC',
        blurb: 'bank a METEORIC chain',
        condition: { kind: 'bank-tier', minTier: 4 },
    },
    {
        id: 'uptime-half',
        name: 'PERPETUAL',
        blurb: 'hold a live chain half of a whole segment',
        condition: { kind: 'session-stat', stat: 'comboUptime', min: 0.5 },
    },
    {
        id: 'perfect-five',
        name: 'CLEAN HANDS',
        blurb: 'five perfect bounces in one segment',
        condition: { kind: 'session-stat', stat: 'perfectBounces', min: 5 },
    },
    {
        id: 'leap-six',
        name: 'SKYWARD',
        blurb: 'climb six floors in a single leap',
        condition: { kind: 'session-stat', stat: 'tallestSingleLink', min: 6 },
    },
    {
        id: 'mult-three',
        name: 'STYLIST',
        blurb: 'bank a chain at ×3 or better',
        condition: { kind: 'bank-mult', min: 3 },
    },
    {
        id: 'deep-drink',
        name: 'ECHO',
        blurb: 'bank eight wall bounces in one chain',
        condition: { kind: 'bank-bounces', min: 8 },
    },
    {
        id: 'hard-way-out',
        name: 'SURVIVOR',
        blurb: 'finish a climb after two catches inside it',
        condition: { kind: 'segment-hearts-lost', min: 2 },
    },
    // --- Act completions (modifier pool growth) ---
    {
        id: 'act1-complete',
        name: 'ASCENT',
        blurb: 'complete act 1',
        condition: { kind: 'act-completed', actIndex: 1 },
    },
    {
        id: 'act2-complete',
        name: 'UPDRAFT',
        blurb: 'complete act 2',
        condition: { kind: 'act-completed', actIndex: 2 },
    },
    {
        id: 'act3-complete',
        name: 'SUMMIT',
        blurb: 'reach the summit',
        condition: { kind: 'act-completed', actIndex: 3 },
    },
] as const;

const FEATS_BY_ID = new Map(FEATS.map((f) => [f.id, f]));

export function featById(id: string): FeatSpec {
    const feat = FEATS_BY_ID.get(id);
    if (!feat) {
        throw new Error(`feats: unknown feat id "${id}"`);
    }
    return feat;
}

/** One firing: the feat plus the stat reference that tripped it (the
 *  `meta/feat` payload's trigger column). */
export interface FeatFire {
    featId: string;
    trigger: string;
}

/**
 * The deterministic feat engine: a pure function of its input sequence.
 * Scoped counters (segment bounces, act heart losses) reset on the same
 * events that define the scopes; the earned set makes every feat fire once
 * ever across the save's lifetime.
 */
export class FeatEngine {
    private readonly earned: Set<string>;
    private segmentBounces = 0;
    private heartsLostThisAct = 0;

    constructor(alreadyEarned: Iterable<string>) {
        this.earned = new Set(alreadyEarned);
    }

    earnedIds(): readonly string[] {
        return [...this.earned];
    }

    /** Movement-bus facts: bounce counting, ceiling, heart/segment scopes. */
    handleMovement(e: MovementEvent): FeatFire[] {
        switch (e.type) {
            case 'run/segment_start':
                this.segmentBounces = 0;
                return [];
            case 'movement/wall_bounce': {
                this.segmentBounces += 1;
                return this.fireMatching(
                    (c) => c.kind === 'segment-bounces' && this.segmentBounces >= c.count,
                    `movement/wall_bounce.count=${this.segmentBounces}`,
                );
            }
            case 'movement/ceiling':
                if (e.state !== 'entered') {
                    return [];
                }
                return this.fireMatching((c) => c.kind === 'ceiling', 'movement/ceiling.entered');
            case 'run/heart_lost':
                this.heartsLostThisAct += 1;
                return [];
            case 'run/segment_end':
                return this.fireMatching(
                    (c) => c.kind === 'segment-hearts-lost' && e.heartsLost >= c.min,
                    `run/segment_end.heartsLost=${e.heartsLost}`,
                );
            default:
                return [];
        }
    }

    /** Combo-bus facts: banks and the session stat block. */
    handleCombo(e: AnyComboEvent): FeatFire[] {
        if (e.type === 'combo/banked') {
            return this.fireMatching(
                (c) =>
                    (c.kind === 'bank-tier' && e.tierReached >= c.minTier) ||
                    (c.kind === 'bank-mult' && e.mult >= c.min) ||
                    (c.kind === 'bank-bounces' && e.spiceTotals.bounces >= c.min),
                `combo/banked.tier=${e.tierReached},mult=${e.mult},bounces=${e.spiceTotals.bounces}`,
            );
        }
        if (e.type === 'score/session_final') {
            return this.handleSessionStats(e.stats);
        }
        return [];
    }

    /** The stat-block face — also the harness's synthetic entry point. */
    handleSessionStats(stats: SessionStats): FeatFire[] {
        return this.fireMatching(
            (c) => c.kind === 'session-stat' && stats[c.stat] >= c.min,
            (feat) => {
                const c = feat.condition as Extract<FeatCondition, { kind: 'session-stat' }>;
                return `session.${c.stat}=${stats[c.stat]}`;
            },
        );
    }

    /** A heart lost outside the movement stream (mystery outcomes). */
    noteHeartLoss(): void {
        this.heartsLostThisAct += 1;
    }

    /** Act boundary: evaluates clean-act + act-completed, resets the scope. */
    handleActCompleted(actIndex: number): FeatFire[] {
        const heartsLost = this.heartsLostThisAct;
        const fires = this.fireMatching(
            (c) =>
                (c.kind === 'clean-act' && heartsLost === 0) ||
                (c.kind === 'act-completed' && c.actIndex === actIndex),
            `run/act_completed.actIndex=${actIndex},heartsLost=${heartsLost}`,
        );
        this.heartsLostThisAct = 0;
        return fires;
    }

    private fireMatching(
        match: (condition: FeatCondition, feat: FeatSpec) => boolean,
        trigger: string | ((feat: FeatSpec) => string),
    ): FeatFire[] {
        const fires: FeatFire[] = [];
        for (const feat of FEATS) {
            if (this.earned.has(feat.id) || !match(feat.condition, feat)) {
                continue;
            }
            this.earned.add(feat.id);
            fires.push({
                featId: feat.id,
                trigger: typeof trigger === 'string' ? trigger : trigger(feat),
            });
        }
        return fires;
    }
}
