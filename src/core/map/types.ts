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
 *  multipliers apply to segment coin earnings (the clear bounty today;
 *  placed loot when IDENTITY lands it). Relic odds are IDENTITY passthrough. */
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
     * PLACEHOLDER ECONOMY, marked for IDENTITY: until placed loot exists,
     * clearing a segment pays this bounty (× coinsMul). IDENTITY's economy
     * absorbs or replaces it — the field name is the reconciliation seam.
     */
    clearBounty: number;
    /** Folded product of the node's lootPatch coin multipliers. */
    coinsMul: number;
    guaranteedRelic: boolean;
    relicOddsAdd: number;
}

/** Shop stock, rolled from `shop:<nodeId>` at map generation. Hearts only
 *  until IDENTITY stocks relics/rerolls — the minimal real shop. */
export interface ShopStock {
    heartPrice: number;
    heartsAvailable: number;
}

export type LineProfileName = 'standard' | 'gentle' | 'hot' | 'none';

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
     * The segment spec, pre-built at generation (climbable types and the
     * boss stub); null for shop/mystery. `map/node_committed` hands this to
     * pressure verbatim.
     */
    segment: SegmentSpec | null;
    rewards: NodeRewards;
    lineProfile: LineProfileName;
    /** Mystery nodes: the event id plus the pre-rolled outcome in [0, 1) —
     *  seeded outcomes, never meta-RNG. */
    mysteryEventId: string | null;
    mysteryRoll: number | null;
    shopStock: ShopStock | null;
    /** True on the boss node while it commits to the EXAM-phase placeholder
     *  segment (a hardened climb). EXAM replaces the stub with the duel. */
    bossStub: boolean;
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
