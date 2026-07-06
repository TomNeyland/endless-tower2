/**
 * PRESSURE's HUD: hearts, and a gap indicator that appears at danger tiers —
 * plus the restrained bottom-screen-edge treatment (the threat comes from
 * below; the edge glows where it comes from). UI whispers: small, corner,
 * numbers-free (art-direction.md). No debug leakage — everything here is a
 * player-facing surface. Reads PressureSystem's surface per frame; hidden
 * entirely outside segment mode.
 */
import { BlendModes, type GameObjects, type Scene } from 'phaser';
import type { TuningStack } from '../../core/tuning';
import { Atlas, Gen, HudFrame, TileFrame } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import type { PressureSystem } from './PressureSystem';

const HEART_SCALE = 0.55;
const HEART_SPACING = 42;
const HEART_X = 28;
const HEART_Y = 26;
const METER_W = 96;
const METER_H = 8;

export class PressureHud {
    private readonly scene: Scene;
    private readonly pressure: PressureSystem;
    private readonly t: TuningStack;

    private hearts: GameObjects.Image[] = [];
    private meterIcon: GameObjects.Image | null = null;
    private meterBack: GameObjects.Rectangle | null = null;
    private meterFill: GameObjects.Rectangle | null = null;
    private edgeGlow: GameObjects.Image | null = null;

    constructor(scene: Scene, pressure: PressureSystem, tuning: TuningStack) {
        this.scene = scene;
        this.pressure = pressure;
        this.t = tuning;

        if (!pressure.inSegmentMode()) {
            return; // Endless sandbox: no pressure, no HUD, feel gate intact.
            // (Boss arenas ARE segment mode — their door just doesn't exist
            // yet, and the hearts/gap HUD matters most mid-duel.)
        }

        this.buildHeartsRow(pressure.heartsMax());

        // Gap meter: a shrinking ember bar — distance to the fire, no numbers.
        const meterY = HEART_Y + 46;
        this.meterIcon = scene.add
            .image(HEART_X, meterY, Atlas.tiles, TileFrame.fireball)
            .setOrigin(0, 0.5)
            .setScale(0.32)
            .setScrollFactor(0)
            .setDepth(30);
        this.meterBack = scene.add
            .rectangle(HEART_X + 28, meterY, METER_W, METER_H, 0x201410, 0.75)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(30);
        this.meterFill = scene.add
            .rectangle(HEART_X + 28, meterY, METER_W, METER_H - 2, 0xff8c2a, 1)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(31);

        // The screen-edge treatment: a warm glow along the bottom edge,
        // silent until danger, swelling toward critical. Never the camera's
        // business — this is a fixed overlay.
        this.edgeGlow = scene.add
            .image(GAME_WIDTH / 2, GAME_HEIGHT, Gen.glowBand)
            .setDisplaySize(GAME_WIDTH, 150)
            .setOrigin(0.5, 1)
            .setTint(0xff5a1f)
            .setBlendMode(BlendModes.ADD)
            .setScrollFactor(0)
            .setDepth(29)
            .setAlpha(0);

        this.setMeterVisible(false);
    }

    private setMeterVisible(visible: boolean): void {
        this.meterIcon?.setVisible(visible);
        this.meterBack?.setVisible(visible);
        this.meterFill?.setVisible(visible);
    }

    /** (Re)build the hearts row — Thick Skin can raise hearts.max mid-run. */
    private buildHeartsRow(max: number): void {
        for (const heart of this.hearts) {
            heart.destroy();
        }
        this.hearts = [];
        for (let i = 0; i < max; i += 1) {
            this.hearts.push(
                this.scene.add
                    .image(HEART_X + i * HEART_SPACING, HEART_Y, Atlas.tiles, HudFrame.heartFull)
                    .setOrigin(0, 0)
                    .setScale(HEART_SCALE)
                    .setScrollFactor(0)
                    .setDepth(30),
            );
        }
    }

    update(): void {
        if (this.hearts.length === 0) {
            return;
        }
        const max = this.pressure.heartsMax();
        if (max !== this.hearts.length) {
            this.buildHeartsRow(max);
        }
        const remaining = this.pressure.heartsRemaining();
        for (let i = 0; i < this.hearts.length; i += 1) {
            this.hearts[i].setFrame(i < remaining ? HudFrame.heartFull : HudFrame.heartEmpty);
        }

        const gap = this.pressure.gapPx();
        const tier = this.pressure.tier();
        const showMeter = gap !== null && (tier === 'danger' || tier === 'critical');
        this.setMeterVisible(showMeter);

        const dangerPx = this.t.value('line.proximityDangerPx');
        if (showMeter && gap !== null && this.meterFill) {
            const frac = Math.max(0.03, Math.min(1, gap / dangerPx));
            this.meterFill.setScale(frac, 1);
            this.meterFill.setFillStyle(tier === 'critical' ? 0xff4020 : 0xff8c2a, 1);
        }

        if (this.edgeGlow) {
            if (gap === null || tier === 'safe' || tier === 'aware') {
                this.edgeGlow.setAlpha(0);
            } else {
                // 0 at the danger edge, full at the critical marker and in.
                const criticalPx = this.t.value('line.proximityCriticalPx');
                const span = Math.max(1, dangerPx - criticalPx);
                const closeness = Math.max(0, Math.min(1, (dangerPx - gap) / span));
                const pulse =
                    tier === 'critical' ? 0.08 * Math.sin(this.scene.time.now * 0.012) : 0;
                this.edgeGlow.setAlpha(0.1 + 0.3 * closeness + pulse);
            }
        }
    }

    destroy(): void {
        for (const heart of this.hearts) {
            heart.destroy();
        }
        this.meterIcon?.destroy();
        this.meterBack?.destroy();
        this.meterFill?.destroy();
        this.edgeGlow?.destroy();
    }
}
