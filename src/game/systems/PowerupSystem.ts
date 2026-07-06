/**
 * Timed powerups at the Phaser boundary. Defs, placement, and durations are
 * core data (core/powerups.ts, seeded); this system renders the visible
 * spawns, detects pickup on the player's kinematics, pushes the temporary
 * tuning layers (owner `powerup:<id>`), auto-pops them on expiry, and emits
 * the powerup/started|expired facts. Re-picking an active powerup refreshes
 * its clock — pop-then-push, never stacked (removeByOwner is the contract's
 * pop primitive, so a powerup pop can never eat a relic's layers).
 *
 * A small HUD chip row (icon + draining bar) keeps active spice legible —
 * whisper-sized, corner-adjacent, per art-direction's "UI whispers".
 */
import type { GameObjects, Scene } from 'phaser';
import type { EventBus } from '../../core/events';
import {
    placeSegmentPowerups,
    type PowerupDef,
    powerupById,
    type PowerupId,
    validatePowerupDef,
} from '../../core/powerups';
import type { SegmentSpec } from '../../core/pressure/segment';
import type { TowerLayout } from '../../core/tower';
import type { TuningStack } from '../../core/tuning';
import { Atlas, Gen, TileFrame } from '../assets';
import { GAME_WIDTH } from '../main';
import type { PlayerSystem } from '../player/PlayerSystem';

const PICKUP_RADIUS_PX = 46;
const SPAWN_DEPTH = 4;
const CHIP_DEPTH = 30;
const CHIP_W = 64;
const CHIP_H = 6;

const SPAWN_FRAME: Record<PowerupId, string> = {
    'spring-shoes': TileFrame.powerupSpring,
    'coin-storm': TileFrame.powerupCoinStorm,
    ghost: TileFrame.powerupGhost,
    overdrive: TileFrame.powerupOverdrive,
};

interface ActivePowerup {
    def: PowerupDef;
    startedTick: number;
    expiresAtTick: number;
    chip: GameObjects.Container;
    fill: GameObjects.Rectangle;
}

export class PowerupSystem {
    private readonly scene: Scene;
    private readonly t: TuningStack;
    private readonly bus: EventBus;
    private readonly player: PlayerSystem;

    private spawnSprites = new Map<number, { sprite: GameObjects.Image; type: PowerupId }>();
    private active = new Map<PowerupId, ActivePowerup>();
    private layerSeq = 0;

    constructor(
        scene: Scene,
        layout: TowerLayout,
        spec: SegmentSpec,
        tuning: TuningStack,
        bus: EventBus,
        player: PlayerSystem,
    ) {
        this.scene = scene;
        this.t = tuning;
        this.bus = bus;
        this.player = player;

        for (const spawn of placeSegmentPowerups(spec, layout, tuning)) {
            const def = powerupById(spawn.type);
            validatePowerupDef(def);
            const sprite = scene.add
                .image(spawn.x, spawn.y, Atlas.tiles, SPAWN_FRAME[spawn.type])
                .setScale(0.5)
                .setDepth(SPAWN_DEPTH);
            const glow = scene.add
                .image(spawn.x, spawn.y, Gen.glow)
                .setScale(1.1)
                .setTint(def.tint)
                .setBlendMode('ADD')
                .setAlpha(0.3)
                .setDepth(SPAWN_DEPTH - 1);
            sprite.once('destroy', () => glow.destroy());
            // Visible on approach: a gentle bob sells "this is a pickup".
            scene.tweens.add({
                targets: [sprite, glow],
                y: spawn.y - 8,
                duration: 900,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
            this.spawnSprites.set(spawn.id, { sprite, type: spawn.type });
        }
    }

    update(): void {
        const kin = this.player.kinematics();

        for (const [id, spawn] of this.spawnSprites) {
            const dx = spawn.sprite.x - kin.x;
            const dy = spawn.sprite.y - kin.y;
            if (dx * dx + dy * dy <= PICKUP_RADIUS_PX * PICKUP_RADIUS_PX) {
                this.spawnSprites.delete(id);
                spawn.sprite.destroy();
                this.collect(spawn.type, kin.tick);
            }
        }

        for (const [id, live] of this.active) {
            if (kin.tick >= live.expiresAtTick) {
                this.expire(id, live, kin.tick);
                continue;
            }
            const total = live.expiresAtTick - live.startedTick;
            live.fill.width = CHIP_W * Math.max(0, (live.expiresAtTick - kin.tick) / total);
        }
    }

    private collect(type: PowerupId, tick: number): void {
        const def = powerupById(type);
        const owner = `powerup:${def.id}`;
        const existing = this.active.get(type);
        if (existing) {
            // Refresh, never stack: pop this powerup's own layers first.
            this.t.removeByOwner(owner);
            existing.chip.destroy();
            this.active.delete(type);
        }
        for (const spec of def.layers) {
            this.t.pushLayer({
                id: `${owner}:${this.layerSeq++}`,
                owner,
                key: spec.key,
                op: spec.op,
                value: spec.value,
                tick,
            });
        }
        this.active.set(type, {
            def,
            startedTick: tick,
            expiresAtTick: tick + def.durationTicks,
            ...this.makeChip(def),
        });
        this.layoutChips();
        this.bus.emit({
            type: 'powerup/started',
            tick,
            id: def.id,
            durationTicks: def.durationTicks,
        });
    }

    private expire(id: PowerupId, live: ActivePowerup, tick: number): void {
        this.t.removeByOwner(`powerup:${id}`);
        live.chip.destroy();
        this.active.delete(id);
        this.layoutChips();
        this.bus.emit({
            type: 'powerup/expired',
            tick,
            id,
            durationTicks: live.def.durationTicks,
        });
    }

    private makeChip(def: PowerupDef): {
        chip: GameObjects.Container;
        fill: GameObjects.Rectangle;
    } {
        const icon = this.scene.add
            .image(0, 0, Atlas.tiles, SPAWN_FRAME[def.id])
            .setScale(0.28)
            .setOrigin(0, 0.5);
        const back = this.scene.add
            .rectangle(24, 0, CHIP_W, CHIP_H, 0x10202e, 0.75)
            .setOrigin(0, 0.5);
        const fill = this.scene.add
            .rectangle(24, 0, CHIP_W, CHIP_H - 2, def.tint, 1)
            .setOrigin(0, 0.5);
        const chip = this.scene.add
            .container(0, 0, [icon, back, fill])
            .setScrollFactor(0)
            .setDepth(CHIP_DEPTH);
        return { chip, fill };
    }

    /** Stack active chips down the right edge, whisper-sized. */
    private layoutChips(): void {
        let i = 0;
        for (const live of this.active.values()) {
            live.chip.setPosition(GAME_WIDTH - 116, 96 + i * 26);
            i += 1;
        }
    }

    destroy(): void {
        for (const spawn of this.spawnSprites.values()) {
            spawn.sprite.destroy();
        }
        this.spawnSprites.clear();
        for (const live of this.active.values()) {
            // Scene teardown rebuilds the stack fresh; pop anyway so a future
            // shared-stack owner never inherits a dead powerup.
            this.t.removeByOwner(`powerup:${live.def.id}`);
            live.chip.destroy();
        }
        this.active.clear();
    }
}
