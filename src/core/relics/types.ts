/**
 * Relic vocabulary (docs/design/relics-economy.md). Engine-free by law.
 *
 * A relic is `{id, name, blurb, rarity, effects, tell}` where effects use
 * EXACTLY the two frozen surfaces from the consumer contract:
 *
 *   1. Tuning layers — ordered {key, op, value} entries on any table key,
 *      pushed with owner `relic:<id>` in acquisition order (the TuningStack
 *      folds relics by push order within the relic class).
 *   2. Event subscriptions — triggered effects consuming the bus, scaling
 *      with payload VALUES, never event counts (the law).
 *
 * Triggers are DATA — a small closed grammar the effects runtime interprets,
 * so the whole roster stays a table, not a pile of bespoke handlers. Relics
 * never touch engine internals, never add code paths to movement or combo.
 */
import type { RelicRarity } from '../events';
import type { TuningKey, TuningOp } from '../tuning';

export type { RelicRarity, RelicSource } from '../events';

/** One tuning layer a relic (or powerup) contributes — owner added at push. */
export interface RelicLayerSpec {
    key: TuningKey;
    op: TuningOp;
    value: number;
}

/** Where a relic's hook lives on the spine (display + audit vocabulary). */
export type RelicHook = 'earn' | 'keep' | 'route' | 'spend' | 'chain' | 'body';

/** The visible tell's rendering style (RelicTells budgets these). */
export type TellStyle = 'orbit' | 'aura' | 'spark';

/**
 * Every relic has a visible tell — a small persistent accent on the
 * character or its trail (within art-direction's budget: the player stays
 * highest contrast; tells live in trail/aura, never silhouette).
 */
export interface RelicTell {
    color: number;
    style: TellStyle;
}

/**
 * The closed trigger grammar — exactly the shapes the starting roster needs.
 * Each names the event it consumes and the effect it produces; magnitudes
 * live in the data, interpretation in effects.ts.
 */
export type RelicTrigger =
    /** Push layers for a fixed duration after a landing (refreshed, never
     *  stacked). Cold Start. */
    | {
          on: 'movement/land';
          effect: 'timed-layers';
          layers: RelicLayerSpec[];
          durationTicks: number;
      }
    /** Push layers for a fixed duration after a combo tier crossing. Launch
     *  Pad. */
    | { on: 'combo/tier'; effect: 'timed-layers'; layers: RelicLayerSpec[]; durationTicks: number }
    /** Hold layers while the envelope speed tier is at or above a floor —
     *  reconciled from the tier every event carries (Amendment 1a).
     *  Momentum Lock. */
    | { on: 'speed-tier'; effect: 'gated-layers'; minTier: number; layers: RelicLayerSpec[] }
    /** Arm a one-shot horizontal impulse, paid on the first ground contact
     *  after a heart-loss rescue, along the landing's own direction of
     *  travel (zero speed amplifies to zero — relics amplify momentum).
     *  Second Wind. */
    | { on: 'run/heart_lost'; effect: 'arm-landing-impulse'; vxAdd: number }
    /** Gain a heart when a bank's tierReached payload clears a floor —
     *  payload-scaled, with the once-per-segment limiter. Fireproof. */
    | {
          on: 'combo/banked';
          effect: 'gain-heart';
          minTierReached: number;
          oncePerSegment: boolean;
      }
    /** Gain a heart on this relic's own acquisition event. Thick Skin's
     *  "+1 now" — still an event subscription, not a third surface. */
    | { on: 'acquire'; effect: 'gain-heart' };

export interface RelicDef {
    id: string;
    name: string;
    /** Player-facing effect text — the shop card and the codex line. */
    blurb: string;
    rarity: RelicRarity;
    hook: RelicHook;
    /** Permanent-for-the-run tuning layers, pushed at acquisition. */
    layers: RelicLayerSpec[];
    /** Triggered effects (the second frozen surface). */
    triggers: RelicTrigger[];
    tell: RelicTell;
}
