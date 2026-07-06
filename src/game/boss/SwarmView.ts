/**
 * Critter sprites over the pure swarm runtime — the view half of the swarm
 * (EXAM). Positions are read from the deterministic core every frame;
 * nothing here decides anything. A contact pulses the critters so the
 * momentum tax reads on screen the moment it is charged.
 */
import type { GameObjects, Scene } from 'phaser';
import type { SwarmRuntime } from '../../core/exam/swarm';
import { Atlas, CritterFrames } from '../assets';
import type { PlayerSystem } from '../player/PlayerSystem';
import type { ExamFieldSystem } from '../systems/ExamFieldSystem';

const CRITTER_SCALE = 0.6; // 128px double frames -> ~77px: bigger than a
// coin, smaller than the player — an obstacle, not a monster
const CRITTER_DEPTH = 4;

export class SwarmView {
    private readonly scene: Scene;
    private readonly swarm: SwarmRuntime;
    private readonly examField: ExamFieldSystem;
    private readonly player: PlayerSystem;
    private readonly sprites = new Map<number, GameObjects.Image>();
    private flip = false;
    private flipAt = 0;

    constructor(
        scene: Scene,
        swarm: SwarmRuntime,
        examField: ExamFieldSystem,
        player: PlayerSystem,
    ) {
        this.scene = scene;
        this.swarm = swarm;
        this.examField = examField;
        this.player = player;
    }

    update(): void {
        const now = this.scene.time.now;
        if (now >= this.flipAt) {
            this.flipAt = now + 140;
            this.flip = !this.flip;
        }
        const tick = this.player.currentTick;
        const live = this.swarm.positions(tick);
        const seen = new Set<number>();
        const justHit = this.examField.contactHappenedAt() >= tick - 3;
        for (const c of live) {
            seen.add(c.critterId);
            let sprite = this.sprites.get(c.critterId);
            const frames = CritterFrames[c.skin];
            if (!sprite) {
                sprite = this.scene.add
                    .image(c.x, c.y, Atlas.enemiesDouble, frames[0])
                    .setScale(CRITTER_SCALE)
                    .setDepth(CRITTER_DEPTH);
                this.sprites.set(c.critterId, sprite);
            }
            sprite.setPosition(c.x, c.y);
            sprite.setTexture(Atlas.enemiesDouble, this.flip ? frames[0] : frames[1]);
            sprite.setTint(justHit ? 0xffffff : 0xffe8e8);
        }
        for (const [id, sprite] of this.sprites) {
            if (!seen.has(id)) {
                sprite.destroy();
                this.sprites.delete(id);
            }
        }
    }

    destroy(): void {
        for (const sprite of this.sprites.values()) {
            sprite.destroy();
        }
        this.sprites.clear();
    }
}
