/**
 * The node label — everything a player may know before committing, in one
 * structure (pillar 2: the full price tag, revealed on hover/select). One
 * authority builds it; the card renders it, `map/node_previewed` carries it,
 * and the debug bridge dumps it.
 */
import { modifierById } from './modifiers';
import { LINE_PROFILES, NODE_PRESETS } from './presets';
import type { NodeSpec } from './types';

export interface ModifierLabelLine {
    id: string;
    name: string;
    /** Price and pay in one breath — `price → pay`, or `pay, free` on gifts. */
    breath: string;
}

export interface NodeLabel {
    nodeId: string;
    type: NodeSpec['type'];
    title: string;
    blurb: string;
    /** "28 floors · standard line" — null for shop/mystery. */
    shape: string | null;
    modifiers: ModifierLabelLine[];
    rewards: string[];
    /** Present when two priced mutators stack — compound danger, stated
     *  plainly (map-modifiers.md's own risk note). */
    compound: string | null;
}

export function modifierBreath(id: string): ModifierLabelLine {
    const m = modifierById(id);
    return {
        id: m.id,
        name: m.name,
        breath: m.gift ? `${m.pay}` : `${m.price} → ${m.pay}`,
    };
}

export function buildNodeLabel(node: NodeSpec, pendingGiftIds: readonly string[] = []): NodeLabel {
    const preset = NODE_PRESETS[node.type];
    const lineFace = LINE_PROFILES[node.lineProfile].face;
    const shape = node.segment === null ? null : `${node.segment.floors} floors · ${lineFace}`;

    const modifierIds = [...node.modifierIds];
    for (const gift of pendingGiftIds) {
        if (node.segment !== null && !modifierIds.includes(gift)) {
            modifierIds.push(gift);
        }
    }
    const modifiers = modifierIds.map(modifierBreath);

    const rewards: string[] = [];
    if (node.rewards.clearBounty > 0) {
        const bounty = Math.round(node.rewards.clearBounty * node.rewards.coinsMul);
        rewards.push(`${bounty} coins on clear`);
    }
    if (node.rewards.guaranteedRelic) {
        rewards.push('a relic, guaranteed');
    }
    if (node.rewards.relicOddsAdd > 0) {
        rewards.push('better relic odds');
    }
    if (node.type === 'shop' && node.shopStock !== null) {
        rewards.push(`hearts for sale (${node.shopStock.heartPrice} coins)`);
    }
    if (node.type === 'mystery') {
        rewards.push('risk and reward, revealed inside');
    }
    if (node.type === 'boss') {
        rewards.push('the act is yours');
    }

    const priced = modifierIds.map(modifierById).filter((m) => !m.gift);
    const compound =
        priced.length >= 2
            ? `both prices apply at once — ${priced.map((m) => m.name.toLowerCase()).join(' and ')}`
            : null;

    return {
        nodeId: node.id,
        type: node.type,
        title: preset.title,
        blurb: preset.blurb,
        shape,
        modifiers,
        rewards,
        compound,
    };
}
