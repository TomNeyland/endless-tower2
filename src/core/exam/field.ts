/**
 * The platform field — per-platform landing state for a running segment
 * (EXAM; movement.md Amendment 1c made real). Engine-free and REPLAYABLE:
 * the browser and the headless replay step this exact code once per tick.
 *
 * Two ways a platform's state changes, two channels:
 *  1. REGENERABLE transitions — a landing on a crumble-classified ledge arms
 *     its collapse; the collapse timer expires. Pure functions of the land
 *     events and the tick, so the headless replay re-derives them from the
 *     recording with zero extra data.
 *  2. COMMANDED transitions — boss attacks (crumble volley, sticky spit,
 *     body slam, the defeat door). The brain runs browser-side only, so its
 *     commands ride the session recording's exam-command timeline
 *     (commands.ts) and replay frame-stamped, like tuning mutations.
 *
 * Removal is a physics fact: both worlds (PlayerSystem statics, the headless
 * mirror) consume the step's FieldChange list and stop colliding the ledge.
 * The glow-before-collapse delay is the telegraph — risk stays a price tag
 * even mid-duel (pillar 2), and the mandate's "platforms GLOW before
 * crumbling" is this state, rendered.
 */
import type { LandClassification } from '../events';
import type { PlatformSpec } from '../tower';

export type PlatformPhase = 'intact' | 'collapsing' | 'gone';

export interface PlatformFieldEntry {
    id: number;
    classification: LandClassification | null;
    phase: PlatformPhase;
    /** Absolute tick the ledge stops existing; null while intact. */
    collapseAtTick: number | null;
}

/** One observable state change, in tick order — the view and the physics
 *  layers consume these; nothing polls. */
export type FieldChange =
    | { kind: 'collapse_started'; platformId: number; collapseAtTick: number }
    | { kind: 'removed'; platformId: number }
    | { kind: 'classified'; platformId: number; classification: LandClassification | null };

export class PlatformField {
    private readonly entries = new Map<number, PlatformFieldEntry>();
    private pending: FieldChange[] = [];

    constructor(platforms: readonly Pick<PlatformSpec, 'id' | 'landClass'>[]) {
        for (const p of platforms) {
            this.entries.set(p.id, {
                id: p.id,
                classification: p.landClass ?? null,
                phase: 'intact',
                collapseAtTick: null,
            });
        }
    }

    /** The detection layers' lookup at contact time. Removed ledges never
     *  reach this (they no longer collide); collapsing ones still classify. */
    classification(platformId: number): LandClassification | undefined {
        return this.entry(platformId).classification ?? undefined;
    }

    isRemoved(platformId: number): boolean {
        return this.entry(platformId).phase === 'gone';
    }

    phase(platformId: number): PlatformPhase {
        return this.entry(platformId).phase;
    }

    /**
     * A landing happened (fed from the land event by both worlds): a touch
     * on a crumble ledge arms its collapse after the tuned glow delay.
     * Regenerable channel — never recorded.
     */
    handleLand(platformId: number, tick: number, crumbleDelayTicks: number): void {
        const entry = this.entry(platformId);
        if (entry.classification === 'crumble' && entry.phase === 'intact') {
            this.beginCollapse(entry, tick + Math.round(crumbleDelayTicks));
        }
    }

    /** Commanded collapse (volley resolve, slam impact, forced): the ledge
     *  glows for delayTicks, then goes. Already-collapsing ledges keep their
     *  earlier deadline — an attack never extends a life. */
    commandCollapse(platformId: number, tick: number, delayTicks: number): void {
        const entry = this.entry(platformId);
        if (entry.phase !== 'intact') {
            return;
        }
        this.beginCollapse(entry, tick + Math.max(1, Math.round(delayTicks)));
    }

    /** Commanded classification (sticky spit lands goo; null clears). */
    commandClassify(platformId: number, classification: LandClassification | null): void {
        const entry = this.entry(platformId);
        if (entry.phase === 'gone') {
            return;
        }
        entry.classification = classification;
        this.pending.push({ kind: 'classified', platformId, classification });
    }

    /** One fixed tick: expire collapse timers. Returns every change since
     *  the last step (commands included), in occurrence order. */
    step(tick: number): FieldChange[] {
        for (const entry of this.entries.values()) {
            if (entry.phase === 'collapsing' && entry.collapseAtTick !== null) {
                if (tick >= entry.collapseAtTick) {
                    entry.phase = 'gone';
                    entry.collapseAtTick = null;
                    this.pending.push({ kind: 'removed', platformId: entry.id });
                }
            }
        }
        const changes = this.pending;
        this.pending = [];
        return changes;
    }

    /** Ids of intact platforms — the brain targets only what still exists. */
    intactIds(): number[] {
        const ids: number[] = [];
        for (const entry of this.entries.values()) {
            if (entry.phase === 'intact') {
                ids.push(entry.id);
            }
        }
        return ids;
    }

    /** Diagnostics snapshot (bridge) — never read by the game. */
    snapshot(): PlatformFieldEntry[] {
        return [...this.entries.values()].map((e) => ({ ...e }));
    }

    private beginCollapse(entry: PlatformFieldEntry, collapseAtTick: number): void {
        entry.phase = 'collapsing';
        entry.collapseAtTick = collapseAtTick;
        this.pending.push({
            kind: 'collapse_started',
            platformId: entry.id,
            collapseAtTick,
        });
    }

    private entry(platformId: number): PlatformFieldEntry {
        const entry = this.entries.get(platformId);
        if (!entry) {
            throw new Error(`platform field: unknown platform ${platformId}`);
        }
        return entry;
    }
}

/**
 * Roll the initial classifications for a freshly generated layout from the
 * spec's field fractions — deterministic (its own labeled fork), and bounded
 * by the no-adjacent-crumble rule: the generator's reachability chain proves
 * platform i is reachable from i−1, so at most every OTHER link may be
 * removable — one missing rung is a hard jump the mid-band runway clears,
 * two would be a softlock the death line then monetizes unfairly.
 */
export function rollFieldClassifications(
    platforms: PlatformSpec[],
    rng: () => number,
    fractions: { crumbleFraction: number; stickyFraction: number },
    excludeIds: readonly number[],
): void {
    let prevCrumble = false;
    for (const p of platforms) {
        if (p.id === 0 || excludeIds.includes(p.id)) {
            prevCrumble = false;
            continue;
        }
        const roll = rng();
        if (roll < fractions.crumbleFraction && !prevCrumble) {
            p.landClass = 'crumble';
            prevCrumble = true;
        } else if (roll < fractions.crumbleFraction + fractions.stickyFraction) {
            p.landClass = 'sticky';
            prevCrumble = false;
        } else {
            prevCrumble = false;
        }
    }
}
