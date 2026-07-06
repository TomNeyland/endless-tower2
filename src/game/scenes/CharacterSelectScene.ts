/**
 * Character select — the run-start step RETURN owns (playthrough-trace.md
 * finding 1): five colors in a row, one-line traits, locked colors stand
 * dark and show the feat that opens them. Default focus is Beige — a new
 * player presses ENTER twice from the title and is climbing. Traits are
 * sideways, so this is an identity choice, never a power choice.
 */
import { type GameObjects, Scene } from 'phaser';
import { CHARACTERS, type CharacterDef } from '../../core/meta/characters';
import { featById } from '../../core/meta/feats';
import { characterUnlocked } from '../../core/meta/unlocks';
import { Atlas, characterFrames, ensureGeneratedTextures, Gen, Img, Sfx } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../dims';
import { saveStore } from '../meta/SaveStore';
import { RunOrchestrator } from '../systems/RunOrchestrator';

export interface CharacterSelectBootData {
    seed: string;
}

const CX = GAME_WIDTH / 2;
const ROW_Y = 380;
const SPACING = 180;

interface Column {
    character: CharacterDef;
    unlocked: boolean;
    sprite: GameObjects.Sprite;
    ring: GameObjects.Image;
}

/** The lock line for a locked column. Explicitly narrowed: a null-feat
 *  character is ALWAYS unlocked (characterUnlocked), so reaching here with
 *  null is a broken invariant — fail loud, never cast it away. */
function lockedBlurb(character: CharacterDef): string {
    if (character.unlockFeat === null) {
        throw new Error(`character select: ${character.id} is locked with no unlock feat`);
    }
    return `locked — ${featById(character.unlockFeat).blurb}`;
}

export class CharacterSelectScene extends Scene {
    private seed!: string;
    private columns: Column[] = [];
    private focusIndex = 0;
    private detailObjs: GameObjects.GameObject[] = [];
    private started = false;

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            const step = event.key === 'ArrowLeft' ? -1 : 1;
            this.setFocus((this.focusIndex + step + this.columns.length) % this.columns.length);
        } else if (event.key === 'Enter' || event.key === ' ') {
            this.confirm(this.focusIndex);
        } else if (event.key === 'Escape') {
            this.leaveToMenu();
        }
    };

    constructor() {
        super('CharacterSelect');
    }

    create(data: CharacterSelectBootData): void {
        if (!data.seed) {
            throw new Error('CharacterSelect: booted without a seed (MainMenu owns entry)');
        }
        ensureGeneratedTextures(this);
        this.seed = data.seed;
        this.started = false;
        this.columns = [];
        this.detailObjs = [];

        this.add.tileSprite(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Img.backgroundSky);
        this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a1220, 0.55).setOrigin(0);
        this.add
            .text(CX, 120, 'WHO CLIMBS?', {
                fontFamily: 'Arial Black',
                fontSize: 42,
                color: '#ffffff',
                stroke: '#1a3a5c',
                strokeThickness: 8,
            })
            .setOrigin(0.5);
        this.add
            .text(CX, 172, `seed ${this.seed}`, {
                fontFamily: 'Arial',
                fontSize: 14,
                color: '#bfd8ee',
            })
            .setOrigin(0.5)
            .setAlpha(0.85);

        const unlockedIds = saveStore().doc.unlocks.characters;
        const x0 = CX - SPACING * 2;
        CHARACTERS.forEach((character, i) => {
            const x = x0 + i * SPACING;
            const unlocked = characterUnlocked(character.id, unlockedIds);
            const ring = this.add
                .image(x, ROW_Y, Gen.glow)
                .setScale(2.6)
                .setTint(0xffd77a)
                .setBlendMode('ADD')
                .setAlpha(0);
            const sprite = this.add
                .sprite(x, ROW_Y, Atlas.characters, characterFrames(character.id).front)
                .setScale(0.6)
                .setInteractive({ useHandCursor: true });
            if (!unlocked) {
                sprite.setTint(0x141a24);
            }
            sprite.on('pointerover', () => this.setFocus(i));
            sprite.on('pointerdown', () => {
                if (this.focusIndex === i) {
                    this.confirm(i);
                } else {
                    this.setFocus(i);
                }
            });
            this.add
                .text(x, ROW_Y + 66, character.name, {
                    fontFamily: 'Arial Black',
                    fontSize: 17,
                    color: unlocked ? '#e8f4ff' : '#4a5666',
                })
                .setOrigin(0.5);
            this.columns.push({ character, unlocked, sprite, ring });
        });

        this.add
            .text(CX, GAME_HEIGHT - 60, 'arrows — choose      ENTER — climb      ESC — back', {
                fontFamily: 'Arial',
                fontSize: 15,
                color: '#bfd8ee',
            })
            .setOrigin(0.5)
            .setAlpha(0.85);

        this.setFocus(0); // default Beige — the doc's ruling
        this.input.keyboard?.on('keydown', this.onKeyDown);
        this.events.once('shutdown', () => {
            this.input.keyboard?.off('keydown', this.onKeyDown);
        });
    }

    private setFocus(index: number): void {
        this.focusIndex = index;
        this.columns.forEach((column, i) => {
            column.ring.setAlpha(i === index ? 0.6 : 0);
            column.sprite.setScale(i === index ? 0.7 : 0.6);
        });
        for (const obj of this.detailObjs) {
            obj.destroy();
        }
        this.detailObjs = [];
        const { character, unlocked } = this.columns[index];
        this.detailObjs.push(
            this.add
                .text(CX, 540, `${character.name} — ${character.epithet}`, {
                    fontFamily: 'Arial Black',
                    fontSize: 24,
                    color: unlocked ? '#ffe9b0' : '#5a6a7a',
                })
                .setOrigin(0.5),
            this.add
                .text(CX, 580, unlocked ? character.traitLine : lockedBlurb(character), {
                    fontFamily: 'Arial',
                    fontSize: 17,
                    color: unlocked ? '#e8f4ff' : '#8a9db0',
                })
                .setOrigin(0.5),
        );
    }

    private confirm(index: number): void {
        if (this.started) {
            return;
        }
        const { character, unlocked } = this.columns[index];
        if (!unlocked) {
            // The refusal: the lock is the message; the feat line is already up.
            this.sound.play(Sfx.bump, { volume: 0.35, rate: 0.8 });
            return;
        }
        this.started = true;
        this.sound.play(Sfx.select, { volume: 0.5 });
        RunOrchestrator.begin(this.game, this.seed, character.id);
    }

    private leaveToMenu(): void {
        if (this.started) {
            return;
        }
        this.started = true;
        this.scene.start('MainMenu');
    }
}
