/**
 * Act-1 visual identity: Meadow Ascent, bright morning, hopeful. Three
 * parallax layers per the art-direction depth model — sky (0.05), far
 * horizon band (0.2), near cloud haze (0.5) — all cheap tileSprites. Never
 * a flat backdrop again: parallax is the single cheapest "this is a real
 * place" signal we can buy. Backgrounds never contain shapes that read as
 * platforms.
 */
import type { GameObjects, Scene } from 'phaser';
import { Img } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';

const SKY_FACTOR = 0.05;
const FAR_FACTOR = 0.2;
const NEAR_FACTOR = 0.5;
/** Barely-there warm lift — the act-1 grading, applied uniformly. */
const ACT1_TINT = 0xfff2e2;
const STRIP_H = 256;

export class ParallaxBackdrop {
    private sky: GameObjects.TileSprite;
    private nearClouds: GameObjects.TileSprite;
    private farStrips: GameObjects.TileSprite[];
    /** Screen-space anchors for the far band, captured on first update. */
    private baseScrollY: number | null = null;
    private farBaseY: number[] = [];

    constructor(scene: Scene) {
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;

        this.sky = scene.add
            .tileSprite(cx, cy, GAME_WIDTH, GAME_HEIGHT, Img.backgroundSky)
            .setScrollFactor(0)
            .setTint(ACT1_TINT)
            .setDepth(-30);

        // The far band: Kenney's intended vertical stack — cloud transition,
        // pale silhouettes, green hills, solid fill — anchored at the ground
        // horizon, sinking away at 0.2x as the climb leaves the meadow.
        const bandTextures = [
            Img.backgroundClouds,
            Img.backgroundHillsFade,
            Img.backgroundHills,
            Img.backgroundGrass,
        ];
        this.farStrips = bandTextures.map((tex, i) =>
            scene.add
                .tileSprite(cx, 0, GAME_WIDTH, STRIP_H, tex)
                .setScrollFactor(0)
                .setTint(ACT1_TINT)
                .setDepth(-20 + i * 0.1),
        );

        // Near haze: the opaque cloud tile at low alpha over the same-blue
        // sky reads as translucent drifting clouds.
        this.nearClouds = scene.add
            .tileSprite(cx, cy, GAME_WIDTH, GAME_HEIGHT, Img.backgroundClouds)
            .setScrollFactor(0)
            .setTint(ACT1_TINT)
            .setAlpha(0.4)
            .setTileScale(1.6, 1.6)
            .setDepth(-15);
    }

    update(scrollY: number, deltaMs: number): void {
        if (this.baseScrollY === null) {
            this.baseScrollY = scrollY;
            // Horizon: where the ground surface sits on screen at spawn.
            // Stack: clouds transition, silhouettes, hills straddling the
            // horizon, solid fill running off the bottom.
            const horizonScreenY = GAME_HEIGHT * 0.64;
            this.farBaseY = this.farStrips.map((_, i) => horizonScreenY - 448 + i * STRIP_H);
        }

        this.sky.tilePositionY = scrollY * SKY_FACTOR;

        const drop = (this.baseScrollY - scrollY) * FAR_FACTOR;
        this.farStrips.forEach((strip, i) => {
            strip.y = this.farBaseY[i] + drop;
        });

        this.nearClouds.tilePositionY = (scrollY * NEAR_FACTOR) / 1.6;
        this.nearClouds.tilePositionX += deltaMs * 0.004;
    }

    destroy(): void {
        this.sky.destroy();
        this.nearClouds.destroy();
        for (const strip of this.farStrips) {
            strip.destroy();
        }
    }
}
