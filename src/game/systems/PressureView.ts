/**
 * PRESSURE's act-1 presentation: the grass-fire death line (per
 * art-direction.md — the line carries its own light and is unmissable at any
 * grading), the lit exit door, the ignition announcement, and the
 * invulnerability blink. Pure bus consumer + per-frame reader of
 * PressureSystem's read surface — deleting this file changes nothing about
 * the rules.
 */
import { BlendModes, type GameObjects, type Scene, type Tweens } from 'phaser';
import type { EventBus, HeartLostEvent, LineStateEvent } from '../../core/events';
import type { TuningStack } from '../../core/tuning';
import { Atlas, Gen, TileFrame } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import type { PlayerAnimator } from '../player/PlayerAnimator';
import type { PressureSystem } from './PressureSystem';

const TILE = 64;
const FIRE_TINT = 0xff8c2a;
const EMBER_TINTS = [0xffd166, 0xffa14a, 0xff6b35];

export class PressureView {
    private readonly scene: Scene;
    private readonly pressure: PressureSystem;
    private readonly animator: PlayerAnimator;
    private readonly bus: EventBus;
    private readonly t: TuningStack;

    private door: GameObjects.Image[] = [];
    private doorGlow: GameObjects.Image | null = null;
    private fireEdge: GameObjects.TileSprite | null = null;
    private fireFill: GameObjects.TileSprite | null = null;
    private fireGlow: GameObjects.Image | null = null;
    private embers: GameObjects.Particles.ParticleEmitter | null = null;
    private emberAt = 0;
    private blinkTween: Tweens.Tween | null = null;

    private readonly onLineState = (e: LineStateEvent): void => {
        if (e.state !== 'active' || e.lineY === null) {
            return;
        }
        this.buildFire();
        // The announcement: one ember burst along the whole ignition front.
        if (this.embers) {
            for (let i = 0; i < 24; i += 1) {
                this.embers.emitParticleAt(
                    TILE + Math.random() * (GAME_WIDTH - TILE * 2),
                    e.lineY - 6,
                    1,
                );
            }
        }
    };

    private readonly onHeartLost = (e: HeartLostEvent): void => {
        if (this.embers) {
            this.embers.explode(14, e.x, e.y);
        }
        if (e.heartsRemaining <= 0) {
            return;
        }
        // The classic blink for the whole invulnerability window — the
        // shield made visible, restored to full alpha on completion.
        const sprite = this.animator.visual;
        const invulnMs = this.t.value('hearts.invulnMs');
        this.blinkTween?.stop();
        sprite.alpha = 1;
        this.blinkTween = this.scene.tweens.add({
            targets: sprite,
            alpha: 0.25,
            duration: 80,
            yoyo: true,
            repeat: Math.max(0, Math.floor(invulnMs / 160) - 1),
            onComplete: () => {
                sprite.alpha = 1;
            },
        });
    };

    constructor(
        scene: Scene,
        pressure: PressureSystem,
        animator: PlayerAnimator,
        bus: EventBus,
        tuning: TuningStack,
    ) {
        this.scene = scene;
        this.pressure = pressure;
        this.animator = animator;
        this.bus = bus;
        this.t = tuning;

        const door = pressure.door();
        if (door) {
            // Lit and unmissable: a warm halo behind the open doorway.
            this.doorGlow = scene.add
                .image(door.xCenter, door.topY - TILE, Gen.dust)
                .setScale(30, 22)
                .setTint(0xffe9a0)
                .setAlpha(0.4)
                .setBlendMode(BlendModes.ADD)
                .setDepth(1.4);
            scene.tweens.add({
                targets: this.doorGlow,
                alpha: 0.62,
                duration: 900,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
            this.door = [
                scene.add
                    .image(door.xCenter, door.topY - TILE / 2, Atlas.tiles, TileFrame.doorBottom)
                    .setDepth(1.5),
                scene.add
                    .image(door.xCenter, door.topY - TILE * 1.5, Atlas.tiles, TileFrame.doorTop)
                    .setDepth(1.5),
            ];
        }

        bus.on('line/state', this.onLineState);
        bus.on('run/heart_lost', this.onHeartLost);
    }

    /** Created at ignition — before that the line does not exist, visibly. */
    private buildFire(): void {
        if (this.fireEdge) {
            return;
        }
        this.fireFill = this.scene.add
            .tileSprite(
                GAME_WIDTH / 2,
                0,
                GAME_WIDTH,
                GAME_HEIGHT + TILE * 2,
                Atlas.tiles,
                TileFrame.fireFill,
            )
            .setTint(FIRE_TINT)
            .setDepth(4);
        this.fireEdge = this.scene.add
            .tileSprite(GAME_WIDTH / 2, 0, GAME_WIDTH, TILE, Atlas.tiles, TileFrame.fireEdge)
            .setTint(FIRE_TINT)
            .setDepth(5);
        this.fireGlow = this.scene.add
            .image(GAME_WIDTH / 2, 0, Gen.glow)
            .setDisplaySize(GAME_WIDTH, 110)
            .setOrigin(0.5, 1)
            .setTint(0xff9a3d)
            .setBlendMode(BlendModes.ADD)
            .setDepth(5.5);
        this.embers = this.scene.add.particles(0, 0, Gen.dust, {
            speedY: { min: -170, max: -70 },
            speedX: { min: -30, max: 30 },
            lifespan: { min: 500, max: 1100 },
            scale: { start: 0.7, end: 0 },
            alpha: { start: 0.9, end: 0 },
            tint: EMBER_TINTS,
            blendMode: 'ADD',
            emitting: false,
        });
        this.embers.setDepth(6);
    }

    update(scrollY: number): void {
        const lineY = this.pressure.lineY();
        if (lineY === null || !this.fireEdge || !this.fireFill || !this.fireGlow) {
            return;
        }
        const now = this.scene.time.now;
        // The flame edge crests at the catch line; the fill burns below it.
        this.fireEdge.setPosition(GAME_WIDTH / 2, lineY + TILE / 2);
        this.fireEdge.tilePositionX = now * 0.03;
        this.fireFill.setPosition(GAME_WIDTH / 2, lineY + TILE + (GAME_HEIGHT + TILE * 2) / 2);
        this.fireGlow.setPosition(GAME_WIDTH / 2, lineY + 6);
        this.fireGlow.setAlpha(0.5 + 0.14 * Math.sin(now * 0.008));

        // Embers drift up from the front while it is anywhere near view.
        const onScreen = lineY > scrollY - 120 && lineY < scrollY + GAME_HEIGHT + 240;
        if (onScreen && this.embers && now >= this.emberAt) {
            this.embers.emitParticleAt(
                TILE + Math.random() * (GAME_WIDTH - TILE * 2),
                lineY - 4,
                1,
            );
            this.emberAt = now + 70;
        }
    }

    destroy(): void {
        this.bus.off('line/state', this.onLineState);
        this.bus.off('run/heart_lost', this.onHeartLost);
        this.blinkTween?.stop();
        for (const img of this.door) {
            img.destroy();
        }
        this.doorGlow?.destroy();
        this.fireEdge?.destroy();
        this.fireFill?.destroy();
        this.fireGlow?.destroy();
        this.embers?.destroy();
    }
}
