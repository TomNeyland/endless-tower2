/**
 * Event minting and chain-ledger application — the payout half of the
 * economist's grammar/payout seam (pre-approved in combo-scoring.md). The
 * state machine in engine.ts contains zero point math; every number a combo
 * event carries is computed here or in spice.ts. These are the ONLY places
 * payout integers are minted.
 */
import type { EventEnvelope, LandEvent } from '../events';
import type { TuningStack } from '../tuning';
import { highestCrossing, ladderFloors, tierName } from './ladder';
import {
    basePoints,
    bounceProvisionalDelta,
    confirmLink,
    ledgerProvisionalTotal,
    payoutOf,
    zeroTotals,
} from './spice';
import type {
    BankReason,
    ChainCore,
    ComboBankedEvent,
    ComboEvent,
    ComboSpiceEvent,
    ComboVoidedEvent,
    SpiceKind,
    SpiceLedger,
    VoidReason,
} from './types';

export function createChain(chainId: number, e: LandEvent): ChainCore {
    return {
        chainId,
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
}

/**
 * Confirm one link onto the chain: escrow-capped spice, floors, mult, tier
 * crossings, spice-total accumulation. Mutates the chain; returns the
 * `combo/link` event (and the highest `combo/tier` crossing, if any) plus
 * the fuse deadline the engine sets its CHAIN_GROUND state with.
 */
export function applyLinkToChain(
    chain: ChainCore,
    ledger: SpiceLedger,
    e: LandEvent,
    t: TuningStack,
): { events: ComboEvent[]; graceDeadlineTick: number } {
    const spice = confirmLink(chain, ledger, e.floorsGained, e.tier, t);
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

    const graceDeadlineTick = e.tick + t.value('combo.groundGraceTicks');
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
            provisionalPayout: payoutOf(basePoints(chain.chainFloors, t), chain.mult),
            x: e.x,
            y: e.y,
        },
    ];

    const crossing = highestCrossing(prevFloors, chain.chainFloors, t);
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
            thresholds: ladderFloors(t),
            x: e.x,
            y: e.y,
        });
    }
    return { events, graceDeadlineTick };
}

/** THE payout authority's payload. The engine checks `payout < 0` into its
 *  negativePayout tripwire after minting. */
export function mintBanked(
    chain: ChainCore,
    reason: BankReason,
    tick: number,
    endFloorIndex: number,
    t: TuningStack,
): ComboBankedEvent {
    const base = basePoints(chain.chainFloors, t);
    return {
        type: 'combo/banked',
        tick,
        chainId: chain.chainId,
        reason,
        chainFloors: chain.chainFloors,
        links: chain.links,
        mult: chain.mult,
        basePoints: base,
        payout: payoutOf(base, chain.mult),
        tierReached: chain.tierReached,
        tierReachedName: chain.tierReached >= 0 ? tierName(chain.tierReached) : null,
        spiceTotals: { ...chain.spiceTotals },
        startFloorIndex: chain.startFloorIndex,
        endFloorIndex,
        startTick: chain.startTick,
        endTick: tick,
    };
}

export function mintVoided(
    chain: ChainCore,
    reason: VoidReason,
    tick: number,
    refundFraction: number,
    t: TuningStack,
): ComboVoidedEvent {
    const unpaid = payoutOf(basePoints(chain.chainFloors, t), chain.mult);
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

/** Provisional style whisper (bounce/perfect: priced per accrual; ceiling:
 *  priced flat). `ledger` is the air's ledger AFTER the accrual. */
export function mintSpice(
    kind: SpiceKind,
    envelope: Pick<EventEnvelope, 'tick'>,
    chain: ChainCore,
    ledger: SpiceLedger | null,
    t: TuningStack,
): ComboSpiceEvent {
    const delta =
        kind === 'ceiling'
            ? t.value('combo.multCeiling')
            : bounceProvisionalDelta(kind === 'perfect', t);
    const pending = ledger ? ledgerProvisionalTotal(ledger, t) : t.value('combo.multCeiling');
    return {
        type: 'combo/spice',
        tick: envelope.tick,
        chainId: chain.chainId,
        kind,
        provisionalMultDelta: delta,
        provisionalMultTotal: chain.mult + pending,
    };
}
