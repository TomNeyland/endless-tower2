/**
 * The run loop: map → segment → results toast → map (map-modifiers.md).
 * Owns the RunSignal wiring until IDENTITY's RunState assumes it:
 * `map/node_committed` hands pressure its segment spec verbatim (modifier
 * layers ride the spec and are pushed owner-tagged `segment:<nodeId>` at
 * segment start, popped with the scene — the substrate already does this);
 * consumes segment outcomes (`run/segment_end`, `run/ended {death_line}`),
 * emits `run/act_completed` and `run/ended {summit}` after act 3's boss
 * node (the EXAM stub: summit fires on clearing the stub segment).
 *
 * Lives across scenes on the Game, not in any scene. Character select is
 * RETURN's (default Beige everywhere).
 */
import type { Game } from 'phaser';
import { groupDigits } from '../../core/format';
import type { MapEvent } from '../../core/map/events';
import { generateActGraph } from '../../core/map/gen';
import { buildNodeLabel, type NodeLabel } from '../../core/map/label';
import { modifierById } from '../../core/map/modifiers';
import { type MysteryEffect, mysteryEventById, resolveMystery } from '../../core/map/mystery';
import {
    applySegmentOutcome,
    createRunState,
    type MapRunState,
    type SegmentOutcome,
} from '../../core/map/run';
import {
    ACT_COUNT,
    type ActGraph,
    nodeById,
    type NodeSpec,
    type NodeType,
} from '../../core/map/types';
import type { SegmentSpec } from '../../core/pressure/segment';
import { DEFAULT_TUNING } from '../../core/tuning';
import { installMapBridge, removeMapBridge } from '../debug/MapBridge';
import type { ToastData } from '../map/MapOverlays';
import type { SandboxBootData } from '../scenes/Sandbox';

const EVENT_RING_SIZE = 256;

export type CommitRoute = { kind: 'segment' } | { kind: 'mystery' } | { kind: 'shop' };

export class RunOrchestrator {
    readonly state: MapRunState;
    private readonly game: Game;
    private graph: ActGraph;
    private ring: MapEvent[] = [];
    private toast: ToastData | null = null;
    private summit = false;
    private actStartPathIndex = 0;

    /** Begin a run and enter the map. The one front door (MainMenu). */
    static begin(game: Game, seed: string): RunOrchestrator {
        const run = new RunOrchestrator(game, seed);
        run.hop('MapScene', { run });
        return run;
    }

    private constructor(game: Game, seed: string) {
        this.game = game;
        this.state = createRunState(seed);
        this.graph = this.generateAct(1);
        installMapBridge(this, game);
    }

    // --- Map surface (MapScene reads; commits route through here) ---

    actGraph(): ActGraph {
        return this.graph;
    }

    isSummit(): boolean {
        return this.summit;
    }

    /** Node ids the player may commit to right now. */
    reachableIds(): string[] {
        if (this.summit) {
            return [];
        }
        if (this.state.nodeId === null) {
            return this.graph.rows[0].map((n) => n.id);
        }
        return [...nodeById(this.graph, this.state.nodeId).edgesUp];
    }

    /** Node ids committed in the current act (the warm trail). */
    actPath(): string[] {
        return this.state.path.slice(this.actStartPathIndex);
    }

    preview(nodeId: string): NodeLabel {
        const node = nodeById(this.graph, nodeId);
        const label = buildNodeLabel(node, this.state.pendingModifierIds);
        this.emit({ type: 'map/node_previewed', nodeId, label });
        return label;
    }

    /** Confirm a node. Emits map/node_committed, then routes: segments swap
     *  scenes; mystery/shop stay on the map (the scene opens the overlay). */
    commit(nodeId: string): CommitRoute {
        if (!this.reachableIds().includes(nodeId)) {
            throw new Error(`run: ${nodeId} is not reachable from ${this.state.nodeId}`);
        }
        const node = nodeById(this.graph, nodeId);
        this.state.nodeId = nodeId;
        this.state.path.push(nodeId);
        const spec = node.segment === null ? null : this.specWithGifts(node);
        this.emit({
            type: 'map/node_committed',
            nodeId,
            nodeType: node.type,
            modifiers: this.committedModifierIds(node),
            rewards: { ...node.rewards },
            segment: spec,
        });
        if (node.type === 'mystery') {
            return { kind: 'mystery' };
        }
        if (node.type === 'shop') {
            return { kind: 'shop' };
        }
        this.launchSegment(node, spec);
        return { kind: 'segment' };
    }

    consumeToast(): ToastData | null {
        const toast = this.toast;
        this.toast = null;
        return toast;
    }

    heartsDisplay(): { count: number; max: number } {
        return {
            count: this.state.hearts ?? DEFAULT_TUNING['hearts.start'],
            max: DEFAULT_TUNING['hearts.max'],
        };
    }

    // --- Mystery (seeded outcomes — the roll was fixed at map generation) ---

    resolveMysteryChoice(choiceIndex: number): MysteryEffect {
        const node = this.currentNode();
        if (node.type !== 'mystery' || node.mysteryEventId === null || node.mysteryRoll === null) {
            throw new Error(`run: ${node.id} is not a mystery node`);
        }
        const effect = resolveMystery(
            mysteryEventById(node.mysteryEventId),
            choiceIndex,
            node.mysteryRoll,
        );
        this.applyMysteryEffect(effect);
        return effect;
    }

    private applyMysteryEffect(effect: MysteryEffect): void {
        if (effect.coinsDelta) {
            this.state.coins = Math.max(0, this.state.coins + effect.coinsDelta);
        }
        if (effect.heartsDelta) {
            const max = DEFAULT_TUNING['hearts.max'];
            const current = this.state.hearts ?? DEFAULT_TUNING['hearts.start'];
            // A mystery never ends a run: heart loss floors at 1 (pillar 1).
            this.state.hearts = Math.min(max, Math.max(1, current + effect.heartsDelta));
        }
        if (effect.giftModifierId) {
            modifierById(effect.giftModifierId); // throws on a data typo
            this.state.pendingModifierIds.push(effect.giftModifierId);
        }
    }

    // --- Shop (minimal, honest: hearts only until IDENTITY stocks it) ---

    shopStockText(): string {
        const node = this.currentNode();
        if (node.shopStock === null) {
            throw new Error(`run: ${node.id} has no shop stock`);
        }
        const { heartPrice, heartsAvailable } = node.shopStock;
        return heartsAvailable > 0
            ? `${heartsAvailable} heart${heartsAvailable > 1 ? 's' : ''} in stock — ${heartPrice} coins each`
            : 'sold out';
    }

    shopWalletText(): string {
        const hearts = this.heartsDisplay();
        return `you carry ${this.state.coins} coins · ${hearts.count}/${hearts.max} hearts`;
    }

    buyHeart(): boolean {
        const node = this.currentNode();
        const stock = node.shopStock;
        if (stock === null || stock.heartsAvailable <= 0) {
            return false;
        }
        const hearts = this.heartsDisplay();
        if (hearts.count >= hearts.max || this.state.coins < stock.heartPrice) {
            return false;
        }
        this.state.coins -= stock.heartPrice;
        this.state.hearts = hearts.count + 1;
        stock.heartsAvailable -= 1;
        return true;
    }

    // --- Segment launch and outcome (the RunSignal wiring) ---

    private specWithGifts(node: NodeSpec): SegmentSpec {
        if (node.segment === null) {
            throw new Error(`run: ${node.id} has no segment`);
        }
        const spec: SegmentSpec = {
            ...node.segment,
            lineProfile: node.segment.lineProfile.map((o) => ({ ...o })),
            modifiers: node.segment.modifiers.map((o) => ({ ...o })),
        };
        for (const giftId of this.state.pendingModifierIds) {
            spec.modifiers.push(...modifierById(giftId).tuningLayers.map((o) => ({ ...o })));
        }
        return spec;
    }

    private committedModifierIds(node: NodeSpec): string[] {
        return node.segment === null
            ? [...node.modifierIds]
            : [...node.modifierIds, ...this.state.pendingModifierIds];
    }

    private launchSegment(node: NodeSpec, spec: SegmentSpec | null): void {
        if (spec === null) {
            throw new Error(`run: launching ${node.id} without a segment spec`);
        }
        this.state.pendingModifierIds = [];
        this.hop('Sandbox', {
            segment: spec,
            hearts: this.state.hearts,
            run: { onOutcome: (outcome: SegmentOutcome) => this.onOutcome(node, outcome) },
        } satisfies SandboxBootData);
    }

    private onOutcome(node: NodeSpec, outcome: SegmentOutcome): void {
        const coinsEarned = applySegmentOutcome(
            this.state,
            outcome,
            node.rewards.clearBounty,
            node.rewards.coinsMul,
        );
        if (outcome.kind === 'death_line') {
            // pressure already emitted run/ended {death_line} on its bus; the
            // run loop just folds. A real results scene is RETURN's.
            this.endRun();
            return;
        }
        if (node.rewards.guaranteedRelic) {
            this.state.relicsOwed.push(node.id); // IDENTITY passthrough
        }
        const lines = [`+${coinsEarned} coins`, `+${groupDigits(outcome.stats.totalScore)} score`];
        if (outcome.stats.bestChainFace.length > 0) {
            lines.push(`best chain ${outcome.stats.bestChainFace}`);
        }
        if (node.rewards.guaranteedRelic) {
            lines.push('relic secured (claimed when relics arrive)');
        }
        this.toast = {
            headline: `${node.type === 'boss' ? 'ACT CLEARED' : 'CLIMB CLEARED'}`,
            lines,
        };

        if (node.type === 'boss') {
            this.emit({
                type: 'run/act_completed',
                actIndex: this.state.act,
                path: this.actPath(),
                stats: outcome.stats,
            });
            if (this.state.act >= ACT_COUNT) {
                this.summit = true;
                this.emit({
                    type: 'run/ended',
                    reason: 'summit',
                    seed: this.state.seed,
                    path: [...this.state.path],
                    totalScore: this.state.totalScore,
                    coins: this.state.coins,
                });
            } else {
                this.state.act += 1;
                this.state.nodeId = null;
                this.actStartPathIndex = this.state.path.length;
                this.graph = this.generateAct(this.state.act);
            }
        }
        this.hop('MapScene', { run: this });
    }

    /** Leave the run (death or summit-return): back to the menu. */
    endRun(): void {
        removeMapBridge();
        this.hop('MainMenu');
    }

    /**
     * The queue-safe scene hop: route through the active scene's ScenePlugin,
     * which QUEUES the stop/start pair for the next scene-manager pass.
     * SceneManager.start/stop execute immediately and can shear down a scene
     * that is mid-update (a delayed-call outcome fires inside the Sandbox's
     * own step — an immediate stop there crashes the remainder of the step).
     */
    private hop(startKey: string, data?: object): void {
        const active = this.game.scene.getScenes(true);
        if (active.length === 0) {
            // Nothing is mid-step, so the immediate manager call is safe.
            this.game.scene.start(startKey, data);
            return;
        }
        active[0].scene.start(startKey, data);
    }

    // --- Events (MAP_SCHEMA_VERSION = 1): ring for the bridge ---

    private emit(event: MapEvent): void {
        this.ring.push(event);
        if (this.ring.length > EVENT_RING_SIZE) {
            this.ring.shift();
        }
    }

    recentEvents(count = 50): MapEvent[] {
        return this.ring.slice(-count);
    }

    private generateAct(actIndex: number): ActGraph {
        const graph = generateActGraph(this.state.seed, actIndex);
        const countsByType = {} as Record<NodeType, number>;
        for (const row of graph.rows) {
            for (const node of row) {
                countsByType[node.type] = (countsByType[node.type] ?? 0) + 1;
            }
        }
        this.emit({
            type: 'map/generated',
            actIndex,
            seed: this.state.seed,
            forkLabel: graph.forkLabel,
            regenCount: graph.regenCount,
            rowWidths: graph.rows.map((r) => r.length),
            countsByType,
        });
        return graph;
    }

    private currentNode(): NodeSpec {
        if (this.state.nodeId === null) {
            throw new Error('run: no committed node');
        }
        return nodeById(this.graph, this.state.nodeId);
    }

    // --- Debug bridge surfaces (harness handles; not gameplay) ---

    debugJumpToNode(nodeId: string): void {
        nodeById(this.graph, nodeId); // throws on unknown id
        this.state.nodeId = nodeId;
        this.state.path.push(nodeId);
        if (this.game.scene.isActive('MapScene')) {
            this.hop('MapScene', { run: this });
        }
        // Mid-segment jumps apply when the run returns to the map.
    }

    debugRevealMap(): ActGraph {
        return this.graph;
    }

    debugSetSeed(seed: string): void {
        // A fresh run on the given seed — the shareable-seed harness path.
        removeMapBridge();
        RunOrchestrator.begin(this.game, seed);
    }
}
