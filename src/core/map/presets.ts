/**
 * Node types as segment-spec presets (map-modifiers.md's table) — each a
 * distinct momentum economy, not a reskin. Floors, line profiles, generation
 * overrides, and reward profiles are data; gen.ts rolls a NodeSpec from a
 * preset plus the node's forked stream.
 *
 * Line profile numbers: the doc quantifies the speed multipliers (gentle
 * 0.7×, hot 1.3×) and names the grace qualitatively ("long grace" / "short
 * grace") — the grace multipliers below are this session's starting values
 * for those words, data like everything else.
 */
import type { SegmentTuningOverride } from '../pressure/segment';
import type { LineProfileName, NodeType } from './types';

export interface LineProfilePreset {
    name: LineProfileName;
    /** Shown on the label card — the line's price in one breath. */
    face: string;
    overrides: SegmentTuningOverride[];
}

export const LINE_PROFILES: Record<LineProfileName, LineProfilePreset> = {
    standard: { name: 'standard', face: 'standard line', overrides: [] },
    gentle: {
        name: 'gentle',
        face: 'gentle line, long grace',
        overrides: [
            { key: 'line.baseSpeed', op: 'mul', value: 0.7 },
            { key: 'line.graceMs', op: 'mul', value: 1.5 },
            { key: 'line.graceFloors', op: 'mul', value: 1.5 },
        ],
    },
    hot: {
        name: 'hot',
        face: 'hot line, short grace',
        overrides: [
            { key: 'line.baseSpeed', op: 'mul', value: 1.3 },
            { key: 'line.graceMs', op: 'mul', value: 0.55 },
            { key: 'line.graceFloors', op: 'mul', value: 0.55 },
        ],
    },
    boss: {
        name: 'boss',
        face: 'the boss commands the line',
        // Time-triggered ignition, tuned to land just after the entrance
        // beat (the longest is 4s) — the line lights at the boss's command,
        // and its surges are boss:<attackId> layers pushed mid-duel.
        overrides: [
            { key: 'line.graceMs', op: 'set', value: 4500 },
            { key: 'line.graceFloors', op: 'set', value: 999 },
        ],
    },
    none: { name: 'none', face: '', overrides: [] },
};

export interface ModifierSlotPreset {
    /** Chance the node carries modifiers at all. */
    chance: number;
    min: number;
    max: number;
    /** Challenge draws its exactly-one mutator from the nasty pool. */
    nastyOnly: boolean;
}

export interface NodeTypePreset {
    type: NodeType;
    title: string;
    blurb: string;
    /** Inclusive floor range; null for non-climb nodes (shop/mystery). */
    floors: [number, number] | null;
    lineProfile: LineProfileName;
    /** Generation repricing (wide/tight ledges) — same substrate as modifiers. */
    genOverrides: SegmentTuningOverride[];
    modifierSlots: ModifierSlotPreset;
    /** Placed-loot density multiplier on `coins.perFloor` — the node type's
     *  loot identity (Coin Rush's "coins ×2.5 placement", Elite's lean walls). */
    lootCoinsMul: number;
    /** Inclusive clear-bounty range — nonzero only where the design names a
     *  bounty (Challenge, Boss); placed loot pays everywhere else. */
    clearBounty: [number, number];
    guaranteedRelic: boolean;
    relicOddsAdd: number;
    /** Chance the rare gift modifier (Double Fuse) rides along for free. */
    giftChance: number;
}

export const NODE_PRESETS: Record<NodeType, NodeTypePreset> = {
    climb: {
        type: 'climb',
        title: 'CLIMB',
        blurb: 'A bounded tower — reach the door before the world ends below.',
        floors: [24, 32],
        lineProfile: 'standard',
        genOverrides: [],
        modifierSlots: { chance: 0.3, min: 1, max: 1, nastyOnly: false },
        lootCoinsMul: 1,
        clearBounty: [0, 0],
        guaranteedRelic: false,
        relicOddsAdd: 0,
        giftChance: 0.06,
    },
    coin_rush: {
        type: 'coin_rush',
        title: 'COIN RUSH',
        blurb: 'Short, loud, and paved with loot.',
        floors: [14, 18],
        lineProfile: 'gentle',
        genOverrides: [{ key: 'tower.platformWidthMul', op: 'mul', value: 1.25 }],
        modifierSlots: { chance: 0.2, min: 1, max: 1, nastyOnly: false },
        lootCoinsMul: 2.5, // the doc's "coins ×2.5 placement", now literally placed
        clearBounty: [0, 0],
        guaranteedRelic: false,
        relicOddsAdd: 0,
        giftChance: 0.08,
    },
    challenge: {
        type: 'challenge',
        title: 'CHALLENGE',
        blurb: 'One nasty mutator, one big reward.',
        floors: [22, 28],
        lineProfile: 'standard',
        genOverrides: [],
        modifierSlots: { chance: 1, min: 1, max: 1, nastyOnly: true },
        lootCoinsMul: 1,
        clearBounty: [55, 70], // the design's "large fixed bounty"
        guaranteedRelic: false,
        relicOddsAdd: 0.2,
        giftChance: 0.04,
    },
    elite: {
        type: 'elite',
        title: 'ELITE',
        blurb: 'A brutal stretch of tower guarding a relic.',
        floors: [26, 34],
        lineProfile: 'hot',
        genOverrides: [{ key: 'tower.platformWidthMul', op: 'mul', value: 0.85 }],
        modifierSlots: { chance: 1, min: 1, max: 2, nastyOnly: true },
        lootCoinsMul: 0.75, // tight gen, lean walls — the relic is the pay
        clearBounty: [0, 0],
        guaranteedRelic: true,
        relicOddsAdd: 0,
        giftChance: 0.04,
    },
    shop: {
        type: 'shop',
        title: 'SHOP',
        blurb: 'Spend coins. Catch your breath.',
        floors: null,
        lineProfile: 'none',
        genOverrides: [],
        modifierSlots: { chance: 0, min: 0, max: 0, nastyOnly: false },
        lootCoinsMul: 1,
        clearBounty: [0, 0],
        guaranteedRelic: false,
        relicOddsAdd: 0,
        giftChance: 0,
    },
    mystery: {
        type: 'mystery',
        title: 'MYSTERY',
        blurb: 'Something waits behind this window.',
        floors: null,
        lineProfile: 'none',
        genOverrides: [],
        modifierSlots: { chance: 0, min: 0, max: 0, nastyOnly: false },
        lootCoinsMul: 1,
        clearBounty: [0, 0],
        guaranteedRelic: false,
        relicOddsAdd: 0,
        giftChance: 0,
    },
    boss: {
        type: 'boss',
        title: 'BOSS',
        blurb: 'The keeper of the act waits above. No door until it falls.',
        // The duel arena (EXAM): floors here are the endless tower's
        // generation budget, not a door altitude — the exit materializes on
        // defeat, and the hp budget ends the duel long before the budget.
        floors: [220, 220],
        lineProfile: 'boss',
        genOverrides: [],
        modifierSlots: { chance: 0, min: 0, max: 0, nastyOnly: false },
        lootCoinsMul: 1,
        clearBounty: [90, 110], // "act completion + big bounty"
        guaranteedRelic: false,
        relicOddsAdd: 0,
        giftChance: 0,
    },
};

/** Non-climb specials for the path guarantee (boss is the destination, not
 *  a special; climb is the core verb). */
export const SPECIAL_TYPES: readonly NodeType[] = [
    'coin_rush',
    'challenge',
    'elite',
    'shop',
    'mystery',
];

export function isSpecial(type: NodeType): boolean {
    return SPECIAL_TYPES.includes(type);
}
