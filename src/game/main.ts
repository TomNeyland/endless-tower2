import { AUTO, Game, Scale, type Types } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './dims';
import { Boot } from './scenes/Boot';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { MainMenu } from './scenes/MainMenu';
import { MapScene } from './scenes/MapScene';
import { MuseumScene } from './scenes/MuseumScene';
import { Preloader } from './scenes/Preloader';
import { ResultsScene } from './scenes/ResultsScene';
import { Sandbox } from './scenes/Sandbox';
import { ShopScene } from './scenes/ShopScene';

// Re-exported for existing runtime readers; module-scope readers must
// import ./dims directly (see that module's header for the cycle story).
export { GAME_HEIGHT, GAME_WIDTH } from './dims';

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
    scene: [
        Boot,
        Preloader,
        MainMenu,
        CharacterSelectScene,
        MapScene,
        Sandbox,
        ShopScene,
        ResultsScene,
        MuseumScene,
    ],
};

const StartGame = (parent: string) => {
    const game = new Game({ ...config, parent });
    // The boot slice of the debug bridge: hidden/occluded tabs never fire
    // requestAnimationFrame, so scripted verification stalls before any
    // scene bridge exists (menus included). Same clause as __ET2__.pump.
    window.__ET2_LOOP__ = {
        pump: (steps = 1) => {
            for (let i = 0; i < steps; i += 1) {
                game.loop.step(game.loop.now + 1000 / 60);
            }
        },
    };
    return game;
};

declare global {
    interface Window {
        __ET2_LOOP__?: { pump(steps?: number): void };
    }
}

export default StartGame;
