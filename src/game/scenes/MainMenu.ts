import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import { Img, Sfx } from '../assets';

export class MainMenu extends Scene {
    constructor() {
        super('MainMenu');
    }

    create() {
        this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Img.backgroundSky);

        this.add
            .text(GAME_WIDTH / 2, 280, 'ENDLESS TOWER 2', {
                fontFamily: 'Arial Black',
                fontSize: 64,
                color: '#ffffff',
                stroke: '#1a3a5c',
                strokeThickness: 10,
            })
            .setOrigin(0.5);

        this.add
            .text(GAME_WIDTH / 2, 360, 'a momentum roguelite', {
                fontFamily: 'Arial',
                fontSize: 24,
                color: '#e8f4ff',
            })
            .setOrigin(0.5);

        this.add
            .text(GAME_WIDTH / 2, 520, 'press any key', {
                fontFamily: 'Arial',
                fontSize: 20,
                color: '#ffffff',
            })
            .setOrigin(0.5);

        const start = () => {
            this.sound.play(Sfx.select, { volume: 0.5 });
            this.scene.start('Sandbox');
        };
        this.input.once('pointerdown', start);
        this.input.keyboard?.once('keydown', start);
    }
}
