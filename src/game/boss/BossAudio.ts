/**
 * The duel's voice — menace and phase stingers from the existing pack
 * sounds, RESTRAINED (audio.md: the mix whispers so earned moments have
 * somewhere to go). The combo pipeline already sings the player's half;
 * this narrates only the boss's beats: arrival, telegraphs (one low tick),
 * knockdowns, phase turns, and the fall.
 */
import type { Scene } from 'phaser';
import type {
    BossDefeatedEvent,
    BossHitEvent,
    BossOpennessEvent,
    BossPhaseEvent,
    BossSpawnedEvent,
    BossTelegraphEvent,
    EventBus,
} from '../../core/events';
import { Sfx } from '../assets';

const TELEGRAPH_COOLDOWN_MS = 450;

export class BossAudio {
    private readonly scene: Scene;
    private readonly bus: EventBus;
    private lastTelegraphAt = 0;

    private readonly onSpawned = (_e: BossSpawnedEvent): void => {
        // Menace: the same bell, dropped an octave — arrival, not fanfare.
        this.scene.sound.play(Sfx.magic, { rate: 0.5, volume: 0.5 });
        this.scene.time.delayedCall(260, () => {
            this.scene.sound.play(Sfx.bump, { rate: 0.55, volume: 0.45 });
        });
    };

    private readonly onTelegraph = (e: BossTelegraphEvent): void => {
        const now = this.scene.time.now;
        if (now - this.lastTelegraphAt < TELEGRAPH_COOLDOWN_MS) {
            return; // layered telegraphs never machine-gun the warning
        }
        this.lastTelegraphAt = now;
        const rate = e.kind === 'line_surge' ? 0.6 : 0.75;
        this.scene.sound.play(Sfx.select, { rate, volume: 0.3 });
    };

    private readonly onHit = (e: BossHitEvent): void => {
        if (e.loudness === 'roar') {
            // The knockdown thud — the one loud boss sound, earned by a roar.
            this.scene.sound.play(Sfx.bump, { rate: 0.45, volume: 0.6 });
        }
    };

    private readonly onOpenness = (e: BossOpennessEvent): void => {
        if (e.state !== 'entered') {
            return;
        }
        // The invitation: one high, quiet chime as the stance opens — the
        // timing decision gets an ear as well as an eye, still a whisper.
        this.scene.sound.play(Sfx.magic, { rate: 1.6, volume: 0.18 });
    };

    private readonly onPhase = (e: BossPhaseEvent): void => {
        // The phase stinger: two falling steps — it is coming apart.
        this.scene.sound.play(Sfx.magic, { rate: 0.8 - 0.1 * e.phase, volume: 0.45 });
        this.scene.time.delayedCall(180, () => {
            this.scene.sound.play(Sfx.magic, { rate: 0.65 - 0.1 * e.phase, volume: 0.4 });
        });
    };

    private readonly onDefeated = (_e: BossDefeatedEvent): void => {
        this.scene.sound.play(Sfx.disappear, { rate: 0.7, volume: 0.55 });
    };

    constructor(scene: Scene, bus: EventBus) {
        this.scene = scene;
        this.bus = bus;
        bus.on('boss/spawned', this.onSpawned);
        bus.on('boss/telegraph', this.onTelegraph);
        bus.on('boss/hit', this.onHit);
        bus.on('boss/openness', this.onOpenness);
        bus.on('boss/phase', this.onPhase);
        bus.on('boss/defeated', this.onDefeated);
    }

    destroy(): void {
        this.bus.off('boss/spawned', this.onSpawned);
        this.bus.off('boss/telegraph', this.onTelegraph);
        this.bus.off('boss/hit', this.onHit);
        this.bus.off('boss/openness', this.onOpenness);
        this.bus.off('boss/phase', this.onPhase);
        this.bus.off('boss/defeated', this.onDefeated);
    }
}
