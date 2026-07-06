/**
 * BOSS events (EXAM, docs/design/bosses.md — EXAM_SCHEMA_VERSION lives in
 * src/core/boss/types.ts). Same bus, same facts-only law as the movement
 * taxonomy. These are duel facts (the boss's schedule, its health, the
 * openness window), not player kinematics: they carry the tick but not the
 * movement envelope — a boss has its own body. Like run-economy events they
 * are excluded from the replay eventIndex (session.ts): the brain runs
 * browser-side only, and every physics side effect it causes rides a
 * recorded channel (tuning timeline for surges/gusts, the exam command
 * timeline for the tower's platforms).
 *
 * The game-wide union and the EventBus live in src/core/events.ts (the
 * designated coupling seam); it re-exports this vocabulary, so consumers
 * keep one import path.
 */

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
