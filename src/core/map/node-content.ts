/** Seeded segment and reward content for one climbable map node. */
import { bossForAct } from '../boss/defs';
import type { SegmentFieldSpec, SegmentSpec, SegmentTuningOverride } from '../pressure/segment';
import { forkSeed, range, rangeInt, type Rng } from '../rng';
import { DEFAULT_TUNING } from '../tuning-table';
import { modifierById } from './modifiers';
import { LINE_PROFILES, type NodeTypePreset } from './presets';
import type { NodeRewards } from './types';

function rollRewards(
    rng: Rng,
    preset: NodeTypePreset,
    modifierIds: string[],
    floors: number | null,
): NodeRewards {
    if ((preset.floors === null) !== (floors === null)) {
        throw new Error(`map gen: ${preset.type} floor roll disagrees with its preset`);
    }
    let bountyRate = range(rng, preset.clearBountyPerFloor[0], preset.clearBountyPerFloor[1]);
    let coinsMul = 1;
    let relicOddsAdd = preset.relicOddsAdd;
    for (const id of modifierIds) {
        const loot = modifierById(id).lootPatch;
        if (loot?.coinsMul !== undefined) {
            coinsMul *= loot.coinsMul;
        }
        if (loot?.bountyCoinsPerFloorAdd !== undefined) {
            bountyRate += loot.bountyCoinsPerFloorAdd;
        }
        if (loot?.relicOddsAdd !== undefined) {
            relicOddsAdd += loot.relicOddsAdd;
        }
    }
    const clearBounty = floors === null ? 0 : Math.round(bountyRate * floors);
    return { clearBounty, coinsMul, guaranteedRelic: preset.guaranteedRelic, relicOddsAdd };
}

function buildSegment(
    runSeed: string,
    actIndex: number,
    nodeId: string,
    preset: NodeTypePreset,
    floors: number | null,
    modifierIds: string[],
    coinsMul: number,
): SegmentSpec | null {
    if (floors === null) {
        if (preset.difficulty !== null) {
            throw new Error(`map gen: ${preset.type} has difficulty without floors`);
        }
        return null;
    }
    if (preset.difficulty === null) {
        throw new Error(`map gen: ${preset.type} has floors without difficulty`);
    }

    const modifierLayers: SegmentTuningOverride[] = preset.genOverrides.map((override) => ({
        ...override,
    }));
    let crumbleFraction = 0;
    let stickyFraction = 0;
    for (const id of modifierIds) {
        const modifier = modifierById(id);
        modifierLayers.push(...modifier.tuningLayers.map((override) => ({ ...override })));
        if (modifier.genPatch?.crumbleFraction !== undefined) {
            crumbleFraction += modifier.genPatch.crumbleFraction;
        }
        if (modifier.genPatch?.stickyFraction !== undefined) {
            stickyFraction += modifier.genPatch.stickyFraction;
        }
    }
    const field: SegmentFieldSpec | undefined =
        crumbleFraction > 0 || stickyFraction > 0 ? { crumbleFraction, stickyFraction } : undefined;
    return {
        segmentId: nodeId,
        floors,
        seed: forkSeed(runSeed, `segment:${nodeId}`),
        difficulty: {
            profile: { ...preset.difficulty },
            actIndex,
        },
        lineProfile: LINE_PROFILES[preset.lineProfile].overrides.map((override) => ({
            ...override,
        })),
        modifiers: modifierLayers,
        loot: {
            coinsPerFloor: DEFAULT_TUNING['coins.perFloor'] * preset.lootCoinsMul * coinsMul,
            powerupEveryFloors: DEFAULT_TUNING['powerup.everyFloors'],
        },
        field,
        boss: preset.type === 'boss' ? bossForAct(actIndex).id : undefined,
    };
}

export function rollNodeContent(
    runSeed: string,
    actIndex: number,
    nodeId: string,
    rng: Rng,
    preset: NodeTypePreset,
    modifierIds: string[],
): { rewards: NodeRewards; segment: SegmentSpec | null } {
    const floors =
        preset.floors === null ? null : rangeInt(rng, preset.floors[0], preset.floors[1]);
    const rewards = rollRewards(rng, preset, modifierIds, floors);
    return {
        rewards,
        segment: buildSegment(
            runSeed,
            actIndex,
            nodeId,
            preset,
            floors,
            modifierIds,
            rewards.coinsMul,
        ),
    };
}
