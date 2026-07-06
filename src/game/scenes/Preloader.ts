import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import { loadCoreAssets } from '../assets';

export class Preloader extends Scene {
    constructor() {
        super('Preloader');
    }

    init() {
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        this.add.rectangle(cx, cy, 468, 32).setStrokeStyle(1, 0xffffff);
        const bar = this.add.rectangle(cx - 230, cy, 4, 28, 0xffffff);
        this.load.on('progress', (progress: number) => {
            bar.width = 4 + 460 * progress;
        });
    }

    preload() {
        loadCoreAssets(this.load);
    }

    create() {
        this.scene.start('MainMenu');
    }
}
