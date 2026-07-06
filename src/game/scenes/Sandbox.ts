import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import { Atlas, Img } from '../assets';

/**
 * Placeholder proving the render pipeline (atlases, frames, background).
 * The FEEL phase replaces this with the real movement sandbox.
 */
export class Sandbox extends Scene {
    constructor() {
        super('Sandbox');
    }

    create() {
        this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Img.backgroundSky);

        const groundY = GAME_HEIGHT - 32;
        for (let x = 32; x < GAME_WIDTH; x += 64) {
            this.add.image(x, groundY, Atlas.tiles, 'terrain_grass_cloud_middle');
        }

        this.add.image(GAME_WIDTH / 2, groundY - 96, Atlas.characters, 'character_beige_idle');

        this.add
            .text(GAME_WIDTH / 2, 120, 'movement sandbox — FEEL phase pending', {
                fontFamily: 'Arial',
                fontSize: 20,
                color: '#ffffff',
                stroke: '#1a3a5c',
                strokeThickness: 4,
            })
            .setOrigin(0.5);
    }
}
