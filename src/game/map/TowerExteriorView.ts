/**
 * The act's tower exterior — the map IS the place you're climbing, not a
 * flowchart in a void (map-modifiers.md). Nodes are glowing windows on the
 * silhouette; the current node pulses, reachable windows glow brighter,
 * the taken path stays warm-lit behind you, and the traversal animation
 * climbs the character marker up the outside wall.
 */
import { BlendModes, type GameObjects, type Scene } from 'phaser';
import type { ActGraph, NodeSpec, NodeType } from '../../core/map/types';
import { fork } from '../../core/rng';
import { Atlas, CharFrame, Gen, MapIconFrame } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import type { ActPalette } from './palettes';

const TOWER_BOTTOM_Y = 748;
const TOWER_TOP_Y = 96;
const TOWER_BOTTOM_W = 640;
const TOWER_TOP_W = 350;
const ROW_BASE_Y = 645;
const ROW_TOP_Y = 158;
const WINDOW_W = 44;
const WINDOW_H = 56;

const ICON_BY_TYPE: Partial<Record<NodeType, string>> = {
    coin_rush: MapIconFrame.coinRush,
    challenge: MapIconFrame.challenge,
    elite: MapIconFrame.elite,
    shop: MapIconFrame.shop,
    mystery: MapIconFrame.mystery,
    boss: MapIconFrame.boss,
};

interface WindowSprite {
    node: NodeSpec;
    x: number;
    y: number;
    pane: GameObjects.Rectangle;
    glow: GameObjects.Image;
    icon: GameObjects.Image | null;
    focusRing: GameObjects.Rectangle;
}

function rowY(row: number): number {
    return ROW_BASE_Y + (row / 6) * (ROW_TOP_Y - ROW_BASE_Y);
}

function towerHalfWidthAt(y: number): number {
    const t = (TOWER_BOTTOM_Y - y) / (TOWER_BOTTOM_Y - TOWER_TOP_Y);
    return (TOWER_BOTTOM_W + (TOWER_TOP_W - TOWER_BOTTOM_W) * t) / 2;
}

export class TowerExteriorView {
    private readonly scene: Scene;
    private readonly palette: ActPalette;
    private readonly windows = new Map<string, WindowSprite>();
    private readonly edgeGfx: GameObjects.Graphics;
    private readonly marker: GameObjects.Image;
    private reachable = new Set<string>();
    private currentId: string | null = null;
    private pulsePhase = 0;

    constructor(scene: Scene, graph: ActGraph, palette: ActPalette, seedForSkin: string) {
        this.scene = scene;
        this.palette = palette;

        this.drawBackdrop(seedForSkin);
        this.drawTower();
        this.edgeGfx = scene.add.graphics().setDepth(4);

        for (const row of graph.rows) {
            for (const node of row) {
                this.windows.set(node.id, this.buildWindow(node, row.length));
            }
        }
        this.drawEdges(graph);

        this.marker = scene.add
            .image(GAME_WIDTH / 2, TOWER_BOTTOM_Y - 24, Atlas.characters, CharFrame.front)
            .setScale(0.34)
            .setDepth(8);
    }

    private drawBackdrop(seedForSkin: string): void {
        const g = this.scene.add.graphics().setDepth(0);
        g.fillGradientStyle(
            this.palette.skyTop,
            this.palette.skyTop,
            this.palette.skyBottom,
            this.palette.skyBottom,
            1,
        );
        g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        const rng = fork(seedForSkin, 'mapskin');
        if (this.palette.stars) {
            g.fillStyle(0xffffff, 0.8);
            for (let i = 0; i < 90; i += 1) {
                g.fillCircle(rng() * GAME_WIDTH, rng() * GAME_HEIGHT * 0.7, rng() < 0.85 ? 1 : 2);
            }
        }
        // Far silhouettes: soft mounds on the horizon.
        g.fillStyle(this.palette.far, 1);
        for (let i = 0; i < 5; i += 1) {
            const cx = rng() * GAME_WIDTH;
            const r = 120 + rng() * 180;
            g.fillEllipse(cx, GAME_HEIGHT + r * 0.45, r * 2.4, r);
        }
    }

    private drawTower(): void {
        const g = this.scene.add.graphics().setDepth(2);
        const halfBottom = TOWER_BOTTOM_W / 2;
        const halfTop = TOWER_TOP_W / 2;
        const cx = GAME_WIDTH / 2;
        g.fillStyle(this.palette.towerFill, 1);
        g.beginPath();
        g.moveTo(cx - halfBottom, TOWER_BOTTOM_Y);
        g.lineTo(cx - halfTop, TOWER_TOP_Y);
        g.lineTo(cx + halfTop, TOWER_TOP_Y);
        g.lineTo(cx + halfBottom, TOWER_BOTTOM_Y);
        g.closePath();
        g.fillPath();
        g.lineStyle(3, this.palette.towerEdge, 1);
        g.strokePath();
        // The crown: a simple parapet so the summit reads as a destination.
        g.fillStyle(this.palette.towerEdge, 1);
        const merlons = 5;
        const crownW = TOWER_TOP_W * 0.92;
        for (let i = 0; i < merlons; i += 1) {
            const w = crownW / (merlons * 2 - 1);
            g.fillRect(cx - crownW / 2 + i * 2 * w, TOWER_TOP_Y - 18, w, 18);
        }
    }

    private buildWindow(node: NodeSpec, rowWidth: number): WindowSprite {
        const y = rowY(node.row);
        const usable = towerHalfWidthAt(y) * 2 - 120;
        const spacing = rowWidth > 1 ? Math.min(150, usable / (rowWidth - 1)) : 0;
        const x = GAME_WIDTH / 2 + (node.col - (rowWidth - 1) / 2) * spacing;
        const isBoss = node.type === 'boss';
        const w = isBoss ? WINDOW_W * 1.7 : WINDOW_W;
        const h = isBoss ? WINDOW_H * 1.5 : WINDOW_H;

        const glow = this.scene.add
            .image(x, y, Gen.glow)
            .setDisplaySize(w * 3.4, h * 3)
            .setTint(this.palette.glow)
            .setBlendMode(BlendModes.ADD)
            .setDepth(3)
            .setAlpha(0.25);
        const pane = this.scene.add
            .rectangle(x, y, w, h, this.palette.windowLit, 1)
            .setStrokeStyle(3, this.palette.towerEdge, 1)
            .setDepth(5);
        pane.setInteractive({ useHandCursor: true });
        pane.setData('nodeId', node.id);
        const focusRing = this.scene.add
            .rectangle(x, y, w + 14, h + 14)
            .setStrokeStyle(3, 0xffffff, 0.9)
            .setDepth(6)
            .setVisible(false);
        const iconFrame = ICON_BY_TYPE[node.type];
        const icon = iconFrame
            ? this.scene.add
                  .image(x, y, Atlas.tiles, iconFrame)
                  .setScale(isBoss ? 0.5 : 0.38)
                  .setDepth(6)
            : null;
        return { node, x, y, pane, glow, icon, focusRing };
    }

    private drawEdges(graph: ActGraph): void {
        this.edgeGfx.clear();
        for (const row of graph.rows) {
            for (const node of row) {
                const from = this.windows.get(node.id);
                if (!from) {
                    continue;
                }
                for (const upId of node.edgesUp) {
                    const to = this.windows.get(upId);
                    if (!to) {
                        continue;
                    }
                    const taken = this.takenEdge(node.id, upId);
                    const live = this.currentId === node.id && this.reachable.has(upId);
                    if (taken) {
                        this.edgeGfx.lineStyle(3, this.palette.trail, 0.85);
                    } else if (live) {
                        this.edgeGfx.lineStyle(2, this.palette.edgeLine, 0.7);
                    } else {
                        this.edgeGfx.lineStyle(2, this.palette.edgeLine, 0.16);
                    }
                    this.edgeGfx.lineBetween(from.x, from.y - 6, to.x, to.y + 6);
                }
            }
        }
    }

    private takenPath: string[] = [];

    private takenEdge(fromId: string, toId: string): boolean {
        const i = this.takenPath.indexOf(fromId);
        return i !== -1 && this.takenPath[i + 1] === toId;
    }

    /** Reflect the run's position: current node, reachable set, warm trail. */
    setRunPosition(
        graph: ActGraph,
        currentId: string | null,
        reachable: string[],
        actPath: string[],
    ): void {
        this.currentId = currentId;
        this.reachable = new Set(reachable);
        this.takenPath = [...actPath];
        for (const win of this.windows.values()) {
            const visited = actPath.includes(win.node.id);
            const isReachable = this.reachable.has(win.node.id);
            const isCurrent = win.node.id === currentId;
            win.pane.setFillStyle(
                this.palette.windowLit,
                isCurrent || isReachable ? 1 : visited ? 0.9 : 0.45,
            );
            win.glow.setTint(visited || isCurrent ? this.palette.trail : this.palette.glow);
            win.icon?.setAlpha(isCurrent || isReachable ? 1 : visited ? 0.9 : 0.55);
        }
        this.drawEdges(graph);
        if (currentId) {
            const win = this.windows.get(currentId);
            if (win) {
                this.marker.setPosition(win.x, win.y - 8);
            }
        } else {
            this.marker.setPosition(GAME_WIDTH / 2, TOWER_BOTTOM_Y - 24);
        }
    }

    setFocus(nodeId: string | null): void {
        for (const win of this.windows.values()) {
            win.focusRing.setVisible(win.node.id === nodeId);
        }
    }

    windowPos(nodeId: string): { x: number; y: number } {
        const win = this.windows.get(nodeId);
        if (!win) {
            throw new Error(`map view: no window for ${nodeId}`);
        }
        return { x: win.x, y: win.y };
    }

    /** The character climbs the exterior to the chosen window. */
    traverseTo(nodeId: string, onComplete: () => void): void {
        const { x, y } = this.windowPos(nodeId);
        this.scene.tweens.add({
            targets: this.marker,
            x,
            y: y - 8,
            duration: 650,
            ease: 'Sine.easeInOut',
            onComplete,
        });
        this.scene.tweens.add({
            targets: this.marker,
            angle: { from: -6, to: 6 },
            duration: 130,
            yoyo: true,
            repeat: 2,
            onComplete: () => this.marker.setAngle(0),
        });
    }

    onPointerOver(fn: (nodeId: string) => void): void {
        for (const win of this.windows.values()) {
            win.pane.on('pointerover', () => fn(win.node.id));
        }
    }

    onPointerDown(fn: (nodeId: string) => void): void {
        for (const win of this.windows.values()) {
            win.pane.on('pointerdown', () => fn(win.node.id));
        }
    }

    /** Gentle breathing on the glow layer; stronger on current + reachable. */
    update(deltaMs: number): void {
        this.pulsePhase += deltaMs * 0.004;
        const pulse = (Math.sin(this.pulsePhase) + 1) / 2;
        for (const win of this.windows.values()) {
            const isCurrent = win.node.id === this.currentId;
            const isReachable = this.reachable.has(win.node.id);
            const base = isCurrent ? 0.75 : isReachable ? 0.55 : 0.22;
            const swing = isCurrent ? 0.25 : isReachable ? 0.2 : 0.05;
            win.glow.setAlpha(base + swing * pulse);
        }
    }

    destroy(): void {
        // Scene shutdown destroys display objects; explicit for symmetry.
        for (const win of this.windows.values()) {
            win.pane.destroy();
            win.glow.destroy();
            win.icon?.destroy();
            win.focusRing.destroy();
        }
        this.edgeGfx.destroy();
        this.marker.destroy();
    }
}
