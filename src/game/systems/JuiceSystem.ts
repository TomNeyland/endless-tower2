/**
 * Screen-level juice: speed wind, the afterimage trail (the master's crown),
 * and the ONE screen-shake trigger. All sprite-only, all event-driven, all
 * scaled by kinematic magnitude, silent below threshold, all deletable —
 * physics and camera never know this file exists.
 */
import type { Cameras, GameObjects, Scene } from 'phaser';
import type { EventBus, LandEvent } from '../../core/events';
import type { TuningStack } from '../../core/tuning';
import { Gen } from '../assets';
import type { PlayerAnimator } from '../player/PlayerAnimator';
import type { PlayerSystem } from '../player/PlayerSystem';

export class JuiceSystem {
    private readonly scene: Scene;
    private readonly camera: Cameras.Scene2D.Camera;
    private readonly player: PlayerSystem;
    private readonly animator: PlayerAnimator;
    private readonly bus: EventBus;
    private readonly t: TuningStack;

    private wind: GameObjects.Particles.ParticleEmitter;
    private windAt = 0;
    private afterimageAt = 0;

    private readonly onLand = (e: LandEvent): void => {
        const juice = this.t.value('JUICE_SCALE');
        if (juice > 0 && e.impactVy >= this.t.value('SHAKE_MIN_IMPACT')) {
            // 2px on a 768px viewport, 90ms — the whole shake budget of FEEL.
            this.camera.shake(90, 0.0026 * juice);
        }
    };

    constructor(
        scene: Scene,
        player: PlayerSystem,
        animator: PlayerAnimator,
        bus: EventBus,
        tuning: TuningStack,
    ) {
        this.scene = scene;
        this.camera = scene.cameras.main;
        this.player = player;
        this.animator = animator;
        this.bus = bus;
        this.t = tuning;

        this.wind = scene.add.particles(0, 0, Gen.streak, {
            lifespan: 320,
            alpha: { start: 0.35, end: 0 },
            scale: { start: 1, end: 0.4 },
            tint: 0xffffff,
            emitting: false,
        });
        this.wind.setDepth(8);

        bus.on('movement/land', this.onLand);
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

        // Speed wind: horizontal streaks trailing the sprint.
        if (speed >= this.t.value('WIND_FRAC') * ceiling && now >= this.windAt) {
            const dir = Math.sign(k.vx) || 1;
            const px = k.x - dir * 30;
            const py = k.y - 20 + Math.random() * 40;
            this.wind.setParticleSpeed(-dir * (120 + Math.random() * 80), 0);
            this.wind.emitParticleAt(px, py, 1);
            this.windAt = now + 45;
        }

        // Afterimage trail: the visible signature of a run gone god-mode.
        if (speed >= this.t.value('AFTERIMAGE_FRAC') * ceiling && now >= this.afterimageAt) {
            const src = this.animator.visual;
            const ghost = this.scene.add
                .image(src.x, src.y, src.texture.key, src.frame.name)
                .setOrigin(src.originX, src.originY)
                .setScale(src.scaleX, src.scaleY)
                .setFlipX(src.flipX)
                .setRotation(src.rotation)
                .setAlpha(0.35 * juice)
                .setTint(0xbfe8ff)
                .setDepth(7);
            this.scene.tweens.add({
                targets: ghost,
                alpha: 0,
                duration: 200,
                onComplete: () => ghost.destroy(),
            });
            this.afterimageAt = now + 50;
        }
    }

    destroy(): void {
        this.bus.off('movement/land', this.onLand);
        this.wind.destroy();
    }
}
