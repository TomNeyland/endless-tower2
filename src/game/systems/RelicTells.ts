/**
 * Relic tells on the character — every relic has a visible tell, so a
 * stacked build is readable ON THE BODY (relics-economy.md: the build is
 * part of the spectacle). Within art-direction's budget: the player stays
 * highest contrast; tells live in trail/aura, never silhouette. Three
 * styles from the tell data:
 *
 *   orbit — a small mote circling the character (staggered radii/phases)
 *   aura  — a soft additive ring breathing behind the sprite
 *   spark — an orbiting mote that twinkles
 *
 * All accents render BELOW the player's depth at capped alpha; past
 * MAX_ACCENTS the newest relics still join the belt (HUD) but the body
 * stops accreting — readability outranks completeness.
 */
import type { GameObjects, Scene } from 'phaser';
import type { EventBus } from '../../core/events';
import { relicById } from '../../core/relics/roster';
import type { RelicTell } from '../../core/relics/types';
import type { RunState } from '../../core/run/state';
import { Gen } from '../assets';
import type { PlayerSystem } from '../player/PlayerSystem';

const ACCENT_DEPTH = 9; // player sprite sits at 10 — tells never cover it
const MAX_ACCENTS = 10;
const ORBIT_BASE_RADIUS = 40;
const ORBIT_RADIUS_STEP = 7;
const ORBIT_SPEED = 1.4; // rad/s

interface Accent {
    tell: RelicTell;
    sprite: GameObjects.Image;
    phase: number;
    radius: number;
}

export class RelicTells {
    private readonly scene: Scene;
    private readonly bus: EventBus;
    private readonly run: RunState;
    private readonly player: PlayerSystem;

    private accents: Accent[] = [];
    private clock = 0;

    private readonly onRelicAcquired = (): void => this.rebuild();

    constructor(scene: Scene, bus: EventBus, run: RunState, player: PlayerSystem) {
        this.scene = scene;
        this.bus = bus;
        this.run = run;
        this.player = player;
        this.rebuild();
        bus.on('relic/acquired', this.onRelicAcquired);
    }

    private rebuild(): void {
        for (const accent of this.accents) {
            accent.sprite.destroy();
        }
        this.accents = [];
        const ids = this.run.relicIds().slice(0, MAX_ACCENTS);
        ids.forEach((id, i) => {
            const tell = relicById(id).tell;
            const aura = tell.style === 'aura';
            const sprite = this.scene.add
                .image(0, 0, Gen.glow)
                .setTint(tell.color)
                .setBlendMode('ADD')
                .setDepth(ACCENT_DEPTH)
                .setScale(aura ? 1.6 : 0.32)
                .setAlpha(aura ? 0.14 : 0.55);
            this.accents.push({
                tell,
                sprite,
                phase: (i * Math.PI * 2) / Math.max(1, ids.length),
                radius: ORBIT_BASE_RADIUS + (i % 4) * ORBIT_RADIUS_STEP,
            });
        });
    }

    update(deltaMs: number): void {
        if (this.accents.length === 0) {
            return;
        }
        this.clock += deltaMs / 1000;
        const k = this.player.kinematics();
        for (const accent of this.accents) {
            const { sprite, tell } = accent;
            if (tell.style === 'aura') {
                sprite.setPosition(k.x, k.y);
                sprite.setAlpha(0.11 + 0.05 * Math.sin(this.clock * 2 + accent.phase));
                continue;
            }
            const angle = this.clock * ORBIT_SPEED + accent.phase;
            sprite.setPosition(
                k.x + Math.cos(angle) * accent.radius,
                k.y + Math.sin(angle) * accent.radius * 0.6,
            );
            if (tell.style === 'spark') {
                sprite.setAlpha(0.3 + 0.35 * Math.abs(Math.sin(this.clock * 5 + accent.phase)));
            }
        }
    }

    destroy(): void {
        this.bus.off('relic/acquired', this.onRelicAcquired);
        for (const accent of this.accents) {
            accent.sprite.destroy();
        }
        this.accents = [];
    }
}
