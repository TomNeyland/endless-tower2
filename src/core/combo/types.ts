/**
 * The combo engine's vocabulary — COMBO_SCHEMA_VERSION 1, designed from
 * scratch per docs/design/combo-scoring.md (v1's combo/scoring is disavowed
 * entirely). Engine-free by law.
 *
 * One law governs everything: NO CLOCK, NO FARM — zero value accrues from
 * time; only landings pay; landings pay only via floors actually climbed;
 * style is escrowed mid-air and confirmed only when a landing proves the
 * climb.
 */

export const COMBO_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Inbound port
// ---------------------------------------------------------------------------

/**
 * The run-orchestration signals the engine consumes, published now and wired
 * by PRESSURE (built in parallel — subscribed BY NAME, zero compile-time
 * coupling). Until they fire, sandbox chains never void: strictly generous,
 * safe. `run/bank_now` is orchestration-only, contractually never wirable to
 * player input — it would be an attack-shaped button; the verbs stay pure.
 */
export interface RunSignal {
    type: 'run/heart_lost' | 'run/segment_end' | 'run/bank_now';
    tick: number;
}

export const RUN_SIGNAL_NAMES = ['run/heart_lost', 'run/segment_end', 'run/bank_now'] as const;

// ---------------------------------------------------------------------------
// The spice ledger (provisional, per-air) and the chain core
// ---------------------------------------------------------------------------

/** One airborne wall bounce awaiting confirmation, with combo's OWN perfect
 *  verdict (re-windowed on raw inputLeadTicks — movement's flag is not
 *  consulted; the widen-the-window relic class exists because of this). */
export interface LedgerBounce {
    perfect: boolean;
}

/**
 * Style escrowed during one air. Always provisional: a fizzle discards it
 * silently; only a landing that proves the climb (a link) confirms it, and
 * bounces confirm capped against that landing's floorsGained.
 */
export interface SpiceLedger {
    bounces: LedgerBounce[];
    /** Ceiling entered during this chain-air (or pending from chain-ground). */
    ceiling: boolean;
}

export function emptyLedger(ceilingPending = false): SpiceLedger {
    return { bounces: [], ceiling: ceilingPending };
}

/** Confirmed spice accumulated over a whole chain — banked payload material. */
export interface SpiceTotals {
    bounces: number;
    perfects: number;
    leaps: number;
    hotLandings: number;
    ceiling: boolean;
    multFromSpice: number;
}

/** What one link confirmed — the payload face of `combo/link.spiceConfirmed`. */
export interface LinkSpice {
    bounces: number;
    perfects: number;
    leap: boolean;
    leapStreak: number;
    hotLanding: boolean;
    ceiling: boolean;
    multDelta: number;
}

/** The live chain: everything confirmed so far. */
export interface ChainCore {
    chainId: number;
    startTick: number;
    startFloorIndex: number;
    entryFloorsGained: number;
    chainFloors: number;
    /** Confirmed links so far (the opener is link 0). */
    links: number;
    mult: number;
    /** Consecutive-leap streak ending at the latest link (Tetris back-to-back). */
    leapStreak: number;
    /** Ceiling spice is once per chain. */
    ceilingUsed: boolean;
    /** Ceiling entered while CHAIN_GROUND, escrowed into the next air's ledger. */
    ceilingPending: boolean;
    /** Highest ladder tier index crossed (-1 = below SPARK). */
    tierReached: number;
    /** BEYOND repeats already fired (0 = plain BEYOND was the last). */
    beyondRepeats: number;
    stumblesUsed: number;
    spiceTotals: SpiceTotals;
}

// ---------------------------------------------------------------------------
// The four-state machine, as an explicit discriminated union
// ---------------------------------------------------------------------------

export type ChainState =
    | { kind: 'IDLE_GROUND' }
    | {
          kind: 'IDLE_AIR';
          ledger: SpiceLedger;
          /** One-air-inert after void: the rescue-launch air cannot open a
           *  fresh chain from unearned height (graft #1). */
          inert: boolean;
          takeoffFloorIndex: number;
      }
    | { kind: 'CHAIN_GROUND'; chain: ChainCore; graceDeadlineTick: number }
    | { kind: 'CHAIN_AIR'; chain: ChainCore; ledger: SpiceLedger; takeoffFloorIndex: number };

// ---------------------------------------------------------------------------
// Outbound events (combo/* and score/*) — one schema, one authority table
// ---------------------------------------------------------------------------

export type BankReason = 'fizzle' | 'grace' | 'exit' | 'forced';
export type VoidReason = 'heart_lost' | 'reset';
export type SpiceKind = 'bounce' | 'perfect' | 'ceiling';

export interface ComboStartedEvent {
    type: 'combo/started';
    tick: number;
    chainId: number;
    startTick: number;
    startFloorIndex: number;
    entryFloorsGained: number;
    chainFloors: number;
    mult: number;
}

export interface ComboLinkEvent {
    type: 'combo/link';
    tick: number;
    chainId: number;
    linkIndex: number;
    floorsGained: number;
    chainFloors: number;
    mult: number;
    multDelta: number;
    spiceConfirmed: LinkSpice;
    /** Absolute tick the fuse burns out — the HUD draws the drain against it. */
    graceDeadlineTick: number;
    provisionalPayout: number;
    x: number;
    y: number;
}

export interface ComboSpiceEvent {
    type: 'combo/spice';
    tick: number;
    chainId: number;
    kind: SpiceKind;
    /** Explicitly provisional — HUD may whisper, nothing may pay. */
    provisionalMultDelta: number;
    provisionalMultTotal: number;
}

export interface ComboTierEvent {
    type: 'combo/tier';
    tick: number;
    chainId: number;
    tierIndex: number;
    tierName: string;
    isRepeat: boolean;
    /** For BEYOND xN cards: 0 = plain BEYOND, 1 = x2, 2 = x3 ... */
    repeatIndex: number;
    chainFloors: number;
    /** Self-describing ladder thresholds at emission. */
    thresholds: number[];
    x: number;
    y: number;
}

/** THE payout authority: score adds payout; bosses apply their own curve
 *  over the exposed axes. Consumers scale with payload values, never event
 *  counts (the frozen consumer law). */
export interface ComboBankedEvent {
    type: 'combo/banked';
    tick: number;
    chainId: number;
    reason: BankReason;
    chainFloors: number;
    links: number;
    mult: number;
    basePoints: number;
    payout: number;
    tierReached: number;
    tierReachedName: string | null;
    spiceTotals: SpiceTotals;
    startFloorIndex: number;
    endFloorIndex: number;
    startTick: number;
    endTick: number;
}

export interface ComboVoidedEvent {
    type: 'combo/voided';
    tick: number;
    chainId: number;
    reason: VoidReason;
    chainFloorsLost: number;
    multLost: number;
    unpaidPayout: number;
    refundPaid: number;
}

export interface ComboResetEvent {
    type: 'combo/reset';
    tick: number;
    reason: 'spawn';
}

/** Additive under COMBO_SCHEMA_VERSION discipline: the stumble transition
 *  (a relic charge absorbing a fizzle without banking) is specified by the
 *  state machine and restarts the fuse — the HUD needs the new deadline. */
export interface ComboStumbleEvent {
    type: 'combo/stumble';
    tick: number;
    chainId: number;
    chargesLeft: number;
    graceDeadlineTick: number;
}

export type ComboEvent =
    | ComboStartedEvent
    | ComboLinkEvent
    | ComboSpiceEvent
    | ComboTierEvent
    | ComboBankedEvent
    | ComboVoidedEvent
    | ComboResetEvent
    | ComboStumbleEvent;

export interface ScoreHeightEvent {
    type: 'score/height';
    tick: number;
    floorIndex: number;
    pointsAwarded: number;
    total: number;
}

export interface ScoreUpdatedEvent {
    type: 'score/updated';
    tick: number;
    totalScore: number;
    heightPoints: number;
    comboPoints: number;
    delta: number;
    source: 'height' | 'banked' | 'refund' | 'reset';
}

export interface ScoreSessionFinalEvent {
    type: 'score/session_final';
    tick: number;
    stats: SessionStats;
}

export type ScoreEvent = ScoreHeightEvent | ScoreUpdatedEvent | ScoreSessionFinalEvent;

export type AnyComboEvent = ComboEvent | ScoreEvent;
export type AnyComboEventType = AnyComboEvent['type'];
export type ComboEventOf<T extends AnyComboEventType> = Extract<AnyComboEvent, { type: T }>;

// ---------------------------------------------------------------------------
// Session stats (RETURN-phase achievement vocabulary, free)
// ---------------------------------------------------------------------------

export interface SessionStats {
    bestChainFloors: number;
    bestChainMult: number;
    bestChainPayout: number;
    /** The flex stat's display face: "31 FLOORS x4.75 — 45,648". */
    bestChainFace: string;
    longestChainLinks: number;
    tallestSingleLink: number;
    totalScore: number;
    heightPoints: number;
    comboPoints: number;
    banksByReason: Record<BankReason, number>;
    voids: number;
    perfectBounces: number;
    /** Confirmed chain bounces / airborne bounces seen — escrow efficiency. */
    bounceEfficiency: number;
    /** Ticks with a live chain / total ticks — the perma-combo bragging stat. */
    comboUptime: number;
    tierHistogram: number[];
    bestLeapStreak: number;
    /** Chain links closed by an assist-aided takeoff / total links. */
    assistShareInChains: number;
    /** Chain floors earned at-or-below the segment high-water at chain start —
     *  the refarm instrumentation (ruling: measure before legislating). */
    refarmedFloorShare: number;
}

// ---------------------------------------------------------------------------
// The combo-stream bus (same discipline as the movement EventBus: handlers
// run synchronously in subscription order; the engine emits and never knows
// who listens)
// ---------------------------------------------------------------------------

type AnyComboHandler = (event: AnyComboEvent) => void;

export class ComboBus {
    private handlers = new Map<AnyComboEventType, AnyComboHandler[]>();
    private anyHandlers: AnyComboHandler[] = [];

    on<T extends AnyComboEventType>(type: T, fn: (event: ComboEventOf<T>) => void): void {
        const list = this.handlers.get(type) ?? [];
        list.push(fn as AnyComboHandler);
        this.handlers.set(type, list);
    }

    off<T extends AnyComboEventType>(type: T, fn: (event: ComboEventOf<T>) => void): void {
        const list = this.handlers.get(type);
        if (list) {
            this.handlers.set(
                type,
                list.filter((h) => h !== (fn as AnyComboHandler)),
            );
        }
    }

    onAny(fn: AnyComboHandler): void {
        this.anyHandlers.push(fn);
    }

    offAny(fn: AnyComboHandler): void {
        this.anyHandlers = this.anyHandlers.filter((h) => h !== fn);
    }

    emit(event: AnyComboEvent): void {
        const list = this.handlers.get(event.type);
        if (list) {
            for (const fn of list) {
                fn(event);
            }
        }
        for (const fn of this.anyHandlers) {
            fn(event);
        }
    }

    clear(): void {
        this.handlers.clear();
        this.anyHandlers = [];
    }
}
