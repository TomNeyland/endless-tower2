/**
 * The shop — spend coins: relics, hearts, rerolls (relics-economy.md).
 * Launched as an overlay above a paused caller scene. Stock and pricing are
 * core decisions (economy/shop.ts): stock rolls at visit time from
 * fork(runSeed, 'shop:<nodeId>:<reroll>') against the live owned set —
 * docs/DEVIATIONS.md entry 15. Rendering lives in ShopView; this scene
 * keeps stock + purchase orchestration only, and leaving is free — the
 * door back is always lit.
 *
 * Two hosts, one contract: the map launches it on a committed Shop node
 * (RunOrchestrator.shopLaunchData) and the debug bridge launches it
 * mid-segment (__ET2__.run.enterShop). The launch data carries the live
 * RunState and TuningStack plus narrow callbacks — an emit sink instead of
 * a bus (the map has no scene bus, only the run's diagnostics ring) and a
 * grantRelic port instead of RelicEffects (the map attaches triggers
 * through RunHost; a segment through its RelicEffects pump) — so a bought
 * relic's layers are in force the moment play resumes, wherever play is.
 * UI click sounds are scene-local by design — the shop is not a gameplay
 * event stream; wallet/relic events still ride the shared sink.
 */
import { Scene } from 'phaser';
import { heartPrice, relicPrice, rerollPrice, rollShopStock } from '../../core/economy/shop';
import type { RelicSource } from '../../core/events';
import type { RelicDef } from '../../core/relics/types';
import type { RunEmit, RunState } from '../../core/run/state';
import type { TuningStack } from '../../core/tuning';
import { Sfx } from '../assets';
import { ShopView } from '../shop/ShopView';

export interface ShopLaunchData {
    run: RunState;
    tuning: TuningStack;
    /** Wallet/relic/shop events ride here (scene bus or diagnostics ring). */
    emit: RunEmit;
    /** The host's acquisition path: layers, triggers, RunState command. */
    grantRelic: (relicId: string, source: RelicSource) => void;
    nodeId: string;
    /** 1-based act — weights the stock's rarity roll. */
    act: number;
    /** The caller's tick provider (paused mid-segment: a frozen timebase;
     *  the map: tickless zero). */
    tick: () => number;
    onLeave: () => void;
}

export class ShopScene extends Scene {
    private ctx!: ShopLaunchData;
    private view!: ShopView;
    private stock: RelicDef[] = [];
    private sold = new Set<string>();
    private purchases: string[] = [];
    private rerolls = 0;

    constructor() {
        super('Shop');
    }

    create(data: ShopLaunchData): void {
        this.ctx = data;
        this.sold = new Set();
        this.purchases = [];
        this.rerolls = 0;

        this.view = new ShopView(this);
        this.view.buildChrome(data.run.coins);
        this.rollStock();
        this.renderBottomRow();

        const kb = this.input.keyboard;
        kb?.on('keydown-ONE', () => this.buyRelic(0));
        kb?.on('keydown-TWO', () => this.buyRelic(1));
        kb?.on('keydown-THREE', () => this.buyRelic(2));
        kb?.on('keydown-H', () => this.buyHeart());
        kb?.on('keydown-R', () => this.reroll());
        kb?.on('keydown-ESC', () => this.leave());

        data.emit({
            type: 'shop/entered',
            tick: data.tick(),
            nodeId: data.nodeId,
            stock: this.stock.map((r) => r.id),
        });
    }

    // --- Stock ---

    private rollStock(): void {
        this.stock = rollShopStock(
            this.ctx.run.runSeed,
            this.ctx.nodeId,
            this.ctx.act,
            this.ctx.run.relicIds(),
            this.rerolls,
        );
        this.renderCards();
    }

    private renderCards(): void {
        this.view.renderCards(
            this.stock.map((relic, i) => {
                const price = relicPrice(this.ctx.tuning, relic.rarity);
                return {
                    relic,
                    price,
                    soldOut: this.sold.has(relic.id),
                    affordable: this.ctx.run.coins >= price,
                    onBuy: () => this.buyRelic(i),
                };
            }),
        );
    }

    private renderBottomRow(): void {
        const t = this.ctx.tuning;
        const run = this.ctx.run;
        const heartsFull = run.hearts >= run.heartsMax();
        const hPrice = heartPrice(t, run.heartsBought);
        const rPrice = rerollPrice(t, this.rerolls);
        this.view.renderBottomRow([
            {
                label: heartsFull ? 'HEART — FULL' : `HEART — ${hPrice} coins  [H]`,
                onClick: heartsFull ? null : () => this.buyHeart(),
            },
            { label: `REROLL — ${rPrice} coins  [R]`, onClick: () => this.reroll() },
            { label: 'LEAVE — free  [ESC]', onClick: () => this.leave() },
        ]);
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
        this.ctx.grantRelic(relic.id, 'shop');
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
        this.view.refuse();
    }

    private refresh(): void {
        this.view.setCoins(this.ctx.run.coins);
        this.renderCards();
        this.renderBottomRow();
    }

    private leave(): void {
        this.ctx.emit({
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
