/**
 * PRESSURE's voice (audio.md): the death-line proximity rumble — audio as
 * HUD, eyes on the tower, ears on the threat — the ignition announcement,
 * heart loss as hurt-then-hope in one phrase, and the exit chime. Sound
 * attaches to events, never polls game state; the rumble pulse reads only
 * the tier the proximity broadcasts told it. Everything restrained: the mix
 * whispers so earned moments keep their headroom.
 */
import type { Scene, Time } from 'phaser';
import type {
    EventBus,
    HeartLostEvent,
    LineProximityEvent,
    LineProximityTier,
} from '../../core/events';
import { Sfx } from '../assets';

const RUMBLE: Record<LineProximityTier, { volume: number; periodMs: number } | null> = {
    safe: null,
    aware: { volume: 0.06, periodMs: 1300 },
    danger: { volume: 0.12, periodMs: 900 },
    critical: { volume: 0.2, periodMs: 550 },
};

export class PressureAudio {
    private readonly scene: Scene;
    private readonly bus: EventBus;
    private tier: LineProximityTier = 'safe';
    private rumbleAt = 0;
    private hopeTimer: Time.TimerEvent | null = null;

    private readonly onLineState = (): void => {
        // Ignition is a visible, audible moment — never a silent start.
        this.scene.sound.play(Sfx.magic, { rate: 0.72, volume: 0.5 });
    };

    private readonly onProximity = (e: LineProximityEvent): void => {
        this.tier = e.tier;
    };

    private readonly onHeartLost = (e: HeartLostEvent): void => {
        // The one deliberately hard sound in the game...
        this.scene.sound.play(Sfx.hurt, { rate: 1, volume: 0.85 });
        if (e.heartsRemaining > 0) {
            // ...then the skyward whoosh: hurt, then hope, one phrase.
            this.hopeTimer = this.scene.time.delayedCall(170, () => {
                this.scene.sound.play(Sfx.disappear, { rate: 1.3, volume: 0.5 });
            });
        }
    };

    private readonly onRunEnded = (): void => {
        this.tier = 'safe';
        this.scene.sound.play(Sfx.disappear, { rate: 0.6, volume: 0.55 });
    };

    private readonly onSegmentEnd = (): void => {
        this.tier = 'safe';
        this.scene.sound.play(Sfx.coin, { rate: 1, volume: 0.5 });
    };

    constructor(scene: Scene, bus: EventBus) {
        this.scene = scene;
        this.bus = bus;
        bus.on('line/state', this.onLineState);
        bus.on('line/proximity', this.onProximity);
        bus.on('run/heart_lost', this.onHeartLost);
        bus.on('run/ended', this.onRunEnded);
        bus.on('run/segment_end', this.onSegmentEnd);
    }

    /** The rumble: a low pulse that quickens and swells as the line nears. */
    update(): void {
        const rumble = RUMBLE[this.tier];
        if (!rumble) {
            return;
        }
        const now = this.scene.time.now;
        if (now < this.rumbleAt) {
            return;
        }
        this.rumbleAt = now + rumble.periodMs;
        this.scene.sound.play(Sfx.bump, { rate: 0.32, volume: rumble.volume });
    }

    destroy(): void {
        this.bus.off('line/state', this.onLineState);
        this.bus.off('line/proximity', this.onProximity);
        this.bus.off('run/heart_lost', this.onHeartLost);
        this.bus.off('run/ended', this.onRunEnded);
        this.bus.off('run/segment_end', this.onSegmentEnd);
        this.hopeTimer?.remove(false);
    }
}
