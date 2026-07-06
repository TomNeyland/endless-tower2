/**
 * The relic belt — the HUD strip of owned tells, plus the wallet readout
 * (coins are economy; the belt is where the build and its purse live).
 * UI whispers: small, top-right corner, no text beyond the coin count. Each
 * owned relic shows as its tell-colored stone in acquisition order — the
 * build readable at a glance, matching the accents on the character.
 *
 * Pure bus consumer: relic/acquired grows the strip, coin events tick the
 * wallet, and the initial state comes from RunState at construction.
 */
import type { GameObjects, Scene } from 'phaser';
import type { CoinCollectedEvent, CoinSpentEvent, EventBus } from '../../core/events';
import { relicById } from '../../core/relics/roster';
import type { RunState } from '../../core/run/state';
import { Atlas, Gen, HudFrame } from '../assets';
import { GAME_WIDTH } from '../main';

const DEPTH = 30;
const RIGHT_MARGIN = 16;
const COIN_Y = 18;
const BELT_Y = 56;
const STONE_SPACING = 22;
const STONES_PER_ROW = 8;

export class RelicBelt {
    private readonly scene: Scene;
    private readonly bus: EventBus;
    private readonly run: RunState;

    private coinIcon: GameObjects.Image;
    private coinText: GameObjects.Text;
    private stones: GameObjects.Image[] = [];

    private readonly onRelicAcquired = (): void => this.rebuildStones();

    private readonly onCoins = (e: CoinCollectedEvent | CoinSpentEvent): void => {
        this.coinText.setText(`${e.total}`);
        this.scene.tweens.add({
            targets: [this.coinIcon, this.coinText],
            scale: { from: 1.15, to: 1 },
            duration: 110,
        });
    };

    constructor(scene: Scene, bus: EventBus, run: RunState) {
        this.scene = scene;
        this.bus = bus;
        this.run = run;

        this.coinText = scene.add
            .text(GAME_WIDTH - RIGHT_MARGIN, COIN_Y, `${run.coins}`, {
                fontFamily: 'Arial Black',
                fontSize: 20,
                color: '#ffd24a',
                stroke: '#1a2733',
                strokeThickness: 4,
            })
            .setOrigin(1, 0.5)
            .setScrollFactor(0)
            .setDepth(DEPTH);
        this.coinIcon = scene.add
            .image(this.coinText.x - this.coinText.width - 8, COIN_Y, Atlas.tiles, HudFrame.coin)
            .setScale(0.35)
            .setOrigin(1, 0.5)
            .setScrollFactor(0)
            .setDepth(DEPTH);

        this.rebuildStones();
        bus.on('relic/acquired', this.onRelicAcquired);
        bus.on('coin/collected', this.onCoins);
        bus.on('coin/spent', this.onCoins);
    }

    private rebuildStones(): void {
        for (const stone of this.stones) {
            stone.destroy();
        }
        this.stones = [];
        const ids = this.run.relicIds();
        ids.forEach((id, i) => {
            const tell = relicById(id).tell;
            const col = i % STONES_PER_ROW;
            const row = Math.floor(i / STONES_PER_ROW);
            const x = GAME_WIDTH - RIGHT_MARGIN - 6 - col * STONE_SPACING;
            const y = BELT_Y + row * STONE_SPACING;
            this.stones.push(
                this.scene.add
                    .image(x, y, Gen.glow)
                    .setScale(0.42)
                    .setTint(tell.color)
                    .setBlendMode('ADD')
                    .setAlpha(0.95)
                    .setScrollFactor(0)
                    .setDepth(DEPTH),
            );
        });
        // Coin icon hugs the count as digits grow.
        this.coinIcon.setX(this.coinText.x - this.coinText.width - 8);
    }

    destroy(): void {
        this.bus.off('relic/acquired', this.onRelicAcquired);
        this.bus.off('coin/collected', this.onCoins);
        this.bus.off('coin/spent', this.onCoins);
        this.coinIcon.destroy();
        this.coinText.destroy();
        for (const stone of this.stones) {
            stone.destroy();
        }
    }
}
