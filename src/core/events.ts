/**
 * The movement event taxonomy — v1 of the nervous-system vocabulary — and the
 * deterministic emitter.
 *
 * Design law: events carry facts and physically-grounded classifications only.
 * Never point values, never combo state, never judgments a downstream system
 * might re-decide. The tick is the canonical timebase.
 */

export const EVENT_SCHEMA_VERSION = 1;

/** Envelope present on every event. Kinematics are the values at emission. */
export interface EventEnvelope {
    tick: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    speed: number;
    grounded: boolean;
    floorIndex: number;
    /**
     * Current speed-tier index at emission (movement.md Amendment 1a —
     * additive under EVENT_SCHEMA_VERSION discipline, no bump). Two consumers
     * (combo hot-landing spice, audio pitch-by-tier) need tier-at-event;
     * stateful reconstruction downstream would ship known-desynced.
     */
    tier: number;
}

export type WallSide = 'left' | 'right';

export interface SpawnEvent extends EventEnvelope {
    type: 'movement/spawn';
    reason: 'initial' | 'reset';
}

export interface JumpEvent extends EventEnvelope {
    type: 'movement/jump';
    launchSpeedX: number;
    vyJump: number;
    conversionFraction: number;
    retainedSpeedX: number;
    predictedHeightPx: number;
    wasBuffered: boolean;
    wasCoyote: boolean;
    takeoffPlatformId: number;
}

export interface JumpCutEvent extends EventEnvelope {
    type: 'movement/jump_cut';
    vyBefore: number;
    vyAfter: number;
    riseMs: number;
    floorsForfeited: number;
}

export interface LeftGroundEvent extends EventEnvelope {
    type: 'movement/left_ground';
    reason: 'jump' | 'walkoff';
    takeoffSpeed: number;
}

export interface ApexEvent extends EventEnvelope {
    type: 'movement/apex';
    apexHeightPx: number;
    floorsAboveTakeoff: number;
    hangActive: boolean;
}

/**
 * Landing classifications (movement.md Amendment 1c — the reserved additive
 * payload, implemented by EXAM): a fact about the platform the feet touched.
 * `crumble` = this touch armed the ledge's collapse; `sticky` = the ledge
 * drank speed at the landing (the drain is already in the envelope's vx).
 */
export type LandClassification = 'crumble' | 'sticky';

export interface LandEvent extends EventEnvelope {
    type: 'movement/land';
    impactVy: number;
    airTicks: number;
    floorsGained: number;
    platformId: number;
    momentumRetained: number;
    bouncesDuringAir: number;
    sameTickJump: boolean;
    /** Absent on ordinary ledges — additive under EVENT_SCHEMA_VERSION
     *  discipline (no bump), exactly as Amendment 1c reserved. */
    classification?: LandClassification;
}

export interface WallBounceEvent extends EventEnvelope {
    type: 'movement/wall_bounce';
    side: WallSide;
    impactSpeedX: number;
    exitSpeedX: number;
    efficiency: number;
    /**
     * Ticks since the most recent input edge toward the wall (the kick).
     * 0 = pressed on the impact tick; larger = pressed earlier. Emission is
     * immediate (audio/juice need the impact tick), so post-impact presses
     * are not observable here; INPUT_LEAD_NEVER means no recent kick press.
     * Signed by contract so a future consumer may re-window without a
     * schema change. Known divergence from movement.md's ±window — see
     * docs/DEVIATIONS.md entry 1.
     */
    inputLeadTicks: number;
    perfect: boolean;
    airborne: boolean;
    bounceIndexInAir: number;
    timeSinceLastBounceMs: number | null;
    heightAtBounce: number;
}

/** Sentinel for `inputLeadTicks` when no kick press preceded the bounce. */
export const INPUT_LEAD_NEVER = 999;

export interface WallTouchEvent extends EventEnvelope {
    type: 'movement/wall_touch';
    side: WallSide;
    impactSpeedX: number;
}

export interface FloorCrossedEvent extends EventEnvelope {
    type: 'movement/floor_crossed';
    direction: 'up' | 'down';
    cumulativeThisAir: number;
    airborne: boolean;
}

export interface SpeedTierEvent extends EventEnvelope {
    type: 'movement/speed_tier';
    tier: number;
    previousTier: number;
    /** Self-describing px/s thresholds — fractions of the effective ceiling. */
    thresholds: number[];
}

export interface CeilingEvent extends EventEnvelope {
    type: 'movement/ceiling';
    state: 'entered' | 'exited';
    effectiveMaxSpeed: number;
    source: 'base' | 'stack';
}

export interface StallEvent extends EventEnvelope {
    type: 'movement/stall';
    state: 'entered' | 'exited';
    durationTicks: number;
}

export interface ReversalEvent extends EventEnvelope {
    type: 'movement/reversal';
    speedBefore: number;
    viaWallBounce: boolean;
}

/** 60Hz firehose — debug bridge only. */
export interface TickEvent extends EventEnvelope {
    type: 'movement/tick';
    axisX: number;
    jumpHeld: boolean;
    gravityScale: number;
    tier: number;
    hangActive: boolean;
    coyoteTicksLeft: number;
    bufferTicksLeft: number;
    graceTicksLeft: number;
    lockoutBlocked: number;
    wallDedupHits: number;
}

// Reserved (do not implement, do not repurpose): a ceiling-bump event slot
// for EXAM-phase tower mutation.

// The game-wide event union. The name predates PRESSURE (kept stable for
// consumers); pressure events ride the same bus under the same facts law.
export type MovementEvent =
    | SpawnEvent
    | JumpEvent
    | JumpCutEvent
    | LeftGroundEvent
    | ApexEvent
    | LandEvent
    | WallBounceEvent
    | WallTouchEvent
    | FloorCrossedEvent
    | SpeedTierEvent
    | CeilingEvent
    | StallEvent
    | ReversalEvent
    | TickEvent
    | PressureEvent
    | RunEconomyEvent
    | BossEvent;

// ---------------------------------------------------------------------------
// PRESSURE events (docs/design/pressure.md) — same envelope, same facts-only
// law. The death line, hearts, and segment lifecycle broadcast here; nothing
// reads the line except consumers of these events. `run/heart_lost` and
// `run/segment_end` are exactly the RunSignal wiring combo-scoring.md
// published (facts only — no score, no judgment).
// ---------------------------------------------------------------------------

export const PRESSURE_SCHEMA_VERSION = 1;

export type LineProximityTier = 'safe' | 'aware' | 'danger' | 'critical';

/** A tuning repricing broadcast as a fact (structurally = a layer, sans id). */
export interface SegmentOverrideFact {
    key: string;
    op: 'mul' | 'add' | 'set';
    value: number;
}

export interface SegmentStartEvent extends EventEnvelope {
    type: 'run/segment_start';
    segmentId: string;
    floors: number;
    seed: number;
    /** Null in a boss arena — the door does not exist until the boss falls
     *  (bosses.md: the door materializes on defeat, lit). */
    doorFloorIndex: number | null;
    lineProfile: SegmentOverrideFact[];
    modifiers: SegmentOverrideFact[];
}

export interface LineStateEvent extends EventEnvelope {
    type: 'line/state';
    state: 'dormant' | 'active';
    /** Which half of the dual trigger ignited the line (null when dormant). */
    trigger: 'time' | 'floors' | null;
    igniteTick: number | null;
    lineY: number | null;
}

export interface LineProximityEvent extends EventEnvelope {
    type: 'line/proximity';
    /**
     * pressure.md's table names this field `tier`, but the envelope's
     * game-wide `tier` (speed tier, combo-scoring.md graft #1) claimed that
     * name for every event. The proximity band renames to `zone` — the
     * closed 4-name set is unchanged.
     */
    zone: LineProximityTier;
    gapPx: number;
    direction: 'closing' | 'receding';
    lineY: number;
}

export interface HeartLostEvent extends EventEnvelope {
    type: 'run/heart_lost';
    heartsRemaining: number;
    gapAtCatch: number;
    catchFloorIndex: number;
}

export interface SegmentEndEvent extends EventEnvelope {
    type: 'run/segment_end';
    reason: 'exit';
    segmentId: string;
    floorsClimbed: number;
    timeTicks: number;
    heartsLost: number;
}

export interface RunEndedEvent extends EventEnvelope {
    type: 'run/ended';
    reason: 'death_line';
    segmentId: string;
    /** Interim final stats; score/session_final (MASTERY) will join this. */
    floorsClimbed: number;
    timeTicks: number;
    heartsLost: number;
}

export type PressureEvent =
    | SegmentStartEvent
    | LineStateEvent
    | LineProximityEvent
    | HeartLostEvent
    | SegmentEndEvent
    | RunEndedEvent;

// ---------------------------------------------------------------------------
// RUN & ECONOMY events (IDENTITY, docs/design/relics-economy.md). Same bus,
// same facts-only law. These are run-orchestration facts (wallet totals,
// build changes, shop lifecycle), not kinematics: they carry the tick (the
// canonical timebase) but not the movement envelope — a shop has no velocity.
// Schema authority: RUN_SCHEMA_VERSION in src/core/run/state.ts.
// ---------------------------------------------------------------------------

export type RelicRarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type RelicSource = 'shop' | 'elite' | 'mystery' | 'debug';

export interface RelicAcquiredEvent {
    type: 'relic/acquired';
    tick: number;
    relicId: string;
    rarity: RelicRarity;
    source: RelicSource;
    /** Permanent tuning layers this acquisition pushed (owner `relic:<id>`). */
    layersPushed: number;
}

export interface CoinCollectedEvent {
    type: 'coin/collected';
    tick: number;
    value: number;
    /** Wallet total after collection — consumers scale with payload values. */
    total: number;
    magnetized: boolean;
}

export interface CoinSpentEvent {
    type: 'coin/spent';
    tick: number;
    amount: number;
    total: number;
    item: string;
}

export interface ShopEnteredEvent {
    type: 'shop/entered';
    tick: number;
    nodeId: string;
    /** Relic ids on offer (the seeded stock). */
    stock: string[];
}

export interface ShopLeftEvent {
    type: 'shop/left';
    tick: number;
    nodeId: string;
    /** Item ids bought this visit (relic ids, 'heart', 'reroll'). */
    purchases: string[];
}

export interface PowerupStartedEvent {
    type: 'powerup/started';
    tick: number;
    id: string;
    durationTicks: number;
}

export interface PowerupExpiredEvent {
    type: 'powerup/expired';
    tick: number;
    id: string;
    durationTicks: number;
}

export interface HeartGainedEvent {
    type: 'run/heart_gained';
    tick: number;
    /** What granted it: 'shop', a relic id ('fireproof', 'thick-skin'), ... */
    source: string;
    heartsNow: number;
}

export type RunEconomyEvent =
    | RelicAcquiredEvent
    | CoinCollectedEvent
    | CoinSpentEvent
    | ShopEnteredEvent
    | ShopLeftEvent
    | PowerupStartedEvent
    | PowerupExpiredEvent
    | HeartGainedEvent;

// ---------------------------------------------------------------------------
// BOSS events (EXAM, docs/design/bosses.md — EXAM_SCHEMA_VERSION lives in
// src/core/boss/types.ts). Same bus, same facts-only law. These are duel
// facts (the boss's schedule, its health, the openness window), not player
// kinematics: they carry the tick but not the movement envelope — a boss has
// its own body. Like run-economy events they are excluded from the replay
// eventIndex (session.ts): the brain runs browser-side only, and every
// physics side effect it causes rides a recorded channel (tuning timeline
// for surges/gusts, the exam command timeline for the tower's platforms).
// ---------------------------------------------------------------------------

export type BossAttackKind =
    | 'crumble_volley'
    | 'sticky_spit'
    | 'line_surge'
    | 'gust'
    | 'swarm'
    | 'body_slam';

/** Payout-scaled hit classes, boundaries shared with the bank loudness
 *  tuning (`hud.bankWhisper` / `hud.bankVoice`) — one vocabulary of loud. */
export type BossHitLoudness = 'whisper' | 'voice' | 'roar';

export interface BossSpawnedEvent {
    type: 'boss/spawned';
    tick: number;
    bossId: string;
    name: string;
    hp: number;
    hpMax: number;
    phase: number;
}

export interface BossTelegraphEvent {
    type: 'boss/telegraph';
    tick: number;
    attackId: string;
    kind: BossAttackKind;
    /** Floor band the attack targets; null for whole-arena attacks (surge). */
    targetBand: { loFloor: number; hiFloor: number } | null;
    /** Platforms the attack will touch — the view glows exactly these. */
    targetPlatformIds: number[];
    /** Absolute tick the attack resolves — the telegraph's honest deadline. */
    resolveTick: number;
}

export interface BossAttackEvent {
    type: 'boss/attack';
    tick: number;
    attackId: string;
    kind: BossAttackKind;
}

export interface BossHitEvent {
    type: 'boss/hit';
    tick: number;
    damage: number;
    hpRemaining: number;
    /** The bank that landed — the frozen contract's exposed axes. */
    bankRef: { payout: number; chainFloors: number; mult: number; tier: number };
    loudness: BossHitLoudness;
    /** True when the hit landed inside an openness window (multiplied). */
    openness: boolean;
}

export interface BossPhaseEvent {
    type: 'boss/phase';
    tick: number;
    /** 1 (fresh) / 2 (below 2/3) / 3 (below 1/3). */
    phase: number;
    hpFrac: number;
}

export interface BossOpennessEvent {
    type: 'boss/openness';
    tick: number;
    state: 'entered' | 'exited';
    multiplier: number;
}

export interface BossDefeatedEvent {
    type: 'boss/defeated';
    tick: number;
    bossId: string;
    /** Duel stats: banks landed, the biggest single hit, duel length. */
    banks: number;
    biggestHit: number;
    durationTicks: number;
}

export type BossEvent =
    | BossSpawnedEvent
    | BossTelegraphEvent
    | BossAttackEvent
    | BossHitEvent
    | BossPhaseEvent
    | BossOpennessEvent
    | BossDefeatedEvent;

export type MovementEventType = MovementEvent['type'];
export type EventOf<T extends MovementEventType> = Extract<MovementEvent, { type: T }>;

type AnyHandler = (event: MovementEvent) => void;

/**
 * Deterministic synchronous emitter: handlers run in subscription order, on
 * the emitting tick. Movement emits and never knows who listens.
 */
export class EventBus {
    private handlers = new Map<MovementEventType, AnyHandler[]>();
    private anyHandlers: AnyHandler[] = [];

    on<T extends MovementEventType>(type: T, fn: (event: EventOf<T>) => void): void {
        const list = this.handlers.get(type) ?? [];
        list.push(fn as AnyHandler);
        this.handlers.set(type, list);
    }

    off<T extends MovementEventType>(type: T, fn: (event: EventOf<T>) => void): void {
        const list = this.handlers.get(type);
        if (list) {
            this.handlers.set(
                type,
                list.filter((h) => h !== (fn as AnyHandler)),
            );
        }
    }

    onAny(fn: AnyHandler): void {
        this.anyHandlers.push(fn);
    }

    offAny(fn: AnyHandler): void {
        this.anyHandlers = this.anyHandlers.filter((h) => h !== fn);
    }

    emit(event: MovementEvent): void {
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
