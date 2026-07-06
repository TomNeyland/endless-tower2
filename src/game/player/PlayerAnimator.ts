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
    private afterburner: GameObjects.Particles.ParticleEmitter;
    private wallSparks: GameObjects.Particles.ParticleEmitter;

    private squash = { x: 1, y: 1 };
    private squashTween: Tweens.Tween | null = null;
    private uprightTween: Tweens.Tween | null = null;
    private spinOmega = 0;
    private spinDir = 1;
    private duckUntil = 0;
    private walkToggleAt = 0;
    private walkFrameA = true;
    private runDustAt = 0;
    private afterburnerAt = 0;

    private readonly onJump = (e: JumpEvent): void => {
        this.applySquash(0.8, 1.25, 80);
        this.triggerSpin(e.launchSpeedX, e.vx < 0 ? -1 : 1, 1);
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

    private readonly onWallBounce = (e: WallBounceEvent): void => {
        this.applySquash(0.7, 1.15, 70);
        const dir = e.vx < 0 ? -1 : 1;
        this.triggerSpin(e.exitSpeedX, dir, this.t.value('juice.wallSpinMul'));
        const juice = this.t.value('JUICE_SCALE');
        const heat = Math.min(1, e.exitSpeedX / this.t.value('MAX_RUN_SPEED'));
        const sparkMin = this.t.value('juice.wallSparkMinParticles');
        const sparkMax = this.t.value('juice.wallSparkMaxParticles');
        const count = Math.round((sparkMin + (sparkMax - sparkMin) * heat) * juice);
        if (count > 0) {
            this.wallSparks.setParticleSpeed(-dir * (120 + 220 * heat), -80 - 120 * heat);
            this.wallSparks.explode(count, e.x, e.y);
        }
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
        this.afterburner = scene.add.particles(0, 0, Gen.ember, {
            speedX: { min: -70, max: 70 },
            speedY: { min: 40, max: 160 },
            lifespan: { min: 180, max: 360 },
            scale: { start: 0.9, end: 0.05 },
            alpha: { start: 0.85, end: 0 },
            tint: [0xffe28a, 0xff8a20, 0xff3d0f],
            blendMode: 'ADD',
            emitting: false,
        });
        this.afterburner.setDepth(8.5);
        this.wallSparks = scene.add.particles(0, 0, Gen.spark, {
            lifespan: { min: 140, max: 300 },
            scale: { start: 1.4, end: 0 },
            alpha: { start: 1, end: 0 },
            tint: [0xfff0a0, 0xffa11a, 0xffffff],
            blendMode: 'ADD',
            emitting: false,
        });
        this.wallSparks.setDepth(9.5);

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

    private triggerSpin(speed: number, dir: -1 | 1, mul: number): void {
        const start = this.t.value('juice.spinStartSpeed');
        if (speed <= start) {
            this.spinOmega = 0;
            return;
        }
        const full = this.t.value('juice.spinFullSpeed');
        if (full <= start) {
            throw new Error(
                `juice tuning degenerate: spinFullSpeed ${full} <= spinStartSpeed ${start}`,
            );
        }
        const span = full - start;
        const heat = Math.min(1, (speed - start) / span);
        this.spinOmega =
            heat ** this.t.value('juice.spinExponent') *
            this.t.value('juice.spinMaxRadPerSec') *
            mul;
        this.spinDir = dir;
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

        // Afterburner: the "screen on fire" body-language before the formal
        // afterimage crown. Wall-bounce spin can keep it alive mid-air even
        // while jump-spend temporarily lowers horizontal speed.
        const afterburnerSpeed =
            this.t.value('juice.afterburnerFrac') * this.t.value('MAX_RUN_SPEED');
        const spinHeat = this.spinOmega / this.t.value('juice.spinMaxRadPerSec');
        if (
            juice > 0 &&
            (speed >= afterburnerSpeed || spinHeat >= this.t.value('juice.spinAfterburnerHeat')) &&
            now >= this.afterburnerAt
        ) {
            const dir = speed > 30 ? (k.vx < 0 ? -1 : 1) : this.spinDir;
            const heat = Math.min(1, Math.max(speed / this.t.value('MAX_RUN_SPEED'), spinHeat));
            const min = this.t.value('juice.afterburnerMinParticles');
            const max = this.t.value('juice.afterburnerMaxParticles');
            const count = Math.round((min + (max - min) * heat) * juice);
            this.afterburner.setParticleSpeed(-dir * (100 + speed * 0.12), 70);
            this.afterburner.emitParticleAt(k.x - dir * 20, k.feetY - 26, count);
            this.afterburnerAt = now + this.t.value('juice.afterburnerMs');
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
        this.afterburner.destroy();
        this.wallSparks.destroy();
    }
}
