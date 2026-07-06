/**
 * Relic effects, surface 1: owner-tagged tuning layers (`relic:<id>`),
 * pushed in acquisition order — the TuningStack's canonical fold and its
 * validation-that-throws do the rest. Surface 2 (the subscription runtime)
 * lives in ./runtime.ts; the two files ARE the two frozen surfaces.
 *
 * One absolute limit relics cannot cross: JUMP_HARD_CAP is engine safety,
 * not a stat — validation here throws on any relic or powerup layer that
 * targets it. The knee moves, the ceiling moves, the asymptote never does.
 */
import type { TuningStack } from '../tuning';
import type { RelicDef, RelicLayerSpec } from './types';

/** The absolute limit: no relic/powerup layer may touch these keys. */
const FORBIDDEN_LAYER_KEYS = new Set<string>(['JUMP_HARD_CAP']);

/** Throws on a layer set that crosses the absolute limit or is degenerate. */
export function validateLayerSpecs(ownerLabel: string, layers: readonly RelicLayerSpec[]): void {
    for (const layer of layers) {
        if (FORBIDDEN_LAYER_KEYS.has(layer.key)) {
            throw new Error(
                `${ownerLabel}: layer targets ${layer.key} — the hard cap is engine ` +
                    'safety, not a stat (relics-economy.md, the one absolute limit)',
            );
        }
        if (!Number.isFinite(layer.value)) {
            throw new Error(`${ownerLabel}: non-finite layer value on ${layer.key}`);
        }
        if (layer.op === 'mul' && layer.value < 0) {
            throw new Error(`${ownerLabel}: negative mul on ${layer.key} flips physics`);
        }
    }
}

/** Full-def validation: every layer surface a relic carries, checked. */
export function validateRelicDef(relic: RelicDef): void {
    validateLayerSpecs(`relic:${relic.id}`, relic.layers);
    for (const trigger of relic.triggers) {
        if (trigger.effect === 'timed-layers' || trigger.effect === 'gated-layers') {
            validateLayerSpecs(`relic:${relic.id} (${trigger.on})`, trigger.layers);
        }
    }
}

/**
 * Push a relic's permanent layers (owner `relic:<id>`, acquisition order =
 * fold order within the relic class). Returns how many layers were pushed.
 * The stack's own validation throws on a degenerate resolved table.
 */
export function applyRelicLayers(relic: RelicDef, tuning: TuningStack, tick: number): number {
    validateRelicDef(relic);
    relic.layers.forEach((spec, i) => {
        tuning.pushLayer({
            id: `relic:${relic.id}:${i}`,
            owner: `relic:${relic.id}`,
            key: spec.key,
            op: spec.op,
            value: spec.value,
            tick,
        });
    });
    return relic.layers.length;
}

/** Re-apply a serialized build (scene create / restore): layers only, in
 *  acquisition order — triggers re-attach via the runtime, and no
 *  acquisition events re-fire. */
export function applyOwnedRelicLayers(
    relicIds: readonly string[],
    lookup: (id: string) => RelicDef,
    tuning: TuningStack,
    tick: number,
): void {
    for (const id of relicIds) {
        applyRelicLayers(lookup(id), tuning, tick);
    }
}
