/**
 * The default tuning table — every gameplay constant, as data.
 *
 * (ETHOS: "constants are data" — a hardcoded constant is a relic that can
 * never exist.) The values below are the starting table from
 * docs/design/movement.md, not the truth: the feel gate owns the truth, and
 * converged values get committed back here the same session.
 *
 * The table is pure data; the machinery that layers relics and modifiers
 * over it lives in ./tuning.ts (the TuningStack) — split so neither half
 * crowds the file cap as systems keep adding rows.
 */
import { DEFAULT_COMBO_TUNING } from './combo/tuning';
import { DEFAULT_DIFFICULTY_TUNING } from './difficulty/tuning';
import { DEFAULT_IDENTITY_TUNING } from './economy/tuning';
import { DEFAULT_EXAM_TUNING } from './exam/tuning';

export const DEFAULT_TUNING = {
    // --- Jump: the exchange (speed spent on height along a convex curve) ---
    JUMP_BASE: 640, // px/s: standing jump mounts one floor; zero-speed is never a softlock
    EXCHANGE_K: 0.9, // "jump speed is your run speed plus ninety percent"
    SPEED_DEADBAND: 100, // px/s: takeoff speeds below this convert as zero
    JUMP_SPAN: 650, // px/s: the soft-knee tanh span above the knee
    JUMP_HARD_CAP: 2400, // px/s: absolute asymptote — no relic stack outruns the camera
    JUMP_RETENTION: 0.84, // the spend: vx multiplier applied at takeoff — raised from
    // 0.70 across human feel passes: below 0.80, jump-spend vs runway-earn
    // reached equilibrium before the "screen on fire" band. 0.84 lets good
    // routing climb into tier 4 without making held-key running the answer.

    // --- Gravity family ---
    GRAVITY_RISE: 1500, // px/s^2 while ascending
    GRAVITY_FALL_MULT: 1.35, // fall gravity = rise x this
    APEX_HANG_MULT: 0.6, // hold-gated float at the apex — earned, not ambient
    APEX_HANG_BAND: 60, // px/s: |vy| band where the hang applies
    TERMINAL_FALL: 1300, // px/s: manual clamp in core — body.maxVelocity is never a gameplay clamp

    // --- Run: two regimes, crisp skids, the ice glide ---
    RUN_ACCEL_LOW: 1600, // px/s^2 below the regime knee: 0->400 in 0.25s, hand-in-glove
    RUN_ACCEL_HIGH: 650, // px/s^2 above: the top is reachable without turning held-key into the answer
    RUN_REGIME_SPEED: 400, // px/s: boundary between the two regimes
    TURN_ACCEL: 2600, // px/s^2 when input opposes velocity — the skid
    GROUND_DRAG: 350, // px/s^2 with no input — a 900 px/s coast survives ~2.6s
    AIR_ACCEL: 400, // px/s^2: air is spent, not earned
    AIR_DRAG: 0, // airborne momentum is sacred
    MAX_RUN_SPEED: 1400, // px/s: the effective ceiling; manual clamp

    // --- Speed tiers (fractions of the effective ceiling — self-repricing) ---
    TIER_FRAC_1: 0.29,
    TIER_FRAC_2: 0.5,
    TIER_FRAC_3: 0.71,
    TIER_FRAC_4: 0.89,
    TIER_HYSTERESIS: 50, // px/s

    // --- Input forgiveness (each named, tagged, counted) ---
    BUFFER_MS: 100, // edge-stamped, consumed on the landing tick with landing-tick vx
    COYOTE_MS: 80, // walk-off only; jump departures never earn coyote
    JUMP_CUT_MULT: 0.45, // vy multiplier on early release, once per air
    JUMP_CUT_MIN_RISE_MS: 80, // ascent required before a cut is allowed
    REGROUND_LOCKOUT_TICKS: 3, // engineering guard only; its counter must read 0 forever

    // --- FlappyTower mobile input shell (game-layer policy, same InputFrame) ---
    'flappytower.edgeGuardPx': 84, // max inset before the auto-pacer turns on a runway
    'flappytower.edgeGuardRunwayFrac': 0.55, // narrow ledges spend this share of their usable half-runway
    'flappytower.directionSeedSpeed': 90, // landing vx needed to seed the next committed run direction

    // --- Walls: the routing law ---
    WALL_EFFICIENCY: 1.0, // lossless — never a tax, never a pump; modifiers arrive as data
    WALL_MIN_BOUNCE_SPEED: 150, // px/s: below this a contact is a lean, not a bounce
    WALL_PERFECT_WINDOW_TICKS: 5, // detection only — zero physics effect
    STICK_FLIP_GRACE_MS: 120, // input toward the old direction reads neutral after a bounce

    // --- Movement facts ---
    STALL_SPEED: 80, // px/s: grounded slower than this is hesitation
    STALL_MS: 750, // hesitation must persist this long to become a fact
    REVERSAL_MIN_SPEED: 300, // px/s: sign flips from at least this speed are reversals
    FLOOR_HEIGHT_PX: 128, // the tower's vertical unit

    // --- Camera rig (reads player kinematics, nothing else, ever) ---
    CAM_ANCHOR: 0.6, // proxy anchor as a fraction of screen height from the top
    CAM_LOOKAHEAD_TIME: 0.2, // seconds of velocity lookahead
    CAM_LOOKAHEAD_CLAMP: 180, // px
    CAM_LOOKAHEAD_LERP: 0.08,
    CAM_LERP_UP: 0.12,
    CAM_LERP_DOWN: 0.08, // falls never yank

    // --- Juice (sprite-only, event-driven, deletable) ---
    JUICE_SCALE: 1.0, // the global restraint knob
    DUST_MIN_IMPACT: 400, // px/s landing impact before dust appears
    RUN_DUST_FRAC: 0.42, // of the effective ceiling
    WIND_FRAC: 0.62, // of the effective ceiling
    AFTERIMAGE_FRAC: 0.78, // the master's crown
    SHAKE_MIN_IMPACT: 1100, // px/s: the ONE shake trigger
    'juice.landShakeAmpPx': 2, // FEEL's whole shake budget, now one scheduler contender
    'juice.landShakeMs': 90,
    'juice.spinStartSpeed': 420, // px/s: accessible cartwheel threshold
    'juice.spinFullSpeed': 1250, // px/s: speed that reaches max spin
    'juice.spinExponent': 1.35, // gentle at entry, wild near the ceiling
    'juice.spinMaxRadPerSec': 36, // v1's fun made legible, not debug-noisy
    'juice.wallSpinMul': 1.12, // wall redirects punch slightly harder visually
    'juice.afterburnerFrac': 0.58, // orange exhaust begins before afterimages
    'juice.afterburnerMs': 38,
    'juice.afterburnerMinParticles': 1,
    'juice.afterburnerMaxParticles': 3,
    'juice.spinAfterburnerHeat': 0.45,
    'juice.wallSparkMinParticles': 3,
    'juice.wallSparkMaxParticles': 12,
    'juice.windMs': 38,
    'juice.afterimageMs': 42,
    MASTER_VOLUME: 0.7, // audio ships audible — the level is audio.md's ruling, one authority

    // --- Player presentation ---
    PLAYER_SCALE: 0.5, // one tile tall; the physics body never reads this

    // --- PRESSURE: the death line (docs/design/pressure.md) ---
    'line.baseSpeed': 55, // px/s: dormant->active base rise speed
    'line.rampPerFloor': 0.2, // px/s per floor: 100 floors preserve the old 30-floor total arc
    'line.graceMs': 10000, // dual activation trigger, half one: time
    'line.graceFraction': 1 / 3, // dual trigger half two: progress fraction, length-independent
    'line.slackPx': 360, // visible catch-up leash: relevance on god-runs, never pity
    'line.catchUpFactor': 2.4, // x base while the gap exceeds the slack
    'line.igniteOffsetPx': 128, // ignition starts one floor below the arena bottom — announced, never an instant catch
    'line.proximitySafePx': 800, // broadcast boundaries: each tier's outer edge...
    'line.proximityAwarePx': 400,
    'line.proximityDangerPx': 200,
    'line.proximityCriticalPx': 80,
    'line.proximityHysteresisPx': 40, // ...crossed with this much slack on the way back out

    // --- PRESSURE: hearts (the mercy that preserves the fantasy) ---
    'hearts.max': 3,
    'hearts.start': 3, // generous by design; shops sell them back (IDENTITY)
    'hearts.rescueVy': -1500, // px/s: the skyward mercy — must clear the line's next ~2s of rise
    'hearts.rescueVxKeep': 0.5, // vx multiplier at rescue: the momentum story stays intact
    'hearts.invulnMs': 1600, // blink window; the line cannot re-catch (and never pauses)

    // --- PRESSURE: segments ---
    'segment.doorBufferFloors': 6, // visual continuity above the exit — scenery, not play space
    'segment.defaultFloors': 100, // the bridge's no-argument segment length
    'segment.sandboxFloors': 300, // endless feel-gate generation budget

    // --- CHOICE: the map and the tower generator's repriceable knobs ---
    'map.maxRegens': 16, // validate-or-regenerate budget; exceeding it THROWS (map-modifiers.md)
    ...DEFAULT_DIFFICULTY_TUNING,

    // --- Combo & score (MASTERY): defaults live in src/core/combo/tuning.ts;
    //     merged here so relics/modifiers need zero combo-specific plumbing ---
    ...DEFAULT_COMBO_TUNING,

    // --- Coins, shop, powerups (IDENTITY): defaults live in
    //     src/core/economy/tuning.ts, merged by the same rule ---
    ...DEFAULT_IDENTITY_TUNING,

    // --- Bosses, land classifications, wind, swarm (EXAM): defaults live in
    //     src/core/exam/tuning.ts, merged by the same rule ---
    ...DEFAULT_EXAM_TUNING,
} satisfies Record<string, number>;

export type TuningTable = { -readonly [K in keyof typeof DEFAULT_TUNING]: number };
export type TuningKey = keyof TuningTable;
