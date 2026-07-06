/**
 * One small persistent audio surface: a top-right mute toggle that writes
 * through the save's sanctioned settings path. The button changes only the
 * Phaser master volume and the saved masterVolume value; event-level mix
 * choices still belong to AudioSystem/audio.md.
 */
import type { GameObjects, Scene } from 'phaser';
import { DEFAULT_MASTER_VOLUME } from '../../core/persist/save';
import { saveStore } from '../meta/SaveStore';

const PAD = 18;

export class MuteButton {
    private readonly scene: Scene;
    private readonly label: GameObjects.Text;

    private readonly onPointerDown = (): void => {
        const current = saveStore().settings().masterVolume;
        const next = current > 0 ? 0 : DEFAULT_MASTER_VOLUME;
        saveStore().updateSettings({ masterVolume: next });
        this.scene.sound.volume = next;
        this.refresh(next);
    };

    constructor(scene: Scene) {
        this.scene = scene;
        const volume = saveStore().settings().masterVolume;
        scene.sound.volume = volume;
        this.label = scene.add
            .text(scene.scale.width - PAD, PAD, this.face(volume), {
                fontFamily: 'Arial Black',
                fontSize: 14,
                color: '#ffffff',
                backgroundColor: '#07111fcc',
                padding: { x: 10, y: 6 },
                stroke: '#1a3a5c',
                strokeThickness: 3,
            })
            .setOrigin(1, 0)
            .setScrollFactor(0)
            .setDepth(1000)
            .setInteractive({ useHandCursor: true });
        this.label.on('pointerdown', this.onPointerDown);
        scene.events.once('shutdown', () => this.destroy());
    }

    private refresh(volume: number): void {
        this.label.setText(this.face(volume));
    }

    private face(volume: number): string {
        return volume > 0 ? 'MUTE' : 'UNMUTE';
    }

    private destroy(): void {
        this.label.off('pointerdown', this.onPointerDown);
        this.label.destroy();
    }
}
