/**
 * The map scene — composition root, nothing else (the Sandbox pattern).
 * Renders the act's tower exterior, routes keyboard + pointer to the run
 * orchestrator, opens the label card on focus, runs the traversal
 * animation on commit, and hosts the overlays (mystery, results toast,
 * summit). Committed Shop nodes launch IDENTITY's real ShopScene above
 * this paused scene. All decisions live in RunOrchestrator and src/core.
 */
import { Scene } from 'phaser';
import { mysteryEventById } from '../../core/map/mystery';
import { nodeById } from '../../core/map/types';
import { characterFrames, ensureGeneratedTextures } from '../assets';
import { type HudReadout, MapHud } from '../map/MapHud';
import { NodeCardView } from '../map/NodeCardView';
import { actPalette } from '../map/palettes';
import { MysteryOverlay, ResultsToast, SummitCard } from '../map/MapOverlays';
import { TowerExteriorView } from '../map/TowerExteriorView';
import type { RunOrchestrator } from '../systems/RunOrchestrator';

export interface MapSceneBootData {
    run: RunOrchestrator;
}

export class MapScene extends Scene {
    private run!: RunOrchestrator;
    private view!: TowerExteriorView;
    private card!: NodeCardView;
    private hud!: MapHud;
    private focusId: string | null = null;
    /** The open decision overlay — owned here so a scene shutdown while it
     *  is up (debug jump, run end) tears its key handler down with it. */
    private overlay: MysteryOverlay | SummitCard | null = null;
    private overlayOpen = false;
    private traversing = false;

    private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKey(event);

    constructor() {
        super('MapScene');
    }

    create(data: MapSceneBootData): void {
        if (!data.run) {
            throw new Error('MapScene: booted without a run (MainMenu owns Start Run)');
        }
        ensureGeneratedTextures(this);
        this.run = data.run;
        this.overlayOpen = false;
        this.traversing = false;

        const snap = this.run.snapshot();
        const palette = actPalette(snap.actIndex);
        const graph = this.run.actGraph();
        this.view = new TowerExteriorView(
            this,
            graph,
            palette,
            snap.seed,
            characterFrames(snap.characterId),
        );
        this.card = new NodeCardView(this, palette);
        this.hud = new MapHud(this, palette, () => this.hudReadout());
        this.syncRunPosition();

        this.view.onPointerOver((nodeId) => {
            if (!this.overlayOpen && !this.traversing) {
                this.setFocus(nodeId);
            }
        });
        this.view.onPointerDown((nodeId) => {
            if (this.overlayOpen || this.traversing) {
                return;
            }
            if (this.focusId === nodeId && this.run.reachableIds().includes(nodeId)) {
                this.commit(nodeId);
            } else {
                this.setFocus(nodeId);
            }
        });
        this.input.keyboard?.on('keydown', this.onKeyDown);

        if (this.run.isSummit()) {
            this.overlayOpen = true;
            this.overlay = new SummitCard(this, palette, this.run.snapshot(), () =>
                this.run.endRun(),
            );
        } else {
            const toast = this.run.consumeToast();
            if (toast) {
                new ResultsToast(this, palette, toast);
            }
            this.focusFirstReachable();
        }

        this.events.once('shutdown', () => this.teardown());
    }

    private hudReadout(): HudReadout {
        const snap = this.run.snapshot();
        return {
            hearts: this.run.heartsDisplay(),
            coins: snap.coins,
            totalScore: snap.totalScore,
            act: snap.actIndex,
            seed: snap.seed,
        };
    }

    private syncRunPosition(): void {
        this.view.setRunPosition(
            this.run.actGraph(),
            this.run.snapshot().nodeId,
            this.run.reachableIds(),
            this.run.actPath(),
        );
    }

    private focusFirstReachable(): void {
        const reachable = this.run.reachableIds();
        this.setFocus(reachable.length > 0 ? reachable[0] : null);
    }

    private setFocus(nodeId: string | null): void {
        this.focusId = nodeId;
        this.view.setFocus(nodeId);
        if (nodeId === null) {
            this.card.hide();
            return;
        }
        const label = this.run.preview(nodeId);
        const pos = this.view.windowPos(nodeId);
        const reachable = this.run.reachableIds().includes(nodeId);
        const node = nodeById(this.run.actGraph(), nodeId);
        const verb =
            node.type === 'shop'
                ? 'ENTER — browse'
                : node.type === 'mystery'
                  ? 'ENTER — investigate'
                  : 'ENTER — climb';
        this.card.show(label, pos.x, pos.y, reachable ? verb : null);
    }

    /**
     * Keyboard roams the WHOLE act, exactly like pointer hover: plan-ahead
     * label reading is the map phase's core activity ("you chose all of it,
     * three rows ago, on purpose" — map-modifiers.md), so upper rows must be
     * studyable without a mouse. Left/Right walks the focused row, Up/Down
     * hops rows to the nearest window, Enter/Space commits — and only a
     * reachable focus commits (the card's commit-hint is already null
     * elsewhere).
     */
    private handleKey(event: KeyboardEvent): void {
        if (this.overlayOpen || this.traversing) {
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            if (this.focusId === null) {
                this.focusFirstReachable();
            } else if (this.run.reachableIds().includes(this.focusId)) {
                this.commit(this.focusId);
            }
            return;
        }
        const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
        const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
        if (!horizontal && !vertical) {
            return;
        }
        if (this.focusId === null) {
            this.focusFirstReachable();
            return;
        }
        const graph = this.run.actGraph();
        const node = nodeById(graph, this.focusId);
        if (horizontal) {
            const row = graph.rows[node.row];
            const i = row.findIndex((n) => n.id === this.focusId);
            const step = event.key === 'ArrowLeft' ? -1 : 1;
            this.setFocus(row[(i + step + row.length) % row.length].id);
            return;
        }
        const targetRow = node.row + (event.key === 'ArrowUp' ? 1 : -1);
        if (targetRow < 0 || targetRow >= graph.rows.length) {
            return;
        }
        const x = this.view.windowPos(this.focusId).x;
        let best = graph.rows[targetRow][0];
        for (const candidate of graph.rows[targetRow]) {
            const dist = Math.abs(this.view.windowPos(candidate.id).x - x);
            if (dist < Math.abs(this.view.windowPos(best.id).x - x)) {
                best = candidate;
            }
        }
        this.setFocus(best.id);
    }

    /** Confirm → traversal animation → map/node_committed → route. */
    private commit(nodeId: string): void {
        this.traversing = true;
        this.card.hide();
        this.view.setFocus(null);
        this.view.traverseTo(nodeId, () => {
            this.traversing = false;
            const route = this.run.commit(nodeId);
            // Segment routes swap scenes inside the orchestrator; the map
            // routes open their surface here.
            if (route.kind === 'mystery') {
                this.openMystery();
            } else if (route.kind === 'shop') {
                this.openShop();
            }
        });
    }

    private openMystery(): void {
        const node = nodeById(this.run.actGraph(), this.run.snapshot().nodeId as string);
        if (node.mysteryEventId === null) {
            throw new Error(`MapScene: ${node.id} committed as mystery without an event`);
        }
        this.overlayOpen = true;
        this.syncRunPosition();
        const palette = actPalette(this.run.snapshot().actIndex);
        this.overlay = new MysteryOverlay(
            this,
            palette,
            // Rendered from the same data the resolution reads — one authority.
            mysteryEventById(node.mysteryEventId),
            // The wallet gates the stakes (unaffordable choices disable).
            this.run.snapshot().coins,
            (choiceIndex) => this.run.resolveMysteryChoice(choiceIndex).text,
            () => this.closeOverlay(),
        );
    }

    /** The real shop (relics, hearts, rerolls) above the paused map — the
     *  same ShopScene contract the debug bridge drives mid-segment. */
    private openShop(): void {
        this.overlayOpen = true;
        this.syncRunPosition();
        const data = this.run.shopLaunchData(() => {
            this.scene.resume();
            this.closeOverlay();
        });
        this.scene.pause();
        this.scene.launch('Shop', data);
    }

    private closeOverlay(): void {
        this.overlay = null; // the overlay destroyed itself before closing
        this.overlayOpen = false;
        this.hud.refresh(this.hudReadout());
        this.syncRunPosition();
        this.focusFirstReachable();
    }

    update(_time: number, delta: number): void {
        this.view.update(delta);
    }

    private teardown(): void {
        this.input.keyboard?.off('keydown', this.onKeyDown);
        this.overlay?.destroy(); // its key handler must not outlive the scene
        this.overlay = null;
        this.card.destroy();
        this.hud.destroy();
        this.view.destroy();
    }
}
