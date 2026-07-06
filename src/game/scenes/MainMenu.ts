import { type GameObjects, Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../main';
import { Img, Sfx } from '../assets';
import { saveStore } from '../meta/SaveStore';
import type { CharacterSelectBootData } from './CharacterSelectScene';

/** Seed characters accepted by the entry overlay (shareable, URL-safe). */
const SEED_CHARS = /^[a-z0-9\-_]$/i;

export class MainMenu extends Scene {
    private seedEntryOpen = false;
    private seedBuffer = '';
    private seedObjs: GameObjects.GameObject[] = [];
    private seedValueText: GameObjects.Text | null = null;

    constructor() {
        super('MainMenu');
    }

    create() {
        this.seedEntryOpen = false;
        this.seedBuffer = '';
        this.seedObjs = [];

        this.add.tileSprite(
            GAME_WIDTH / 2,
            GAME_HEIGHT / 2,
            GAME_WIDTH,
            GAME_HEIGHT,
            Img.backgroundSky,
        );

        this.add
            .text(GAME_WIDTH / 2, 220, 'ENDLESS TOWER 2', {
                fontFamily: 'Arial Black',
                fontSize: 64,
                color: '#ffffff',
                stroke: '#1a3a5c',
                strokeThickness: 10,
            })
            .setOrigin(0.5);

        this.add
            .text(GAME_WIDTH / 2, 300, 'a momentum roguelite', {
                fontFamily: 'Arial',
                fontSize: 24,
                color: '#e8f4ff',
            })
            .setOrigin(0.5);

        // One start, ever: every listener is removed when any door opens.
        let started = false;
        const open = (go: () => void): void => {
            if (started || this.seedEntryOpen) {
                return;
            }
            started = true;
            this.input.keyboard?.off('keydown', onKey);
            this.sound.play(Sfx.select, { volume: 0.5 });
            go();
        };
        const startRun = () =>
            open(() =>
                this.scene.start('CharacterSelect', {
                    seed: newRunSeed(),
                } satisfies CharacterSelectBootData),
            );
        const startSeeded = () => {
            if (!started && !this.seedEntryOpen) {
                this.openSeedEntry((seed) =>
                    open(() =>
                        this.scene.start('CharacterSelect', {
                            seed,
                        } satisfies CharacterSelectBootData),
                    ),
                );
            }
        };
        const startMuseum = () => open(() => this.scene.start('MuseumScene'));
        const startSandbox = () => open(() => this.scene.start('Sandbox'));

        this.buildOption(GAME_WIDTH / 2, 420, 'START RUN', 'enter', startRun);
        this.buildOption(GAME_WIDTH / 2, 495, 'SEEDED RUN', 'D', startSeeded);
        this.buildOption(GAME_WIDTH / 2, 570, 'MUSEUM', 'M', startMuseum);
        this.buildOption(GAME_WIDTH / 2, 645, 'SANDBOX', 'S', startSandbox);

        const onKey = (event: KeyboardEvent): void => {
            if (this.seedEntryOpen) {
                this.handleSeedKey(event);
                return;
            }
            if (event.key === 'Enter') {
                startRun();
            } else if (event.key === 'd' || event.key === 'D') {
                startSeeded();
            } else if (event.key === 'm' || event.key === 'M') {
                startMuseum();
            } else if (event.key === 's' || event.key === 'S') {
                startSandbox();
            }
        };
        this.input.keyboard?.on('keydown', onKey);
        this.events.once('shutdown', () => {
            this.input.keyboard?.off('keydown', onKey);
        });
    }

    /**
     * The seeded-run entry (meta-progression.md): type or paste a seed, ENTER
     * confirms, ESC cancels. Prefilled with the last run's seed — rematch is
     * one keypress. (A "daily seed" — same for everyone, date-derived — is
     * the designed HANDS-phase addition; it would be one more door here that
     * calls the same confirm path with a date-derived string.)
     */
    private openSeedEntry(onConfirm: (seed: string) => void): void {
        this.seedEntryOpen = true;
        this.seedBuffer = saveStore().doc.lastSeed ?? '';
        this.seedConfirm = onConfirm;

        const scrim = this.add
            .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
            .setOrigin(0)
            .setDepth(20)
            .setInteractive();
        const panel = this.add
            .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 520, 200, 0x10131a, 0.97)
            .setStrokeStyle(2, 0x3a5a7c)
            .setDepth(21);
        const title = this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, 'SEEDED RUN', {
                fontFamily: 'Arial Black',
                fontSize: 22,
                color: '#e8f4ff',
            })
            .setOrigin(0.5)
            .setDepth(21);
        this.seedValueText = this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 8, this.seedFace(), {
                fontFamily: 'Arial Black',
                fontSize: 26,
                color: '#ffd77a',
            })
            .setOrigin(0.5)
            .setDepth(21);
        const hint = this.add
            .text(
                GAME_WIDTH / 2,
                GAME_HEIGHT / 2 + 56,
                'type a seed — ENTER to climb it, ESC to cancel',
                { fontFamily: 'Arial', fontSize: 14, color: '#9fb4c8' },
            )
            .setOrigin(0.5)
            .setDepth(21);
        this.seedObjs = [scrim, panel, title, this.seedValueText, hint];
    }

    private seedConfirm: ((seed: string) => void) | null = null;

    private seedFace(): string {
        return this.seedBuffer.length > 0 ? this.seedBuffer : '_';
    }

    private handleSeedKey(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.closeSeedEntry();
            return;
        }
        if (event.key === 'Enter') {
            if (this.seedBuffer.length === 0) {
                this.sound.play(Sfx.bump, { volume: 0.3, rate: 0.8 });
                return;
            }
            const seed = this.seedBuffer;
            const confirm = this.seedConfirm;
            this.closeSeedEntry();
            confirm?.(seed);
            return;
        }
        if (event.key === 'Backspace') {
            this.seedBuffer = this.seedBuffer.slice(0, -1);
        } else if (SEED_CHARS.test(event.key) && this.seedBuffer.length < 24) {
            this.seedBuffer += event.key.toLowerCase();
        }
        this.seedValueText?.setText(this.seedFace());
    }

    private closeSeedEntry(): void {
        this.seedEntryOpen = false;
        this.seedConfirm = null;
        for (const obj of this.seedObjs) {
            obj.destroy();
        }
        this.seedObjs = [];
        this.seedValueText = null;
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
