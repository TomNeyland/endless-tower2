import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import { Img, Sfx } from '../assets';
import { RunOrchestrator } from '../systems/RunOrchestrator';

export class MainMenu extends Scene {
    constructor() {
        super('MainMenu');
    }

    create() {
        this.add.tileSprite(
            GAME_WIDTH / 2,
            GAME_HEIGHT / 2,
            GAME_WIDTH,
            GAME_HEIGHT,
            Img.backgroundSky,
        );

        this.add
            .text(GAME_WIDTH / 2, 260, 'ENDLESS TOWER 2', {
                fontFamily: 'Arial Black',
                fontSize: 64,
                color: '#ffffff',
                stroke: '#1a3a5c',
                strokeThickness: 10,
            })
            .setOrigin(0.5);

        this.add
            .text(GAME_WIDTH / 2, 340, 'a momentum roguelite', {
                fontFamily: 'Arial',
                fontSize: 24,
                color: '#e8f4ff',
            })
            .setOrigin(0.5);

        // One start, ever: every listener is removed when any door opens.
        let started = false;
        const open = (go: () => void): void => {
            if (started) {
                return;
            }
            started = true;
            this.input.keyboard?.off('keydown-ENTER', startRun);
            this.input.keyboard?.off('keydown-S', startSandbox);
            this.sound.play(Sfx.select, { volume: 0.5 });
            go();
        };
        const startRun = () => open(() => RunOrchestrator.begin(this.game, newRunSeed()));
        const startSandbox = () => open(() => this.scene.start('Sandbox'));

        this.buildOption(GAME_WIDTH / 2, 480, 'START RUN', 'enter', startRun);
        this.buildOption(GAME_WIDTH / 2, 560, 'SANDBOX', 'S', startSandbox);

        this.input.keyboard?.on('keydown-ENTER', startRun);
        this.input.keyboard?.on('keydown-S', startSandbox);
    }

    private buildOption(
        x: number,
        y: number,
        label: string,
        keyHint: string,
        go: () => void,
    ): void {
        const t = this.add
            .text(x, y, label, {
                fontFamily: 'Arial Black',
                fontSize: 30,
                color: '#ffffff',
                stroke: '#1a3a5c',
                strokeThickness: 6,
            })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });
        const hint = this.add
            .text(x, y + 30, keyHint, {
                fontFamily: 'Arial',
                fontSize: 14,
                color: '#e8f4ff',
            })
            .setOrigin(0.5)
            .setAlpha(0.8);
        t.on('pointerover', () => {
            t.setScale(1.08);
            hint.setAlpha(1);
        });
        t.on('pointerout', () => {
            t.setScale(1);
            hint.setAlpha(0.8);
        });
        t.on('pointerdown', go);
    }
}

/** A fresh shareable seed. Entropy source only — all run randomness forks
 *  from the string deterministically (core/rng). */
function newRunSeed(): string {
    return Date.now().toString(36);
}
