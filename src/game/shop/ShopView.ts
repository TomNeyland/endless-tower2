/**
 * The shop's rendering surface — chrome, relic cards, the bottom purchase
 * row, and the tell preview (relics-economy.md: "browsing shows full relic
 * text + tell preview on the character"). Pure presentation: every decision
 * (stock, prices, affordability, sold-out) arrives as data from ShopScene,
 * and every interaction returns through a callback. Split from the scene at
 * the wave-2 fix session so the scene keeps only stock + purchase
 * orchestration (the ~300-line law).
 */
import type { GameObjects, Scene } from 'phaser';
import type { RelicRarity } from '../../core/events';
import type { RelicDef } from '../../core/relics/types';
import { Atlas, CharFrame, Gen, HudFrame } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';

const RARITY_COLOR: Record<RelicRarity, number> = {
    common: 0xbfc8d8,
    uncommon: 0x7ae87a,
    rare: 0x6ab8ff,
    legendary: 0xffa03a,
};

const CARD_W = 252;
const CARD_H = 246;
const CARD_GAP = 30;
const CARD_Y = 320;
const ROW_Y = 552;

export interface ShopCardData {
    relic: RelicDef;
    price: number;
    soldOut: boolean;
    affordable: boolean;
    onBuy: () => void;
}

export interface ShopButtonData {
    label: string;
    /** Null renders the button disabled (e.g. hearts already full). */
    onClick: (() => void) | null;
}

export class ShopView {
    private readonly scene: Scene;
    private cardObjs: GameObjects.GameObject[] = [];
    private rowObjs: GameObjects.GameObject[] = [];
    private coinText!: GameObjects.Text;
    private previewAura!: GameObjects.Image;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    /** Scrim, panel, title, wallet readout, and the tell-preview character. */
    buildChrome(coins: number): void {
        const s = this.scene;
        s.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x060a10, 0.74).setOrigin(0);
        s.add
            .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 900, 600, 0x0e1926, 0.97)
            .setStrokeStyle(2, 0x2a4258);
        s.add
            .text(GAME_WIDTH / 2, 128, 'SHOP', {
                fontFamily: 'Arial Black',
                fontSize: 32,
                color: '#e8f4ff',
                stroke: '#1a2733',
                strokeThickness: 5,
            })
            .setOrigin(0.5);
        s.add
            .image(GAME_WIDTH / 2 + 350, 128, Atlas.tiles, HudFrame.coin)
            .setScale(0.4)
            .setOrigin(1, 0.5);
        this.coinText = s.add
            .text(GAME_WIDTH / 2 + 358, 128, `${coins}`, {
                fontFamily: 'Arial Black',
                fontSize: 22,
                color: '#ffd24a',
            })
            .setOrigin(0, 0.5);

        // Tell preview: the character wearing the hovered relic's accent.
        const px = GAME_WIDTH / 2 - 380;
        this.previewAura = s.add
            .image(px, ROW_Y, Gen.glow)
            .setScale(2.4)
            .setBlendMode('ADD')
            .setAlpha(0);
        s.add.sprite(px, ROW_Y, Atlas.characters, CharFrame.front).setScale(0.42);
        s.add
            .text(px, ROW_Y + 46, 'tell preview', {
                fontFamily: 'Arial',
                fontSize: 12,
                color: '#9fb4c8',
            })
            .setOrigin(0.5);
    }

    setCoins(coins: number): void {
        this.coinText.setText(`${coins}`);
    }

    /** The refusal shake — the wallet says no, visibly. */
    refuse(): void {
        this.scene.tweens.add({
            targets: this.coinText,
            x: { from: this.coinText.x + 4, to: this.coinText.x },
            duration: 90,
            yoyo: true,
        });
    }

    renderCards(cards: readonly ShopCardData[]): void {
        for (const obj of this.cardObjs) {
            obj.destroy();
        }
        this.cardObjs = [];
        cards.forEach((card, i) => {
            this.renderCard(card, i);
        });
    }

    private renderCard(data: ShopCardData, i: number): void {
        const { relic, price, soldOut } = data;
        const x = GAME_WIDTH / 2 + (i - 1) * (CARD_W + CARD_GAP);
        const color = RARITY_COLOR[relic.rarity];

        const card = this.scene.add
            .rectangle(x, CARD_Y, CARD_W, CARD_H, 0x142333, 1)
            .setStrokeStyle(2, color, soldOut ? 0.3 : 1);
        const stone = this.scene.add
            .image(x, CARD_Y - 82, Gen.glow)
            .setScale(0.8)
            .setTint(relic.tell.color)
            .setBlendMode('ADD');
        const name = this.scene.add
            .text(x, CARD_Y - 52, relic.name, {
                fontFamily: 'Arial Black',
                fontSize: 17,
                color: '#e8f4ff',
                align: 'center',
                wordWrap: { width: CARD_W - 24 },
            })
            .setOrigin(0.5, 0);
        const rarity = this.scene.add
            .text(x, CARD_Y - 22, relic.rarity.toUpperCase(), {
                fontFamily: 'Arial',
                fontSize: 11,
                color: `#${color.toString(16).padStart(6, '0')}`,
            })
            .setOrigin(0.5, 0);
        const blurb = this.scene.add
            .text(x, CARD_Y + 0, relic.blurb, {
                fontFamily: 'Arial',
                fontSize: 14,
                color: '#bfd8ee',
                align: 'center',
                wordWrap: { width: CARD_W - 28 },
            })
            .setOrigin(0.5, 0);
        const priceText = this.scene.add
            .text(x, CARD_Y + CARD_H / 2 - 26, soldOut ? 'SOLD' : `${price} coins  [${i + 1}]`, {
                fontFamily: 'Arial Black',
                fontSize: 15,
                color: soldOut ? '#5a6a7a' : data.affordable ? '#ffd24a' : '#ff5a4a',
            })
            .setOrigin(0.5);

        const objs = [card, stone, name, rarity, blurb, priceText];
        if (soldOut) {
            for (const obj of objs) {
                (obj as unknown as { setAlpha(a: number): void }).setAlpha(0.45);
            }
        } else {
            card.setInteractive({ useHandCursor: true });
            card.on('pointerover', () => {
                card.setFillStyle(0x1b2f44, 1);
                this.previewAura.setTint(relic.tell.color).setAlpha(0.5);
            });
            card.on('pointerout', () => {
                card.setFillStyle(0x142333, 1);
                this.previewAura.setAlpha(0);
            });
            card.on('pointerdown', data.onBuy);
        }
        this.cardObjs.push(...objs);
    }

    /** Heart / reroll / leave, left to right. */
    renderBottomRow(buttons: readonly ShopButtonData[]): void {
        for (const obj of this.rowObjs) {
            obj.destroy();
        }
        this.rowObjs = [];
        const xs = [GAME_WIDTH / 2 - 150, GAME_WIDTH / 2 + 110, GAME_WIDTH / 2 + 330];
        buttons.forEach((button, i) => {
            this.rowObjs.push(this.makeButton(xs[i], ROW_Y, button.label, button.onClick));
        });
    }

    private makeButton(
        x: number,
        y: number,
        label: string,
        onClick: (() => void) | null,
    ): GameObjects.Container {
        const text = this.scene.add
            .text(0, 0, label, {
                fontFamily: 'Arial Black',
                fontSize: 15,
                color: onClick ? '#e8f4ff' : '#5a6a7a',
            })
            .setOrigin(0.5);
        const w = text.width + 32;
        const bg = this.scene.add
            .rectangle(0, 0, w, 40, 0x142333, 1)
            .setStrokeStyle(2, onClick ? 0x2a4258 : 0x1a2733);
        const button = this.scene.add.container(x, y, [bg, text]);
        if (onClick) {
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerover', () => bg.setFillStyle(0x1b2f44, 1));
            bg.on('pointerout', () => bg.setFillStyle(0x142333, 1));
            bg.on('pointerdown', onClick);
        }
        return button;
    }
}
