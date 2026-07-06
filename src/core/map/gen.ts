/**
 * Act-graph generation (map-modifiers.md): 3 acts × 7 rows, width 2-4,
 * adjacent-row edges with no crossings, 1-3 up-edges, all reachable, all
 * paths reaching the boss. Deterministic from the run seed by labeled fork;
 * validate-or-regenerate with a bumped fork counter; THROWS after
 * `map.maxRegens` — a generation bug fails loud, never ships a degenerate
 * act.
 *
 * The guarantees are honored by the ROLL's shape (a full shop row on the
 * narrowest mid row, a special row carrying the act's mystery), then proven
 * by exact validation — generation may be as structured as it likes, but
 * violations always regenerate whole, never get patched by hand.
 */
import type { SegmentSpec, SegmentTuningOverride } from '../pressure/segment';
import { fork, forkSeed, pick, rangeInt, type Rng, weightedIndex } from '../rng';
import { DEFAULT_TUNING } from '../tuning-table';
import { compatible, modifierById, rollableModifiers } from './modifiers';
import { LINE_PROFILES, NODE_PRESETS, type NodeTypePreset } from './presets';
import { MYSTERY_EVENTS } from './mystery';
import {
    ACT_ROWS,
    type ActGraph,
    BOSS_ROW,
    MAP_SCHEMA_VERSION,
    type ModifierSpec,
    type NodeRewards,
    nodeIdOf,
    type NodeSpec,
    type NodeType,
} from './types';
import { validateActGraph } from './validate';

const STAIRCASE_RETRIES = 20;

/** Random monotone lattice path (0,0)->(m-1,n-1); every visited pair is an
 *  edge. Monotone = non-crossing by construction; retried until the 1-3
 *  up-edge cap holds. */
function staircaseEdges(rng: Rng, m: number, n: number): [number, number][] {
    for (let attempt = 0; attempt < STAIRCASE_RETRIES; attempt += 1) {
        const edges: [number, number][] = [[0, 0]];
        let i = 0;
        let j = 0;
        while (i < m - 1 || j < n - 1) {
            const canI = i < m - 1;
            const canJ = j < n - 1;
            const step =
                canI && canJ
                    ? (['both', 'i', 'j'] as const)[weightedIndex(rng, [0.45, 0.3, 0.25])]
                    : canI
                      ? 'i'
                      : 'j';
            if (step !== 'j') {
                i += 1;
            }
            if (step !== 'i') {
                j += 1;
            }
            edges.push([i, j]);
        }
        const outDegree = new Array(m).fill(0);
        for (const [lower] of edges) {
            outDegree[lower] += 1;
        }
        if (outDegree.every((d) => d >= 1 && d <= 3)) {
            return edges;
        }
    }
    throw new Error(`map gen: staircase ${m}x${n} could not satisfy the edge cap`);
}

function rollModifierIds(rng: Rng, preset: NodeTypePreset, pool: readonly ModifierSpec[]): string[] {
    const ids: string[] = [];
    const slots = preset.modifierSlots;
    if (slots.max > 0 && rng() < slots.chance) {
        const count = rangeInt(rng, slots.min, slots.max);
        const chosen: ModifierSpec[] = [];
        for (let k = 0; k < count; k += 1) {
            const candidates = pool.filter(
                (m) => (!slots.nastyOnly || m.nasty) && chosen.every((c) => compatible(m, c)),
            );
            if (candidates.length === 0) {
                break;
            }
            chosen.push(pick(rng, candidates));
        }
        ids.push(...chosen.map((m) => m.id));
    }
    if (preset.giftChance > 0 && rng() < preset.giftChance) {
        ids.push('double_fuse');
    }
    return ids;
}

function rollRewards(rng: Rng, preset: NodeTypePreset, modifierIds: string[]): NodeRewards {
    let clearBounty = rangeInt(rng, preset.clearBounty[0], preset.clearBounty[1]);
    let coinsMul = 1;
    let relicOddsAdd = preset.relicOddsAdd;
    for (const id of modifierIds) {
        const loot = modifierById(id).lootPatch;
        coinsMul *= loot?.coinsMul ?? 1;
        clearBounty += loot?.bountyCoinsAdd ?? 0;
        relicOddsAdd += loot?.relicOddsAdd ?? 0;
    }
    return { clearBounty, coinsMul, guaranteedRelic: preset.guaranteedRelic, relicOddsAdd };
}

function buildSegment(
    runSeed: string,
    nodeId: string,
    rng: Rng,
    preset: NodeTypePreset,
    modifierIds: string[],
    coinsMul: number,
): SegmentSpec | null {
    if (preset.floors === null) {
        return null;
    }
    const modifierLayers: SegmentTuningOverride[] = [...preset.genOverrides.map((o) => ({ ...o }))];
    for (const id of modifierIds) {
        modifierLayers.push(...modifierById(id).tuningLayers.map((o) => ({ ...o })));
    }
    return {
        // segmentId IS the nodeId, so pressure's owner tag lands verbatim as
        // `segment:<nodeId>` (playthrough-trace.md finding 6).
        segmentId: nodeId,
        floors: rangeInt(rng, preset.floors[0], preset.floors[1]),
        seed: forkSeed(runSeed, `segment:${nodeId}`),
        lineProfile: LINE_PROFILES[preset.lineProfile].overrides.map((o) => ({ ...o })),
        modifiers: modifierLayers,
        // Placed loot IS the coin economy ("coins by play"): the node type's
        // density identity × the modifiers' folded loot repricing. Rolled
        // from the base table — the map is generated once at run start, and
        // the label prints what the segment will place (pillar 2).
        loot: {
            coinsPerFloor: DEFAULT_TUNING['coins.perFloor'] * preset.lootCoinsMul * coinsMul,
            powerupEveryFloors: DEFAULT_TUNING['powerup.everyFloors'],
        },
    };
}

function buildNode(
    runSeed: string,
    actIndex: number,
    row: number,
    col: number,
    type: NodeType,
    pool: readonly ModifierSpec[],
): NodeSpec {
    const id = nodeIdOf(actIndex, row, col);
    const preset = NODE_PRESETS[type];
    // The node's own forked stream — independently regenerable by label.
    // (Shop stock is NOT rolled here: the real shop forks `shop:<nodeId>`
    // from the run seed at visit time against the live owned-relic set.)
    const rng = fork(runSeed, `node:${id}`);
    const modifierIds = rollModifierIds(rng, preset, pool);
    const rewards = rollRewards(rng, preset, modifierIds);
    const mysteryRng = fork(runSeed, `mystery:${id}`);
    return {
        id,
        actIndex,
        row,
        col,
        type,
        edgesUp: [],
        modifierIds,
        segment: buildSegment(runSeed, id, rng, preset, modifierIds, rewards.coinsMul),
        rewards,
        lineProfile: preset.lineProfile,
        mysteryEventId: type === 'mystery' ? pick(mysteryRng, MYSTERY_EVENTS).id : null,
        mysteryRoll: type === 'mystery' ? mysteryRng() : null,
        bossStub: type === 'boss',
    };
}

function rollTypes(rng: Rng, widths: number[]): NodeType[][] {
    const midRows = [1, 2, 3, 4, 5];
    // The shop guarantee by construction: the narrowest mid row (rows 2-5)
    // becomes all shops — every path crosses every row, so every path shops.
    const shopCandidates = midRows.filter((r) => r >= 2);
    const minWidth = Math.min(...shopCandidates.map((r) => widths[r]));
    const shopRow = pick(
        rng,
        shopCandidates.filter((r) => widths[r] === minWidth),
    );
    // The second special by construction: one full row of non-climb
    // specials, carrying the act's guaranteed mystery.
    const specialRow = pick(
        rng,
        midRows.filter((r) => r !== shopRow),
    );

    const types: NodeType[][] = [];
    for (let row = 0; row < ACT_ROWS; row += 1) {
        const width = widths[row];
        const rowTypes: NodeType[] = [];
        for (let col = 0; col < width; col += 1) {
            if (row === BOSS_ROW) {
                rowTypes.push('boss');
            } else if (row === 0) {
                rowTypes.push((['climb', 'coin_rush'] as const)[weightedIndex(rng, [0.7, 0.3])]);
            } else if (row === shopRow) {
                rowTypes.push('shop');
            } else if (row === specialRow) {
                const pool: NodeType[] = ['coin_rush', 'challenge', 'elite', 'mystery'];
                const weights = [0.3, 0.3, row === 1 ? 0 : 0.25, 0.15];
                rowTypes.push(pool[weightedIndex(rng, weights)]);
            } else {
                const pool: NodeType[] = ['climb', 'coin_rush', 'challenge', 'elite', 'mystery'];
                const weights = [0.66, 0.12, 0.1, row === 1 ? 0 : 0.07, 0.05];
                rowTypes.push(pool[weightedIndex(rng, weights)]);
            }
        }
        types.push(rowTypes);
    }
    // The act's guaranteed mystery lives on the special row.
    types[specialRow][rangeInt(rng, 0, widths[specialRow] - 1)] = 'mystery';
    return types;
}

function rollAct(
    runSeed: string,
    actIndex: number,
    forkLabel: string,
    regenCount: number,
    pool: readonly ModifierSpec[],
): ActGraph {
    const rng = fork(runSeed, forkLabel);
    const widths = [rangeInt(rng, 2, 3), ...[1, 2, 3, 4, 5].map(() => rangeInt(rng, 2, 4)), 1];
    const types = rollTypes(rng, widths);
    const rows: NodeSpec[][] = types.map((rowTypes, row) =>
        rowTypes.map((type, col) => buildNode(runSeed, actIndex, row, col, type, pool)),
    );
    for (let row = 0; row < BOSS_ROW; row += 1) {
        const edges = staircaseEdges(rng, widths[row], widths[row + 1]);
        for (const [lower, upper] of edges) {
            rows[row][lower].edgesUp.push(rows[row + 1][upper].id);
        }
    }
    return {
        schemaVersion: MAP_SCHEMA_VERSION,
        actIndex,
        seed: runSeed,
        forkLabel,
        regenCount,
        rows,
    };
}

/**
 * Generate act `actIndex` (1-based) for a run seed: roll, validate,
 * regenerate deterministically with a bumped fork counter, throw after the
 * budget. `maxRegens` is tuning data (`map.maxRegens`).
 *
 * `modifierPool` is the rollable pool for this save (RETURN's meta gating
 * composes over the roster's own `rollable` state — core/meta/unlocks.ts).
 * Same seed + same pool = same map; a smaller pool IS the simpler early map
 * the design promises, by construction.
 */
export function generateActGraph(
    runSeed: string,
    actIndex: number,
    maxRegens: number = DEFAULT_TUNING['map.maxRegens'],
    modifierPool: readonly ModifierSpec[] = rollableModifiers(),
): ActGraph {
    if (actIndex < 1 || actIndex > 3 || !Number.isInteger(actIndex)) {
        throw new Error(`map gen: actIndex must be 1..3, got ${actIndex}`);
    }
    let lastViolations: string[] = [];
    for (let attempt = 0; attempt < maxRegens; attempt += 1) {
        const forkLabel =
            attempt === 0 ? `map:act${actIndex}` : `map:act${actIndex}:regen${attempt}`;
        const graph = rollAct(runSeed, actIndex, forkLabel, attempt, modifierPool);
        lastViolations = validateActGraph(graph);
        if (lastViolations.length === 0) {
            return graph;
        }
    }
    throw new Error(
        `map gen: act ${actIndex} of seed "${runSeed}" failed validation ${maxRegens} times — ` +
            `last violations: ${lastViolations.join('; ')}`,
    );
}

/** Row widths + counts by type — `map/generated`'s graph summary. */
export function actGraphSummary(graph: ActGraph): {
    rowWidths: number[];
    countsByType: Record<NodeType, number>;
} {
    const countsByType = {} as Record<NodeType, number>;
    for (const row of graph.rows) {
        for (const node of row) {
            countsByType[node.type] = (countsByType[node.type] ?? 0) + 1;
        }
    }
    return { rowWidths: graph.rows.map((r) => r.length), countsByType };
}
