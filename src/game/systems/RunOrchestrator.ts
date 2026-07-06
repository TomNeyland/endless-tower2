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
import {
    choiceCoinStake,
    type MysteryEffect,
    mysteryEventById,
    resolveMystery,
} from '../../core/map/mystery';
import { ACT_COUNT, type ActGraph, nodeById, type NodeSpec } from '../../core/map/types';
import { DEFAULT_TUNING } from '../../core/tuning';
import { modifierPool, relicPool } from '../../core/meta/unlocks';
import type { SegmentSpec } from '../../core/pressure/segment';
import { RunHost } from '../../core/run/host';
import { MetaTracker } from '../meta/MetaTracker';
import { saveStore } from '../meta/SaveStore';
import type { ResultsBootData } from '../scenes/ResultsScene';
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
    private readonly characterId: string;
    /** RETURN's run-spanning feat/stat watcher — one per run. */
    private readonly tracker: MetaTracker;
    private graph: ActGraph;
    private ring: RunRingEvent[] = [];
    private toast: ToastData | null = null;
    private summit = false;
    private actStartPathIndex = 0;

    /** Begin a run and enter the map. The one front door (character select). */
    static begin(game: Game, seed: string, characterId = 'beige'): RunOrchestrator {
        const run = new RunOrchestrator(game, seed, characterId);
        run.hop('MapScene', { run });
        return run;
    }

    private constructor(game: Game, seed: string, characterId: string) {
        this.game = game;
        this.characterId = characterId;
        this.tracker = new MetaTracker(saveStore());
        this.host = RunHost.begin(seed, (e) => this.emit(e), characterId);
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
        const event = mysteryEventById(node.mysteryEventId);
        const effect = resolveMystery(event, choiceIndex, node.mysteryRoll);
        // The overlay disables unaffordable stakes; this is the backstop (the
        // shop's "UI is the gate, the command is the backstop" pattern).
        const stake = choiceCoinStake(event.choices[choiceIndex]);
        if (stake > this.host.run.coins) {
            throw new Error(
                `run: mystery choice ${choiceIndex} stakes ${stake} coins with ` +
                    `${this.host.run.coins} in the wallet — affordability is the overlay's gate`,
            );
        }
        // A mystery's heart loss is eventless (RunState module doc) — the
        // meta layer learns it from the one truth: hearts before vs after.
        const heartsBefore = this.host.run.hearts;
        applyMysteryEffect(this.host.run, effect);
        if (this.host.run.hearts < heartsBefore) {
            this.tracker.noteMysteryHeartLoss();
        }
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
            meta: this.tracker,
        } satisfies SandboxBootData);
    }

    private onOutcome(node: NodeSpec, outcome: SegmentOutcome, snap: RunSnapshot): void {
        // The map-side wallet BEFORE adoption is the launch-time truth:
        // diffing it against the returned snapshot recovers the segment's own
        // coin story (placed pickups, minus anything a mid-segment shop
        // charged) — the toast shows the segment's delta of coins, score,
        // and bests (playthrough-trace.md finding 4).
        const coinsBefore = this.host.run.coins;
        // Adopt the segment's returned truth whole — the one live authority
        // moves back to the map side (core/run/host.ts).
        this.host = RunHost.adopt(snap, (e) => this.emit(e));
        const run = this.host.run;
        run.foldSegmentStats(outcome.stats);
        this.tracker.noteOutcome(outcome);
        if (outcome.kind === 'death_line') {
            // pressure already emitted run/ended {death_line} on its bus; the
            // run loop just folds — endRun routes to the results scene.
            this.endRun();
            return;
        }
        const lines: string[] = [];
        const coinsDelta = run.coins - coinsBefore;
        if (coinsDelta !== 0) {
            lines.push(`${coinsDelta > 0 ? '+' : ''}${coinsDelta} coins`);
        }
        const bounty = Math.round(node.rewards.clearBounty * node.rewards.coinsMul);
        if (bounty > 0) {
            run.adjustCoins(bounty);
            lines.push(`+${bounty} coins bounty`);
        }
        lines.push(`+${groupDigits(outcome.stats.totalScore)} score`);
        if (outcome.stats.bestChainFace.length > 0) {
            lines.push(`best chain ${outcome.stats.bestChainFace}`);
        }
        if (node.rewards.guaranteedRelic) {
            const relic = rollRelicReward(
                run.runSeed,
                node.id,
                run.act,
                run.relicIds(),
                relicPool(saveStore().doc.unlocks.relics),
            );
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
            this.tracker.noteActCompleted(run.act);
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

    /**
     * The run is over (death, or the summit card's RETURN): fold the run
     * into the meta layer — feats fired, stats, lastSeed, the ONE save
     * write — and hand the full run-end flow to the ResultsScene.
     */
    endRun(): void {
        removeMapBridge();
        const results = this.tracker.finish(
            this.summit ? 'summit' : 'death_line',
            this.host.run.snapshot(),
        );
        saveStore().commitRunEnd(results.record, this.tracker.relicsUnlockedThisRun());
        this.hop('Results', { results } satisfies ResultsBootData);
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
        // The modifier roll pool is the save's (RETURN): the meta-locked
        // three stay out until their act-completion feats land.
        const graph = generateActGraph(
            this.host.run.runSeed,
            actIndex,
            DEFAULT_TUNING['map.maxRegens'],
            modifierPool(saveStore().doc.unlocks.modifiers),
        );
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
        // Same seed + same character = same run offer (meta-progression.md).
        removeMapBridge();
        RunOrchestrator.begin(this.game, seed, this.characterId);
    }
}
