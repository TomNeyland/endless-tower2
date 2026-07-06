import { AUTO, Game, Scale, type Types } from 'phaser';
import { Boot } from './scenes/Boot';
import { MainMenu } from './scenes/MainMenu';
import { Preloader } from './scenes/Preloader';
import { Sandbox } from './scenes/Sandbox';
import { ShopScene } from './scenes/ShopScene';

export const GAME_WIDTH = 1024;
export const GAME_HEIGHT = 768;

const config: Types.Core.GameConfig = {
    type: AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#87ceeb',
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
    },
    physics: {
        default: 'arcade',
        arcade: {
            // Gravity is applied by the movement core via Actions so relics
            // can someday mutate it — the engine never integrates it.
            gravity: { x: 0, y: 0 },
            // v1 removed the fixed timestep and its momentum jumps became
            // framerate-sensitive. Never turn this off.
            fixedStep: true,
            fps: 60,
        },
    },
    scene: [Boot, Preloader, MainMenu, Sandbox, ShopScene],
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
};

export default StartGame;
