/**
 * The player's visible body: frame animation, squash/stretch, the momentum
 * spin (v1's one good visual instinct, re-derived), and dust. Pure bus
 * consumer + per-frame reader of carrier kinematics — deleting this file
 * changes nothing about physics.
 */
import type { GameObjects, Scene, Tweens } from 'phaser';
import type { EventBus, JumpEvent, LandEvent, WallBounceEvent } from '../../core/events';
import type { TuningStack } from '../../core/tuning';
import { Atlas, CharFrame, type CharacterFrameSet, Gen } from '../assets';
import type { PlayerSystem } from '../player/PlayerSystem';

const CHAR_FRAME_PX = 128;
const DUST_TINT = 0xe8dfc8;

export class PlayerAnimator {
    private readonly scene: Scene;
    private readonly player: PlayerSystem;
    private readonly bus: EventBus;
    private readonly t: TuningStack;
    /** The run character's frame set (RETURN); Beige is the baseline. */
    private readonly frames: CharacterFrameSet;

    private sprite: GameObjects.Sprite;
    private dust: GameObjects.Particles.ParticleEmitter;

    private squash = { x: 1, y: 1 };
    private squashTween: Tweens.Tween | null = null;
    private uprightTween: Tweens.Tween | null = null;
    private spinOmega = 0;
    private spinDir = 1;
    private duckUntil = 0;
    private walkToggleAt = 0;
    private walkFrameA = true;
    private runDustAt = 0;

    private readonly onJump = (e: JumpEvent): void => {
        this.applySquash(0.8, 1.25, 80);
        const launch = e.launchSpeedX;
        if (launch > 500) {
            this.spinOmega = ((launch - 500) / 900) ** 1.5 * 24;
            this.spinDir = e.vx < 0 ? -1 : 1;
        } else {
            this.spinOmega = 0;
        }
    };

    private readonly onLand = (e: LandEvent): void => {
        const k = Math.max(0, Math.min(1, (e.impactVy - 200) / 1300));
        this.applySquash(1 + 0.45 * k, 1 - 0.4 * k, 110);
        this.duckUntil = this.scene.time.now + 110;
        this.spinOmega = 0;
        this.uprightTween?.stop();
        const rest = Math.round(this.sprite.rotation / (Math.PI * 2)) * Math.PI * 2;
        this.uprightTween = this.scene.tweens.add({
            targets: this.sprite,
            rotation: rest,
            duration: 90,
            ease: 'Sine.easeOut',
        });
        if (e.impactVy >= this.t.value('DUST_MIN_IMPACT')) {
            const juice = this.t.value('JUICE_SCALE');
            const count = Math.round((4 + 8 * Math.min(1, (e.impactVy - 400) / 1200)) * juice);
            if (count > 0) {
                this.dust.explode(count, e.x, e.y + 26);
            }
        }
    };

    // Wall squash only — movement.md's juice list prices squash for walls;
    // dust is priced for landings and runs, not bounces. Restraint doctrine.
    private readonly onWallBounce = (_e: WallBounceEvent): void => {
        this.applySquash(0.7, 1.15, 70);
    };

    private readonly onSpawn = (): void => {
        this.squashTween?.stop();
        this.uprightTween?.stop();
        this.squash = { x: 1, y: 1 };
        this.sprite.rotation = 0;
        this.spinOmega = 0;
        this.duckUntil = 0;
    };

    constructor(
        scene: Scene,
        player: PlayerSystem,
        bus: EventBus,
        tuning: TuningStack,
        frames: CharacterFrameSet = CharFrame,
    ) {
        this.scene = scene;
        this.player = player;
        this.bus = bus;
        this.t = tuning;
        this.frames = frames;

        const k = player.kinematics();
        this.sprite = scene.add
            .sprite(k.x, k.y, Atlas.characters, frames.idle)
            .setOrigin(0.5, 0.5)
            .setDepth(10);

        this.dust = scene.add.particles(0, 0, Gen.dust, {
            speed: { min: 40, max: 150 },
            angle: { min: 200, max: 340 },
            gravityY: 350,
            lifespan: { min: 220, max: 420 },
            scale: { start: 0.9, end: 0 },
            alpha: { start: 0.8, end: 0 },
            tint: DUST_TINT,
            emitting: false,
        });
        this.dust.setDepth(9);

        bus.on('movement/jump', this.onJump);
        bus.on('movement/land', this.onLand);
        bus.on('movement/wall_bounce', this.onWallBounce);
        bus.on('movement/spawn', this.onSpawn);
    }

    /** The visible sprite — the juice layer samples it for afterimages. */
    get visual(): GameObjects.Sprite {
        return this.sprite;
    }

    private applySquash(x: number, y: number, durationMs: number): void {
        const juice = this.t.value('JUICE_SCALE');
        this.squashTween?.stop();
        this.squash.x = 1 + (x - 1) * juice;
        this.squash.y = 1 + (y - 1) * juice;
        this.squashTween = this.scene.tweens.add({
            targets: this.squash,
            x: 1,
            y: 1,
            duration: durationMs,
            ease: 'Sine.easeOut',
        });
    }

    update(deltaMs: number): void {
        const k = this.player.kinematics();
        const base = this.t.value('PLAYER_SCALE');
        const now = this.scene.time.now;
        const speed = Math.abs(k.vx);

        this.sprite.setScale(base * this.squash.x, base * this.squash.y);
        this.sprite.x = k.x;
        this.sprite.y = k.feetY - (CHAR_FRAME_PX * base * this.squash.y) / 2;
        if (speed > 30) {
            this.sprite.setFlipX(k.vx < 0);
        }

        if (!k.grounded && this.spinOmega > 0) {
            this.sprite.rotation += this.spinDir * this.spinOmega * (deltaMs / 1000);
        }

        // Frame selection
        if (now < this.duckUntil) {
            this.sprite.setFrame(this.frames.duck);
        } else if (!k.grounded) {
            this.sprite.setFrame(this.frames.jump);
        } else if (speed >= 50) {
            const interval = Math.max(70, 220 - speed * 0.12);
            if (now >= this.walkToggleAt) {
                this.walkFrameA = !this.walkFrameA;
                this.walkToggleAt = now + interval;
            }
            this.sprite.setFrame(this.walkFrameA ? this.frames.walkA : this.frames.walkB);
        } else {
            this.sprite.setFrame(this.frames.idle);
        }

        // Run dust: speed made visible on the ground.
        const juice = this.t.value('JUICE_SCALE');
        const runDustSpeed = this.t.value('RUN_DUST_FRAC') * this.t.value('MAX_RUN_SPEED');
        if (juice > 0 && k.grounded && speed >= runDustSpeed && now >= this.runDustAt) {
            this.dust.explode(1, k.x - Math.sign(k.vx) * 18, k.feetY - 4);
            this.runDustAt = now + 70;
        }
    }

    destroy(): void {
        this.bus.off('movement/jump', this.onJump);
        this.bus.off('movement/land', this.onLand);
        this.bus.off('movement/wall_bounce', this.onWallBounce);
        this.bus.off('movement/spawn', this.onSpawn);
        this.squashTween?.stop();
        this.uprightTween?.stop();
        this.sprite.destroy();
        this.dust.destroy();
    }
}
