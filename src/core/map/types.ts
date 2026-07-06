/**
 * CHOICE-phase map types (docs/design/map-modifiers.md). Engine-free by law.
 *
 * A node is a PRICED MOMENTUM ECONOMY: its mutators, loot, and danger are
 * printed on the label before the player commits (pillar 2). Node contents
 * are rolled at map generation from the node's own forked stream and carried
 * here as data — the map scene renders them, the orchestrator hands
 * pressure.md its SegmentSpec verbatim.
 */
import type { SegmentSpec, SegmentTuningOverride } from '../pressure/segment';

export const MAP_SCHEMA_VERSION = 1;

export const ACT_COUNT = 3;
export const ACT_ROWS = 7;
export const BOSS_ROW = ACT_ROWS - 1;

export type NodeType = 'climb' | 'coin_rush' | 'challenge' | 'elite' | 'shop' | 'mystery' | 'boss';

/** Loot repricing carried as data — consumed by the run economy. Coin
 *  multipliers reprice placed-loot density (SegmentSpec.loot.coinsPerFloor)
 *  and the bounty where a node pays one. `relicOddsAdd` has no consumer yet
 *  (docs/DEVIATIONS.md entry 11 — priced into shop weighting later). */
export interface LootPatch {
    coinsMul?: number;
    bountyCoinsAdd?: number;
    relicOddsAdd?: number;
}

/**
 * Generation/skin patches carried as data. Fields without a live consumer
 * yet are the reason their modifier is not rollable (see ModifierSpec) —
 * crumble/sticky await movement.md Amendment 1c's land classifications,
 * the swarm awaits critter entities, the fog veil awaits its skin layer,
 * and the line surge is EXAM's toolkit.
 */
export interface GenPatch {
    crumbleFraction?: number;
    stickyFraction?: number;
    stickySpeedKeep?: number;
    swarm?: boolean;
    fogVeil?: boolean;
    lineSurge?: { periodMs: number; speedMul: number; telegraphMs: number };
}

/**
 * A priced mutator, arriving as data. The mechanical truth is the tuning
 * layers (pushed at run/segment_start with owner `segment:<nodeId>`, popped
 * at segment end — the TuningStack substrate). Every modifier states its
 * price and its pay in one breath on the map label.
 */
export interface ModifierSpec {
    id: string;
    name: string;
    blurb: string;
    /** What it costs you — one breath, shown verbatim on the card. */
    price: string;
    /** What it gives — one breath, shown verbatim on the card. */
    pay: string;
    tuningLayers: SegmentTuningOverride[];
    genPatch?: GenPatch;
    lootPatch?: LootPatch;
    /**
     * False while the machinery the price depends on is unbuilt: an
     * unpriced pay would be a lie on the label (pillar 2), so the roll
     * pool excludes it until its systems land. The roster still ships the
     * full 12 as data.
     */
    rollable: boolean;
    /** Pay with no price (Double Fuse) — rolled rarely, on its own slot. */
    gift?: boolean;
    /** Challenge nodes draw their one nasty mutator from these. */
    nasty?: boolean;
    /** Compatibility matrix: pairs whose stack is illegible misery. */
    incompatibleWith?: string[];
}

/** What a node pays on clear — data for the card and the run economy. */
export interface NodeRewards {
    /**
     * Paid on clear where the design names a bounty (Challenge's "large
     * fixed bounty", Boss's "big bounty"); zero elsewhere — placed loot is
     * the working economy (relics-economy.md; DEVIATIONS.md entry 11).
     */
    clearBounty: number;
    /** Folded product of the node's lootPatch coin multipliers — reprices
     *  placed-loot density at generation and multiplies the bounty. */
    coinsMul: number;
    /** Elite: the relic is granted on clear, seeded `relic:<nodeId>`. */
    guaranteedRelic: boolean;
    relicOddsAdd: number;
}

export type LineProfileName = 'standard' | 'gentle' | 'hot' | 'boss' | 'none';

export interface NodeSpec {
    id: string;
    actIndex: number;
    row: number;
    col: number;
    type: NodeType;
    /** Ids of connected nodes in row + 1 (adjacent rows only, no crossings). */
    edgesUp: string[];
    modifierIds: string[];
    /**
     * The segment spec, pre-built at generation (climbable types and boss
     * arenas — real duels since EXAM, `spec.boss = bossForAct(act).id`);
     * null for shop/mystery. `map/node_committed` hands this to pressure
     * verbatim.
     */
    segment: SegmentSpec | null;
    rewards: NodeRewards;
    lineProfile: LineProfileName;
    /** Mystery nodes: the event id plus the pre-rolled outcome in [0, 1) —
     *  seeded outcomes, never meta-RNG. */
    mysteryEventId: string | null;
    mysteryRoll: number | null;
}

export interface ActGraph {
    schemaVersion: number;
    actIndex: number;
    seed: string;
    /** The fork label that produced this graph — regen bumps are auditable. */
    forkLabel: string;
    /** How many validation regenerations it took (watch per the doc's risk). */
    regenCount: number;
    rows: NodeSpec[][];
}

export function nodeById(graph: ActGraph, nodeId: string): NodeSpec {
    for (const row of graph.rows) {
        for (const node of row) {
            if (node.id === nodeId) {
                return node;
            }
        }
    }
    throw new Error(`map: unknown node ${nodeId} in act ${graph.actIndex}`);
}

export function nodeIdOf(actIndex: number, row: number, col: number): string {
    return `a${actIndex}-r${row}-c${col}`;
}
