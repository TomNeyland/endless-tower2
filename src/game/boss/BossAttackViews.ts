/**
 * Attack telegraphs on the TOWER itself (bosses.md: glow, shimmer, rumble —
 * risk is a price tag even mid-duel). Crumble glow lives in TowerView (the
 * field's collapsing state IS that telegraph); this view narrates the rest:
 * goo globs that fly from the boss and SPLAT at resolve, the line flaring
 * before a surge, wind streaks crossing the arena before and during a gust,
 * and a warning ring where a slam will land. Pure bus consumer — deleting
 * this file changes nothing about the rules.
 */
import { BlendModes, type GameObjects, type Scene } from 'phaser';
import type { BossTelegraphEvent, EventBus } from '../../core/events';
import type { TuningStack } from '../../core/tuning';
import { Gen } from '../assets';
import { GAME_WIDTH } from '../main';
import type { PressureSystem } from '../systems/PressureSystem';
import type { TowerView } from '../systems/TowerView';

const GOO_TINT = 0x86d94e;
const SURGE_TINT = 0xff5a1f;
const WIND_TINT = 0xd8ecff;

export class BossAttackViews {
    private readonly scene: Scene;
    private readonly bus: EventBus;
    private readonly towerView: TowerView;
    private readonly pressure: PressureSystem;
    private readonly t: TuningStack;

    private surgeFlare: GameObjects.Image | null = null;
    private windUntil = 0;
    private windDir = 1;
    private windAt = 0;
    private wind: GameObjects.Particles.ParticleEmitter;
    private slamRings: GameObjects.Image[] = [];

    private readonly onTelegraph = (e: BossTelegraphEvent): void => {
        const msLeft = ((e.resolveTick - e.tick) * 1000) / 60;
        switch (e.kind) {
            case 'sticky_spit':
                for (const id of e.targetPlatformIds) {
                    this.flyGoo(id, msLeft);
                }
                break;
            case 'line_surge':
                this.flareLine(msLeft);
                break;
            case 'gust':
                // Streaks first (the warning), direction revealed with the
                // push itself — aim gets harder, never blind.
                this.windUntil = this.scene.time.now + msLeft;
                break;
            case 'body_slam':
                for (const id of e.targetPlatformIds) {
                    this.markSlam(id, msLeft);
                }
                break;
            default:
                break; // crumble glow is TowerView's; swarm announces itself
        }
    };

    constructor(
        scene: Scene,
        bus: EventBus,
        towerView: TowerView,
        pressure: PressureSystem,
        tuning: TuningStack,
    ) {
        this.scene = scene;
        this.bus = bus;
        this.towerView = towerView;
        this.pressure = pressure;
        this.t = tuning;
        this.wind = scene.add.particles(0, 0, Gen.streak, {
            lifespan: 500,
            alpha: { start: 0.5, end: 0 },
            scale: { start: 1.6, end: 0.6 },
            tint: WIND_TINT,
            emitting: false,
        });
        this.wind.setDepth(8);
        bus.on('boss/telegraph', this.onTelegraph);
    }

    /** A goo glob arcs down onto the ledge and SPLATS exactly at resolve
     *  (the classify command lands the same tick; TowerView draws the goo). */
    private flyGoo(platformId: number, msLeft: number): void {
        const target = this.towerView.platformAnchor(platformId);
        if (!target) {
            return;
        }
        const glob = this.scene.add
            .image(target.x + (Math.random() * 160 - 80), target.y - 500, Gen.dust)
            .setScale(2.4, 2.0)
            .setTint(GOO_TINT)
            .setAlpha(0.95)
            .setDepth(9);
        this.scene.tweens.add({
            targets: glob,
            x: target.x,
            y: target.y - 8,
            duration: Math.max(120, msLeft),
            ease: 'Quad.easeIn',
            onComplete: () => {
                this.scene.tweens.add({
                    targets: glob,
                    scaleX: 3.4,
                    scaleY: 0.7,
                    alpha: 0,
                    duration: 260,
                    onComplete: () => glob.destroy(),
                });
            },
        });
    }

    /** The line flares before it lunges — its own light is the warning. */
    private flareLine(msLeft: number): void {
        const lineY = this.pressure.lineY();
        if (lineY === null) {
            return;
        }
        this.surgeFlare?.destroy();
        const flare = this.scene.add
            .image(GAME_WIDTH / 2, lineY, Gen.glowBand)
            .setDisplaySize(GAME_WIDTH, 220)
            .setOrigin(0.5, 1)
            .setTint(SURGE_TINT)
            .setBlendMode(BlendModes.ADD)
            .setAlpha(0);
        flare.setDepth(5.8);
        this.surgeFlare = flare;
        this.scene.tweens.add({
            targets: flare,
            alpha: { from: 0.15, to: 0.8 },
            duration: 170,
            yoyo: true,
            repeat: Math.max(1, Math.floor(msLeft / 340)),
            onComplete: () => {
                flare.destroy();
                if (this.surgeFlare === flare) {
                    this.surgeFlare = null;
                }
            },
        });
    }

    /** A warning ring pulses where the slam will land. */
    private markSlam(platformId: number, msLeft: number): void {
        const target = this.towerView.platformAnchor(platformId);
        if (!target) {
            return;
        }
        const ring = this.scene.add
            .image(target.x, target.y, Gen.glow)
            .setDisplaySize(target.width + 60, 90)
            .setTint(0xffb03a)
            .setBlendMode(BlendModes.ADD)
            .setAlpha(0.3)
            .setDepth(1.3);
        this.slamRings.push(ring);
        this.scene.tweens.add({
            targets: ring,
            alpha: 0.75,
            duration: 150,
            yoyo: true,
            repeat: Math.max(1, Math.floor(msLeft / 300)),
            onComplete: () => {
                ring.destroy();
                this.slamRings = this.slamRings.filter((r) => r !== ring);
            },
        });
    }

    /** Per render frame: the wind's streaks while a gust threatens/blows. */
    update(scrollY: number): void {
        const now = this.scene.time.now;
        // The surge flare rides the line while it lives.
        const lineY = this.pressure.lineY();
        if (this.surgeFlare && lineY !== null) {
            this.surgeFlare.setY(lineY + 8);
        }
        // Streaks during the telegraph (a warning, direction neutral-ish)
        // AND while the wind is actually live in the tuning table (a world
        // fact the view simply renders).
        const accel = this.t.value('wind.accelX');
        if ((now < this.windUntil || accel !== 0) && now >= this.windAt) {
            this.windAt = now + 30;
            const dir = accel !== 0 ? Math.sign(accel) : this.windDir;
            this.windDir = dir;
            const y = scrollY + Math.random() * 700;
            const x = dir > 0 ? -10 : GAME_WIDTH + 10;
            this.wind.setParticleSpeed(dir * (420 + Math.random() * 240), 0);
            this.wind.emitParticleAt(x, y, 1);
        }
    }

    destroy(): void {
        this.bus.off('boss/telegraph', this.onTelegraph);
        this.surgeFlare?.destroy();
        for (const ring of this.slamRings) {
            ring.destroy();
        }
        this.wind.destroy();
    }
}
