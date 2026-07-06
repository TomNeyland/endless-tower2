/**
 * Map-scene overlays: the mystery event (seeded outcomes, PG flavor), the
 * minimal shop (hearts only until IDENTITY stocks relics — the honest
 * subset of "spend coins"), the inter-node results toast (light, per
 * playthrough-trace.md finding 4), and the summit card.
 */
import type { GameObjects, Scene } from 'phaser';
import { groupDigits } from '../../core/format';
import type { MysteryEvent } from '../../core/map/mystery';
import type { MapRunState } from '../../core/map/run';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import type { ActPalette } from './palettes';

const PANEL_W = 460;

/** A dim scrim plus a centered panel container. */
function buildPanel(scene: Scene, palette: ActPalette, height: number): GameObjects.Container {
    const c = scene.add.container(0, 0).setDepth(40);
    const scrim = scene.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
        .setInteractive(); // swallow clicks behind the panel
    const bg = scene.add.graphics();
    const x = (GAME_WIDTH - PANEL_W) / 2;
    const y = (GAME_HEIGHT - height) / 2;
    bg.fillStyle(0x10131a, 0.96);
    bg.fillRoundedRect(x, y, PANEL_W, height, 12);
    bg.lineStyle(2, palette.glow, 0.9);
    bg.strokeRoundedRect(x, y, PANEL_W, height, 12);
    c.add([scrim, bg]);
    return c;
}

function buildButton(
    scene: Scene,
    c: GameObjects.Container,
    label: string,
    x: number,
    y: number,
    onClick: () => void,
): GameObjects.Text {
    const t = scene.add
        .text(x, y, label, {
            fontFamily: 'Arial Black',
            fontSize: 17,
            color: '#ffe9b0',
            backgroundColor: '#26202e',
            padding: { x: 14, y: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
    t.on('pointerover', () => t.setStyle({ backgroundColor: '#3a3348' }));
    t.on('pointerout', () => t.setStyle({ backgroundColor: '#26202e' }));
    t.on('pointerdown', onClick);
    c.add(t);
    return t;
}

/** The mystery event: prompt, choices, then the outcome and a Continue. */
export class MysteryOverlay {
    private readonly scene: Scene;
    private readonly palette: ActPalette;
    private container: GameObjects.Container;

    constructor(
        scene: Scene,
        palette: ActPalette,
        event: MysteryEvent,
        resolve: (choiceIndex: number) => string,
        onClose: () => void,
    ) {
        this.scene = scene;
        this.palette = palette;
        this.container = buildPanel(scene, palette, 280);
        const cx = GAME_WIDTH / 2;
        const top = (GAME_HEIGHT - 280) / 2;
        this.container.add(
            scene.add
                .text(cx, top + 34, event.title, {
                    fontFamily: 'Arial Black',
                    fontSize: 24,
                    color: palette.text,
                })
                .setOrigin(0.5),
        );
        this.container.add(
            scene.add
                .text(cx, top + 92, event.prompt, {
                    fontFamily: 'Arial',
                    fontSize: 16,
                    color: palette.textDim,
                    align: 'center',
                    wordWrap: { width: PANEL_W - 60 },
                })
                .setOrigin(0.5),
        );
        event.choices.forEach((choice, i) => {
            buildButton(scene, this.container, choice.label, cx, top + 168 + i * 52, () => {
                const text = resolve(i);
                this.showOutcome(text, onClose);
            });
        });
    }

    private showOutcome(text: string, onClose: () => void): void {
        this.container.destroy();
        this.container = buildPanel(this.scene, this.palette, 200);
        const cx = GAME_WIDTH / 2;
        const top = (GAME_HEIGHT - 200) / 2;
        this.container.add(
            this.scene.add
                .text(cx, top + 66, text, {
                    fontFamily: 'Arial',
                    fontSize: 17,
                    color: this.palette.text,
                    align: 'center',
                    wordWrap: { width: PANEL_W - 60 },
                })
                .setOrigin(0.5),
        );
        buildButton(this.scene, this.container, 'CONTINUE', cx, top + 148, () => {
            this.destroy();
            onClose();
        });
    }

    destroy(): void {
        this.container.destroy();
    }
}

/** The minimal shop: hearts for coins. IDENTITY stocks the rest. */
export class ShopOverlay {
    private readonly stockLine: GameObjects.Text;
    private readonly walletLine: GameObjects.Text;
    private readonly container: GameObjects.Container;

    constructor(
        scene: Scene,
        palette: ActPalette,
        stockText: () => string,
        walletText: () => string,
        buyHeart: () => boolean,
        onClose: () => void,
    ) {
        this.container = buildPanel(scene, palette, 260);
        const cx = GAME_WIDTH / 2;
        const top = (GAME_HEIGHT - 260) / 2;
        this.container.add(
            scene.add
                .text(cx, top + 34, 'SHOP', {
                    fontFamily: 'Arial Black',
                    fontSize: 24,
                    color: palette.text,
                })
                .setOrigin(0.5),
        );
        this.stockLine = scene.add
            .text(cx, top + 86, stockText(), {
                fontFamily: 'Arial',
                fontSize: 17,
                color: palette.text,
            })
            .setOrigin(0.5);
        this.walletLine = scene.add
            .text(cx, top + 116, walletText(), {
                fontFamily: 'Arial',
                fontSize: 14,
                color: palette.textDim,
            })
            .setOrigin(0.5);
        this.container.add([this.stockLine, this.walletLine]);
        buildButton(scene, this.container, 'BUY A HEART', cx - 90, top + 176, () => {
            if (buyHeart()) {
                this.stockLine.setText(stockText());
                this.walletLine.setText(walletText());
            }
        });
        buildButton(scene, this.container, 'LEAVE', cx + 110, top + 176, () => {
            this.destroy();
            onClose();
        });
    }

    destroy(): void {
        this.container.destroy();
    }
}

export interface ToastData {
    headline: string;
    lines: string[];
}

/** The inter-node results toast — light: coins/score delta and bests. */
export class ResultsToast {
    private readonly container: GameObjects.Container;

    constructor(scene: Scene, palette: ActPalette, toast: ToastData) {
        const height = 56 + toast.lines.length * 22;
        const c = scene.add.container(0, 0).setDepth(35).setAlpha(0);
        const bg = scene.add.graphics();
        const w = 380;
        const x = (GAME_WIDTH - w) / 2;
        bg.fillStyle(0x10131a, 0.9);
        bg.fillRoundedRect(x, 56, w, height, 10);
        bg.lineStyle(2, palette.trail, 0.8);
        bg.strokeRoundedRect(x, 56, w, height, 10);
        c.add(bg);
        c.add(
            scene.add
                .text(GAME_WIDTH / 2, 78, toast.headline, {
                    fontFamily: 'Arial Black',
                    fontSize: 17,
                    color: palette.text,
                })
                .setOrigin(0.5),
        );
        toast.lines.forEach((line, i) => {
            c.add(
                scene.add
                    .text(GAME_WIDTH / 2, 104 + i * 22, line, {
                        fontFamily: 'Arial',
                        fontSize: 14,
                        color: palette.textDim,
                    })
                    .setOrigin(0.5),
            );
        });
        this.container = c;
        scene.tweens.add({ targets: c, alpha: 1, duration: 250 });
        scene.tweens.add({
            targets: c,
            alpha: 0,
            delay: 3600,
            duration: 500,
            onComplete: () => c.destroy(),
        });
    }

    destroy(): void {
        this.container.destroy();
    }
}

/** The summit: the run is won. Score, best chain, seed — then the menu. */
export class SummitCard {
    private readonly container: GameObjects.Container;

    constructor(scene: Scene, palette: ActPalette, state: MapRunState, onDone: () => void) {
        this.container = buildPanel(scene, palette, 300);
        const cx = GAME_WIDTH / 2;
        const top = (GAME_HEIGHT - 300) / 2;
        const add = (y: number, text: string, size: number, color: string, bold = false): void => {
            this.container.add(
                scene.add
                    .text(cx, top + y, text, {
                        fontFamily: bold ? 'Arial Black' : 'Arial',
                        fontSize: size,
                        color,
                        align: 'center',
                        wordWrap: { width: PANEL_W - 50 },
                    })
                    .setOrigin(0.5),
            );
        };
        add(44, 'THE SUMMIT', 30, palette.text, true);
        add(96, `score ${groupDigits(state.totalScore)}`, 20, palette.text);
        if (state.bestChainFace.length > 0) {
            add(132, `best chain ${state.bestChainFace}`, 16, '#ffce7a');
        }
        add(170, `seed ${state.seed}`, 14, palette.textDim);
        buildButton(scene, this.container, 'RETURN', cx, top + 236, () => {
            this.destroy();
            onDone();
        });
    }

    destroy(): void {
        this.container.destroy();
    }
}
