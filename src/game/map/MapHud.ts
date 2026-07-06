/**
 * HUD continuity on the map: hearts and coins persist between climbs
 * (playthrough-trace.md finding 7), plus the run score and the visible,
 * tap-to-copy seed (map-modifiers.md). UI whispers — small, corner, the
 * tower is the show.
 */
import type { GameObjects, Scene } from 'phaser';
import { groupDigits } from '../../core/format';
import type { MapRunState } from '../../core/map/run';
import { DEFAULT_TUNING } from '../../core/tuning';
import { Atlas, HudFrame } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import type { ActPalette } from './palettes';

const HEART_SCALE = 0.55;
const HEART_SPACING = 42;
const X = 28;
const Y = 26;

export class MapHud {
    private readonly scene: Scene;
    private readonly hearts: GameObjects.Image[] = [];
    private readonly coinIcon: GameObjects.Image;
    private readonly coinText: GameObjects.Text;
    private readonly scoreText: GameObjects.Text;
    private readonly actText: GameObjects.Text;
    private readonly seedText: GameObjects.Text;
    private copiedFlash: GameObjects.Text | null = null;

    constructor(scene: Scene, state: MapRunState, palette: ActPalette) {
        this.scene = scene;

        const max = DEFAULT_TUNING['hearts.max'];
        // null hearts = fresh run: the segment will start at hearts.start.
        const count = state.hearts === null ? DEFAULT_TUNING['hearts.start'] : state.hearts;
        for (let i = 0; i < max; i += 1) {
            this.hearts.push(
                scene.add
                    .image(X + i * HEART_SPACING, Y, Atlas.tiles, HudFrame.heartFull)
                    .setOrigin(0, 0)
                    .setScale(HEART_SCALE)
                    .setDepth(30)
                    .setFrame(i < count ? HudFrame.heartFull : HudFrame.heartEmpty),
            );
        }

        this.coinIcon = scene.add
            .image(X, Y + 52, Atlas.tiles, HudFrame.coin)
            .setOrigin(0, 0.5)
            .setScale(0.42)
            .setDepth(30);
        this.coinText = scene.add
            .text(this.coinIcon.x + 34, Y + 52, `${state.coins}`, {
                fontFamily: 'Arial Black',
                fontSize: 20,
                color: palette.text,
            })
            .setOrigin(0, 0.5)
            .setDepth(30);
        this.scoreText = scene.add
            .text(GAME_WIDTH - 24, Y, groupDigits(state.totalScore), {
                fontFamily: 'Arial Black',
                fontSize: 22,
                color: palette.text,
            })
            .setOrigin(1, 0)
            .setDepth(30);
        this.actText = scene.add
            .text(GAME_WIDTH / 2, 20, `ACT ${state.act} — ${palette.name}`, {
                fontFamily: 'Arial Black',
                fontSize: 18,
                color: palette.text,
            })
            .setOrigin(0.5, 0)
            .setDepth(30)
            .setAlpha(0.9);

        this.seedText = scene.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT - 14, `seed ${state.seed} — tap to copy`, {
                fontFamily: 'Arial',
                fontSize: 13,
                color: palette.textDim,
            })
            .setOrigin(0.5, 1)
            .setDepth(30)
            .setInteractive({ useHandCursor: true });
        this.seedText.on('pointerdown', () => this.copySeed(state.seed, palette));
    }

    /** Re-read the run state (shop purchases, mystery outcomes). */
    refresh(state: MapRunState): void {
        const count = state.hearts === null ? DEFAULT_TUNING['hearts.start'] : state.hearts;
        for (let i = 0; i < this.hearts.length; i += 1) {
            this.hearts[i].setFrame(i < count ? HudFrame.heartFull : HudFrame.heartEmpty);
        }
        this.coinText.setText(`${state.coins}`);
        this.scoreText.setText(groupDigits(state.totalScore));
    }

    private copySeed(seed: string, palette: ActPalette): void {
        navigator.clipboard?.writeText(seed);
        this.copiedFlash?.destroy();
        this.copiedFlash = this.scene.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT - 36, 'copied', {
                fontFamily: 'Arial',
                fontSize: 13,
                color: palette.text,
            })
            .setOrigin(0.5, 1)
            .setDepth(30);
        this.scene.tweens.add({
            targets: this.copiedFlash,
            alpha: 0,
            delay: 700,
            duration: 400,
            onComplete: () => {
                this.copiedFlash?.destroy();
                this.copiedFlash = null;
            },
        });
    }

    destroy(): void {
        for (const heart of this.hearts) {
            heart.destroy();
        }
        this.coinIcon.destroy();
        this.coinText.destroy();
        this.scoreText.destroy();
        this.actText.destroy();
        this.seedText.destroy();
        this.copiedFlash?.destroy();
    }
}
