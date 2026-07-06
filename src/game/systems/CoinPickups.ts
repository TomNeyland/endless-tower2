/**
 * Coin pickups at the Phaser boundary. Placement and collection rules live
 * in core (economy/coins.ts, seeded); this system renders the placed coins,
 * steps the field on the player's kinematics, feeds the wallet through
 * RunState's typed command, and sells the magnet pull with a short tween.
 *
 * Coin Storm: while `coins.stormRate` > 0 (a temporary powerup layer), a
 * seeded shower rains collectible coins near the player — wallet spice, no
 * physics. Collection audio is event-driven in AudioSystem (coin/collected),
 * one audio authority; the casino-pack voice upgrade is a HANDS note.
 */
import type { GameObjects, Scene } from 'phaser';
import { CoinField, placeSegmentCoins } from '../../core/economy/coins';
import type { SegmentSpec } from '../../core/pressure/segment';
import { fork, type Rng } from '../../core/rng';
import type { TowerLayout } from '../../core/tower';
import type { TuningStack } from '../../core/tuning';
import type { RunState } from '../../core/run/state';
import { Atlas, Gen, TileFrame } from '../assets';
import type { PlayerSystem } from '../player/PlayerSystem';

const COIN_SCALE = 0.42;
const COIN_DEPTH = 3;
/** Storm coins fall this far before expiring uncollected. */
const STORM_FALL_PX = 900;
const STORM_SPAWN_HALF_SPAN = 160;

export class CoinPickups {
    private readonly scene: Scene;
    private readonly t: TuningStack;
    private readonly run: RunState;
    private readonly player: PlayerSystem;
    private readonly layout: TowerLayout;

    private readonly field: CoinField;
    private readonly sprites = new Map<number, GameObjects.Image>();
    private readonly stormRng: Rng;
    /** Transient storm coins: id -> falling sprite (position is live). */
    private readonly stormCoins = new Map<
        number,
        { sprite: GameObjects.Image; vy: number; fallen: number }
    >();
    private stormAccumulator = 0;
    private lastTick = 0;

    constructor(
        scene: Scene,
        layout: TowerLayout,
        spec: SegmentSpec,
        tuning: TuningStack,
        run: RunState,
        player: PlayerSystem,
    ) {
        this.scene = scene;
        this.t = tuning;
        this.run = run;
        this.player = player;
        this.layout = layout;
        this.stormRng = fork(spec.seed, `coin-storm:${spec.segmentId}`);

        const coins = placeSegmentCoins(spec, layout, tuning);
        this.field = new CoinField(coins);
        for (const coin of coins) {
            this.sprites.set(coin.id, this.makeCoinSprite(coin.x, coin.y));
        }
    }

    update(): void {
        const kin = this.player.kinematics();
        const dtTicks = Math.max(0, kin.tick - this.lastTick);
        this.lastTick = kin.tick;

        // Storm coins fall under their own (presentation-only) gravity.
        this.stepStorm(kin.x, dtTicks);

        const collected = this.field.step(kin.x, kin.y, this.t.value('coins.magnetPx'));
        for (const { coin, magnetized } of collected) {
            this.run.addCoins(coin.value, magnetized);
            const sprite = this.sprites.get(coin.id) ?? this.stormCoins.get(coin.id)?.sprite;
            this.sprites.delete(coin.id);
            this.stormCoins.delete(coin.id);
            if (sprite) {
                this.scene.tweens.add({
                    targets: sprite,
                    x: kin.x,
                    y: kin.y,
                    scale: COIN_SCALE * 0.4,
                    alpha: 0,
                    duration: magnetized ? 140 : 90,
                    ease: 'Cubic.easeIn',
                    onComplete: () => sprite.destroy(),
                });
            }
        }
    }

    private stepStorm(playerX: number, dtTicks: number): void {
        const rate = this.t.value('coins.stormRate');
        if (rate > 0 && dtTicks > 0) {
            this.stormAccumulator += (rate * dtTicks) / 60;
            while (this.stormAccumulator >= 1) {
                this.stormAccumulator -= 1;
                this.spawnStormCoin(playerX);
            }
        }
        // Advance falling storm coins; expire the ones that fell out.
        for (const [id, drop] of this.stormCoins) {
            const sprite = drop.sprite;
            const fall = (drop.vy * dtTicks) / 60;
            sprite.y += fall;
            drop.fallen += fall;
            this.field.move(id, sprite.x, sprite.y);
            if (drop.fallen > STORM_FALL_PX) {
                this.field.expire(id);
                this.stormCoins.delete(id);
                sprite.destroy();
            }
        }
    }

    private spawnStormCoin(playerX: number): void {
        const cam = this.scene.cameras.main;
        const half = STORM_SPAWN_HALF_SPAN;
        const minX = this.layout.wallLeftX + 24;
        const maxX = this.layout.wallRightX - 24;
        const x = Math.min(maxX, Math.max(minX, playerX - half + this.stormRng() * half * 2));
        const y = cam.scrollY - 40;
        const coin = this.field.spawnTransient(x, y, this.t.value('coins.pickupValue'));
        const sprite = this.makeCoinSprite(x, y);
        this.stormCoins.set(coin.id, { sprite, vy: 420 + this.stormRng() * 160, fallen: 0 });
    }

    private makeCoinSprite(x: number, y: number): GameObjects.Image {
        const sprite = this.scene.add
            .image(x, y, Atlas.tiles, TileFrame.coinGold)
            .setScale(COIN_SCALE)
            .setDepth(COIN_DEPTH);
        // A faint glint so loot reads at speed without shouting.
        const glow = this.scene.add
            .image(x, y, Gen.glow)
            .setScale(0.7)
            .setTint(0xffd24a)
            .setBlendMode('ADD')
            .setAlpha(0.18)
            .setDepth(COIN_DEPTH - 1);
        sprite.once('destroy', () => glow.destroy());
        return sprite;
    }

    destroy(): void {
        for (const sprite of this.sprites.values()) {
            sprite.destroy();
        }
        this.sprites.clear();
        for (const drop of this.stormCoins.values()) {
            drop.sprite.destroy();
        }
        this.stormCoins.clear();
    }
}
