/**
 * Screen-level juice: speed wind, the afterimage trail (the master's crown),
 * and screen shake. All sprite-only, all event-driven, all scaled by
 * kinematic magnitude, silent below threshold, all deletable — physics and
 * camera never know this file exists.
 *
 * MASTERY additions: ONE shake class game-wide behind a scheduler (priority
 * tier > bank > movement-land; same-tick losers are DROPPED, never queued;
 * contenders arbitrate to the max, never sum; always <= 200ms), and the
 * escalation ladder's earned light — the character glow ignites at SPARK
 * and steps up per tier, the trail reads as a comet tail at COMET, and
 * SUPERNOVA spends the one full-frame warm pulse (the milestone allowance).
 */
import type { Cameras, GameObjects, Scene } from 'phaser';
import type { ComboBankedEvent, ComboBus, ComboTierEvent } from '../../core/combo/types';
import type { EventBus, LandEvent } from '../../core/events';
import type { TuningStack } from '../../core/tuning';
import { Gen } from '../assets';
import type { PlayerAnimator } from '../player/PlayerAnimator';
import type { PlayerSystem } from '../player/PlayerSystem';

/** Shake priority: tier > bank > movement-land (combo-scoring.md graft #6). */
const SHAKE_PRIORITY = { land: 0, bank: 1, tier: 2 } as const;
type ShakePriority = (typeof SHAKE_PRIORITY)[keyof typeof SHAKE_PRIORITY];
const SHAKE_MAX_MS = 200;
/** 2px amplitude on the 768px viewport was FEEL's 0.0026 intensity. */
const SHAKE_INTENSITY_PER_PX = 0.0013;

/** Glow alpha per tier index (SPARK -> BEYOND); the ladder of earned light. */
const GLOW_ALPHA = [0.1, 0.16, 0.22, 0.28, 0.35, 0.44, 0.55, 0.55];
const COMET_TIER = 5;
const SUPERNOVA_TIER = 6;

export class JuiceSystem {
    private readonly scene: Scene;
    private readonly camera: Cameras.Scene2D.Camera;
    private readonly player: PlayerSystem;
    private readonly animator: PlayerAnimator;
    private readonly bus: EventBus;
    private readonly comboBus: ComboBus;
    private readonly t: TuningStack;

    private wind: GameObjects.Particles.ParticleEmitter;
    private glow: GameObjects.Image;
    private windAt = 0;
    private afterimageAt = 0;
    private comboTier = -1;
    private activeShake: { until: number; priority: ShakePriority; ampPx: number } | null = null;

    private readonly onLand = (e: LandEvent): void => {
        if (e.impactVy >= this.t.value('SHAKE_MIN_IMPACT')) {
            // 2px, 90ms — the whole shake budget of FEEL, now one contender.
            this.requestShake(SHAKE_PRIORITY.land, 2, 90);
        }
    };

    private readonly onComboTier = (e: ComboTierEvent): void => {
        this.comboTier = Math.min(e.tierIndex, GLOW_ALPHA.length - 1);
        this.scene.tweens.add({
            targets: this.glow,
            alpha: GLOW_ALPHA[this.comboTier] * this.t.value('JUICE_SCALE'),
            duration: 250,
        });
        if (e.isRepeat) {
            return; // BEYOND xN: stinger and card only, effects plateau
        }
        if (e.tierIndex >= this.t.value('juice.comboShakeMinTier')) {
            this.requestShake(
                SHAKE_PRIORITY.tier,
                this.t.value('juice.comboShakeAmpPx'),
                this.t.value('juice.comboShakeMs'),
            );
        }
        if (e.tierIndex === SUPERNOVA_TIER && this.t.value('JUICE_SCALE') > 0) {
            // The one full-frame warm pulse — the milestone allowance, spent.
            this.camera.flash(280, 255, 224, 168, false);
        }
    };

    private readonly onComboBanked = (e: ComboBankedEvent): void => {
        // Only a roar-class bank earns shake — a fizzle bank stays quiet.
        if (e.payout >= this.t.value('hud.bankVoice')) {
            this.requestShake(SHAKE_PRIORITY.bank, 2, 100);
        }
        this.douseGlow();
    };

    private readonly onComboEnded = (): void => this.douseGlow();

    constructor(
        scene: Scene,
        player: PlayerSystem,
        animator: PlayerAnimator,
        bus: EventBus,
        tuning: TuningStack,
        comboBus: ComboBus,
    ) {
        this.scene = scene;
        this.camera = scene.cameras.main;
        this.player = player;
        this.animator = animator;
        this.bus = bus;
        this.comboBus = comboBus;
        this.t = tuning;

        this.wind = scene.add.particles(0, 0, Gen.streak, {
            lifespan: 320,
            alpha: { start: 0.35, end: 0 },
            scale: { start: 1, end: 0.4 },
            tint: 0xffffff,
            emitting: false,
        });
        this.wind.setDepth(8);

        this.glow = scene.add
            .image(0, 0, Gen.glow)
            .setDepth(6)
            .setScale(3.2)
            .setTint(0xffe2a0)
            .setBlendMode('ADD')
            .setAlpha(0);

        bus.on('movement/land', this.onLand);
        comboBus.on('combo/tier', this.onComboTier);
        comboBus.on('combo/banked', this.onComboBanked);
        comboBus.on('combo/voided', this.onComboEnded);
        comboBus.on('combo/reset', this.onComboEnded);
    }

    /**
     * THE shake scheduler — every screen shake in the game goes through
     * here. Winners by priority, then by amplitude; the survivor takes the
     * max amplitude of the contenders (never the sum); an outranked request
     * while another shake is live is dropped, never queued.
     */
    private requestShake(priority: ShakePriority, ampPx: number, ms: number): void {
        const juice = this.t.value('JUICE_SCALE');
        if (juice <= 0) {
            return;
        }
        const now = this.scene.time.now;
        const active = this.activeShake;
        let amp = ampPx;
        if (active && now < active.until) {
            if (
                priority < active.priority ||
                (priority === active.priority && ampPx <= active.ampPx)
            ) {
                return; // dropped, never queued
            }
            amp = Math.max(amp, active.ampPx); // arbitrate to the max, never sum
        }
        const duration = Math.min(ms, SHAKE_MAX_MS);
        this.activeShake = { until: now + duration, priority, ampPx: amp };
        this.camera.shake(duration, amp * SHAKE_INTENSITY_PER_PX * juice, true);
    }

    private douseGlow(): void {
        this.comboTier = -1;
        this.scene.tweens.add({ targets: this.glow, alpha: 0, duration: 350 });
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

        this.glow.setPosition(k.x, k.y);

        // Speed wind: horizontal streaks trailing the sprint.
        if (speed >= this.t.value('WIND_FRAC') * ceiling && now >= this.windAt) {
            const dir = Math.sign(k.vx) || 1;
            const px = k.x - dir * 30;
            const py = k.y - 20 + Math.random() * 40;
            this.wind.setParticleSpeed(-dir * (120 + Math.random() * 80), 0);
            this.wind.emitParticleAt(px, py, 1);
            this.windAt = now + 45;
        }

        // Afterimage trail: the visible signature of a run gone god-mode —
        // and, from COMET up, the comet tail the ladder promises.
        const trailBySpeed = speed >= this.t.value('AFTERIMAGE_FRAC') * ceiling;
        const trailByTier = this.comboTier >= COMET_TIER;
        if ((trailBySpeed || trailByTier) && now >= this.afterimageAt) {
            const src = this.animator.visual;
            const ghost = this.scene.add
                .image(src.x, src.y, src.texture.key, src.frame.name)
                .setOrigin(src.originX, src.originY)
                .setScale(src.scaleX, src.scaleY)
                .setFlipX(src.flipX)
                .setRotation(src.rotation)
                .setAlpha(0.35 * juice)
                .setTint(trailByTier ? 0xffd28a : 0xbfe8ff)
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
        this.comboBus.off('combo/tier', this.onComboTier);
        this.comboBus.off('combo/banked', this.onComboBanked);
        this.comboBus.off('combo/voided', this.onComboEnded);
        this.comboBus.off('combo/reset', this.onComboEnded);
        this.wind.destroy();
        this.glow.destroy();
    }
}
