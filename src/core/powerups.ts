/**
 * Timed powerups — in-segment spice (docs/design/relics-economy.md). Short,
 * loud, legible; they layer over the relic build via temporary tuning layers
 * on the SAME substrate (owner `powerup:<id>`, auto-popped on expiry —
 * nothing new to invent). Spawns are visible on approach and seeded from
 * fork(spec.seed, 'powerups:<segmentId>').
 *
 * "+X% jump velocity" multiplies both exchange terms (the roster's rule);
 * Ghost holds the line's catch through the `line.ghost` tuning row (the
 * runtime reads it like any other line constant — the line still rises);
 * Coin Storm raises `coins.stormRate`, which the coin field reads to rain
 * wallet coins near the player. The absolute limit applies here too:
 * validation throws on any powerup layer touching JUMP_HARD_CAP.
 */
import type { SegmentSpec } from './pressure/segment';
import { validateLayerSpecs } from './relics/effects';
import type { RelicLayerSpec } from './relics/types';
import { fork, rangeInt } from './rng';
import { GROUND_PLATFORM_ID, type TowerLayout } from './tower';
import type { TuningStack } from './tuning';

export type PowerupId = 'spring-shoes' | 'coin-storm' | 'ghost' | 'overdrive';

export interface PowerupDef {
    id: PowerupId;
    name: string;
    blurb: string;
    durationTicks: number;
    layers: RelicLayerSpec[];
    /** Presentation accent (pickup glow + HUD chip). */
    tint: number;
}

export const POWERUPS: readonly PowerupDef[] = [
    {
        id: 'spring-shoes',
        name: 'Spring Shoes',
        blurb: '+20% jump velocity for 8s.',
        durationTicks: 480,
        layers: [
            { key: 'JUMP_BASE', op: 'mul', value: 1.2 },
            { key: 'EXCHANGE_K', op: 'mul', value: 1.2 },
        ],
        tint: 0xa8ffd0,
    },
    {
        id: 'coin-storm',
        name: 'Coin Storm',
        blurb: 'A coin shower follows you for 6s.',
        durationTicks: 360,
        layers: [{ key: 'coins.stormRate', op: 'set', value: 3 }],
        tint: 0xffd24a,
    },
    {
        id: 'ghost',
        name: 'Ghost',
        blurb: 'The line cannot catch you for 5s — it still rises.',
        durationTicks: 300,
        layers: [{ key: 'line.ghost', op: 'set', value: 1 }],
        tint: 0xbfe8ff,
    },
    {
        id: 'overdrive',
        name: 'Overdrive',
        blurb: 'Acceleration ×1.5 for 6s.',
        durationTicks: 360,
        layers: [
            { key: 'RUN_ACCEL_LOW', op: 'mul', value: 1.5 },
            { key: 'RUN_ACCEL_HIGH', op: 'mul', value: 1.5 },
        ],
        tint: 0xff8a5a,
    },
];

const BY_ID = new Map(POWERUPS.map((p) => [p.id, p]));

export function powerupById(id: string): PowerupDef {
    const def = BY_ID.get(id as PowerupId);
    if (!def) {
        throw new Error(`powerups: unknown powerup id "${id}"`);
    }
    return def;
}

export function validatePowerupDef(def: PowerupDef): void {
    if (def.durationTicks < 1) {
        throw new Error(`powerup:${def.id}: durationTicks must be >= 1`);
    }
    validateLayerSpecs(`powerup:${def.id}`, def.layers);
}

export interface PowerupSpawn {
    id: number;
    type: PowerupId;
    x: number;
    y: number;
}

/**
 * Seeded spawn placement: one visible pickup roughly every
 * loot.powerupEveryFloors floors (±2 jitter), hovering over a platform.
 * Buffer floors above the door stay scenery.
 */
export function placeSegmentPowerups(
    spec: SegmentSpec,
    layout: TowerLayout,
    t: TuningStack,
): PowerupSpawn[] {
    const rng = fork(spec.seed, `powerups:${spec.segmentId}`);
    const floorH = t.value('FLOOR_HEIGHT_PX');
    const every = spec.loot.powerupEveryFloors;
    const spawns: PowerupSpawn[] = [];
    let id = 0;
    let nextFloor = every + rangeInt(rng, -2, 2);
    for (const p of layout.platforms) {
        if (p.id === GROUND_PLATFORM_ID) {
            continue;
        }
        const floor = (layout.groundTopY - p.topY) / floorH;
        if (floor > spec.floors + 1e-6) {
            break; // door buffer: scenery, never loot
        }
        if (floor + 1e-6 < nextFloor) {
            continue;
        }
        spawns.push({
            id: id++,
            type: POWERUPS[rangeInt(rng, 0, POWERUPS.length - 1)].id,
            x: p.xCenter,
            y: p.topY - 52,
        });
        nextFloor = floor + every + rangeInt(rng, -2, 2);
    }
    return spawns;
}
