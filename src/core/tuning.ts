/**
 * The runtime tuning table and TuningStack.
 *
 * Every gameplay constant is data (ETHOS: "constants are data" — a hardcoded
 * constant is a relic that can never exist). The values below are the starting
 * table from docs/design/movement.md, not the truth: the feel gate owns the
 * truth, and converged values get committed back here the same session.
 *
 * The TuningStack is THE relic/modifier substrate: a base table plus ordered
 * {key, op, value} layers, tick-stamped, so future systems mutate physics as
 * data instead of code.
 */

export const DEFAULT_TUNING = {
    // --- Jump: the exchange (speed spent on height along a convex curve) ---
    JUMP_BASE: 640, // px/s: standing jump mounts one floor; zero-speed is never a softlock
    EXCHANGE_K: 0.9, // "jump speed is your run speed plus ninety percent"
    SPEED_DEADBAND: 100, // px/s: takeoff speeds below this convert as zero
    JUMP_SPAN: 650, // px/s: the soft-knee tanh span above the knee
    JUMP_HARD_CAP: 2400, // px/s: absolute asymptote — no relic stack outruns the camera
    JUMP_RETENTION: 0.7, // the spend: vx multiplier applied at takeoff

    // --- Gravity family ---
    GRAVITY_RISE: 1500, // px/s^2 while ascending
    GRAVITY_FALL_MULT: 1.35, // fall gravity = rise x this
    APEX_HANG_MULT: 0.6, // hold-gated float at the apex — earned, not ambient
    APEX_HANG_BAND: 60, // px/s: |vy| band where the hang applies
    TERMINAL_FALL: 1300, // px/s: manual clamp in core — body.maxVelocity is never a gameplay clamp

    // --- Run: two regimes, crisp skids, the ice glide ---
    RUN_ACCEL_LOW: 1600, // px/s^2 below the regime knee: 0->400 in 0.25s, hand-in-glove
    RUN_ACCEL_HIGH: 500, // px/s^2 above: the last 400 px/s is a career, not a held key
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
    RUN_DUST_FRAC: 0.5, // of the effective ceiling
    WIND_FRAC: 0.71, // of the effective ceiling
    AFTERIMAGE_FRAC: 0.86, // the master's crown
    SHAKE_MIN_IMPACT: 1100, // px/s: the ONE shake trigger
    MASTER_VOLUME: 0.7, // audio ships audible — the level is audio.md's ruling, one authority

    // --- Player presentation ---
    PLAYER_SCALE: 0.5, // one tile tall; the physics body never reads this
} satisfies Record<string, number>;

export type TuningTable = { -readonly [K in keyof typeof DEFAULT_TUNING]: number };
export type TuningKey = keyof TuningTable;

export type TuningOp = 'mul' | 'add' | 'set';

export interface TuningLayer {
    /** Unique handle so the owning system (relic, modifier) can remove it. */
    id: string;
    key: TuningKey;
    op: TuningOp;
    value: number;
    /** Tick the layer was applied — the audit trail for replays. */
    tick: number;
}

/**
 * Every way the stack can change, as one closed union. The recorder captures
 * ALL of these: layer ops are part of the tuning timeline — a session that
 * pushes a mul layer mid-recording must replay identically (determinism law).
 */
export type TuningChange =
    | { op: 'setBase'; key: TuningKey; value: number }
    | { op: 'pushLayer'; layer: TuningLayer }
    | { op: 'removeLayer'; id: string }
    | { op: 'clearLayers' };

export type TuningChangeListener = (change: TuningChange) => void;

export class TuningStack {
    private readonly base: TuningTable;
    private layers: TuningLayer[] = [];
    private cache: TuningTable;
    private dirty = false;
    private listeners: TuningChangeListener[] = [];

    constructor(defaults: TuningTable = { ...DEFAULT_TUNING }) {
        this.base = { ...defaults };
        this.cache = { ...defaults };
    }

    /** Effective value after folding the layer stack over the base, in order. */
    value(key: TuningKey): number {
        if (this.dirty) {
            this.recompute();
        }
        return this.cache[key];
    }

    baseValue(key: TuningKey): number {
        return this.base[key];
    }

    /** Full effective table (copied) — for the bridge and for consumers that batch-read. */
    snapshot(): TuningTable {
        if (this.dirty) {
            this.recompute();
        }
        return { ...this.cache };
    }

    baseSnapshot(): TuningTable {
        return { ...this.base };
    }

    /**
     * Mutate the base table — the FeelTuner path. Listeners (the recorder)
     * see every change so replays reproduce live tuning sessions.
     */
    setBase(key: TuningKey, value: number): void {
        this.base[key] = value;
        this.dirty = true;
        this.notify({ op: 'setBase', key, value });
    }

    /** Restore a full base table (replay setup). Does not notify listeners. */
    restoreBase(table: TuningTable): void {
        for (const key of Object.keys(this.base) as TuningKey[]) {
            this.base[key] = table[key];
        }
        this.dirty = true;
    }

    /** Restore a full layer list (replay setup). Does not notify listeners. */
    restoreLayers(layers: readonly TuningLayer[]): void {
        this.layers = layers.map((l) => ({ ...l }));
        this.dirty = true;
    }

    pushLayer(layer: TuningLayer): void {
        this.layers.push(layer);
        this.dirty = true;
        this.notify({ op: 'pushLayer', layer: { ...layer } });
    }

    removeLayer(id: string): boolean {
        const before = this.layers.length;
        this.layers = this.layers.filter((l) => l.id !== id);
        const removed = this.layers.length !== before;
        if (removed) {
            this.dirty = true;
            this.notify({ op: 'removeLayer', id });
        }
        return removed;
    }

    clearLayers(): void {
        if (this.layers.length === 0) {
            return;
        }
        this.layers = [];
        this.dirty = true;
        this.notify({ op: 'clearLayers' });
    }

    layerList(): readonly TuningLayer[] {
        return this.layers;
    }

    layersSnapshot(): TuningLayer[] {
        return this.layers.map((l) => ({ ...l }));
    }

    onChange(fn: TuningChangeListener): void {
        this.listeners.push(fn);
    }

    offChange(fn: TuningChangeListener): void {
        this.listeners = this.listeners.filter((l) => l !== fn);
    }

    private notify(change: TuningChange): void {
        for (const fn of this.listeners) {
            fn(change);
        }
    }

    private recompute(): void {
        const next: TuningTable = { ...this.base };
        for (const layer of this.layers) {
            switch (layer.op) {
                case 'mul':
                    next[layer.key] *= layer.value;
                    break;
                case 'add':
                    next[layer.key] += layer.value;
                    break;
                case 'set':
                    next[layer.key] = layer.value;
                    break;
            }
        }
        this.cache = next;
        this.dirty = false;
    }
}
