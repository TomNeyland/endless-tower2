/**
 * The starting roster — all 24 relics from docs/design/relics-economy.md as
 * data, exact names/rarities/effects, grouped by their spine hook. Every
 * entry names how it amplifies momentum earned/kept/routed/spent; provenance
 * is blind by law. Rarity gates power: commons tune, uncommons bend, rares
 * break locally, legendaries redefine a run.
 *
 * The named synergy recipes are design targets, not accidents:
 *   Momentum Lock + Echo Walls + Slow Fuse  = the perma-combo comet
 *   High Voltage + Skyhook + Launch Pad     = the sky-castle build
 *   Compounder + Safety Net                 = the gambler
 * IDENTITY's acceptance harness asserts all three at full stack.
 *
 * "+X% jump velocity" effects multiply BOTH exchange terms (JUMP_BASE and
 * EXCHANGE_K), which scales the raw pre-knee vy exactly — the soft knee and
 * the absolute JUMP_HARD_CAP still bound the result. No relic touches
 * JUMP_HARD_CAP; effects.ts validation throws on any layer that tries.
 */
import type { RelicDef } from './types';

/** COMET's ladder index — Fireproof's payload gate reads combo/banked.tierReached. */
export const COMET_TIER_INDEX = 5;

export const RELICS: readonly RelicDef[] = [
    // --- EARN (how speed is built) ---
    {
        id: 'sprinters-creed',
        name: "Sprinter's Creed",
        blurb: 'Run acceleration ×1.2 — both gears.',
        rarity: 'common',
        hook: 'earn',
        layers: [
            { key: 'RUN_ACCEL_LOW', op: 'mul', value: 1.2 },
            { key: 'RUN_ACCEL_HIGH', op: 'mul', value: 1.2 },
        ],
        triggers: [],
        tell: { color: 0xffd24a, style: 'spark' },
    },
    {
        id: 'cold-start',
        name: 'Cold Start',
        blurb: '+60% acceleration for 0.5s after every landing.',
        rarity: 'common',
        hook: 'earn',
        layers: [],
        triggers: [
            {
                on: 'movement/land',
                effect: 'timed-layers',
                layers: [
                    { key: 'RUN_ACCEL_LOW', op: 'mul', value: 1.6 },
                    { key: 'RUN_ACCEL_HIGH', op: 'mul', value: 1.6 },
                ],
                durationTicks: 30,
            },
        ],
        tell: { color: 0xffa03a, style: 'spark' },
    },
    {
        id: 'turn-artist',
        name: 'Turn Artist',
        blurb: 'Turn acceleration ×1.35 — skids become weapons.',
        rarity: 'uncommon',
        hook: 'earn',
        layers: [{ key: 'TURN_ACCEL', op: 'mul', value: 1.35 }],
        triggers: [],
        tell: { color: 0xff7a5a, style: 'orbit' },
    },
    {
        id: 'second-wind',
        name: 'Second Wind',
        blurb: 'After a rescue, your first ground contact grants +400 px/s.',
        rarity: 'rare',
        hook: 'earn',
        layers: [],
        triggers: [{ on: 'run/heart_lost', effect: 'arm-landing-impulse', vxAdd: 400 }],
        tell: { color: 0xff4a6a, style: 'aura' },
    },

    // --- KEEP (how speed survives) ---
    {
        id: 'long-glide',
        name: 'Long Glide',
        blurb: 'Ground drag ×0.6 — the ice gets icier.',
        rarity: 'common',
        hook: 'keep',
        layers: [{ key: 'GROUND_DRAG', op: 'mul', value: 0.6 }],
        triggers: [],
        tell: { color: 0xbfe8ff, style: 'orbit' },
    },
    {
        id: 'momentum-lock',
        name: 'Momentum Lock',
        blurb: 'Zero drag while at speed tier 2 or higher.',
        rarity: 'rare',
        hook: 'keep',
        layers: [],
        triggers: [
            {
                on: 'speed-tier',
                effect: 'gated-layers',
                minTier: 2,
                layers: [{ key: 'GROUND_DRAG', op: 'set', value: 0 }],
            },
        ],
        tell: { color: 0x6ad8ff, style: 'aura' },
    },
    {
        id: 'featherfall',
        name: 'Featherfall',
        blurb: 'Fall gravity ×0.88 — arcs hang longer.',
        rarity: 'uncommon',
        hook: 'keep',
        layers: [{ key: 'GRAVITY_FALL_MULT', op: 'mul', value: 0.88 }],
        triggers: [],
        tell: { color: 0xd8ecff, style: 'orbit' },
    },
    {
        id: 'iron-lungs',
        name: 'Iron Lungs',
        blurb: 'Line slack +400px — breathing room before catch-up.',
        rarity: 'uncommon',
        hook: 'keep',
        layers: [{ key: 'line.slackPx', op: 'add', value: 400 }],
        triggers: [],
        tell: { color: 0x9fb4c8, style: 'orbit' },
    },

    // --- ROUTE (what walls give) ---
    {
        id: 'flip-coach',
        name: 'Flip Coach',
        blurb: 'Stick-flip grace ×1.5 after every bounce.',
        rarity: 'common',
        hook: 'route',
        layers: [{ key: 'STICK_FLIP_GRACE_MS', op: 'mul', value: 1.5 }],
        triggers: [],
        tell: { color: 0xa8ffd0, style: 'orbit' },
    },
    {
        id: 'echo-walls',
        name: 'Echo Walls',
        blurb: 'Bounce escrow cap ratio 2.0 — chains drink deeper.',
        rarity: 'uncommon',
        hook: 'route',
        layers: [{ key: 'combo.bounceFloorsCapRatio', op: 'set', value: 2.0 }],
        triggers: [],
        tell: { color: 0x7affc8, style: 'aura' },
    },
    {
        id: 'wall-charger',
        name: 'Wall Charger',
        blurb: 'Wall efficiency ×1.05 — walls finally pump, because you bought it.',
        rarity: 'rare',
        hook: 'route',
        layers: [{ key: 'WALL_EFFICIENCY', op: 'mul', value: 1.05 }],
        triggers: [],
        tell: { color: 0x4affa0, style: 'aura' },
    },
    {
        id: 'perfect-ear',
        name: 'Perfect Ear',
        blurb: 'Combo perfect window +3 ticks.',
        rarity: 'uncommon',
        hook: 'route',
        layers: [{ key: 'combo.perfectWindowTicks', op: 'add', value: 3 }],
        triggers: [],
        tell: { color: 0xd0ffa8, style: 'spark' },
    },

    // --- SPEND (what jumps buy) ---
    {
        id: 'high-voltage',
        name: 'High Voltage',
        blurb: 'Exchange rate +0.08 — every jump converts hotter.',
        rarity: 'uncommon',
        hook: 'spend',
        layers: [{ key: 'EXCHANGE_K', op: 'add', value: 0.08 }],
        triggers: [],
        tell: { color: 0xfff06a, style: 'spark' },
    },
    {
        id: 'deep-pockets',
        name: 'Deep Pockets',
        blurb: 'Jump retention +0.06 — spend less per leap.',
        rarity: 'uncommon',
        hook: 'spend',
        layers: [{ key: 'JUMP_RETENTION', op: 'add', value: 0.06 }],
        triggers: [],
        tell: { color: 0xe8c86a, style: 'orbit' },
    },
    {
        id: 'skyhook',
        name: 'Skyhook',
        blurb: 'Apex hang band ×2 and hang gravity ×0.5 — own the top of every arc.',
        rarity: 'rare',
        hook: 'spend',
        layers: [
            { key: 'APEX_HANG_BAND', op: 'mul', value: 2 },
            { key: 'APEX_HANG_MULT', op: 'mul', value: 0.5 },
        ],
        triggers: [],
        tell: { color: 0xc8a8ff, style: 'aura' },
    },
    {
        id: 'launch-pad',
        name: 'Launch Pad',
        blurb: '+25% jump velocity for 2s after a combo tier crossing.',
        rarity: 'rare',
        hook: 'spend',
        layers: [],
        triggers: [
            {
                on: 'combo/tier',
                effect: 'timed-layers',
                layers: [
                    { key: 'JUMP_BASE', op: 'mul', value: 1.25 },
                    { key: 'EXCHANGE_K', op: 'mul', value: 1.25 },
                ],
                durationTicks: 120,
            },
        ],
        tell: { color: 0xffb84a, style: 'aura' },
    },

    // --- CHAIN (what the nervous system pays) ---
    {
        id: 'slow-fuse',
        name: 'Slow Fuse',
        blurb: 'Grace fuse +24 ticks — the window breathes.',
        rarity: 'common',
        hook: 'chain',
        layers: [{ key: 'combo.groundGraceTicks', op: 'add', value: 24 }],
        triggers: [],
        tell: { color: 0xffe28a, style: 'orbit' },
    },
    {
        id: 'golden-floors',
        name: 'Golden Floors',
        blurb: 'Combo floor value +5.',
        rarity: 'common',
        hook: 'chain',
        layers: [{ key: 'combo.floorValue', op: 'add', value: 5 }],
        triggers: [],
        tell: { color: 0xffd700, style: 'spark' },
    },
    {
        id: 'stumble-charm',
        name: 'Stumble Charm',
        blurb: '+1 stumble charge — one fizzle forgiven per chain.',
        rarity: 'uncommon',
        hook: 'chain',
        layers: [{ key: 'combo.stumblesAllowed', op: 'add', value: 1 }],
        triggers: [],
        tell: { color: 0xffc8e8, style: 'orbit' },
    },
    {
        id: 'safety-net',
        name: 'Safety Net',
        blurb: 'A voided chain refunds half its unpaid payout.',
        rarity: 'uncommon',
        hook: 'chain',
        layers: [{ key: 'combo.voidRefundFraction', op: 'set', value: 0.5 }],
        triggers: [],
        tell: { color: 0x8ad8c8, style: 'orbit' },
    },
    {
        id: 'compounder',
        name: 'Compounder',
        blurb: 'Chain exponent +0.15 — the quadratic gets hungrier.',
        rarity: 'legendary',
        hook: 'chain',
        layers: [{ key: 'combo.chainExponent', op: 'add', value: 0.15 }],
        triggers: [],
        tell: { color: 0xff8aff, style: 'aura' },
    },
    {
        id: 'fireproof',
        name: 'Fireproof',
        blurb: 'Banking a COMET-or-higher chain grants a heart, once per segment.',
        rarity: 'rare',
        hook: 'chain',
        layers: [],
        triggers: [
            {
                on: 'combo/banked',
                effect: 'gain-heart',
                minTierReached: COMET_TIER_INDEX,
                oncePerSegment: true,
            },
        ],
        tell: { color: 0xff6a3a, style: 'aura' },
    },

    // --- BODY (survival economy) ---
    {
        id: 'thick-skin',
        name: 'Thick Skin',
        blurb: 'Max hearts +1 (and +1 now).',
        rarity: 'common',
        hook: 'body',
        layers: [{ key: 'hearts.max', op: 'add', value: 1 }],
        triggers: [{ on: 'acquire', effect: 'gain-heart' }],
        tell: { color: 0xff9a9a, style: 'orbit' },
    },
    {
        id: 'long-grace',
        name: 'Long Grace',
        blurb: 'Line ignition grace ×1.5 — both halves of the dual trigger.',
        rarity: 'uncommon',
        hook: 'body',
        layers: [
            { key: 'line.graceMs', op: 'mul', value: 1.5 },
            { key: 'line.graceFloors', op: 'mul', value: 1.5 },
        ],
        triggers: [],
        tell: { color: 0xc8e8a8, style: 'orbit' },
    },
];

const BY_ID = new Map(RELICS.map((r) => [r.id, r]));

/** Lookup that fails loud — an unknown relic id is a bug, never a shrug. */
export function relicById(id: string): RelicDef {
    const relic = BY_ID.get(id);
    if (!relic) {
        throw new Error(`relics: unknown relic id "${id}"`);
    }
    return relic;
}

export function relicsByRarity(rarity: RelicDef['rarity']): RelicDef[] {
    return RELICS.filter((r) => r.rarity === rarity);
}

/** The bridge's one-sentence build readout (docs/design/relics-economy.md). */
export function buildReadout(
    relicIds: readonly string[],
    hearts: number,
    heartsMax: number,
    coins: number,
    stumbleCharges: number,
): string {
    const names = relicIds.map((id) => relicById(id).name);
    const build = names.length > 0 ? names.join(' + ') : 'no relics';
    const charges = stumbleCharges > 0 ? `, ${stumbleCharges} stumble charge(s)` : '';
    return `${build} — ${hearts}/${heartsMax} hearts, ${coins} coins${charges}.`;
}
