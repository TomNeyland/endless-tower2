/**
 * The run loop: map → segment → results toast → map (map-modifiers.md),
 * reconciled onto IDENTITY's RunState at the wave-2 integration. The truth
 * lives in a RunHost (core/run/host.ts): the orchestrator routes commits,
 * hands pressure its segment spec verbatim (`map/node_committed`; modifier
 * layers ride the spec, owner-tagged `segment:<nodeId>`), launches the
 * Sandbox with a RunSnapshot + outcome handoff, and adopts the returned
 * snapshot whole — hearts spent, coins picked up, and relics bought
 * mid-segment are already in it. It folds only what the segment could not
 * know: run score totals, the bounty where the design names one, the
 * Elite's on-the-spot relic, act advance, and the summit.
 *
 * Lives across scenes on the Game, not in any scene. Character select is
 * RETURN's (default Beige everywhere).
 */
import type { Game } from 'phaser';
import type { MovementEvent } from '../../core/events';
import { groupDigits } from '../../core/format';
import { rollRelicReward } from '../../core/economy/shop';
import type { MapEvent } from '../../core/map/events';
import { actGraphSummary, generateActGraph } from '../../core/map/gen';
import { buildNodeLabel, type NodeLabel } from '../../core/map/label';
import { mysteryEventById, type MysteryEffect, resolveMystery } from '../../core/map/mystery';
import { ACT_COUNT, type ActGraph, nodeById, type NodeSpec } from '../../core/map/types';
import type { SegmentSpec } from '../../core/pressure/segment';
import { RunHost } from '../../core/run/host';
import {
    applyMysteryEffect,
    committedModifierIds,
    type SegmentOutcome,
    specWithGifts,
} from '../../core/run/loop';
import type { RunSnapshot } from '../../core/run/state';
import { installMapBridge, removeMapBridge } from '../debug/MapBridge';
import type { ToastData } from '../map/MapOverlays';
import type { SandboxBootData } from '../scenes/Sandbox';
import type { ShopLaunchData } from '../scenes/ShopScene';

const EVENT_RING_SIZE = 256;

export type CommitRoute = { kind: 'segment' } | { kind: 'mystery' } | { kind: 'shop' };

/** The diagnostics ring carries the map's own events plus the run-economy
 *  events the map-side RunState emits (shop purchases, mystery hearts). */
export type RunRingEvent = MapEvent | MovementEvent;

export class RunOrchestrator {
    private host: RunHost;
    private readonly game: Game;
    private graph: ActGraph;
    private ring: RunRingEvent[] = [];
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
        this.host = RunHost.begin(seed, (e) => this.emit(e));
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

    snapshot(): RunSnapshot {
        return this.host.run.snapshot();
    }

    heartsDisplay(): { count: number; max: number } {
        return this.host.heartsDisplay();
    }

    /** Node ids the player may commit to right now. */
    reachableIds(): string[] {
        if (this.summit) {
            return [];
        }
        const nodeId = this.host.run.nodeId;
        if (nodeId === null) {
            return this.graph.rows[0].map((n) => n.id);
        }
        return [...nodeById(this.graph, nodeId).edgesUp];
    }

    /** Node ids committed in the current act (the warm trail). */
    actPath(): string[] {
        return this.host.run.pathIds().slice(this.actStartPathIndex);
    }

    preview(nodeId: string): NodeLabel {
        const node = nodeById(this.graph, nodeId);
        const label = buildNodeLabel(node, this.host.run.pendingGiftIds());
        this.emit({ type: 'map/node_previewed', nodeId, label });
        return label;
    }

    /** Confirm a node. Emits map/node_committed, then routes: segments swap
     *  scenes; mystery/shop stay on the map (the scene opens the overlay). */
    commit(nodeId: string): CommitRoute {
        if (!this.reachableIds().includes(nodeId)) {
            throw new Error(`run: ${nodeId} is not reachable from ${this.host.run.nodeId}`);
        }
        const node = nodeById(this.graph, nodeId);
        this.host.run.commitNode(nodeId);
        const gifts = this.host.run.pendingGiftIds();
        const spec = node.segment === null ? null : specWithGifts(node, gifts);
        this.emit({
            type: 'map/node_committed',
            nodeId,
            nodeType: node.type,
            modifiers: committedModifierIds(node, gifts),
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
        applyMysteryEffect(this.host.run, effect);
        return effect;
    }

    // --- Shop (IDENTITY's real ShopScene, launched by MapScene) ---

    shopLaunchData(onLeave: () => void): ShopLaunchData {
        const node = this.currentNode();
        if (node.type !== 'shop') {
            throw new Error(`run: ${node.id} is not a shop node`);
        }
        return {
            run: this.host.run,
            tuning: this.host.tuning,
            emit: (e) => this.emit(e),
            grantRelic: (relicId, source) => {
                this.host.grantRelic(relicId, source);
            },
            nodeId: node.id,
            act: this.host.run.act,
            tick: () => 0, // the map is tickless; segment shops pass the player clock
            onLeave,
        };
    }

    // --- Segment launch and outcome (the RunSignal wiring) ---

    private launchSegment(node: NodeSpec, spec: SegmentSpec | null): void {
        if (spec === null) {
            throw new Error(`run: launching ${node.id} without a segment spec`);
        }
        this.host.run.drainGiftModifiers(); // folded into the spec above
        this.hop('Sandbox', {
            segment: spec,
            run: this.host.run.snapshot(),
            handoff: {
                onOutcome: (outcome, snap) => this.onOutcome(node, outcome, snap),
            },
        } satisfies SandboxBootData);
    }

    private onOutcome(node: NodeSpec, outcome: SegmentOutcome, snap: RunSnapshot): void {
        // Adopt the segment's returned truth whole — the one live authority
        // moves back to the map side (core/run/host.ts).
        this.host = RunHost.adopt(snap, (e) => this.emit(e));
        const run = this.host.run;
        run.foldSegmentStats(outcome.stats);
        if (outcome.kind === 'death_line') {
            // pressure already emitted run/ended {death_line} on its bus; the
            // run loop just folds. A real results scene is RETURN's.
            this.endRun();
            return;
        }
        const lines = [`+${groupDigits(outcome.stats.totalScore)} score`];
        const bounty = Math.round(node.rewards.clearBounty * node.rewards.coinsMul);
        if (bounty > 0) {
            run.adjustCoins(bounty);
            lines.unshift(`+${bounty} coins bounty`);
        }
        if (outcome.stats.bestChainFace.length > 0) {
            lines.push(`best chain ${outcome.stats.bestChainFace}`);
        }
        if (node.rewards.guaranteedRelic) {
            const relic = rollRelicReward(run.runSeed, node.id, run.act, run.relicIds());
            if (relic === null) {
                lines.push('the tower had no relic left to give');
            } else {
                this.host.grantRelic(relic.id, 'elite');
                lines.push(`relic — ${relic.name}`);
            }
        }
        this.toast = {
            headline: `${node.type === 'boss' ? 'ACT CLEARED' : 'CLIMB CLEARED'}`,
            lines,
        };

        if (node.type === 'boss') {
            this.emit({
                type: 'run/act_completed',
                actIndex: run.act,
                path: this.actPath(),
                stats: outcome.stats,
            });
            if (run.act >= ACT_COUNT) {
                this.summit = true;
                this.emit({
                    type: 'run/ended',
                    reason: 'summit',
                    seed: run.runSeed,
                    path: [...run.pathIds()],
                    totalScore: run.totalScore,
                    coins: run.coins,
                });
            } else {
                run.beginAct(run.act + 1);
                this.actStartPathIndex = run.pathIds().length;
                this.graph = this.generateAct(run.act);
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

    private emit(event: RunRingEvent): void {
        this.ring.push(event);
        if (this.ring.length > EVENT_RING_SIZE) {
            this.ring.shift();
        }
    }

    recentEvents(count = 50): RunRingEvent[] {
        return this.ring.slice(-count);
    }

    private generateAct(actIndex: number): ActGraph {
        const graph = generateActGraph(this.host.run.runSeed, actIndex);
        this.emit({
            type: 'map/generated',
            actIndex,
            seed: this.host.run.runSeed,
            forkLabel: graph.forkLabel,
            regenCount: graph.regenCount,
            ...actGraphSummary(graph),
        });
        return graph;
    }

    private currentNode(): NodeSpec {
        const nodeId = this.host.run.nodeId;
        if (nodeId === null) {
            throw new Error('run: no committed node');
        }
        return nodeById(this.graph, nodeId);
    }

    // --- Debug bridge surfaces (harness handles; not gameplay) ---

    debugJumpToNode(nodeId: string): void {
        nodeById(this.graph, nodeId); // throws on unknown id
        this.host.run.commitNode(nodeId);
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
