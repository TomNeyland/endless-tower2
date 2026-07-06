/**
 * Momentum made visible: wind streaks and afterimages.
 * Presentation-only, kinematic-only, and deletable — the physics loop never
 * reads this file. The thresholds are tuning rows so FeelTuner can audition
 * heat without changing code.
 */
import type { GameObjects, Scene } from 'phaser';
import type { TuningStack } from '../../core/tuning';
import { Gen } from '../assets';
import type { PlayerAnimator } from '../player/PlayerAnimator';
import type { PlayerSystem } from '../player/PlayerSystem';

const COMET_TIER = 5;

export class MomentumTrail {
    private readonly scene: Scene;
    private readonly player: PlayerSystem;
    private readonly animator: PlayerAnimator;
    private readonly t: TuningStack;

    private wind: GameObjects.Particles.ParticleEmitter;
    private windAt = 0;
    private afterimageAt = 0;
    private comboTier = -1;

    constructor(scene: Scene, player: PlayerSystem, animator: PlayerAnimator, tuning: TuningStack) {
        this.scene = scene;
        this.player = player;
        this.animator = animator;
        this.t = tuning;

        this.wind = scene.add.particles(0, 0, Gen.streak, {
            lifespan: 320,
            alpha: { start: 0.35, end: 0 },
            scale: { start: 1, end: 0.4 },
            tint: 0xffffff,
            emitting: false,
        });
        this.wind.setDepth(8);
    }

    setComboTier(tierIndex: number): void {
        this.comboTier = tierIndex;
    }

    clearComboTier(): void {
        this.comboTier = -1;
    }

    update(): void {
        const juice = this.t.value('JUICE_SCALE');
        if (juice <= 0) {
            return;
        }
        const k = this.player.kinematics();
        const speed = Math.abs(k.vx);
        const ceiling = this.t.value('MAX_RUN_SPEED');
        const now = this.scene.time.now;

        this.updateWind(k.vx, k.x, k.y, speed, ceiling, now);
        this.updateAfterimages(speed, ceiling, now, juice);
    }

    private updateWind(
        vx: number,
        x: number,
        y: number,
        speed: number,
        ceiling: number,
        now: number,
    ): void {
        if (speed < this.t.value('WIND_FRAC') * ceiling || now < this.windAt) {
            return;
        }
        const dir = Math.sign(vx);
        const px = x - dir * 30;
        const py = y - 20 + Math.random() * 40;
        this.wind.setParticleSpeed(-dir * (120 + Math.random() * 80), 0);
        this.wind.emitParticleAt(px, py, 1);
        this.windAt = now + this.t.value('juice.windMs');
    }

    private updateAfterimages(speed: number, ceiling: number, now: number, juice: number): void {
        const trailBySpeed = speed >= this.t.value('AFTERIMAGE_FRAC') * ceiling;
        const trailByTier = this.comboTier >= COMET_TIER;
        if ((!trailBySpeed && !trailByTier) || now < this.afterimageAt) {
            return;
        }
        const src = this.animator.visual;
        const ghost = this.scene.add
            .image(src.x, src.y, src.texture.key, src.frame.name)
            .setOrigin(src.originX, src.originY)
            .setScale(src.scaleX, src.scaleY)
            .setFlipX(src.flipX)
            .setRotation(src.rotation)
            .setAlpha(0.35 * juice)
            .setTint(trailByTier ? 0xffd28a : 0xffa347)
            .setDepth(7);
        this.scene.tweens.add({
            targets: ghost,
            alpha: 0,
            duration: 200,
            onComplete: () => ghost.destroy(),
        });
        this.afterimageAt = now + this.t.value('juice.afterimageMs');
    }

    destroy(): void {
        this.wind.destroy();
    }
}
