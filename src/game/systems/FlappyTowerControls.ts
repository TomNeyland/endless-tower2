/**
 * FlappyTower: one-button mobile input policy. It produces ordinary
 * InputFrame facts only; movement, combo, bosses, coins, and replay remain
 * the same systems.
 */
import type { GameObjects, Input, Scene } from 'phaser';
import type { EventBus, EventOf } from '../../core/events';
import type { TowerLayout } from '../../core/tower';
import type { TuningStack } from '../../core/tuning';
import { GAME_HEIGHT, GAME_WIDTH } from '../dims';
import type { InputSampleContext } from './InputMap';
import {
    FlappyTowerAutoRunner,
    type FlappyTowerAxis,
    type FlappyTowerTuning,
} from './FlappyTowerAutoRunner';

const DEPTH = 1200;
const BUTTON_X = GAME_WIDTH - 140;
const BUTTON_Y = GAME_HEIGHT - 124;
const BUTTON_RADIUS = 92;
const BUTTON_ZONE_TOP = GAME_HEIGHT - 270;

export class FlappyTowerControls {
    private readonly scene: Scene;
    private readonly bus: EventBus;
    private readonly t: TuningStack;
    private readonly runner: FlappyTowerAutoRunner;
    private readonly objects: GameObjects.GameObject[] = [];
    private readonly jumpPointerIds = new Set<number>();

    private buttonFace!: GameObjects.Arc;
    private chargeRing!: GameObjects.Arc;
    private hintText!: GameObjects.Text;
    private lastCharge = 0;

    private readonly onPointerDown = (pointer: Input.Pointer): void => {
        this.jumpPointerIds.add(pointer.id);
        this.refresh(this.lastCharge);
    };

    private readonly onPointerUp = (pointer: Input.Pointer): void => {
        this.jumpPointerIds.delete(pointer.id);
        this.refresh(this.lastCharge);
    };

    private readonly onSpawn = (_event: EventOf<'movement/spawn'>): void => {
        this.runner.onSpawn();
    };

    private readonly onLand = (event: EventOf<'movement/land'>): void => {
        this.runner.onLand(event, this.tuning());
    };

    private readonly onWallBounce = (event: EventOf<'movement/wall_bounce'>): void => {
        this.runner.onWallBounce(event);
    };

    constructor(scene: Scene, layout: TowerLayout, tuning: TuningStack, bus: EventBus) {
        this.scene = scene;
        this.bus = bus;
        this.t = tuning;
        this.runner = new FlappyTowerAutoRunner(layout.platforms);
        this.build();
        bus.on('movement/spawn', this.onSpawn);
        bus.on('movement/land', this.onLand);
        bus.on('movement/wall_bounce', this.onWallBounce);
    }

    sample(ctx: InputSampleContext): { axisX: FlappyTowerAxis; jumpHeld: boolean } {
        const axisX = this.runner.axis(ctx, this.tuning());
        this.lastCharge = Math.min(1, Math.abs(ctx.vx) / this.t.value('MAX_RUN_SPEED'));
        this.refresh(this.lastCharge);
        return { axisX, jumpHeld: this.jumpPointerIds.size > 0 };
    }

    private tuning(): FlappyTowerTuning {
        return {
            edgeGuardPx: this.t.value('flappytower.edgeGuardPx'),
            edgeGuardRunwayFrac: this.t.value('flappytower.edgeGuardRunwayFrac'),
            directionSeedSpeed: this.t.value('flappytower.directionSeedSpeed'),
        };
    }

    private build(): void {
        const buttonZone = this.scene.add
            .zone(0, BUTTON_ZONE_TOP, GAME_WIDTH, GAME_HEIGHT - BUTTON_ZONE_TOP)
            .setOrigin(0)
            .setScrollFactor(0)
            .setDepth(DEPTH)
            .setInteractive();
        buttonZone.on('pointerdown', this.onPointerDown);
        this.scene.input.on('pointerup', this.onPointerUp);
        this.scene.input.on('pointerupoutside', this.onPointerUp);

        this.buttonFace = this.scene.add
            .circle(BUTTON_X, BUTTON_Y, BUTTON_RADIUS, 0x07111f, 0.58)
            .setStrokeStyle(5, 0xffd166, 0.72)
            .setScrollFactor(0)
            .setDepth(DEPTH);
        this.chargeRing = this.scene.add
            .circle(BUTTON_X, BUTTON_Y, BUTTON_RADIUS + 12, 0xff8c42, 0.08)
            .setStrokeStyle(6, 0xff8c42, 0.42)
            .setScrollFactor(0)
            .setDepth(DEPTH - 1);
        const launchText = this.scene.add
            .text(BUTTON_X, BUTTON_Y - 10, 'LAUNCH', {
                fontFamily: 'Arial Black',
                fontSize: 24,
                color: '#ffe4a8',
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(DEPTH + 1);
        this.hintText = this.scene.add
            .text(BUTTON_X, BUTTON_Y + 24, 'tap / hold', {
                fontFamily: 'Arial Black',
                fontSize: 14,
                color: '#dcecff',
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(DEPTH + 1)
            .setAlpha(0.82);
        const guide = this.scene.add
            .text(40, GAME_HEIGHT - 238, ['FLAPPY TOWER', 'tap to spend speed', 'release to cut'].join('\n'), {
                fontFamily: 'Arial Black',
                fontSize: 16,
                color: '#dcecff',
                stroke: '#07111f',
                strokeThickness: 4,
                lineSpacing: 6,
            })
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(DEPTH + 1)
            .setAlpha(0.86);

        this.objects.push(buttonZone, this.chargeRing, this.buttonFace, launchText, this.hintText, guide);
    }

    private refresh(charge: number): void {
        const held = this.jumpPointerIds.size > 0;
        this.buttonFace.setFillStyle(held ? 0x1b2a3e : 0x07111f, held ? 0.86 : 0.58);
        this.chargeRing.setScale(1 + charge * 0.18);
        this.chargeRing.setAlpha(0.22 + charge * 0.55);
        this.hintText.setText(held ? 'hold height' : charge >= 0.7 ? 'speed charged' : 'tap / hold');
    }

    destroy(): void {
        this.bus.off('movement/spawn', this.onSpawn);
        this.bus.off('movement/land', this.onLand);
        this.bus.off('movement/wall_bounce', this.onWallBounce);
        this.scene.input.off('pointerup', this.onPointerUp);
        this.scene.input.off('pointerupoutside', this.onPointerUp);
        for (const obj of this.objects) {
            obj.destroy();
        }
        this.objects.length = 0;
        this.jumpPointerIds.clear();
    }
}
