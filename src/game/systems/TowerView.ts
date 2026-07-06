/**
 * Visual tower: grass platform tiles over the invisible physics bodies, the
 * ground rows, and the two wall columns. Pure presentation — the physics
 * planes and platform bodies live in core/PlayerSystem and never read this.
 */
import type { GameObjects, Scene } from 'phaser';
import { GROUND_PLATFORM_ID, TILE, type TowerLayout } from '../../core/tower';
import { Atlas, TileFrame } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';

export class TowerView {
    private readonly walls: GameObjects.TileSprite[];
    private readonly tiles: GameObjects.Image[] = [];

    constructor(scene: Scene, layout: TowerLayout) {
        // Ground: a walkable top row plus fill rows for the spawn view.
        for (let x = layout.wallLeftX + TILE / 2; x < layout.wallRightX; x += TILE) {
            this.tiles.push(
                scene.add.image(x, layout.groundTopY + TILE / 2, Atlas.tiles, TileFrame.groundTop),
            );
            this.tiles.push(
                scene.add.image(
                    x,
                    layout.groundTopY + TILE * 1.5,
                    Atlas.tiles,
                    TileFrame.groundFill,
                ),
            );
        }

        // Platforms: left cap, middles, right cap.
        for (const p of layout.platforms) {
            if (p.id === GROUND_PLATFORM_ID) {
                continue;
            }
            const tilesWide = Math.round(p.width / TILE);
            const leftX = p.xCenter - p.width / 2 + TILE / 2;
            const y = p.topY + TILE / 2;
            for (let i = 0; i < tilesWide; i += 1) {
                const frame =
                    i === 0
                        ? TileFrame.platformLeft
                        : i === tilesWide - 1
                          ? TileFrame.platformRight
                          : TileFrame.platformMiddle;
                this.tiles.push(scene.add.image(leftX + i * TILE, y, Atlas.tiles, frame));
            }
        }

        // Walls: camera-fixed columns scrolled by hand so they read infinite.
        this.walls = [TILE / 2, GAME_WIDTH - TILE / 2].map((x) =>
            scene.add
                .tileSprite(x, GAME_HEIGHT / 2, TILE, GAME_HEIGHT, Atlas.tiles, TileFrame.wallColumn)
                .setScrollFactor(0)
                .setDepth(2),
        );
    }

    update(scrollY: number): void {
        for (const wall of this.walls) {
            wall.tilePositionY = scrollY;
        }
    }

    destroy(): void {
        for (const wall of this.walls) {
            wall.destroy();
        }
        for (const tile of this.tiles) {
            tile.destroy();
        }
    }
}
