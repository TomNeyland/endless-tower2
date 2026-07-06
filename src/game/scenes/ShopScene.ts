/**
 * The shop — spend coins: relics, hearts, rerolls (relics-economy.md).
 * Launched as an overlay above a paused caller scene. Stock and pricing are
 * core decisions (economy/shop.ts, seeded fork(seed, 'shop:<nodeId>')); the
 * scene renders full relic text with a live tell preview on the character,
 * and leaving is free — the door back is always lit.
 *
 * Entry points: the debug bridge today (__ET2__.run.enterShop), and the
 * CHOICE map tomorrow — a MapScene commits a Shop node and launches 'Shop'
 * with this same ShopLaunchData shape (the integrator wires the handoff;
 * the contract is this constructor's data).
 *
 * Purchases mutate the live RunState and TuningStack directly (the caller
 * scene shares them), so a bought relic's layers are in force the moment
 * play resumes. UI click sounds are scene-local by design — the shop is not
 * a gameplay event stream; wallet/relic events still ride the shared bus.
 */
import { type GameObjects, Scene } from 'phaser';
import { heartPrice, relicPrice, rerollPrice, rollShopStock } from '../../core/economy/shop';
import type { EventBus, RelicRarity } from '../../core/events';
import type { RelicDef } from '../../core/relics/types';
import type { RunState } from '../../core/run/state';
import type { TuningStack } from '../../core/tuning';
import { Atlas, CharFrame, Gen, HudFrame, Sfx } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import type { RelicEffects } from '../systems/RelicEffects';

export interface ShopLaunchData {
    run: RunState;
    tuning: TuningStack;
    bus: EventBus;
    relics: RelicEffects;
    nodeId: string;
    actIndex: number;
    /** The caller's tick provider (paused mid-segment: a frozen timebase). */
    tick: () => number;
    onLeave: () => void;
}

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

export class ShopScene extends Scene {
    private ctx!: ShopLaunchData;
    private stock: RelicDef[] = [];
    private sold = new Set<string>();
    private purchases: string[] = [];
    private rerolls = 0;
    private cardObjs: GameObjects.GameObject[] = [];
    private rowObjs: GameObjects.GameObject[] = [];
    private coinText!: GameObjects.Text;
    private previewAura!: GameObjects.Image;

    constructor() {
        super('Shop');
    }

    create(data: ShopLaunchData): void {
        this.ctx = data;
        this.sold = new Set();
        this.purchases = [];
        this.rerolls = 0;

        this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x060a10, 0.74).setOrigin(0);
        this.add
            .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 900, 600, 0x0e1926, 0.97)
            .setStrokeStyle(2, 0x2a4258);
        this.add
            .text(GAME_WIDTH / 2, 128, 'SHOP', {
                fontFamily: 'Arial Black',
                fontSize: 32,
                color: '#e8f4ff',
                stroke: '#1a2733',
                strokeThickness: 5,
            })
            .setOrigin(0.5);
        this.add
            .image(GAME_WIDTH / 2 + 350, 128, Atlas.tiles, HudFrame.coin)
            .setScale(0.4)
            .setOrigin(1, 0.5);
        this.coinText = this.add
            .text(GAME_WIDTH / 2 + 358, 128, `${data.run.coins}`, {
                fontFamily: 'Arial Black',
                fontSize: 22,
                color: '#ffd24a',
            })
            .setOrigin(0, 0.5);

        // Tell preview: the character wearing the hovered relic's accent.
        const px = GAME_WIDTH / 2 - 380;
        this.previewAura = this.add
            .image(px, ROW_Y, Gen.glow)
            .setScale(2.4)
            .setBlendMode('ADD')
            .setAlpha(0);
        this.add.sprite(px, ROW_Y, Atlas.characters, CharFrame.front).setScale(0.42);
        this.add
            .text(px, ROW_Y + 46, 'tell preview', {
                fontFamily: 'Arial',
                fontSize: 12,
                color: '#9fb4c8',
            })
            .setOrigin(0.5);

        this.rollStock();
        this.renderBottomRow();

        const kb = this.input.keyboard;
        kb?.on('keydown-ONE', () => this.buyRelic(0));
        kb?.on('keydown-TWO', () => this.buyRelic(1));
        kb?.on('keydown-THREE', () => this.buyRelic(2));
        kb?.on('keydown-H', () => this.buyHeart());
        kb?.on('keydown-R', () => this.reroll());
        kb?.on('keydown-ESC', () => this.leave());

        data.bus.emit({
            type: 'shop/entered',
            tick: data.tick(),
            nodeId: data.nodeId,
            stock: this.stock.map((r) => r.id),
        });
    }

    // --- Stock & rendering ---

    private rollStock(): void {
        this.stock = rollShopStock(
            this.ctx.run.runSeed,
            this.ctx.nodeId,
            this.ctx.actIndex,
            this.ctx.run.relicIds(),
            this.rerolls,
        );
        this.renderCards();
    }

    private renderCards(): void {
        for (const obj of this.cardObjs) {
            obj.destroy();
        }
        this.cardObjs = [];
        this.stock.forEach((relic, i) => {
            this.renderCard(relic, i);
        });
    }

    private renderCard(relic: RelicDef, i: number): void {
        const x = GAME_WIDTH / 2 + (i - 1) * (CARD_W + CARD_GAP);
        const price = relicPrice(this.ctx.tuning, relic.rarity);
        const soldOut = this.sold.has(relic.id);
        const color = RARITY_COLOR[relic.rarity];

        const card = this.add
            .rectangle(x, CARD_Y, CARD_W, CARD_H, 0x142333, 1)
            .setStrokeStyle(2, color, soldOut ? 0.3 : 1);
        const stone = this.add
            .image(x, CARD_Y - 82, Gen.glow)
            .setScale(0.8)
            .setTint(relic.tell.color)
            .setBlendMode('ADD');
        const name = this.add
            .text(x, CARD_Y - 52, relic.name, {
                fontFamily: 'Arial Black',
                fontSize: 17,
                color: '#e8f4ff',
                align: 'center',
                wordWrap: { width: CARD_W - 24 },
            })
            .setOrigin(0.5, 0);
        const rarity = this.add
            .text(x, CARD_Y - 22, relic.rarity.toUpperCase(), {
                fontFamily: 'Arial',
                fontSize: 11,
                color: `#${color.toString(16).padStart(6, '0')}`,
            })
            .setOrigin(0.5, 0);
        const blurb = this.add
            .text(x, CARD_Y + 0, relic.blurb, {
                fontFamily: 'Arial',
                fontSize: 14,
                color: '#bfd8ee',
                align: 'center',
                wordWrap: { width: CARD_W - 28 },
            })
            .setOrigin(0.5, 0);
        const priceText = this.add
            .text(x, CARD_Y + CARD_H / 2 - 26, soldOut ? 'SOLD' : `${price} coins  [${i + 1}]`, {
                fontFamily: 'Arial Black',
                fontSize: 15,
                color: soldOut ? '#5a6a7a' : this.affordColor(price),
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
            card.on('pointerdown', () => this.buyRelic(i));
        }
        this.cardObjs.push(...objs);
    }

    private renderBottomRow(): void {
        for (const obj of this.rowObjs) {
            obj.destroy();
        }
        this.rowObjs = [];
        const t = this.ctx.tuning;
        const run = this.ctx.run;

        const heartsFull = run.hearts >= run.heartsMax();
        const hPrice = heartPrice(t, run.heartsBought);
        this.rowObjs.push(
            this.makeButton(
                GAME_WIDTH / 2 - 150,
                ROW_Y,
                heartsFull ? 'HEART — FULL' : `HEART — ${hPrice} coins  [H]`,
                heartsFull ? null : () => this.buyHeart(),
            ),
        );
        const rPrice = rerollPrice(t, this.rerolls);
        this.rowObjs.push(
            this.makeButton(GAME_WIDTH / 2 + 110, ROW_Y, `REROLL — ${rPrice} coins  [R]`, () =>
                this.reroll(),
            ),
        );
        this.rowObjs.push(
            this.makeButton(GAME_WIDTH / 2 + 330, ROW_Y, 'LEAVE — free  [ESC]', () => this.leave()),
        );
    }

    private makeButton(
        x: number,
        y: number,
        label: string,
        onClick: (() => void) | null,
    ): GameObjects.Container {
        const text = this.add
            .text(0, 0, label, {
                fontFamily: 'Arial Black',
                fontSize: 15,
                color: onClick ? '#e8f4ff' : '#5a6a7a',
            })
            .setOrigin(0.5);
        const w = text.width + 32;
        const bg = this.add
            .rectangle(0, 0, w, 40, 0x142333, 1)
            .setStrokeStyle(2, onClick ? 0x2a4258 : 0x1a2733);
        const button = this.add.container(x, y, [bg, text]);
        if (onClick) {
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerover', () => bg.setFillStyle(0x1b2f44, 1));
            bg.on('pointerout', () => bg.setFillStyle(0x142333, 1));
            bg.on('pointerdown', onClick);
        }
        return button;
    }

    private affordColor(price: number): string {
        return this.ctx.run.coins >= price ? '#ffd24a' : '#ff5a4a';
    }

    // --- Purchases (RunState commands are the backstop; UI is the gate) ---

    private buyRelic(i: number): void {
        const relic = this.stock[i];
        if (!relic || this.sold.has(relic.id)) {
            return;
        }
        const price = relicPrice(this.ctx.tuning, relic.rarity);
        if (this.ctx.run.coins < price) {
            this.refuse();
            return;
        }
        this.ctx.run.spendCoins(price, relic.id);
        this.ctx.relics.grantRelic(relic.id, 'shop');
        this.sold.add(relic.id);
        this.purchases.push(relic.id);
        this.sound.play(Sfx.select, { volume: 0.5 });
        this.refresh();
    }

    private buyHeart(): void {
        const run = this.ctx.run;
        if (run.hearts >= run.heartsMax()) {
            this.refuse();
            return;
        }
        const price = heartPrice(this.ctx.tuning, run.heartsBought);
        if (run.coins < price) {
            this.refuse();
            return;
        }
        run.buyHeart(price);
        this.purchases.push('heart');
        this.sound.play(Sfx.select, { volume: 0.5 });
        this.refresh();
    }

    private reroll(): void {
        const price = rerollPrice(this.ctx.tuning, this.rerolls);
        if (this.ctx.run.coins < price) {
            this.refuse();
            return;
        }
        this.ctx.run.spendCoins(price, 'reroll');
        this.rerolls += 1;
        this.purchases.push('reroll');
        this.sound.play(Sfx.select, { volume: 0.4 });
        this.rollStock();
        this.refresh();
    }

    private refuse(): void {
        this.sound.play(Sfx.bump, { volume: 0.35, rate: 0.8 });
        this.tweens.add({
            targets: this.coinText,
            x: { from: this.coinText.x + 4, to: this.coinText.x },
            duration: 90,
            yoyo: true,
        });
    }

    private refresh(): void {
        this.coinText.setText(`${this.ctx.run.coins}`);
        this.renderCards();
        this.renderBottomRow();
    }

    private leave(): void {
        this.ctx.bus.emit({
            type: 'shop/left',
            tick: this.ctx.tick(),
            nodeId: this.ctx.nodeId,
            purchases: [...this.purchases],
        });
        const onLeave = this.ctx.onLeave;
        this.scene.stop();
        onLeave();
    }
}
