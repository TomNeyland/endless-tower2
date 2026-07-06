/**
 * Sound attaches to events, never polls. Pitch and sample choice scale with
 * the payload's kinematic facts; sfx_gem is reserved exclusively for
 * perfect-flag bounces — the skill sound. Master volume ships audible (v1
 * shipped muted; refused by name). Per-key cooldowns stop machine-gun spam.
 */
import type { Scene } from 'phaser';
import type { EventBus, JumpEvent, WallBounceEvent } from '../../core/events';
import type { TuningStack } from '../../core/tuning';
import { Sfx } from '../assets';

const COOLDOWN_MS = 80;

export class AudioSystem {
    private readonly scene: Scene;
    private readonly bus: EventBus;
    private readonly t: TuningStack;
    private lastPlayed = new Map<string, number>();

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

    constructor(scene: Scene, bus: EventBus, tuning: TuningStack) {
        this.scene = scene;
        this.bus = bus;
        this.t = tuning;
        scene.sound.volume = tuning.value('MASTER_VOLUME');
        bus.on('movement/jump', this.onJump);
        bus.on('movement/wall_bounce', this.onWallBounce);
    }

    private play(key: string, rate: number, volume: number): void {
        const now = this.scene.time.now;
        const last = this.lastPlayed.get(key) ?? -1000;
        if (now - last < COOLDOWN_MS) {
            return;
        }
        this.lastPlayed.set(key, now);
        // +-3% pitch jitter — presentation-only randomness, never physics.
        const jitter = 1 + (Math.random() * 0.06 - 0.03);
        this.scene.sound.play(key, { rate: rate * jitter, volume });
    }

    destroy(): void {
        this.bus.off('movement/jump', this.onJump);
        this.bus.off('movement/wall_bounce', this.onWallBounce);
    }
}
