/**
 * Mobile hands: visible thumb zones that produce the same per-tick facts as
 * the keyboard InputMap. Presentation/input-shell only; core still receives
 * one deterministic InputFrame per fixed step.
 */
import type { GameObjects, Input, Scene } from 'phaser';
import type { InputFrame } from '../../core/movement/state';
import { GAME_HEIGHT, GAME_WIDTH } from '../dims';

type Axis = InputFrame['axisX'];

const DEPTH = 1200;
const MOVE_TOP = GAME_HEIGHT - 238;
const MOVE_WIDTH = 390;
const MOVE_SPLIT_X = 195;
const MOVE_CENTER_Y = GAME_HEIGHT - 112;
const JUMP_X = GAME_WIDTH - 124;
const JUMP_Y = GAME_HEIGHT - 116;
const JUMP_RADIUS = 82;

export class TouchControls {
    private readonly scene: Scene;
    private readonly objects: GameObjects.GameObject[] = [];
    private movePointerId: number | null = null;
    private readonly jumpPointerIds = new Set<number>();
    private axisX: Axis = 0;
    private leftFace!: GameObjects.Rectangle;
    private rightFace!: GameObjects.Rectangle;
    private jumpFace!: GameObjects.Arc;

    private readonly onMoveDown = (pointer: Input.Pointer): void => {
        this.movePointerId = pointer.id;
        this.axisX = pointer.x < MOVE_SPLIT_X ? -1 : 1;
        this.refresh();
    };

    private readonly onJumpDown = (pointer: Input.Pointer): void => {
        this.jumpPointerIds.add(pointer.id);
        this.refresh();
    };

    private readonly onPointerMove = (pointer: Input.Pointer): void => {
        if (pointer.id === this.movePointerId) {
            this.axisX = pointer.x < MOVE_SPLIT_X ? -1 : 1;
            this.refresh();
        }
    };

    private readonly onPointerUp = (pointer: Input.Pointer): void => {
        if (pointer.id === this.movePointerId) {
            this.movePointerId = null;
            this.axisX = 0;
        }
        this.jumpPointerIds.delete(pointer.id);
        this.refresh();
    };

    constructor(scene: Scene) {
        this.scene = scene;
        this.build();
        scene.input.on('pointermove', this.onPointerMove);
        scene.input.on('pointerup', this.onPointerUp);
        scene.input.on('pointerupoutside', this.onPointerUp);
        scene.events.once('shutdown', () => this.destroy());
    }

    sample(): { axisX: Axis; jumpHeld: boolean } {
        return { axisX: this.axisX, jumpHeld: this.jumpPointerIds.size > 0 };
    }

    private build(): void {
        const moveZone = this.scene.add
            .zone(0, MOVE_TOP, MOVE_WIDTH, GAME_HEIGHT - MOVE_TOP)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(DEPTH)
            .setInteractive();
        moveZone.on('pointerdown', this.onMoveDown);

        this.leftFace = this.scene.add
            .rectangle(86, MOVE_CENTER_Y, 132, 126, 0x07111f, 0.42)
            .setStrokeStyle(3, 0x87ceeb, 0.6)
            .setScrollFactor(0)
            .setDepth(DEPTH);
        this.rightFace = this.scene.add
            .rectangle(250, MOVE_CENTER_Y, 132, 126, 0x07111f, 0.42)
            .setStrokeStyle(3, 0x87ceeb, 0.6)
            .setScrollFactor(0)
            .setDepth(DEPTH);
        const leftLabel = this.scene.add
            .text(86, MOVE_CENTER_Y, '←', {
                fontFamily: 'Arial Black',
                fontSize: 44,
                color: '#dcecff',
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(DEPTH + 1);
        const rightLabel = this.scene.add
            .text(250, MOVE_CENTER_Y, '→', {
                fontFamily: 'Arial Black',
                fontSize: 44,
                color: '#dcecff',
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(DEPTH + 1);

        const jumpZone = this.scene.add
            .zone(JUMP_X, JUMP_Y, JUMP_RADIUS * 2, JUMP_RADIUS * 2)
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(DEPTH)
            .setInteractive();
        jumpZone.on('pointerdown', this.onJumpDown);
        this.jumpFace = this.scene.add
            .circle(JUMP_X, JUMP_Y, JUMP_RADIUS, 0x07111f, 0.46)
            .setStrokeStyle(4, 0xffd166, 0.68)
            .setScrollFactor(0)
            .setDepth(DEPTH);
        const jumpLabel = this.scene.add
            .text(JUMP_X, JUMP_Y - 2, 'JUMP', {
                fontFamily: 'Arial Black',
                fontSize: 24,
                color: '#ffe4a8',
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(DEPTH + 1);

        this.objects.push(
            moveZone,
            this.leftFace,
            this.rightFace,
            leftLabel,
            rightLabel,
            jumpZone,
            this.jumpFace,
            jumpLabel,
        );
    }

    private refresh(): void {
        this.leftFace.setFillStyle(0x07111f, this.axisX === -1 ? 0.72 : 0.42);
        this.rightFace.setFillStyle(0x07111f, this.axisX === 1 ? 0.72 : 0.42);
        this.jumpFace.setFillStyle(0x07111f, this.jumpPointerIds.size > 0 ? 0.78 : 0.46);
    }

    destroy(): void {
        this.scene.input.off('pointermove', this.onPointerMove);
        this.scene.input.off('pointerup', this.onPointerUp);
        this.scene.input.off('pointerupoutside', this.onPointerUp);
        for (const obj of this.objects) {
            obj.destroy();
        }
        this.objects.length = 0;
        this.jumpPointerIds.clear();
    }
}
