/**
 * The combo engine: the four-state machine from combo-scoring.md, exactly.
 * Event-fed (`handle`) and stepped at 60Hz (`step`); pure function of
 * (event sequence, ticks, tuning history) — no wall-clock, no RNG.
 *
 * NO CLOCK, NO FARM: only landings pay; landings pay only via floors
 * actually climbed; style is escrowed mid-air and confirmed only when a
 * landing proves the climb. While airborne, nothing can break a chain —
 * air is sacred. The one window is grounded time: the visible fuse.
 *
 * Tripwires (must read 0 forever): comboAltDrift (grounded-belief
 * alternation drift vs movement's events), negativePayout (pricing
 * produced a negative integer), floorGridDrift (land.floorsGained !==
 * land.floorIndex - left_ground.floorIndex — graft #4's invariant).
 */
import type { CeilingEvent, LandEvent, MovementEvent, WallBounceEvent } from '../events';
import type { TuningStack } from '../tuning';
import { highestCrossing, ladderFloors, tierName } from './ladder';
import {
    basePoints,
    bounceProvisionalDelta,
    confirmLink,
    isComboPerfect,
    ledgerProvisionalTotal,
    payoutOf,
    zeroTotals,
} from './spice';
import {
    type BankReason,
    type ChainCore,
    type ChainState,
    type ComboEvent,
    emptyLedger,
    type RunSignal,
    type SpiceLedger,
} from './types';

export interface ComboTripwires {
    comboAltDrift: number;
    negativePayout: number;
    floorGridDrift: number;
}

/** Live view for the bridge/harness — never a payout surface. */
export interface ChainSummary {
    kind: ChainState['kind'];
    chainId: number | null;
    chainFloors: number;
    links: number;
    mult: number;
    tierReached: number;
    graceDeadlineTick: number | null;
}

export class ComboEngine {
    private readonly t: TuningStack;
    private state: ChainState;
    private nextChainId = 1;
    /** One-air-inert after void (graft #1): consumed by the next left_ground. */
    private pendingInert = false;
    private counters: ComboTripwires = { comboAltDrift: 0, negativePayout: 0, floorGridDrift: 0 };

    constructor(tuning: TuningStack) {
        this.t = tuning;
        // Spawn is airborne (envelope grounded: false); the first landing is
        // floor 0 — a fizzle that settles into IDLE_GROUND silently.
        this.state = {
            kind: 'IDLE_AIR',
            ledger: emptyLedger(),
            inert: false,
            takeoffFloorIndex: 0,
        };
    }

    handle(event: MovementEvent | RunSignal): ComboEvent[] {
        switch (event.type) {
            case 'movement/spawn':
                return this.onSpawn(event.tick, event.floorIndex);
            case 'movement/left_ground':
                return this.onLeftGround(event.floorIndex);
            case 'movement/land':
                return this.onLand(event);
            case 'movement/wall_bounce':
                return this.onBounce(event);
            case 'movement/ceiling':
                return this.onCeiling(event);
            case 'run/heart_lost':
                return this.onHeartLost(event.tick);
            case 'run/segment_end':
                return this.onOrchestratedBank('exit', event.tick);
            case 'run/bank_now':
                // Orchestration-only, forever — never wirable to player input.
                return this.onOrchestratedBank('forced', event.tick);
            default:
                return [];
        }
    }

    /** The fuse: bank on grace when grounded time reaches the deadline. */
    step(tick: number): ComboEvent[] {
        if (this.state.kind === 'CHAIN_GROUND' && tick >= this.state.graceDeadlineTick) {
            const chain = this.state.chain;
            const events = [
                this.bankEvent(chain, 'grace', tick, chain.startFloorIndex + chain.chainFloors),
            ];
            this.state = { kind: 'IDLE_GROUND' };
            return events;
        }
        return [];
    }

    tripwires(): ComboTripwires {
        return { ...this.counters };
    }

    summary(): ChainSummary {
        const s = this.state;
        const chain = s.kind === 'CHAIN_GROUND' || s.kind === 'CHAIN_AIR' ? s.chain : null;
        return {
            kind: s.kind,
            chainId: chain?.chainId ?? null,
            chainFloors: chain?.chainFloors ?? 0,
            links: chain?.links ?? 0,
            mult: chain?.mult ?? 1,
            tierReached: chain?.tierReached ?? -1,
            graceDeadlineTick: s.kind === 'CHAIN_GROUND' ? s.graceDeadlineTick : null,
        };
    }

    // -----------------------------------------------------------------------
    // Transitions
    // -----------------------------------------------------------------------

    private onSpawn(tick: number, floorIndex: number): ComboEvent[] {
        const events: ComboEvent[] = [];
        const chain = this.liveChain();
        if (chain) {
            events.push(this.voidEvent(chain, 'reset', tick, 0));
        }
        this.state = {
            kind: 'IDLE_AIR',
            ledger: emptyLedger(),
            inert: false,
            takeoffFloorIndex: floorIndex,
        };
        this.pendingInert = false;
        this.nextChainId = 1;
        events.push({ type: 'combo/reset', tick, reason: 'spawn' });
        return events;
    }

    private onLeftGround(floorIndex: number): ComboEvent[] {
        if (this.state.kind === 'IDLE_AIR' || this.state.kind === 'CHAIN_AIR') {
            this.counters.comboAltDrift += 1;
            return [];
        }
        if (this.state.kind === 'CHAIN_GROUND') {
            const chain = this.state.chain;
            this.state = {
                kind: 'CHAIN_AIR',
                chain,
                // A grounded ceiling entry was escrowed on the chain; it rides
                // this air's ledger and confirms (or evaporates) with it.
                ledger: emptyLedger(chain.ceilingPending),
                takeoffFloorIndex: floorIndex,
            };
            chain.ceilingPending = false;
            return [];
        }
        this.state = {
            kind: 'IDLE_AIR',
            ledger: emptyLedger(),
            inert: this.pendingInert,
            takeoffFloorIndex: floorIndex,
        };
        this.pendingInert = false;
        return [];
    }

    private onLand(e: LandEvent): ComboEvent[] {
        if (this.state.kind === 'IDLE_GROUND' || this.state.kind === 'CHAIN_GROUND') {
            this.counters.comboAltDrift += 1;
            return [];
        }
        // The floor-grid invariant (graft #4).
        if (e.floorsGained !== e.floorIndex - this.state.takeoffFloorIndex) {
            this.counters.floorGridDrift += 1;
        }
        const isLink = e.floorsGained >= this.t.value('combo.linkMinFloors');

        if (this.state.kind === 'IDLE_AIR') {
            if (this.state.inert || !isLink) {
                // Inert air cannot open from unearned height; a sub-link
                // landing discards the ledger silently.
                this.state = { kind: 'IDLE_GROUND' };
                return [];
            }
            return this.openChain(e, this.state.ledger);
        }

        // CHAIN_AIR
        const { chain, ledger } = this.state;
        if (isLink) {
            return this.applyLink(chain, ledger, e);
        }
        if (chain.stumblesUsed < this.t.value('combo.stumblesAllowed')) {
            // A stumble charge absorbs the fizzle: no bank, chain preserved,
            // the air's spice still evaporates, the fuse restarts.
            chain.stumblesUsed += 1;
            const graceDeadlineTick = e.tick + this.t.value('combo.groundGraceTicks');
            this.state = { kind: 'CHAIN_GROUND', chain, graceDeadlineTick };
            return [
                {
                    type: 'combo/stumble',
                    tick: e.tick,
                    chainId: chain.chainId,
                    chargesLeft: this.t.value('combo.stumblesAllowed') - chain.stumblesUsed,
                    graceDeadlineTick,
                },
            ];
        }
        // Fizzle banks 100%: cashing out, disappointment without punishment.
        const events = [this.bankEvent(chain, 'fizzle', e.tick, e.floorIndex)];
        this.state = { kind: 'IDLE_GROUND' };
        return events;
    }

    private onBounce(e: WallBounceEvent): ComboEvent[] {
        if (!e.airborne) {
            return []; // grounded bounces are not combo food
        }
        const perfect = isComboPerfect(e.inputLeadTicks, this.t);
        if (this.state.kind === 'IDLE_AIR') {
            if (!this.state.inert) {
                this.state.ledger.bounces.push({ perfect });
            }
            return []; // pre-chain style accrues silently — no chainId yet
        }
        if (this.state.kind !== 'CHAIN_AIR') {
            return [];
        }
        this.state.ledger.bounces.push({ perfect });
        return [
            {
                type: 'combo/spice',
                tick: e.tick,
                chainId: this.state.chain.chainId,
                kind: perfect ? 'perfect' : 'bounce',
                provisionalMultDelta: bounceProvisionalDelta(perfect, this.t),
                provisionalMultTotal:
                    this.state.chain.mult + ledgerProvisionalTotal(this.state.ledger, this.t),
            },
        ];
    }

    private onCeiling(e: CeilingEvent): ComboEvent[] {
        if (e.state !== 'entered') {
            return [];
        }
        if (this.state.kind === 'CHAIN_AIR') {
            const { chain, ledger } = this.state;
            if (chain.ceilingUsed || ledger.ceiling) {
                return []; // once per chain — oscillation refuses itself
            }
            ledger.ceiling = true;
            return [
                {
                    type: 'combo/spice',
                    tick: e.tick,
                    chainId: chain.chainId,
                    kind: 'ceiling',
                    provisionalMultDelta: this.t.value('combo.multCeiling'),
                    provisionalMultTotal: chain.mult + ledgerProvisionalTotal(ledger, this.t),
                },
            ];
        }
        if (this.state.kind === 'CHAIN_GROUND') {
            const chain = this.state.chain;
            if (chain.ceilingUsed || chain.ceilingPending) {
                return [];
            }
            chain.ceilingPending = true; // escrowed into the next air's ledger
            return [
                {
                    type: 'combo/spice',
                    tick: e.tick,
                    chainId: chain.chainId,
                    kind: 'ceiling',
                    provisionalMultDelta: this.t.value('combo.multCeiling'),
                    provisionalMultTotal: chain.mult + this.t.value('combo.multCeiling'),
                },
            ];
        }
        return []; // ceiling outside a chain is movement's glory, not spice
    }

    private onHeartLost(tick: number): ComboEvent[] {
        // The rescue-launch air is inert whether or not a chain was live —
        // the mercy launch must never mint combos (graft #1).
        const events: ComboEvent[] = [];
        const chain = this.liveChain();
        if (chain) {
            const refundFraction = this.t.value('combo.voidRefundFraction');
            events.push(this.voidEvent(chain, 'heart_lost', tick, refundFraction));
        }
        if (this.state.kind === 'CHAIN_AIR' || this.state.kind === 'IDLE_AIR') {
            const takeoffFloorIndex = this.state.takeoffFloorIndex;
            this.state = {
                kind: 'IDLE_AIR',
                ledger: emptyLedger(),
                inert: true,
                takeoffFloorIndex,
            };
        } else {
            this.state = { kind: 'IDLE_GROUND' };
            this.pendingInert = true;
        }
        return events;
    }

    private onOrchestratedBank(reason: BankReason, tick: number): ComboEvent[] {
        const chain = this.liveChain();
        if (!chain) {
            return [];
        }
        // Unconfirmed air spice evaporates: only a landing proves a climb.
        const events = [
            this.bankEvent(chain, reason, tick, chain.startFloorIndex + chain.chainFloors),
        ];
        if (this.state.kind === 'CHAIN_AIR') {
            const takeoffFloorIndex = this.state.takeoffFloorIndex;
            this.state = {
                kind: 'IDLE_AIR',
                ledger: emptyLedger(),
                inert: false,
                takeoffFloorIndex,
            };
        } else {
            this.state = { kind: 'IDLE_GROUND' };
        }
        return events;
    }

    // -----------------------------------------------------------------------
    // Chain construction and confirmation
    // -----------------------------------------------------------------------

    private openChain(e: LandEvent, ledger: SpiceLedger): ComboEvent[] {
        const chain: ChainCore = {
            chainId: this.nextChainId,
            startTick: e.tick,
            startFloorIndex: e.floorIndex - e.floorsGained,
            entryFloorsGained: e.floorsGained,
            chainFloors: 0,
            links: 0,
            mult: 1,
            leapStreak: 0,
            ceilingUsed: false,
            ceilingPending: false,
            tierReached: -1,
            beyondRepeats: 0,
            stumblesUsed: 0,
            spiceTotals: zeroTotals(),
        };
        this.nextChainId += 1;
        const started: ComboEvent = {
            type: 'combo/started',
            tick: e.tick,
            chainId: chain.chainId,
            startTick: chain.startTick,
            startFloorIndex: chain.startFloorIndex,
            entryFloorsGained: e.floorsGained,
            chainFloors: e.floorsGained,
            mult: 1,
        };
        return [started, ...this.applyLink(chain, ledger, e)];
    }

    /** Confirm a link: spice with caps, floors, tier crossings, fuse restart. */
    private applyLink(chain: ChainCore, ledger: SpiceLedger, e: LandEvent): ComboEvent[] {
        const spice = confirmLink(chain, ledger, e.floorsGained, e.tier, this.t);
        const linkIndex = chain.links;
        const prevFloors = chain.chainFloors;
        chain.links += 1;
        chain.chainFloors += e.floorsGained;
        chain.mult += spice.multDelta;
        chain.leapStreak = spice.leapStreak;
        if (spice.ceiling) {
            chain.ceilingUsed = true;
        }
        chain.spiceTotals.bounces += spice.bounces;
        chain.spiceTotals.perfects += spice.perfects;
        chain.spiceTotals.leaps += spice.leap ? 1 : 0;
        chain.spiceTotals.hotLandings += spice.hotLanding ? 1 : 0;
        chain.spiceTotals.ceiling ||= spice.ceiling;
        chain.spiceTotals.multFromSpice += spice.multDelta;

        const graceDeadlineTick = e.tick + this.t.value('combo.groundGraceTicks');
        this.state = { kind: 'CHAIN_GROUND', chain, graceDeadlineTick };

        const events: ComboEvent[] = [
            {
                type: 'combo/link',
                tick: e.tick,
                chainId: chain.chainId,
                linkIndex,
                floorsGained: e.floorsGained,
                chainFloors: chain.chainFloors,
                mult: chain.mult,
                multDelta: spice.multDelta,
                spiceConfirmed: spice,
                graceDeadlineTick,
                provisionalPayout: payoutOf(basePoints(chain.chainFloors, this.t), chain.mult),
                x: e.x,
                y: e.y,
            },
        ];

        const crossing = highestCrossing(prevFloors, chain.chainFloors, this.t);
        if (crossing) {
            chain.tierReached = Math.max(chain.tierReached, crossing.tierIndex);
            chain.beyondRepeats = Math.max(chain.beyondRepeats, crossing.repeatIndex);
            events.push({
                type: 'combo/tier',
                tick: e.tick,
                chainId: chain.chainId,
                tierIndex: crossing.tierIndex,
                tierName: crossing.tierName,
                isRepeat: crossing.isRepeat,
                repeatIndex: crossing.repeatIndex,
                chainFloors: chain.chainFloors,
                thresholds: ladderFloors(this.t),
                x: e.x,
                y: e.y,
            });
        }
        return events;
    }

    // -----------------------------------------------------------------------
    // Pricing exits (the only places payout integers are minted)
    // -----------------------------------------------------------------------

    private bankEvent(
        chain: ChainCore,
        reason: BankReason,
        tick: number,
        endFloorIndex: number,
    ): ComboEvent {
        const base = basePoints(chain.chainFloors, this.t);
        const payout = payoutOf(base, chain.mult);
        if (payout < 0) {
            this.counters.negativePayout += 1;
        }
        return {
            type: 'combo/banked',
            tick,
            chainId: chain.chainId,
            reason,
            chainFloors: chain.chainFloors,
            links: chain.links,
            mult: chain.mult,
            basePoints: base,
            payout,
            tierReached: chain.tierReached,
            tierReachedName: chain.tierReached >= 0 ? tierName(chain.tierReached) : null,
            spiceTotals: { ...chain.spiceTotals },
            startFloorIndex: chain.startFloorIndex,
            endFloorIndex,
            startTick: chain.startTick,
            endTick: tick,
        };
    }

    private voidEvent(
        chain: ChainCore,
        reason: 'heart_lost' | 'reset',
        tick: number,
        refundFraction: number,
    ): ComboEvent {
        const unpaid = payoutOf(basePoints(chain.chainFloors, this.t), chain.mult);
        if (unpaid < 0) {
            this.counters.negativePayout += 1;
        }
        return {
            type: 'combo/voided',
            tick,
            chainId: chain.chainId,
            reason,
            chainFloorsLost: chain.chainFloors,
            multLost: chain.mult,
            unpaidPayout: unpaid,
            refundPaid: Math.round(unpaid * refundFraction),
        };
    }

    private liveChain(): ChainCore | null {
        return this.state.kind === 'CHAIN_GROUND' || this.state.kind === 'CHAIN_AIR'
            ? this.state.chain
            : null;
    }
}
