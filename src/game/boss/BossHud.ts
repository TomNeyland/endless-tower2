/**
 * BossHud — SUPPORTING cast by design (bosses.md: the body is the real
 * health bar). A name card in the display face for the entrance beat, then
 * a thin top-center hp bar with phase notches. UI whispers; the tower is
 * the show (art-direction.md).
 */
import type { GameObjects, Scene } from 'phaser';
import type { BossDefeatedEvent, BossHitEvent, BossSpawnedEvent, EventBus } from '../../core/events';
import type { BossSystem } from './BossSystem';
import { GAME_WIDTH } from '../main';

const BAR_W = 360;
const BAR_H = 7;
const BAR_Y = 30;

export class BossHud {
    private readonly scene: Scene;
    private readonly bus: EventBus;
    private readonly boss: BossSystem;

    private barBack: GameObjects.Rectangle | null = null;
    private barFill: GameObjects.Rectangle | null = null;
    private nameLabel: GameObjects.Text | null = null;
    private notches: GameObjects.Rectangle[] = [];

    private readonly onSpawned = (e: BossSpawnedEvent): void => {
        // The name card — the display face, front and center, then gone.
        const name = this.scene.add
            .text(GAME_WIDTH / 2, 250, e.name, {
                fontFamily: 'Arial Black',
                fontSize: 44,
                color: '#ffe9c4',
                stroke: '#241205',
                strokeThickness: 8,
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(40)
            .setAlpha(0);
        const epithet = this.scene.add
            .text(GAME_WIDTH / 2, 300, this.boss.def.presentation.epithet, {
                fontFamily: 'Arial Black',
                fontSize: 17,
                color: '#d8b890',
                stroke: '#241205',
                strokeThickness: 5,
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(40)
            .setAlpha(0);
        this.scene.tweens.add({
            targets: [name, epithet],
            alpha: { from: 0, to: 1 },
            duration: 450,
            hold: 1700,
            yoyo: true,
            onComplete: () => {
                name.destroy();
                epithet.destroy();
            },
        });
        this.buildBar(e.name);
    };

    private readonly onHit = (_e: BossHitEvent): void => {
        // The bar reads per frame (update); a hit just pings the label.
        this.nameLabel?.setAlpha(1);
    };

    private readonly onDefeated = (_e: BossDefeatedEvent): void => {
        this.scene.tweens.add({
            targets: [this.barBack, this.barFill, this.nameLabel, ...this.notches],
            alpha: 0,
            delay: 700,
            duration: 700,
        });
    };

    constructor(scene: Scene, bus: EventBus, boss: BossSystem) {
        this.scene = scene;
        this.bus = bus;
        this.boss = boss;
        bus.on('boss/spawned', this.onSpawned);
        bus.on('boss/hit', this.onHit);
        bus.on('boss/defeated', this.onDefeated);
    }

    private buildBar(name: string): void {
        const x = GAME_WIDTH / 2 - BAR_W / 2;
        this.barBack = this.scene.add
            .rectangle(x, BAR_Y, BAR_W, BAR_H, 0x1c0f08, 0.8)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(32);
        this.barFill = this.scene.add
            .rectangle(x + 1, BAR_Y, BAR_W - 2, BAR_H - 2, 0xc94f2a, 1)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(33);
        // Phase notches at 2/3 and 1/3 — the turns are visible ahead of time.
        for (const frac of [2 / 3, 1 / 3]) {
            this.notches.push(
                this.scene.add
                    .rectangle(x + BAR_W * frac, BAR_Y, 2, BAR_H + 4, 0xffe9c4, 0.9)
                    .setOrigin(0.5)
                    .setScrollFactor(0)
                    .setDepth(34),
            );
        }
        this.nameLabel = this.scene.add
            .text(GAME_WIDTH / 2, BAR_Y + 16, name, {
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#d8b890',
            })
            .setOrigin(0.5, 0)
            .setScrollFactor(0)
            .setDepth(32)
            .setAlpha(0.8);
    }

    update(): void {
        if (this.barFill) {
            const frac = Math.max(0, this.boss.health.hpRemaining() / this.boss.health.hpMax);
            this.barFill.setScale(frac, 1);
            this.barFill.setFillStyle(frac <= 1 / 3 ? 0xe8a02a : 0xc94f2a, 1);
        }
    }

    destroy(): void {
        this.bus.off('boss/spawned', this.onSpawned);
        this.bus.off('boss/hit', this.onHit);
        this.bus.off('boss/defeated', this.onDefeated);
        this.barBack?.destroy();
        this.barFill?.destroy();
        this.nameLabel?.destroy();
        for (const notch of this.notches) {
            notch.destroy();
        }
    }
}
