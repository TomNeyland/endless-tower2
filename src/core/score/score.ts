/**
 * Score — a SIBLING CONSUMER of the combo engine, not part of it (the frozen
 * consumer contract: score consumes `combo/banked.payout`, never engine
 * internals, and scales with payload values, never event counts).
 *
 * TOTAL = height points + combo points, one authority (`score/updated`).
 * Height pays segment high-water floors only and is deliberately small —
 * score measures run QUALITY, not run length. The flex stat is BEST CHAIN.
 * Session stats are RETURN-phase achievement vocabulary, free.
 */
import type { MovementEvent } from '../events';
import type { TuningStack } from '../tuning';
import type { BankReason, ComboEvent, ScoreEvent, SessionStats } from '../combo/types';

const TIER_COUNT = 8;

/** Deterministic thousands-separator face (no locale dependence). */
function groupDigits(n: number): string {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function multFace(mult: number): string {
    return (Math.round(mult * 100) / 100).toString();
}

export class ScoreKeeper {
    private readonly t: TuningStack;

    private heightPoints = 0;
    private comboPoints = 0;
    private highWater = 0;

    // Chain tracking (event-derived only)
    private chainActive = false;
    private chainStartFloorIndex = 0;
    private highWaterAtChainStart = 0;
    private lastJumpAssist = false;

    // Session stats accumulators
    private bestChainFloors = 0;
    private bestChainMult = 1;
    private bestChainPayout = 0;
    private bestChainFace = '';
    private longestChainLinks = 0;
    private tallestSingleLink = 0;
    private banksByReason: Record<BankReason, number> = { fizzle: 0, grace: 0, exit: 0, forced: 0 };
    private voids = 0;
    private perfectBounces = 0;
    private confirmedBounces = 0;
    private airborneBounces = 0;
    private totalTicks = 0;
    private chainTicks = 0;
    private tierHistogram: number[] = new Array(TIER_COUNT).fill(0);
    private bestLeapStreak = 0;
    private assistLinks = 0;
    private totalLinks = 0;
    private chainFloorsTotal = 0;
    private refarmedFloors = 0;

    constructor(tuning: TuningStack) {
        this.t = tuning;
    }

    handleMovement(e: MovementEvent): ScoreEvent[] {
        switch (e.type) {
            case 'movement/tick':
                this.totalTicks += 1;
                if (this.chainActive) {
                    this.chainTicks += 1;
                }
                return [];
            case 'movement/floor_crossed':
                return this.onFloorCrossed(e.tick, e.floorIndex);
            case 'movement/jump':
                // Links are assist-agnostic (generosity); the SHARE is stats.
                this.lastJumpAssist = e.wasBuffered || e.wasCoyote;
                return [];
            case 'movement/left_ground':
                if (e.reason === 'walkoff') {
                    this.lastJumpAssist = false;
                }
                return [];
            case 'movement/wall_bounce':
                if (e.airborne) {
                    this.airborneBounces += 1;
                }
                return [];
            case 'movement/spawn':
                return this.reset(e.tick);
            default:
                return [];
        }
    }

    handleCombo(e: ComboEvent): ScoreEvent[] {
        switch (e.type) {
            case 'combo/started':
                this.chainActive = true;
                this.chainStartFloorIndex = e.startFloorIndex;
                this.highWaterAtChainStart = this.highWater;
                return [];
            case 'combo/link': {
                this.totalLinks += 1;
                if (this.lastJumpAssist) {
                    this.assistLinks += 1;
                }
                this.tallestSingleLink = Math.max(this.tallestSingleLink, e.floorsGained);
                this.bestLeapStreak = Math.max(this.bestLeapStreak, e.spiceConfirmed.leapStreak);
                this.chainFloorsTotal += e.floorsGained;
                // Refarm instrumentation (the judges' split ruling: measure
                // before legislating). Floors this link covered at-or-below
                // the segment high-water as of chain start count as refarmed.
                const landingFloor = this.chainStartFloorIndex + e.chainFloors;
                const takeoffFloor = landingFloor - e.floorsGained;
                const below = this.highWaterAtChainStart - takeoffFloor;
                this.refarmedFloors += Math.max(0, Math.min(e.floorsGained, below));
                return [];
            }
            case 'combo/tier':
                this.tierHistogram[Math.min(e.tierIndex, TIER_COUNT - 1)] += 1;
                return [];
            case 'combo/banked':
                return this.onBanked(e);
            case 'combo/voided': {
                this.chainActive = false;
                this.voids += 1;
                if (e.refundPaid <= 0) {
                    return [];
                }
                this.comboPoints += e.refundPaid;
                return [this.updated(e.tick, e.refundPaid, 'refund')];
            }
            default:
                return [];
        }
    }

    /** The full stat block — emitted at segment end and run end. */
    finalize(tick: number): ScoreEvent[] {
        return [{ type: 'score/session_final', tick, stats: this.sessionStats() }];
    }

    totalScore(): number {
        return this.heightPoints + this.comboPoints;
    }

    sessionStats(): SessionStats {
        return {
            bestChainFloors: this.bestChainFloors,
            bestChainMult: this.bestChainMult,
            bestChainPayout: this.bestChainPayout,
            bestChainFace: this.bestChainFace,
            longestChainLinks: this.longestChainLinks,
            tallestSingleLink: this.tallestSingleLink,
            totalScore: this.totalScore(),
            heightPoints: this.heightPoints,
            comboPoints: this.comboPoints,
            banksByReason: { ...this.banksByReason },
            voids: this.voids,
            perfectBounces: this.perfectBounces,
            bounceEfficiency:
                this.airborneBounces > 0 ? this.confirmedBounces / this.airborneBounces : 0,
            comboUptime: this.totalTicks > 0 ? this.chainTicks / this.totalTicks : 0,
            tierHistogram: [...this.tierHistogram],
            bestLeapStreak: this.bestLeapStreak,
            assistShareInChains: this.totalLinks > 0 ? this.assistLinks / this.totalLinks : 0,
            refarmedFloorShare:
                this.chainFloorsTotal > 0 ? this.refarmedFloors / this.chainFloorsTotal : 0,
        };
    }

    private onFloorCrossed(tick: number, floorIndex: number): ScoreEvent[] {
        // Height re-grinding refuses itself: high-water floors pay once, ever.
        if (floorIndex <= this.highWater) {
            return [];
        }
        this.highWater = floorIndex;
        const awarded = this.t.value('score.heightPointsPerFloor');
        this.heightPoints += awarded;
        return [
            {
                type: 'score/height',
                tick,
                floorIndex,
                pointsAwarded: awarded,
                total: this.heightPoints,
            },
            this.updated(tick, awarded, 'height'),
        ];
    }

    private onBanked(e: Extract<ComboEvent, { type: 'combo/banked' }>): ScoreEvent[] {
        this.chainActive = false;
        this.banksByReason[e.reason] += 1;
        this.longestChainLinks = Math.max(this.longestChainLinks, e.links);
        this.perfectBounces += e.spiceTotals.perfects;
        this.confirmedBounces += e.spiceTotals.bounces;
        if (e.payout > this.bestChainPayout) {
            this.bestChainFloors = e.chainFloors;
            this.bestChainMult = e.mult;
            this.bestChainPayout = e.payout;
            // The screenshot line: "31 FLOORS ×4.75 — 45,648".
            this.bestChainFace = `${e.chainFloors} FLOORS ×${multFace(e.mult)} — ${groupDigits(e.payout)}`;
        }
        this.comboPoints += e.payout;
        return [this.updated(e.tick, e.payout, 'banked')];
    }

    private updated(
        tick: number,
        delta: number,
        source: 'height' | 'banked' | 'refund' | 'reset',
    ): ScoreEvent {
        return {
            type: 'score/updated',
            tick,
            totalScore: this.totalScore(),
            heightPoints: this.heightPoints,
            comboPoints: this.comboPoints,
            delta,
            source,
        };
    }

    private reset(tick: number): ScoreEvent[] {
        this.heightPoints = 0;
        this.comboPoints = 0;
        this.highWater = 0;
        this.chainActive = false;
        this.chainStartFloorIndex = 0;
        this.highWaterAtChainStart = 0;
        this.lastJumpAssist = false;
        this.bestChainFloors = 0;
        this.bestChainMult = 1;
        this.bestChainPayout = 0;
        this.bestChainFace = '';
        this.longestChainLinks = 0;
        this.tallestSingleLink = 0;
        this.banksByReason = { fizzle: 0, grace: 0, exit: 0, forced: 0 };
        this.voids = 0;
        this.perfectBounces = 0;
        this.confirmedBounces = 0;
        this.airborneBounces = 0;
        this.totalTicks = 0;
        this.chainTicks = 0;
        this.tierHistogram = new Array(TIER_COUNT).fill(0);
        this.bestLeapStreak = 0;
        this.assistLinks = 0;
        this.totalLinks = 0;
        this.chainFloorsTotal = 0;
        this.refarmedFloors = 0;
        return [this.updated(tick, 0, 'reset')];
    }
}
