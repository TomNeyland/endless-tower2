/**
 * Visual tower: grass platform tiles over the invisible physics bodies, the
 * ground rows, and the two wall columns. Pure presentation — the physics
 * planes and platform bodies live in core/PlayerSystem and never read this.
 *
 * EXAM adds the platform-grain hazard language (pillar 2 at platform grain,
 * playthrough-trace.md finding 12): crumble-classified ledges read cracked
 * from the first frame, sticky ledges wear their goo visibly, a collapsing
 * ledge GLOWS for its whole telegraph, and removal is a burst of debris —
 * the same vocabulary whether a modifier rolled it or a boss commanded it.
 */
import { BlendModes, type GameObjects, type Scene, type Tweens } from 'phaser';
import type { LandClassification } from '../../core/events';
import { GROUND_PLATFORM_ID, TILE, type TowerLayout } from '../../core/tower';
import { Atlas, Gen, TileFrame } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';

const CRUMBLE_TINT = 0xd8b088; // dry, brittle — visibly not ordinary ground
const GOO_TINT = 0x86d94e;
const GLOW_TINT = 0xffb03a;
const BREATHER_TINT = 0xffe0ae;

interface PlatformVisual {
    tiles: GameObjects.Image[];
    goo: GameObjects.Image[];
    glow: GameObjects.Image | null;
    glowTween: Tweens.Tween | null;
    xCenter: number;
    topY: number;
    width: number;
    baseTint: number | null;
}

export class TowerView {
    private readonly scene: Scene;
    private readonly walls: GameObjects.TileSprite[];
    private readonly groundTiles: GameObjects.Image[] = [];
    private readonly platforms = new Map<number, PlatformVisual>();
    private debris: GameObjects.Particles.ParticleEmitter;

    constructor(scene: Scene, layout: TowerLayout) {
        this.scene = scene;
        // Ground: a walkable top row plus fill rows for the spawn view.
        for (let x = layout.wallLeftX + TILE / 2; x < layout.wallRightX; x += TILE) {
            this.groundTiles.push(
                scene.add.image(x, layout.groundTopY + TILE / 2, Atlas.tiles, TileFrame.groundTop),
            );
            this.groundTiles.push(
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
            const tiles: GameObjects.Image[] = [];
            for (let i = 0; i < tilesWide; i += 1) {
                const frame =
                    i === 0
                        ? TileFrame.platformLeft
                        : i === tilesWide - 1
                          ? TileFrame.platformRight
                          : TileFrame.platformMiddle;
                tiles.push(scene.add.image(leftX + i * TILE, y, Atlas.tiles, frame));
            }
            const visual: PlatformVisual = {
                tiles,
                goo: [],
                glow: null,
                glowTween: null,
                xCenter: p.xCenter,
                topY: p.topY,
                width: p.width,
                baseTint: p.breather ? BREATHER_TINT : null,
            };
            this.platforms.set(p.id, visual);
            if (visual.baseTint !== null) {
                for (const tile of visual.tiles) {
                    tile.setTint(visual.baseTint);
                }
            }
            if (p.landClass === 'crumble') {
                this.applyClass(p.id, 'crumble');
            } else if (p.landClass === 'sticky') {
                this.applyClass(p.id, 'sticky');
            }
        }

        this.debris = scene.add.particles(0, 0, Gen.dust, {
            speedY: { min: 60, max: 260 },
            speedX: { min: -140, max: 140 },
            lifespan: { min: 380, max: 750 },
            scale: { start: 0.9, end: 0.1 },
            alpha: { start: 1, end: 0 },
            tint: [0x9a7a52, 0xd8b088, 0x6f5a3e],
            emitting: false,
        });
        this.debris.setDepth(3);

        // Walls: camera-fixed columns scrolled by hand so they read infinite.
        this.walls = [TILE / 2, GAME_WIDTH - TILE / 2].map((x) =>
            scene.add
                .tileSprite(
                    x,
                    GAME_HEIGHT / 2,
                    TILE,
                    GAME_HEIGHT,
                    Atlas.tiles,
                    TileFrame.wallColumn,
                )
                .setScrollFactor(0)
                .setDepth(2),
        );
    }

    /** The hazard reads at platform grain: cracked tint / visible goo. */
    applyClass(platformId: number, classification: LandClassification | null): void {
        const v = this.platforms.get(platformId);
        if (!v) {
            return; // the ground row never classifies
        }
        if (classification === 'crumble') {
            for (const tile of v.tiles) {
                tile.setTint(CRUMBLE_TINT);
            }
            return;
        }
        if (classification === 'sticky') {
            if (v.goo.length > 0) {
                return;
            }
            // Goo SPLATS visibly: a few bright blobs sitting on the lip.
            const blobs = Math.max(2, Math.round(v.width / TILE));
            for (let i = 0; i < blobs; i += 1) {
                const bx = v.xCenter - v.width / 2 + (v.width * (i + 0.5)) / blobs;
                v.goo.push(
                    this.scene.add
                        .image(bx, v.topY - 3 + (i % 2) * 4, Gen.dust)
                        .setScale(1.5 + (i % 3) * 0.5, 1.1)
                        .setTint(GOO_TINT)
                        .setAlpha(0.9)
                        .setDepth(1.2),
                );
            }
            return;
        }
        for (const tile of v.tiles) {
            if (v.baseTint === null) {
                tile.clearTint();
            } else {
                tile.setTint(v.baseTint);
            }
        }
        for (const blob of v.goo) {
            blob.destroy();
        }
        v.goo = [];
    }

    /** The telegraph: the ledge GLOWS before it crumbles (the mandate). */
    setCollapsing(platformId: number): void {
        const v = this.platforms.get(platformId);
        if (!v || v.glow) {
            return;
        }
        v.glow = this.scene.add
            .image(v.xCenter, v.topY + TILE / 2, Gen.glow)
            .setDisplaySize(v.width + 40, TILE + 40)
            .setTint(GLOW_TINT)
            .setBlendMode(BlendModes.ADD)
            .setAlpha(0.35)
            .setDepth(1.3);
        v.glowTween = this.scene.tweens.add({
            targets: v.glow,
            alpha: 0.85,
            duration: 160,
            yoyo: true,
            repeat: -1,
        });
        for (const tile of v.tiles) {
            tile.setTint(GLOW_TINT);
        }
    }

    /** Removal: the ledge stops existing, loudly — debris falls out of it. */
    removePlatform(platformId: number): void {
        const v = this.platforms.get(platformId);
        if (!v) {
            return;
        }
        const count = Math.round(6 + v.width / 40);
        for (let i = 0; i < count; i += 1) {
            this.debris.emitParticleAt(
                v.xCenter - v.width / 2 + Math.random() * v.width,
                v.topY + Math.random() * TILE * 0.6,
                1,
            );
        }
        v.glowTween?.stop();
        v.glow?.destroy();
        for (const tile of v.tiles) {
            tile.destroy();
        }
        for (const blob of v.goo) {
            blob.destroy();
        }
        this.platforms.delete(platformId);
    }

    /** World-space anchor for attack views (goo flights, slam markers). */
    platformAnchor(platformId: number): { x: number; y: number; width: number } | null {
        const v = this.platforms.get(platformId);
        return v ? { x: v.xCenter, y: v.topY, width: v.width } : null;
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
        for (const tile of this.groundTiles) {
            tile.destroy();
        }
        for (const v of this.platforms.values()) {
            v.glowTween?.stop();
            v.glow?.destroy();
            for (const tile of v.tiles) {
                tile.destroy();
            }
            for (const blob of v.goo) {
                blob.destroy();
            }
        }
        this.platforms.clear();
        this.debris.destroy();
    }
}
