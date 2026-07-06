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
import type { ComboBus } from '../../core/combo/bus';
import type { ComboBankedEvent, ComboTierEvent } from '../../core/combo/types';
import type { EventBus, LandEvent } from '../../core/events';
import type { TuningStack } from '../../core/tuning';
import { Gen } from '../assets';
import type { PlayerAnimator } from '../player/PlayerAnimator';
import type { PlayerSystem } from '../player/PlayerSystem';
import { MomentumTrail } from './MomentumTrail';

/** Shake priority: tier > bank > movement-land (combo-scoring.md graft #6). */
const SHAKE_PRIORITY = { land: 0, bank: 1, tier: 2 } as const;
type ShakePriority = (typeof SHAKE_PRIORITY)[keyof typeof SHAKE_PRIORITY];
const SHAKE_MAX_MS = 200;
/** 2px amplitude on the 768px viewport was FEEL's 0.0026 intensity. */
const SHAKE_INTENSITY_PER_PX = 0.0013;

/** Glow alpha per tier index (SPARK -> BEYOND); the ladder of earned light. */
const GLOW_ALPHA = [0.1, 0.16, 0.22, 0.28, 0.35, 0.44, 0.55, 0.55];
const SUPERNOVA_TIER = 6;

export class JuiceSystem {
    private readonly scene: Scene;
    private readonly camera: Cameras.Scene2D.Camera;
    private readonly player: PlayerSystem;
    private readonly bus: EventBus;
    private readonly comboBus: ComboBus;
    private readonly t: TuningStack;

    private glow: GameObjects.Image;
    private warmOverlay: GameObjects.Rectangle;
    private trail: MomentumTrail;
    private comboTier = -1;
    /** Chain that already spent its BLAZING warm grading push. */
    private warmPushChainId = -1;
    private activeShake: { until: number; priority: ShakePriority; ampPx: number } | null = null;

    private readonly onLand = (e: LandEvent): void => {
        if (e.impactVy >= this.t.value('SHAKE_MIN_IMPACT')) {
            this.requestShake(
                SHAKE_PRIORITY.land,
                this.t.value('juice.landShakeAmpPx'),
                this.t.value('juice.landShakeMs'),
            );
        }
    };

    private readonly onComboTier = (e: ComboTierEvent): void => {
        this.comboTier = Math.min(e.tierIndex, GLOW_ALPHA.length - 1);
        this.trail.setComboTier(this.comboTier);
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
            if (e.chainId !== this.warmPushChainId) {
                // BLAZING's ladder promise: first shake + a brief warm
                // grading push — the world grades warmer, once per chain.
                this.warmPushChainId = e.chainId;
                this.warmGradingPush();
            }
        }
        if (e.tierIndex === SUPERNOVA_TIER && this.t.value('JUICE_SCALE') > 0) {
            // The one full-frame warm pulse — the milestone allowance, spent.
            this.camera.flash(280, 255, 224, 168, false);
        }
    };

    private readonly onComboBanked = (e: ComboBankedEvent): void => {
        // Only a roar-class bank earns shake — a fizzle bank stays quiet.
        if (e.payout >= this.t.value('hud.bankVoice')) {
            this.requestShake(
                SHAKE_PRIORITY.bank,
                this.t.value('juice.bankShakeAmpPx'),
                this.t.value('juice.bankShakeMs'),
            );
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
        this.bus = bus;
        this.comboBus = comboBus;
        this.t = tuning;

        this.trail = new MomentumTrail(scene, player, animator, tuning);

        this.glow = scene.add
            .image(0, 0, Gen.glow)
            .setDepth(6)
            .setScale(3.2)
            .setTint(0xffe2a0)
            .setBlendMode('ADD')
            .setAlpha(0);

        // The BLAZING grading push's canvas: a full-frame warm wash, additive
        // and screen-fixed, invisible until the ladder spends it. A cheap
        // stand-in for a real grading rack — but the sentence "the world
        // grades warmer" gets an implementation, not an IOU.
        this.warmOverlay = scene.add
            .rectangle(0, 0, scene.scale.width, scene.scale.height, 0xff9a3d)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setBlendMode('ADD')
            .setDepth(90)
            .setAlpha(0);

        bus.on('movement/land', this.onLand);
        comboBus.on('combo/tier', this.onComboTier);
        comboBus.on('combo/banked', this.onComboBanked);
        comboBus.on('combo/voided', this.onComboEnded);
        comboBus.on('combo/reset', this.onComboEnded);
    }

    /**
     * Boss slams and knockdowns spend shake through the SAME scheduler
     * (art-direction: shake is spent on combo escalations, boss slams, and
     * heart-loss). Bank-class priority: a tier crossing still outranks it.
     */
    bossImpact(ampPx: number, ms: number): void {
        this.requestShake(SHAKE_PRIORITY.bank, ampPx, ms);
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

    /** Brief warm grading push (combo-scoring.md's visual ladder, BLAZING). */
    private warmGradingPush(): void {
        const juice = this.t.value('JUICE_SCALE');
        if (juice <= 0) {
            return;
        }
        this.scene.tweens.add({
            targets: this.warmOverlay,
            alpha: { from: 0, to: 0.09 * juice },
            duration: 220,
            hold: 140,
            yoyo: true,
            ease: 'Sine.easeOut',
        });
    }

    private douseGlow(): void {
        this.comboTier = -1;
        this.trail.clearComboTier();
        this.scene.tweens.add({ targets: this.glow, alpha: 0, duration: 350 });
    }

    update(): void {
        const juice = this.t.value('JUICE_SCALE');
        if (juice <= 0) {
            return;
        }
        const k = this.player.kinematics();

        this.glow.setPosition(k.x, k.y);
        this.trail.update();
    }

    destroy(): void {
        this.bus.off('movement/land', this.onLand);
        this.comboBus.off('combo/tier', this.onComboTier);
        this.comboBus.off('combo/banked', this.onComboBanked);
        this.comboBus.off('combo/voided', this.onComboEnded);
        this.comboBus.off('combo/reset', this.onComboEnded);
        this.trail.destroy();
        this.glow.destroy();
        this.warmOverlay.destroy();
    }
}
