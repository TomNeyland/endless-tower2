/**
 * Shoutout cards — the escalation ladder's world-space voice. One card at a
 * time, near the player (never center-screen), rise-and-fade 600ms, display
 * face per tier ("BLAZING", "BEYOND ×3"). Light is the theme: the warm ramp
 * climbs toward "a god-run is a comet".
 */
import type { GameObjects, Scene } from 'phaser';
import type { ComboBus } from '../../core/combo/bus';
import type { ComboTierEvent } from '../../core/combo/types';

/** Warm color ramp per tier index (SPARK -> BEYOND). */
export const TIER_COLORS = [
    '#fff3c4',
    '#ffe28a',
    '#ffc95e',
    '#ffb03a',
    '#ff9526',
    '#ff7b1c',
    '#ff5e14',
    '#ff3d0f',
];

export function tierColor(tierIndex: number): string {
    return TIER_COLORS[Math.min(tierIndex, TIER_COLORS.length - 1)];
}

const CARD_DEPTH = 15;

export class ComboCards {
    private readonly scene: Scene;
    private readonly comboBus: ComboBus;
    private card: GameObjects.Text | null = null;

    private readonly onTier = (e: ComboTierEvent): void => {
        this.card?.destroy();
        const face = e.repeatIndex > 0 ? `${e.tierName} ×${e.repeatIndex + 1}` : e.tierName;
        const card = this.scene.add
            .text(e.x, e.y - 90, face, {
                fontFamily: 'Arial Black',
                fontSize: 30,
                color: tierColor(e.tierIndex),
                stroke: '#241205',
                strokeThickness: 6,
            })
            .setOrigin(0.5)
            .setDepth(CARD_DEPTH);
        this.card = card;
        this.scene.tweens.add({
            targets: card,
            y: e.y - 136,
            alpha: { from: 1, to: 0 },
            scale: { from: 1.15, to: 1 },
            duration: 600,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                card.destroy();
                if (this.card === card) {
                    this.card = null;
                }
            },
        });
    };

    private readonly onReset = (): void => {
        this.card?.destroy();
        this.card = null;
    };

    constructor(scene: Scene, comboBus: ComboBus) {
        this.scene = scene;
        this.comboBus = comboBus;
        comboBus.on('combo/tier', this.onTier);
        comboBus.on('combo/reset', this.onReset);
    }

    destroy(): void {
        this.comboBus.off('combo/tier', this.onTier);
        this.comboBus.off('combo/reset', this.onReset);
        this.card?.destroy();
    }
}
