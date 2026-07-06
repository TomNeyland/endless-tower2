/**
 * Keyboard to InputFrame, latched once per physics step — never per render
 * frame. Arrows/WASD move, Space/Z jump; on touch devices, FlappyTower
 * supplies auto-paced axis plus one-button jump facts through the same
 * contract.
 */
import { Input, type Scene } from 'phaser';
import type { EventBus } from '../../core/events';
import type { InputFrame } from '../../core/movement/state';
import type { TowerLayout } from '../../core/tower';
import type { TuningStack } from '../../core/tuning';
import { FlappyTowerControls } from './FlappyTowerControls';

const KC = Input.Keyboard.KeyCodes;

export interface InputSampleContext {
    x: number;
    vx: number;
    grounded: boolean;
    platformId: number | null;
}

export class InputMap {
    private keys: {
        left: Input.Keyboard.Key[];
        right: Input.Keyboard.Key[];
        jump: Input.Keyboard.Key[];
    };
    private prevJumpHeld = false;
    private readonly keyboard: Input.Keyboard.KeyboardPlugin;
    private readonly flappy: FlappyTowerControls | null;

    constructor(scene: Scene, layout: TowerLayout, tuning: TuningStack, bus: EventBus) {
        const keyboard = scene.input.keyboard;
        if (!keyboard) {
            throw new Error('InputMap: keyboard plugin unavailable');
        }
        this.keyboard = keyboard;
        this.keys = {
            left: [keyboard.addKey(KC.LEFT), keyboard.addKey(KC.A)],
            right: [keyboard.addKey(KC.RIGHT), keyboard.addKey(KC.D)],
            jump: [keyboard.addKey(KC.SPACE), keyboard.addKey(KC.Z)],
        };
        const device = scene.sys.game.device;
        this.flappy = device.input.touch && !device.os.desktop
            ? new FlappyTowerControls(scene, layout, tuning, bus)
            : null;
    }

    /** Sample the current key state as this tick's InputFrame. */
    sample(ctx: InputSampleContext): InputFrame {
        const flappy = this.flappy?.sample(ctx);
        const keyboardJumpHeld = this.keys.jump.some((k) => k.isDown);
        const axisX = flappy?.axisX ?? this.keyboardAxis();
        const jumpHeld = flappy ? flappy.jumpHeld : keyboardJumpHeld;
        const frame: InputFrame = {
            axisX,
            jumpPressedEdge: jumpHeld && !this.prevJumpHeld,
            jumpHeld,
        };
        this.prevJumpHeld = jumpHeld;
        return frame;
    }

    private keyboardAxis(): InputFrame['axisX'] {
        const left = this.keys.left.some((k) => k.isDown);
        const right = this.keys.right.some((k) => k.isDown);
        return left === right ? 0 : left ? -1 : 1;
    }

    destroy(): void {
        this.flappy?.destroy();
        for (const group of [this.keys.left, this.keys.right, this.keys.jump]) {
            for (const key of group) {
                this.keyboard.removeKey(key);
            }
        }
    }
}
