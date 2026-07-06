/**
 * The node label card: type, modifiers (price/pay in one breath), rewards,
 * line profile — the full price tag before commitment (pillar 2). The
 * silhouette carries the shape; this card carries the detail.
 */
import type { GameObjects, Scene } from 'phaser';
import type { NodeLabel } from '../../core/map/label';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import type { ActPalette } from './palettes';

const CARD_W = 340;
const PAD = 14;
const FONT = 'Arial';

export class NodeCardView {
    private readonly scene: Scene;
    private readonly palette: ActPalette;
    private container: GameObjects.Container | null = null;

    constructor(scene: Scene, palette: ActPalette) {
        this.scene = scene;
        this.palette = palette;
    }

    show(label: NodeLabel, anchorX: number, anchorY: number, commitHint: string | null): void {
        this.hide();
        const c = this.scene.add.container(0, 0).setDepth(20);
        const items: GameObjects.GameObject[] = [];
        let y = PAD;

        const addText = (text: string, size: number, color: string, bold = false): void => {
            const t = this.scene.add
                .text(PAD, y, text, {
                    fontFamily: bold ? 'Arial Black' : FONT,
                    fontSize: size,
                    color,
                    wordWrap: { width: CARD_W - PAD * 2 },
                })
                .setOrigin(0, 0);
            items.push(t);
            y += t.height + 5;
        };

        addText(label.title, 20, this.palette.text, true);
        addText(label.blurb, 13, this.palette.textDim);
        if (label.shape) {
            addText(label.shape, 15, this.palette.text);
        }
        for (const mod of label.modifiers) {
            addText(`${mod.name} — ${mod.breath}`, 13, '#ffce7a');
        }
        if (label.compound) {
            addText(`! ${label.compound}`, 13, '#ff9a6b');
        }
        for (const reward of label.rewards) {
            addText(`+ ${reward}`, 13, '#a8e6a0');
        }
        if (commitHint) {
            y += 4;
            addText(commitHint, 12, this.palette.textDim);
        }

        const height = y + PAD - 5;
        const bg = this.scene.add.graphics();
        bg.fillStyle(0x10131a, 0.92);
        bg.fillRoundedRect(0, 0, CARD_W, height, 10);
        bg.lineStyle(2, this.palette.glow, 0.8);
        bg.strokeRoundedRect(0, 0, CARD_W, height, 10);
        c.add(bg);
        for (const item of items) {
            c.add(item);
        }

        // Anchor beside the window, flipped and clamped to stay on screen.
        const x = anchorX + 60 + CARD_W <= GAME_WIDTH - 8 ? anchorX + 60 : anchorX - 60 - CARD_W;
        const yTop = Math.max(8, Math.min(anchorY - height / 2, GAME_HEIGHT - height - 8));
        c.setPosition(Math.max(8, x), yTop);
        this.container = c;
    }

    hide(): void {
        this.container?.destroy();
        this.container = null;
    }

    destroy(): void {
        this.hide();
    }
}
