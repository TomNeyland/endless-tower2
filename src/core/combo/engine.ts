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
 * This file is grammar with ZERO point math (the economist's pre-approved
 * seam): pricing lives in spice.ts, event minting in payout.ts.
 *
 * Tripwires (must read 0 forever): comboAltDrift (grounded-belief
 * alternation drift vs movement's events), negativePayout (pricing minted
 * a negative integer), floorGridDrift (land.floorsGained !==
 * land.floorIndex - left_ground.floorIndex — graft #4's invariant).
 */
import type { CeilingEvent, LandEvent, MovementEvent, WallBounceEvent } from '../events';
import type { TuningStack } from '../tuning';
import { applyLinkToChain, createChain, mintBanked, mintSpice, mintVoided } from './payout';
import { isComboPerfect } from './spice';
import {
    type BankReason,
    type ChainCore,
    type ChainState,
    type ComboEvent,
    emptyLedger,
    type RunSignal,
    type SpiceLedger,
    type VoidReason,
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
        this.state = this.idleAir(false, 0);
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
            this.state = { kind: 'IDLE_GROUND' };
            return [this.bank(chain, 'grace', tick, chain.startFloorIndex + chain.chainFloors)];
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
            events.push(this.void_(chain, 'reset', tick, 0));
        }
        this.state = this.idleAir(false, floorIndex);
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
        this.state = this.idleAir(this.pendingInert, floorIndex);
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
            // Open a chain: the opener is link 0, confirmed same-tick.
            const chain = createChain(this.nextChainId, e);
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
            return [started, ...this.link(chain, this.state.ledger, e)];
        }

        // CHAIN_AIR
        const { chain, ledger } = this.state;
        if (isLink) {
            return this.link(chain, ledger, e);
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
        this.state = { kind: 'IDLE_GROUND' };
        return [this.bank(chain, 'fizzle', e.tick, e.floorIndex)];
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
            mintSpice(
                perfect ? 'perfect' : 'bounce',
                e,
                this.state.chain,
                this.state.ledger,
                this.t,
            ),
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
            return [mintSpice('ceiling', e, chain, ledger, this.t)];
        }
        if (this.state.kind === 'CHAIN_GROUND') {
            const chain = this.state.chain;
            if (chain.ceilingUsed || chain.ceilingPending) {
                return [];
            }
            chain.ceilingPending = true; // escrowed into the next air's ledger
            return [mintSpice('ceiling', e, chain, null, this.t)];
        }
        return []; // ceiling outside a chain is movement's glory, not spice
    }

    private onHeartLost(tick: number): ComboEvent[] {
        // The rescue-launch air is inert whether or not a chain was live —
        // the mercy launch must never mint combos (graft #1).
        const events: ComboEvent[] = [];
        const chain = this.liveChain();
        if (chain) {
            events.push(
                this.void_(chain, 'heart_lost', tick, this.t.value('combo.voidRefundFraction')),
            );
        }
        if (this.state.kind === 'CHAIN_AIR' || this.state.kind === 'IDLE_AIR') {
            this.state = this.idleAir(true, this.state.takeoffFloorIndex);
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
        const airborne = this.state.kind === 'CHAIN_AIR';
        const takeoffFloorIndex = airborne
            ? (this.state as Extract<ChainState, { kind: 'CHAIN_AIR' }>).takeoffFloorIndex
            : 0;
        this.state = airborne ? this.idleAir(false, takeoffFloorIndex) : { kind: 'IDLE_GROUND' };
        return [this.bank(chain, reason, tick, chain.startFloorIndex + chain.chainFloors)];
    }

    // -----------------------------------------------------------------------
    // Minting delegates (payout.ts prices; the engine only counts tripwires)
    // -----------------------------------------------------------------------

    private link(chain: ChainCore, ledger: SpiceLedger, e: LandEvent): ComboEvent[] {
        const { events, graceDeadlineTick } = applyLinkToChain(chain, ledger, e, this.t);
        this.state = { kind: 'CHAIN_GROUND', chain, graceDeadlineTick };
        return events;
    }

    private bank(chain: ChainCore, reason: BankReason, tick: number, endFloor: number): ComboEvent {
        const event = mintBanked(chain, reason, tick, endFloor, this.t);
        if (event.payout < 0) {
            this.counters.negativePayout += 1;
        }
        return event;
    }

    private void_(
        chain: ChainCore,
        reason: VoidReason,
        tick: number,
        refundFraction: number,
    ): ComboEvent {
        const event = mintVoided(chain, reason, tick, refundFraction, this.t);
        if (event.unpaidPayout < 0) {
            this.counters.negativePayout += 1;
        }
        return event;
    }

    private idleAir(inert: boolean, takeoffFloorIndex: number): ChainState {
        return { kind: 'IDLE_AIR', ledger: emptyLedger(), inert, takeoffFloorIndex };
    }

    private liveChain(): ChainCore | null {
        return this.state.kind === 'CHAIN_GROUND' || this.state.kind === 'CHAIN_AIR'
            ? this.state.chain
            : null;
    }
}
