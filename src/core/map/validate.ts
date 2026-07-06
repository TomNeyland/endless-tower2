/**
 * Post-generation validation (map-modifiers.md's guarantees), exact and
 * engine-free. gen.ts regenerates on any violation — never patches a graph
 * by hand — and throws after the regen budget. Every check returns a named
 * violation string so a generation bug fails loud AND legible.
 */
import { modifierById } from './modifiers';
import { isSpecial, NODE_PRESETS } from './presets';
import { ACT_ROWS, type ActGraph, BOSS_ROW, type NodeSpec } from './types';

function colOf(graph: ActGraph, row: number, id: string): number {
    const col = graph.rows[row].findIndex((n) => n.id === id);
    if (col === -1) {
        throw new Error(`map validate: edge target ${id} is not in row ${row}`);
    }
    return col;
}

function structureViolations(graph: ActGraph, out: string[]): void {
    if (graph.rows.length !== ACT_ROWS) {
        out.push(`act must have ${ACT_ROWS} rows, got ${graph.rows.length}`);
        return;
    }
    for (let row = 0; row < ACT_ROWS; row += 1) {
        const width = graph.rows[row].length;
        const [min, max] = row === 0 ? [2, 3] : row === BOSS_ROW ? [1, 1] : [2, 4];
        if (width < min || width > max) {
            out.push(`row ${row} width ${width} outside [${min}, ${max}]`);
        }
    }
    for (let row = 0; row < BOSS_ROW; row += 1) {
        let prevMaxTarget = -1;
        for (const node of graph.rows[row]) {
            if (node.edgesUp.length < 1 || node.edgesUp.length > 3) {
                out.push(`${node.id} has ${node.edgesUp.length} up-edges (must be 1-3)`);
            }
            const targets = node.edgesUp.map((id) => colOf(graph, row + 1, id));
            const lo = Math.min(...targets);
            const hi = Math.max(...targets);
            // No crossings: a node's lowest target may not undercut any
            // earlier (left) node's highest target.
            if (lo < prevMaxTarget) {
                out.push(`edges cross between row ${row} and ${row + 1} at ${node.id}`);
            }
            prevMaxTarget = Math.max(prevMaxTarget, hi);
        }
    }
    for (const node of graph.rows[BOSS_ROW]) {
        if (node.edgesUp.length !== 0) {
            out.push(`boss node ${node.id} must have no up-edges`);
        }
    }
}

function reachabilityViolations(graph: ActGraph, out: string[]): void {
    const reached = new Set<string>(graph.rows[0].map((n) => n.id));
    for (let row = 0; row < BOSS_ROW; row += 1) {
        for (const node of graph.rows[row]) {
            if (!reached.has(node.id)) {
                continue;
            }
            for (const up of node.edgesUp) {
                reached.add(up);
            }
        }
    }
    for (const row of graph.rows) {
        for (const node of row) {
            if (!reached.has(node.id)) {
                out.push(`${node.id} is unreachable from row 0`);
            }
        }
    }
}

/** DP over the DAG, top-down: for each node, the best a path from it to the
 *  boss can do at avoiding shops / collecting specials. */
function pathGuaranteeViolations(graph: ActGraph, out: string[]): void {
    const shopFree = new Map<string, boolean>();
    const minSpecials = new Map<string, number>();
    for (let row = BOSS_ROW; row >= 0; row -= 1) {
        for (const node of graph.rows[row]) {
            const selfShopFree = node.type !== 'shop';
            const selfSpecial = isSpecial(node.type) ? 1 : 0;
            if (row === BOSS_ROW) {
                shopFree.set(node.id, selfShopFree);
                minSpecials.set(node.id, selfSpecial);
                continue;
            }
            let anyShopFreeAbove = false;
            let minAbove = Number.POSITIVE_INFINITY;
            for (const up of node.edgesUp) {
                const upShopFree = shopFree.get(up);
                const upMin = minSpecials.get(up);
                if (upShopFree === undefined || upMin === undefined) {
                    throw new Error(`map validate: DP visited ${node.id} before ${up}`);
                }
                anyShopFreeAbove = anyShopFreeAbove || upShopFree;
                minAbove = Math.min(minAbove, upMin);
            }
            shopFree.set(node.id, selfShopFree && anyShopFreeAbove);
            minSpecials.set(node.id, selfSpecial + (node.edgesUp.length > 0 ? minAbove : 0));
        }
    }
    for (const entry of graph.rows[0]) {
        if (shopFree.get(entry.id)) {
            out.push(`a path from ${entry.id} reaches the boss without a Shop`);
        }
        const specials = minSpecials.get(entry.id);
        if (specials !== undefined && specials < 2) {
            out.push(`a path from ${entry.id} has only ${specials} non-Climb specials (need 2)`);
        }
    }
}

function nodeRuleViolations(graph: ActGraph, out: string[]): void {
    let mysteries = 0;
    for (const row of graph.rows) {
        for (const node of row) {
            if (node.type === 'mystery') {
                mysteries += 1;
            }
            if (node.type === 'elite' && node.row <= 1) {
                out.push(`Elite in row ${node.row} (${node.id}) — too early`);
            }
            if (node.type === 'boss' && node.row !== BOSS_ROW) {
                out.push(`boss outside row ${BOSS_ROW} (${node.id})`);
            }
            if (node.row === BOSS_ROW && node.type !== 'boss') {
                out.push(`row ${BOSS_ROW} node ${node.id} is not a boss`);
            }
            if (node.type === 'shop') {
                for (const up of node.edgesUp) {
                    const upNode = graph.rows[node.row + 1].find((n) => n.id === up);
                    if (upNode?.type === 'shop') {
                        out.push(`adjacent Shops on a path: ${node.id} -> ${up}`);
                    }
                }
            }
            contentViolations(node, out);
        }
    }
    if (mysteries < 1 || mysteries > 3) {
        out.push(`mystery count ${mysteries} outside [1, 3]`);
    }
}

function contentViolations(node: NodeSpec, out: string[]): void {
    const preset = NODE_PRESETS[node.type];
    if (preset.floors === null) {
        if (node.segment !== null) {
            out.push(`${node.id} (${node.type}) must not carry a segment`);
        }
    } else {
        if (node.segment === null) {
            out.push(`${node.id} (${node.type}) is missing its segment spec`);
        } else if (
            node.segment.floors < preset.floors[0] ||
            node.segment.floors > preset.floors[1]
        ) {
            out.push(`${node.id} floors ${node.segment.floors} outside ${preset.floors}`);
        }
    }
    if (node.type === 'mystery' && (node.mysteryEventId === null || node.mysteryRoll === null)) {
        out.push(`${node.id} mystery has no seeded event/roll`);
    }
    if (node.type === 'boss' && node.segment !== null && node.segment.boss === undefined) {
        out.push(`${node.id} boss node has no duel arena (segment.boss missing)`);
    }
    if (node.type !== 'boss' && node.segment?.boss !== undefined) {
        out.push(`${node.id} (${node.type}) carries a boss arena`);
    }
    const nonGift = node.modifierIds.map(modifierById).filter((m) => !m.gift);
    if (node.type === 'challenge' && (nonGift.length !== 1 || !nonGift[0].nasty)) {
        out.push(`${node.id} challenge must carry exactly one nasty modifier`);
    }
    if (node.type === 'elite' && (nonGift.length < 1 || nonGift.length > 2)) {
        out.push(`${node.id} elite must carry 1-2 modifiers`);
    }
    for (let i = 0; i < nonGift.length; i += 1) {
        for (let k = i + 1; k < nonGift.length; k += 1) {
            const clash =
                nonGift[i].id === nonGift[k].id ||
                nonGift[i].incompatibleWith?.includes(nonGift[k].id) ||
                nonGift[k].incompatibleWith?.includes(nonGift[i].id);
            if (clash) {
                out.push(
                    `${node.id} stacks incompatible modifiers ${nonGift[i].id}+${nonGift[k].id}`,
                );
            }
        }
    }
}

/** All violations in one pass; an empty list is a valid act. */
export function validateActGraph(graph: ActGraph): string[] {
    const out: string[] = [];
    structureViolations(graph, out);
    if (out.length > 0) {
        // Structural damage makes the DP checks unsafe to run — report early.
        return out;
    }
    reachabilityViolations(graph, out);
    pathGuaranteeViolations(graph, out);
    nodeRuleViolations(graph, out);
    return out;
}
