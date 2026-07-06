/**
 * Keyboard to InputFrame, latched once per physics step — never per render
 * frame (fixedStep runs 0..n steps per frame; latch per step or replays
 * diverge). Arrows/WASD move, Space/Z jump.
 */
import { Input, type Scene } from 'phaser';
import type { InputFrame } from '../../core/movement/state';

const KC = Input.Keyboard.KeyCodes;

export class InputMap {
    private keys: {
        left: Input.Keyboard.Key[];
        right: Input.Keyboard.Key[];
        jump: Input.Keyboard.Key[];
    };
    private prevJumpHeld = false;
    private readonly keyboard: Input.Keyboard.KeyboardPlugin;

    constructor(scene: Scene) {
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
    }

    /** Sample the current key state as this tick's InputFrame. */
    sample(): InputFrame {
        const left = this.keys.left.some((k) => k.isDown);
        const right = this.keys.right.some((k) => k.isDown);
        const jumpHeld = this.keys.jump.some((k) => k.isDown);
        const axisX: -1 | 0 | 1 = left === right ? 0 : left ? -1 : 1;
        const frame: InputFrame = {
            axisX,
            jumpPressedEdge: jumpHeld && !this.prevJumpHeld,
            jumpHeld,
        };
        this.prevJumpHeld = jumpHeld;
        return frame;
    }

    destroy(): void {
        for (const group of [this.keys.left, this.keys.right, this.keys.jump]) {
            for (const key of group) {
                this.keyboard.removeKey(key);
            }
        }
    }
}
