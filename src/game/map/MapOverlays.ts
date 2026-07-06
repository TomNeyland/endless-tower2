/**
 * Map-scene overlays: the mystery event (seeded outcomes, PG flavor), the
 * inter-node results toast (light, per playthrough-trace.md finding 4),
 * and the summit card. The shop is NOT an overlay — committed Shop nodes
 * launch IDENTITY's real ShopScene above the paused map.
 *
 * Keyboard + pointer both first-class (map-modifiers.md, binding): every
 * overlay that takes a decision answers keys — digits or arrows+Enter pick
 * a mystery choice, Enter/Space presses CONTINUE and RETURN. Handlers are
 * stored refs removed in destroy() (listener hygiene law); the MapScene
 * owns the open overlay and destroys it on scene shutdown.
 */
import type { GameObjects, Scene } from 'phaser';
import { groupDigits } from '../../core/format';
import type { MysteryEvent } from '../../core/map/mystery';
import type { RunSnapshot } from '../../core/run/state';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import { buildPanel, OverlayButton, PANEL_W } from './overlayKit';
import type { ActPalette } from './palettes';

/** The mystery event: prompt, choices, then the outcome and a Continue. */
export class MysteryOverlay {
    private readonly scene: Scene;
    private readonly palette: ActPalette;
    private container: GameObjects.Container;
    private buttons: OverlayButton[] = [];
    private focusIndex = -1;
    private outcomePhase = false;

    private readonly onKey = (event: KeyboardEvent): void => this.handleKey(event);

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
            const button = new OverlayButton(
                scene,
                this.container,
                `${i + 1}. ${choice.label}`,
                cx,
                top + 168 + i * 52,
                () => {
                    const text = resolve(i);
                    this.showOutcome(text, onClose);
                },
            );
            button.onHover(() => this.setFocus(i));
            this.buttons.push(button);
        });
        this.setFocus(0);
        scene.input.keyboard?.on('keydown', this.onKey);
    }

    private setFocus(index: number): void {
        this.focusIndex = index;
        this.buttons.forEach((b, i) => {
            b.setFocused(i === index);
        });
    }

    private handleKey(event: KeyboardEvent): void {
        if (event.key === 'Enter' || event.key === ' ') {
            if (!event.repeat && this.focusIndex >= 0) {
                this.buttons[this.focusIndex].press();
            }
            return;
        }
        if (this.outcomePhase) {
            return;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            const step = event.key === 'ArrowUp' ? -1 : 1;
            this.setFocus((this.focusIndex + step + this.buttons.length) % this.buttons.length);
            return;
        }
        const digit = Number.parseInt(event.key, 10);
        if (
            !event.repeat &&
            Number.isInteger(digit) &&
            digit >= 1 &&
            digit <= this.buttons.length
        ) {
            this.buttons[digit - 1].press();
        }
    }

    private showOutcome(text: string, onClose: () => void): void {
        this.container.destroy();
        this.outcomePhase = true;
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
        const button = new OverlayButton(
            this.scene,
            this.container,
            'CONTINUE',
            cx,
            top + 148,
            () => {
                this.destroy();
                onClose();
            },
        );
        this.buttons = [button];
        this.setFocus(0);
    }

    destroy(): void {
        this.scene.input.keyboard?.off('keydown', this.onKey);
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
    private readonly scene: Scene;
    private readonly container: GameObjects.Container;

    private readonly onKey = (event: KeyboardEvent): void => {
        if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) {
            this.returnButton.press();
        }
    };

    private readonly returnButton: OverlayButton;

    constructor(scene: Scene, palette: ActPalette, state: RunSnapshot, onDone: () => void) {
        this.scene = scene;
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
        this.returnButton = new OverlayButton(
            scene,
            this.container,
            'RETURN',
            cx,
            top + 236,
            () => {
                this.destroy();
                onDone();
            },
        );
        this.returnButton.setFocused(true);
        scene.input.keyboard?.on('keydown', this.onKey);
    }

    destroy(): void {
        this.scene.input.keyboard?.off('keydown', this.onKey);
        this.container.destroy();
    }
}
