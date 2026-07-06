/**
 * The starting modifier roster (map-modifiers.md's 12) as data. The
 * mechanical truth of each is its tuning layers — movement/combo/line keys
 * on the one TuningStack — plus genPatch/lootPatch data for the systems that
 * consume them. Prices and pays are stated in one breath, verbatim, on the
 * map label (pillar 2: risk is a price tag, never an ambush).
 *
 * Rollability: a modifier whose PRICE needs unbuilt machinery is excluded
 * from the roll pool (rollable: false) — shipping its pay without its price
 * would put a lie on the label. The roster still carries all 12 as data;
 * Dense Fog and Surging Line stay out until their ambient machinery lands.
 * Recorded in docs/DEVIATIONS.md.
 */
import type { ModifierSpec } from './types';

export const MODIFIER_ROSTER: readonly ModifierSpec[] = [
    {
        id: 'icy_floors',
        name: 'Icy Floors',
        blurb: 'Every ledge is glazed — holds are slippery.',
        price: 'slippery holds (ground drag ×0.4)',
        pay: 'coins +50%',
        tuningLayers: [{ key: 'GROUND_DRAG', op: 'mul', value: 0.4 }],
        lootPatch: { coinsMul: 1.5 },
        rollable: true,
        nasty: true,
        incompatibleWith: ['narrow_ledges'],
    },
    {
        id: 'low_gravity',
        name: 'Low Gravity',
        blurb: 'The air holds you longer than it should.',
        price: 'floatier, slower rhythm (gravity ×0.8)',
        pay: 'combo floor value ×1.25',
        tuningLayers: [
            { key: 'GRAVITY_RISE', op: 'mul', value: 0.8 },
            { key: 'combo.floorValue', op: 'mul', value: 1.25 },
        ],
        rollable: true,
        nasty: true,
    },
    {
        id: 'greedy_line',
        name: 'Greedy Line',
        blurb: 'The world ends faster down there — and pays for it.',
        price: 'line speed ×1.5',
        pay: 'all loot ×2',
        tuningLayers: [{ key: 'line.baseSpeed', op: 'mul', value: 1.5 }],
        lootPatch: { coinsMul: 2 },
        rollable: true,
        nasty: true,
    },
    {
        id: 'narrow_ledges',
        name: 'Narrow Ledges',
        blurb: 'The tower pinches in — less footing everywhere.',
        price: 'platform widths −30%',
        pay: 'coins +75%',
        tuningLayers: [{ key: 'tower.platformWidthMul', op: 'mul', value: 0.7 }],
        lootPatch: { coinsMul: 1.75 },
        rollable: true,
        nasty: true,
        incompatibleWith: ['icy_floors', 'sticky_patches'],
    },
    {
        id: 'brittle_rows',
        name: 'Brittle Rows',
        blurb: 'Some ledges crumble after one touch.',
        price: '15% of platforms crumble after one touch',
        pay: 'better relic odds',
        tuningLayers: [],
        genPatch: { crumbleFraction: 0.15 },
        lootPatch: { relicOddsAdd: 0.15 },
        // Rollable since EXAM landed Amendment 1c's crumble classification
        // (DEVIATIONS entry 10's flip condition, met).
        rollable: true,
        nasty: true,
    },
    {
        id: 'headwind',
        name: 'Headwind',
        blurb: 'The wind leans on you between ledges.',
        price: 'air control ×0.5',
        pay: 'leap spice +0.25',
        tuningLayers: [
            { key: 'AIR_ACCEL', op: 'mul', value: 0.5 },
            { key: 'combo.multLeap', op: 'add', value: 0.25 },
        ],
        rollable: true,
        nasty: true,
        incompatibleWith: ['tailwind'],
    },
    {
        id: 'tailwind',
        name: 'Tailwind',
        blurb: 'The wind is climbing with you — so is the line.',
        price: 'line grace −50%',
        pay: 'run accel +20% (you are faster too)',
        tuningLayers: [
            { key: 'line.graceMs', op: 'mul', value: 0.5 },
            { key: 'line.graceFraction', op: 'mul', value: 0.5 },
            { key: 'RUN_ACCEL_LOW', op: 'mul', value: 1.2 },
            { key: 'RUN_ACCEL_HIGH', op: 'mul', value: 1.2 },
        ],
        rollable: true,
        nasty: true,
        incompatibleWith: ['headwind'],
    },
    {
        id: 'dense_fog',
        name: 'Dense Fog',
        blurb: 'You can barely see the tower above you.',
        price: 'far visibility veiled',
        pay: 'coins +60%',
        tuningLayers: [],
        genPatch: { fogVeil: true },
        lootPatch: { coinsMul: 1.6 },
        // Awaits the parallax-veil skin layer (art-direction.md rider).
        rollable: false,
        nasty: true,
    },
    {
        id: 'sticky_patches',
        name: 'Sticky Patches',
        blurb: 'Goo-splatted ledges drink your speed.',
        price: '10% of platforms drain 30% speed on land',
        pay: 'a bigger bounty',
        // The drain rides the tuning table like every price: the set layer
        // pins the printed 30% even if a future base retune moves the
        // default (the label may never drift from the physics).
        tuningLayers: [{ key: 'land.stickyKeep', op: 'set', value: 0.7 }],
        genPatch: { stickyFraction: 0.1, stickySpeedKeep: 0.7 },
        lootPatch: { bountyCoinsPerFloorAdd: 0.4 },
        // Rollable since EXAM landed Amendment 1c's sticky classification
        // (DEVIATIONS entry 10's flip condition, met).
        rollable: true,
        nasty: true,
        incompatibleWith: ['narrow_ledges'],
    },
    {
        id: 'swarm',
        name: 'Swarm',
        blurb: 'The tower has tenants, and they drift.',
        price: 'small saw critters shave 55% speed on touch',
        pay: 'coins +50%',
        tuningLayers: [{ key: 'exam.swarmSpeedKeep', op: 'set', value: 0.45 }],
        genPatch: { swarm: true },
        lootPatch: { coinsMul: 1.5 },
        // Rollable since passive critters seed through the EXAM swarm
        // runtime and replay path.
        rollable: true,
        nasty: true,
    },
    {
        id: 'double_fuse',
        name: 'Double Fuse',
        blurb: 'The fuse between landings burns twice as long.',
        price: '',
        pay: 'combo grace ×2 — a gift',
        tuningLayers: [{ key: 'combo.groundGraceTicks', op: 'mul', value: 2 }],
        rollable: true,
        gift: true,
    },
    {
        id: 'surging_line',
        name: 'Surging Line',
        blurb: 'The line breathes in telegraphed pulses.',
        price: 'line surges in telegraphed pulses',
        pay: 'loot ×1.75',
        tuningLayers: [],
        genPatch: { lineSurge: { periodMs: 7000, speedMul: 2.5, telegraphMs: 1200 } },
        lootPatch: { coinsMul: 1.75 },
        // EXAM's toolkit, previewed here as data — rolls once surges exist.
        rollable: false,
        nasty: true,
    },
] as const;

const byId = new Map(MODIFIER_ROSTER.map((m) => [m.id, m]));

export function modifierById(id: string): ModifierSpec {
    const spec = byId.get(id);
    if (!spec) {
        throw new Error(`modifiers: unknown modifier ${id}`);
    }
    return spec;
}

export function rollableModifiers(): ModifierSpec[] {
    return MODIFIER_ROSTER.filter((m) => m.rollable && !m.gift);
}

export function compatible(a: ModifierSpec, b: ModifierSpec): boolean {
    if (a.id === b.id) {
        return false;
    }
    return !(a.incompatibleWith?.includes(b.id) || b.incompatibleWith?.includes(a.id));
}

function fail(id: string, why: string): never {
    throw new Error(`modifiers: degenerate roster entry ${id} (${why})`);
}

/**
 * Roster validation — THROWS on degenerates (combo-scoring.md's law,
 * reused): a data typo fails loud at load, never ships a silent lie.
 */
export function validateModifierRoster(roster: readonly ModifierSpec[]): void {
    const seen = new Set<string>();
    for (const m of roster) {
        if (seen.has(m.id)) {
            fail(m.id, 'duplicate id');
        }
        seen.add(m.id);
        if (m.name.length === 0 || m.pay.length === 0) {
            fail(m.id, 'label text missing — the price tag law needs words');
        }
        if (!m.gift && m.price.length === 0) {
            fail(m.id, 'a non-gift modifier must state its price');
        }
        if (m.gift && m.price.length > 0) {
            fail(m.id, 'a gift with a price is not a gift');
        }
        for (const layer of m.tuningLayers) {
            if (!Number.isFinite(layer.value)) {
                fail(m.id, `non-finite layer value on ${layer.key}`);
            }
            if (layer.op === 'mul' && layer.value <= 0) {
                fail(m.id, `mul layer on ${layer.key} must be positive`);
            }
        }
        const g = m.genPatch;
        for (const frac of [g?.crumbleFraction, g?.stickyFraction, g?.stickySpeedKeep]) {
            if (frac !== undefined && (frac < 0 || frac > 1)) {
                fail(m.id, 'genPatch fraction outside [0, 1]');
            }
        }
        const l = m.lootPatch;
        if (l?.coinsMul !== undefined && l.coinsMul <= 0) {
            fail(m.id, 'coinsMul must be positive');
        }
        if (l?.bountyCoinsPerFloorAdd !== undefined && l.bountyCoinsPerFloorAdd < 0) {
            fail(m.id, 'negative bounty');
        }
        if (l?.relicOddsAdd !== undefined && (l.relicOddsAdd < 0 || l.relicOddsAdd > 1)) {
            fail(m.id, 'relic odds outside [0, 1]');
        }
        for (const other of m.incompatibleWith ?? []) {
            if (!roster.some((r) => r.id === other)) {
                fail(m.id, `incompatibleWith references unknown id ${other}`);
            }
        }
    }
}

// Fail loud at module load — the roster is checked before anything rolls it.
validateModifierRoster(MODIFIER_ROSTER);
