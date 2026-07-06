/**
 * Shared chrome for the map-scene overlays: the scrim+panel builder and
 * OverlayButton — one button truth for pointer AND keyboard, because
 * map-modifiers.md's map-scene clause is binding: "Keyboard + pointer both
 * first-class." Buttons never wire their own keydown; the overlay owns a
 * single scene-keyboard handler and routes to press()/setFocused(), so
 * pointer hover and keyboard focus share one focus model instead of two
 * half-implementations.
 */
import type { GameObjects, Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import type { ActPalette } from './palettes';

export const PANEL_W = 460;

const BUTTON_BG = '#26202e';
const BUTTON_BG_FOCUS = '#3a3348';
const BUTTON_BG_DISABLED = '#1a161f';
const BUTTON_TEXT = '#ffe9b0';
const BUTTON_TEXT_DISABLED = '#7d7788';

/** A dim scrim plus a centered panel container. */
export function buildPanel(
    scene: Scene,
    palette: ActPalette,
    height: number,
): GameObjects.Container {
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

/**
 * An overlay action, pressable by pointer or by the overlay's key handler.
 * A disabled button is inert on BOTH devices — it renders dim, takes no
 * pointer events, refuses press(), and never receives focus (the overlay's
 * focus walk skips it).
 */
export class OverlayButton {
    readonly enabled: boolean;

    private readonly text: GameObjects.Text;
    private readonly handler: () => void;

    constructor(
        scene: Scene,
        container: GameObjects.Container,
        label: string,
        x: number,
        y: number,
        onPress: () => void,
        enabled = true,
    ) {
        this.enabled = enabled;
        this.handler = onPress;
        this.text = scene.add
            .text(x, y, label, {
                fontFamily: 'Arial Black',
                fontSize: 17,
                color: enabled ? BUTTON_TEXT : BUTTON_TEXT_DISABLED,
                backgroundColor: enabled ? BUTTON_BG : BUTTON_BG_DISABLED,
                padding: { x: 14, y: 8 },
            })
            .setOrigin(0.5);
        if (enabled) {
            this.text.setInteractive({ useHandCursor: true });
            this.text.on('pointerdown', () => this.press());
        }
        container.add(this.text);
    }

    /** Pointer hover reports here so the overlay can move its ONE focus. */
    onHover(fn: () => void): void {
        if (this.enabled) {
            this.text.on('pointerover', fn);
        }
    }

    /** Focus highlight — the same look for keyboard focus and pointer hover. */
    setFocused(on: boolean): void {
        if (this.enabled) {
            this.text.setStyle({ backgroundColor: on ? BUTTON_BG_FOCUS : BUTTON_BG });
        }
    }

    press(): void {
        if (this.enabled) {
            this.handler();
        }
    }
}
