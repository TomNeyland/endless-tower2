/**
 * The combo HUD — where the wager becomes legible. The spectator test
 * governs everything here: chain size (the counter and its light), quality
 * (the xmult), and jeopardy (the draining fuse at every touchdown) must
 * read with zero numbers studied.
 *
 * SPARK ignites the counter. Banks flash the payout in their loudness
 * class; a VOID shatters the counter visually only — the sound of that
 * moment belongs to the heart loss. The world-space shoutout cards live in
 * ComboCards.ts, constructed and owned here.
 */
import type { GameObjects, Scene } from 'phaser';
import type { ComboBus } from '../../core/combo/bus';
import type {
    ComboBankedEvent,
    ComboLinkEvent,
    ComboSpiceEvent,
    ComboStumbleEvent,
    ComboTierEvent,
    ScoreUpdatedEvent,
} from '../../core/combo/types';
import type { EventBus, TickEvent } from '../../core/events';
import type { TuningStack } from '../../core/tuning';
import { GAME_WIDTH } from '../main';
import { ComboCards, tierColor } from './ComboCards';

const HUD_DEPTH = 20;
const FUSE_W = 220;
const FUSE_H = 7;

/** Deterministic thousands grouping for the HUD faces. */
function groupDigits(n: number): string {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export class ComboHud {
    private readonly scene: Scene;
    private readonly bus: EventBus;
    private readonly comboBus: ComboBus;
    private readonly t: TuningStack;

    private counter!: GameObjects.Text;
    private multText!: GameObjects.Text;
    private spiceText!: GameObjects.Text;
    private fuseBack!: GameObjects.Rectangle;
    private fuseFill!: GameObjects.Rectangle;
    private scoreText!: GameObjects.Text;
    private cards!: ComboCards;

    private chainActive = false;
    private ignited = false;
    private fuseStartTick = 0;
    private fuseDeadlineTick = 0;

    private readonly onStarted = (): void => {
        this.chainActive = true;
        this.ignited = false;
        // A shatter tween may still own these objects — reclaim them.
        this.scene.tweens.killTweensOf([this.counter, this.multText]);
        this.counter.setY(84).setAngle(0).setAlpha(0.35).setVisible(true).setColor('#ffffff');
        this.multText.setY(124).setAngle(0).setAlpha(0.35).setVisible(true);
        this.fuseBack.setVisible(true);
        this.fuseFill.setVisible(true);
    };

    private readonly onLink = (e: ComboLinkEvent): void => {
        this.counter.setText(`${e.chainFloors} FLOORS`);
        this.multText.setText(`×${(Math.round(e.mult * 100) / 100).toString()}`);
        this.spiceText.setText('');
        this.fuseStartTick = e.tick;
        this.fuseDeadlineTick = e.graceDeadlineTick;
        this.scene.tweens.add({
            targets: this.counter,
            scale: { from: 1.12, to: 1 },
            duration: 120,
        });
    };

    private readonly onSpice = (e: ComboSpiceEvent): void => {
        // Provisional style may only whisper: escrowed, not owed.
        this.spiceText.setText(`+${e.provisionalMultDelta}?`);
    };

    private readonly onTier = (e: ComboTierEvent): void => {
        if (!this.ignited) {
            this.ignited = true;
            this.counter.setAlpha(1);
            this.multText.setAlpha(1);
        }
        this.counter.setColor(tierColor(e.tierIndex));
    };

    private readonly onStumble = (e: ComboStumbleEvent): void => {
        this.fuseStartTick = e.tick;
        this.fuseDeadlineTick = e.graceDeadlineTick;
    };

    private readonly onBanked = (e: ComboBankedEvent): void => {
        this.clearChain();
        if (e.payout <= 0) {
            return;
        }
        // Loudness class styles the flash: whisper stays nearly invisible.
        const whisper = e.payout < this.t.value('hud.bankWhisper');
        const roar = e.payout >= this.t.value('hud.bankVoice');
        const flash = this.scene.add
            .text(GAME_WIDTH / 2, 150, `+${groupDigits(e.payout)}`, {
                fontFamily: 'Arial Black',
                fontSize: whisper ? 16 : roar ? 34 : 24,
                color: whisper ? '#9fb4c8' : roar ? '#ffd24a' : '#ffffff',
                stroke: '#1a2733',
                strokeThickness: whisper ? 2 : 5,
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(HUD_DEPTH)
            .setAlpha(whisper ? 0.6 : 1);
        this.scene.tweens.add({
            targets: flash,
            y: 118,
            alpha: 0,
            duration: whisper ? 500 : 900,
            ease: 'Cubic.easeOut',
            onComplete: () => flash.destroy(),
        });
    };

    /** The counter shatters visually only — the void has no sound here. */
    private readonly onVoided = (): void => {
        const pieces: GameObjects.Text[] = [this.counter, this.multText];
        for (const piece of pieces) {
            piece.setColor('#ff5a4a');
            this.scene.tweens.add({
                targets: piece,
                y: `+=${64}`,
                angle: piece === this.counter ? -14 : 18,
                alpha: 0,
                duration: 450,
                ease: 'Cubic.easeIn',
                onComplete: () => {
                    piece.setVisible(false).setAlpha(1).setAngle(0).setColor('#ffffff');
                    piece.setY(piece === this.counter ? 84 : 124);
                },
            });
        }
        this.chainActive = false;
        this.spiceText.setText('');
        this.fuseBack.setVisible(false);
        this.fuseFill.setVisible(false);
    };

    private readonly onReset = (): void => {
        this.clearChain();
    };

    private readonly onScore = (e: ScoreUpdatedEvent): void => {
        this.scoreText.setText(`SCORE ${groupDigits(e.totalScore)}`);
    };

    /** The fuse drains against the absolute deadline, in ticks — the one
     *  window made visible. Airborne it rests full and dim: air is sacred. */
    private readonly onTick = (e: TickEvent): void => {
        if (!this.chainActive) {
            return;
        }
        if (!e.grounded) {
            this.fuseFill.width = FUSE_W;
            this.fuseBack.setAlpha(0.2);
            this.fuseFill.setAlpha(0.25);
            return;
        }
        const total = Math.max(1, this.fuseDeadlineTick - this.fuseStartTick);
        const frac = Math.max(0, (this.fuseDeadlineTick - e.tick) / total);
        this.fuseFill.width = FUSE_W * frac;
        this.fuseFill.setFillStyle(frac > 0.5 ? 0xffe28a : frac > 0.25 ? 0xffa03a : 0xff5030);
        this.fuseBack.setAlpha(0.45);
        this.fuseFill.setAlpha(0.95);
    };

    constructor(scene: Scene, bus: EventBus, comboBus: ComboBus, tuning: TuningStack) {
        this.scene = scene;
        this.bus = bus;
        this.comboBus = comboBus;
        this.t = tuning;
        this.cards = new ComboCards(scene, comboBus);
        this.build();

        comboBus.on('combo/started', this.onStarted);
        comboBus.on('combo/link', this.onLink);
        comboBus.on('combo/spice', this.onSpice);
        comboBus.on('combo/tier', this.onTier);
        comboBus.on('combo/stumble', this.onStumble);
        comboBus.on('combo/banked', this.onBanked);
        comboBus.on('combo/voided', this.onVoided);
        comboBus.on('combo/reset', this.onReset);
        comboBus.on('score/updated', this.onScore);
        bus.on('movement/tick', this.onTick);
    }

    private build(): void {
        const cx = GAME_WIDTH / 2;
        this.counter = this.scene.add
            .text(cx, 84, '', {
                fontFamily: 'Arial Black',
                fontSize: 38,
                color: '#ffffff',
                stroke: '#1a2733',
                strokeThickness: 6,
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(HUD_DEPTH)
            .setVisible(false);
        this.multText = this.scene.add
            .text(cx, 124, '', {
                fontFamily: 'Arial Black',
                fontSize: 24,
                color: '#ffd24a',
                stroke: '#1a2733',
                strokeThickness: 4,
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(HUD_DEPTH)
            .setVisible(false);
        this.spiceText = this.scene.add
            .text(cx + 86, 124, '', { fontFamily: 'Arial', fontSize: 16, color: '#bfd8ee' })
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(HUD_DEPTH)
            .setAlpha(0.7);
        this.fuseBack = this.scene.add
            .rectangle(cx - FUSE_W / 2, 148, FUSE_W, FUSE_H, 0x10202e)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(HUD_DEPTH)
            .setVisible(false);
        this.fuseFill = this.scene.add
            .rectangle(cx - FUSE_W / 2, 148, FUSE_W, FUSE_H, 0xffe28a)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(HUD_DEPTH)
            .setVisible(false);
        this.scoreText = this.scene.add
            .text(16, 12, 'SCORE 0', {
                fontFamily: 'Arial Black',
                fontSize: 20,
                color: '#e8f4ff',
                stroke: '#1a2733',
                strokeThickness: 4,
            })
            .setScrollFactor(0)
            .setDepth(HUD_DEPTH);
    }

    private clearChain(): void {
        this.chainActive = false;
        this.counter.setVisible(false);
        this.multText.setVisible(false);
        this.spiceText.setText('');
        this.fuseBack.setVisible(false);
        this.fuseFill.setVisible(false);
    }

    destroy(): void {
        this.comboBus.off('combo/started', this.onStarted);
        this.comboBus.off('combo/link', this.onLink);
        this.comboBus.off('combo/spice', this.onSpice);
        this.comboBus.off('combo/tier', this.onTier);
        this.comboBus.off('combo/stumble', this.onStumble);
        this.comboBus.off('combo/banked', this.onBanked);
        this.comboBus.off('combo/voided', this.onVoided);
        this.comboBus.off('combo/reset', this.onReset);
        this.comboBus.off('score/updated', this.onScore);
        this.bus.off('movement/tick', this.onTick);
        this.cards.destroy();
        this.counter.destroy();
        this.multText.destroy();
        this.spiceText.destroy();
        this.fuseBack.destroy();
        this.fuseFill.destroy();
        this.scoreText.destroy();
    }
}
