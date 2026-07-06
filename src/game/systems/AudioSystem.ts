/**
 * Sound attaches to events, never polls. Pitch and sample choice scale with
 * the payload's kinematic facts; sfx_gem is reserved exclusively for
 * perfect-flag bounces — the skill sound. Master volume ships audible (v1
 * shipped muted; refused by name). Per-key cooldowns stop machine-gun spam.
 *
 * MASTERY additions (combo-scoring.md / audio.md): the tier stinger climbs a
 * pentatonic ladder — one playback-rate step per tier, ~1.5 octaves across
 * the ladder, so any escalation order sounds musical; banking lands a soft
 * detune resolving into a coin tally whose voice scales with the payout's
 * loudness class (whisper / voice / roar — a tiny fizzle bank stays
 * near-silent, banking-on-failure never reads as fanfare); a VOID is
 * deliberately silent here — the heart-loss sound owns that moment; and the
 * glory-music gate opens after GLORY_SUSTAIN at tier >= SOARING.
 */
import type { Scene, Time } from 'phaser';
import type { ComboBankedEvent, ComboBus, ComboTierEvent } from '../../core/combo/types';
import type { EventBus, JumpEvent, WallBounceEvent } from '../../core/events';
import type { TuningStack } from '../../core/tuning';
import { Sfx } from '../assets';

const COOLDOWN_MS = 80;

/** Major-pentatonic playback-rate ladder: C D E G A C' D' E' — one step per
 *  tier, SPARK -> BEYOND (repeats hold the top step; effects plateau). */
const PENTATONIC_RATES = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25, 2.5];

/** The glory gate arms at tier >= SOARING (combo-scoring.md graft #7). */
const GLORY_MIN_TIER = 3;

export class AudioSystem {
    private readonly scene: Scene;
    private readonly bus: EventBus;
    private readonly comboBus: ComboBus;
    private readonly t: TuningStack;
    private lastPlayed = new Map<string, number>();

    private gloryTimer: Time.TimerEvent | null = null;
    private gloryActive = false;

    private readonly onJump = (e: JumpEvent): void => {
        // Pitch 1.0 -> 1.2 by conversionFraction; the high-exchange jump gets
        // the brighter sample.
        const key = e.conversionFraction >= 0.7 ? Sfx.jumpHigh : Sfx.jump;
        this.play(key, 1 + 0.2 * e.conversionFraction, 0.5);
    };

    private readonly onWallBounce = (e: WallBounceEvent): void => {
        const brightness = Math.min(1, e.impactSpeedX / this.t.value('MAX_RUN_SPEED'));
        this.play(Sfx.bump, 0.9 + 0.25 * brightness, 0.4);
        if (e.perfect) {
            this.play(Sfx.gem, 1, 0.45);
        }
    };

    private readonly onComboTier = (e: ComboTierEvent): void => {
        const rate = PENTATONIC_RATES[Math.min(e.tierIndex, PENTATONIC_RATES.length - 1)];
        // Exact pitch — a musical ladder cannot tolerate the spam jitter.
        this.play(Sfx.magic, rate, 0.45, false);
        if (e.tierIndex >= GLORY_MIN_TIER && this.gloryTimer === null && !this.gloryActive) {
            this.gloryTimer = this.scene.time.delayedCall(
                this.t.value('audio.glorySustainMs'),
                () => {
                    this.gloryTimer = null;
                    this.setGloryLayer(true);
                },
            );
        }
    };

    private readonly onComboBanked = (e: ComboBankedEvent): void => {
        this.closeGlory();
        // Loudness class by payout — payload values, never event counts.
        const whisperBelow = this.t.value('hud.bankWhisper');
        const voiceBelow = this.t.value('hud.bankVoice');
        const coins = e.payout < whisperBelow ? 1 : e.payout < voiceBelow ? 3 : 5;
        const volume = e.payout < whisperBelow ? 0.12 : e.payout < voiceBelow ? 0.3 : 0.45;
        // The soft detune of a chain ending...
        this.play(Sfx.bump, 0.72, volume * 0.7, false);
        // ...resolving into the tally, one deliberate phrase (no cooldown).
        for (let i = 0; i < coins; i += 1) {
            this.scene.time.delayedCall(140 + i * 90, () => {
                this.scene.sound.play(Sfx.coin, { rate: 1 + 0.08 * i, volume });
            });
        }
    };

    /** A void is silent by design: the heart-loss sound owns that moment;
     *  the combo counter shatters visually only. Glory still closes. */
    private readonly onComboVoided = (): void => {
        this.closeGlory();
    };

    constructor(scene: Scene, bus: EventBus, tuning: TuningStack, comboBus: ComboBus) {
        this.scene = scene;
        this.bus = bus;
        this.comboBus = comboBus;
        this.t = tuning;
        scene.sound.volume = tuning.value('MASTER_VOLUME');
        bus.on('movement/jump', this.onJump);
        bus.on('movement/wall_bounce', this.onWallBounce);
        comboBus.on('combo/tier', this.onComboTier);
        comboBus.on('combo/banked', this.onComboBanked);
        comboBus.on('combo/voided', this.onComboVoided);
        comboBus.on('combo/reset', this.onComboVoided);
    }

    /** The glory-layer hook: audio.md's vertical music layers arrive in the
     *  HANDS pass and attach exactly here — the gate logic is done now so
     *  music drops in without rework. Closes with a fade when it exists. */
    private setGloryLayer(active: boolean): void {
        this.gloryActive = active;
    }

    private closeGlory(): void {
        if (this.gloryTimer !== null) {
            this.gloryTimer.remove();
            this.gloryTimer = null;
        }
        if (this.gloryActive) {
            this.setGloryLayer(false);
        }
    }

    get gloryLayerActive(): boolean {
        return this.gloryActive;
    }

    private play(key: string, rate: number, volume: number, jitter = true): void {
        const now = this.scene.time.now;
        const last = this.lastPlayed.get(key) ?? -1000;
        if (now - last < COOLDOWN_MS) {
            return;
        }
        this.lastPlayed.set(key, now);
        // +-3% pitch jitter — presentation-only randomness, never physics.
        const rateJitter = jitter ? 1 + (Math.random() * 0.06 - 0.03) : 1;
        this.scene.sound.play(key, { rate: rate * rateJitter, volume });
    }

    destroy(): void {
        this.closeGlory();
        this.bus.off('movement/jump', this.onJump);
        this.bus.off('movement/wall_bounce', this.onWallBounce);
        this.comboBus.off('combo/tier', this.onComboTier);
        this.comboBus.off('combo/banked', this.onComboBanked);
        this.comboBus.off('combo/voided', this.onComboVoided);
        this.comboBus.off('combo/reset', this.onComboVoided);
    }
}
