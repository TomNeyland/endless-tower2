/**
 * PRESSURE's act-1 presentation: the grass-fire death line, the lit exit
 * door, the ignition announcement, and the invulnerability blink. Pure bus
 * consumer + per-frame reader of PressureSystem's read surface — deleting
 * this file changes nothing about the rules.
 *
 * The line's look is binding (pressure.md refuses v1's programmer art by
 * name): the world ending from below, three layers —
 *   1. the consumed zone: a vertical gradient from the edge color to
 *      near-black drawn OVER the world, never a flat rectangle;
 *   2. the edge: layered, offset, independently-scrolling additive strips
 *      that undulate — never a straight ruler line — pulsing with the
 *      proximity tier;
 *   3. the breath: embers rising off the front, sparse at safe, denser and
 *      faster at danger+.
 * Urgency is the line's own light plus the audio swell. Never text. The
 * camera never reacts.
 */
import { BlendModes, type GameObjects, type Scene, type Tweens } from 'phaser';
import type { EventBus, HeartLostEvent, LineStateEvent } from '../../core/events';
import type { ProximityTierName } from '../../core/pressure/line';
import type { TuningStack } from '../../core/tuning';
import { Atlas, Gen, TileFrame } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import type { PlayerAnimator } from '../player/PlayerAnimator';
import type { PressureSystem } from './PressureSystem';

const TILE = 64;
const FIRE_TINT = 0xff8c2a;
const EMBER_TINTS = [0xffd166, 0xffa14a, 0xff6b35];

/** The edge: layered, offset, independently-scrolling strips (never one).
 *  The additive strips run untinted/light so the edge is the brightest
 *  thing on screen — the line carries its own light (art-direction.md). */
const EDGE_STRIPS = [
    { yOff: 0, alpha: 0.95, add: false, tint: 0xffb050, scroll: 0.03, phase: 0, bobPx: 3, bobHz: 0.0021 },
    { yOff: -10, alpha: 0.5, add: true, tint: 0xffffff, scroll: -0.019, phase: 173, bobPx: 5, bobHz: 0.0013 },
    { yOff: 7, alpha: 0.35, add: true, tint: 0xffd9a0, scroll: 0.047, phase: 61, bobPx: 7, bobHz: 0.0032 },
] as const;

/** Glow pulse per proximity tier: base alpha, pulse depth, pulse speed. */
const TIER_GLOW: Record<ProximityTierName, { base: number; amp: number; hz: number }> = {
    safe: { base: 0.42, amp: 0.08, hz: 0.004 },
    aware: { base: 0.48, amp: 0.12, hz: 0.006 },
    danger: { base: 0.56, amp: 0.18, hz: 0.009 },
    critical: { base: 0.66, amp: 0.24, hz: 0.013 },
};

/** The breath per tier: emit cadence, embers per emission, which emitter. */
const TIER_BREATH: Record<ProximityTierName, { intervalMs: number; count: number; fierce: boolean }> =
    {
        safe: { intervalMs: 210, count: 1, fierce: false },
        aware: { intervalMs: 130, count: 1, fierce: false },
        danger: { intervalMs: 70, count: 2, fierce: true },
        critical: { intervalMs: 42, count: 3, fierce: true },
    };

export class PressureView {
    private readonly scene: Scene;
    private readonly pressure: PressureSystem;
    private readonly animator: PlayerAnimator;
    private readonly bus: EventBus;
    private readonly t: TuningStack;

    private door: GameObjects.Image[] = [];
    private doorGlow: GameObjects.Image | null = null;
    private consumed: GameObjects.Image | null = null;
    private edges: GameObjects.TileSprite[] = [];
    private fireGlow: GameObjects.Image | null = null;
    private embers: GameObjects.Particles.ParticleEmitter | null = null;
    private embersFierce: GameObjects.Particles.ParticleEmitter | null = null;
    private emberAt = 0;
    private blinkTween: Tweens.Tween | null = null;

    private readonly onLineState = (e: LineStateEvent): void => {
        if (e.state !== 'active' || e.lineY === null) {
            return;
        }
        this.buildFire();
        // The announcement: one ember burst along the whole ignition front.
        if (this.embers) {
            for (let i = 0; i < 24; i += 1) {
                this.embers.emitParticleAt(
                    TILE + Math.random() * (GAME_WIDTH - TILE * 2),
                    e.lineY - 6,
                    1,
                );
            }
        }
    };

    private readonly onHeartLost = (e: HeartLostEvent): void => {
        if (this.embersFierce) {
            this.embersFierce.explode(14, e.x, e.y);
        }
        if (e.heartsRemaining <= 0) {
            return;
        }
        // The classic blink for the whole invulnerability window — the
        // shield made visible, restored to full alpha on completion.
        const sprite = this.animator.visual;
        const invulnMs = this.t.value('hearts.invulnMs');
        this.blinkTween?.stop();
        sprite.alpha = 1;
        this.blinkTween = this.scene.tweens.add({
            targets: sprite,
            alpha: 0.25,
            duration: 80,
            yoyo: true,
            repeat: Math.max(0, Math.floor(invulnMs / 160) - 1),
            onComplete: () => {
                sprite.alpha = 1;
            },
        });
    };

    constructor(
        scene: Scene,
        pressure: PressureSystem,
        animator: PlayerAnimator,
        bus: EventBus,
        tuning: TuningStack,
    ) {
        this.scene = scene;
        this.pressure = pressure;
        this.animator = animator;
        this.bus = bus;
        this.t = tuning;

        const door = pressure.door();
        if (door) {
            this.buildDoor(door);
        }

        bus.on('line/state', this.onLineState);
        bus.on('run/heart_lost', this.onHeartLost);
    }

    /**
     * The lit exit. Built at scene create for ordinary climbs; in a boss
     * arena the door does not exist until the boss falls — update() watches
     * for its materialization (bosses.md: "then the door lights").
     */
    private buildDoor(door: { xCenter: number; topY: number }): void {
        // Lit and unmissable: a warm halo behind the open doorway.
        this.doorGlow = this.scene.add
            .image(door.xCenter, door.topY - TILE, Gen.dust)
            .setScale(30, 22)
            .setTint(0xffe9a0)
            .setAlpha(0.4)
            .setBlendMode(BlendModes.ADD)
            .setDepth(1.4);
        this.scene.tweens.add({
            targets: this.doorGlow,
            alpha: 0.62,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        this.door = [
            this.scene.add
                .image(door.xCenter, door.topY - TILE / 2, Atlas.tiles, TileFrame.doorBottom)
                .setDepth(1.5),
            this.scene.add
                .image(door.xCenter, door.topY - TILE * 1.5, Atlas.tiles, TileFrame.doorTop)
                .setDepth(1.5),
        ];
    }

    /** Created at ignition — before that the line does not exist, visibly. */
    private buildFire(): void {
        if (this.edges.length > 0) {
            return;
        }
        // Layer 1 — the consumed zone: the tower ceases to exist down there.
        this.consumed = this.scene.add
            .image(GAME_WIDTH / 2, 0, Gen.consumeGradient)
            .setOrigin(0.5, 0)
            .setDisplaySize(GAME_WIDTH, GAME_HEIGHT + TILE * 3)
            .setTint(FIRE_TINT)
            .setDepth(4);
        // Layer 2 — the edge: offset strips, each with its own drift and bob.
        this.edges = EDGE_STRIPS.map((s, i) => {
            const strip = this.scene.add
                .tileSprite(GAME_WIDTH / 2, 0, GAME_WIDTH, TILE, Atlas.tiles, TileFrame.fireEdge)
                .setTint(s.tint)
                .setAlpha(s.alpha)
                .setDepth(5 + i * 0.1);
            if (s.add) {
                strip.setBlendMode(BlendModes.ADD);
            }
            return strip;
        });
        this.fireGlow = this.scene.add
            .image(GAME_WIDTH / 2, 0, Gen.glowBand)
            .setDisplaySize(GAME_WIDTH, 110)
            .setOrigin(0.5, 1)
            .setTint(0xff9a3d)
            .setBlendMode(BlendModes.ADD)
            .setDepth(5.5);
        // Layer 3 — the breath, in two moods: calm drift and danger's rush.
        this.embers = this.scene.add.particles(0, 0, Gen.dust, {
            speedY: { min: -170, max: -70 },
            speedX: { min: -30, max: 30 },
            lifespan: { min: 500, max: 1100 },
            scale: { start: 0.7, end: 0 },
            alpha: { start: 0.9, end: 0 },
            tint: EMBER_TINTS,
            blendMode: 'ADD',
            emitting: false,
        });
        this.embers.setDepth(6);
        this.embersFierce = this.scene.add.particles(0, 0, Gen.dust, {
            speedY: { min: -300, max: -140 },
            speedX: { min: -55, max: 55 },
            lifespan: { min: 350, max: 800 },
            scale: { start: 0.8, end: 0 },
            alpha: { start: 1, end: 0 },
            tint: EMBER_TINTS,
            blendMode: 'ADD',
            emitting: false,
        });
        this.embersFierce.setDepth(6);
    }

    update(scrollY: number): void {
        // A boss arena's door materializes mid-scene, on defeat.
        if (this.door.length === 0) {
            const door = this.pressure.door();
            if (door) {
                this.buildDoor(door);
            }
        }
        const lineY = this.pressure.lineY();
        if (lineY === null || this.edges.length === 0 || !this.consumed || !this.fireGlow) {
            return;
        }
        const now = this.scene.time.now;
        const tier = this.pressure.tier();

        // The consumed zone crests at the catch line and swallows everything
        // below it — edge color at the front, near-black by a screen down.
        this.consumed.setPosition(GAME_WIDTH / 2, lineY);

        // The edge undulates: three strips, each drifting and bobbing on its
        // own rate — never a straight ruler line.
        for (let i = 0; i < this.edges.length; i += 1) {
            const spec = EDGE_STRIPS[i];
            const bob = spec.bobPx * Math.sin(now * spec.bobHz + spec.phase);
            this.edges[i].setPosition(GAME_WIDTH / 2, lineY + TILE / 2 + spec.yOff + bob);
            this.edges[i].tilePositionX = now * spec.scroll + spec.phase * 7;
        }

        // The glow pulses with the proximity tier — the line's own light is
        // the urgency channel (never text, never the camera).
        const glow = TIER_GLOW[tier];
        this.fireGlow.setPosition(GAME_WIDTH / 2, lineY + 6);
        this.fireGlow.setAlpha(glow.base + glow.amp * Math.sin(now * glow.hz));

        // The breath: sparse at safe, denser and faster at danger+.
        const onScreen = lineY > scrollY - 120 && lineY < scrollY + GAME_HEIGHT + 240;
        const breath = TIER_BREATH[tier];
        const emitter = breath.fierce ? this.embersFierce : this.embers;
        if (onScreen && emitter && now >= this.emberAt) {
            for (let i = 0; i < breath.count; i += 1) {
                emitter.emitParticleAt(TILE + Math.random() * (GAME_WIDTH - TILE * 2), lineY - 4, 1);
            }
            this.emberAt = now + breath.intervalMs;
        }
    }

    destroy(): void {
        this.bus.off('line/state', this.onLineState);
        this.bus.off('run/heart_lost', this.onHeartLost);
        this.blinkTween?.stop();
        for (const img of this.door) {
            img.destroy();
        }
        this.doorGlow?.destroy();
        this.consumed?.destroy();
        for (const strip of this.edges) {
            strip.destroy();
        }
        this.fireGlow?.destroy();
        this.embers?.destroy();
        this.embersFierce?.destroy();
    }
}
