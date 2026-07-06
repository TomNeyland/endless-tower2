/**
 * The camera rig. Iron law: reads player kinematics, nothing else, ever.
 * X locked (the tower is exactly canvas-wide), Y follows a proxy: anchored
 * fraction of screen height, velocity lookahead with its own lerp, asymmetric
 * follow lerps (falls never yank), no deadzone, follows down freely — upward
 * pressure is the death line's job and the camera will never know it exists.
 * Shake is applied post-transform by the juice layer; deleting juice leaves
 * a perfect camera.
 */
import type { Cameras, Scene } from 'phaser';
import type { TuningStack } from '../../core/tuning';
import type { PlayerSystem } from '../player/PlayerSystem';

export class CameraRig {
    private readonly camera: Cameras.Scene2D.Camera;
    private readonly player: PlayerSystem;
    private readonly t: TuningStack;
    private look = 0;

    constructor(scene: Scene, player: PlayerSystem, tuning: TuningStack) {
        this.camera = scene.cameras.main;
        this.player = player;
        this.t = tuning;
        this.snap();
    }

    /** Center immediately (spawn/reset) — no lerp from nowhere. */
    snap(): void {
        const k = this.player.kinematics();
        this.look = 0;
        this.camera.setScroll(0, this.targetScrollY(k.y));
    }

    private targetScrollY(focusY: number): number {
        return focusY - this.t.value('CAM_ANCHOR') * this.camera.height;
    }

    update(): void {
        const k = this.player.kinematics();
        const clampPx = this.t.value('CAM_LOOKAHEAD_CLAMP');
        const lookTarget = Math.max(
            -clampPx,
            Math.min(clampPx, k.vy * this.t.value('CAM_LOOKAHEAD_TIME')),
        );
        this.look += (lookTarget - this.look) * this.t.value('CAM_LOOKAHEAD_LERP');

        const target = this.targetScrollY(k.y + this.look);
        const current = this.camera.scrollY;
        const lerp = target < current ? this.t.value('CAM_LERP_UP') : this.t.value('CAM_LERP_DOWN');
        this.camera.setScroll(0, current + (target - current) * lerp);
    }
}
