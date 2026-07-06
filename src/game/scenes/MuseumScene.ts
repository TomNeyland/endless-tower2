/**
 * The museum — memory made visible (docs/design/meta-progression.md). Leads
 * with the flex line: BEST CHAIN, display face, full art treatment — the
 * screenshot stat is the retention loop. Below it: per-character records
 * (the sideways-balance tell: if one color's board dominates, the balance
 * failed), lifetime totals, the lifetime tier histogram, win streaks.
 * Renders the save; mints nothing.
 */
import { Display, Scene } from 'phaser';
import { groupDigits } from '../../core/format';
import { COMBO_TIER_NAMES } from '../../core/combo/tuning';
import { CHARACTERS } from '../../core/meta/characters';
import type { LifetimeStats } from '../../core/meta/stats';
import { characterUnlocked } from '../../core/meta/unlocks';
import { Atlas, characterFrames, ensureGeneratedTextures, Gen, Sfx } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../dims';
import { clockFace } from '../meta/ResultsView';
import { saveStore } from '../meta/SaveStore';

const CX = GAME_WIDTH / 2;

export class MuseumScene extends Scene {
    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' || event.key === 'Enter') {
            this.sound.play(Sfx.select, { volume: 0.5 });
            this.scene.start('MainMenu');
        }
    };

    constructor() {
        super('MuseumScene');
    }

    create(): void {
        ensureGeneratedTextures(this);
        const stats = saveStore().doc.stats;
        this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0c1018, 1).setOrigin(0);
        this.add
            .text(CX, 56, 'THE MUSEUM', {
                fontFamily: 'Arial Black',
                fontSize: 34,
                color: '#e8f4ff',
                stroke: '#1a2733',
                strokeThickness: 6,
            })
            .setOrigin(0.5);

        if (stats.runs === 0) {
            this.add
                .text(CX, GAME_HEIGHT / 2, 'no runs yet — the tower awaits', {
                    fontFamily: 'Arial',
                    fontSize: 22,
                    color: '#8a9db0',
                })
                .setOrigin(0.5);
        } else {
            this.renderBestChain(stats);
            this.renderCharacterBoards(stats);
            this.renderLifetime(stats);
            this.renderTierHistogram(stats);
        }

        this.add
            .text(CX, GAME_HEIGHT - 28, 'ESC — menu', {
                fontFamily: 'Arial',
                fontSize: 14,
                color: '#8a9db0',
            })
            .setOrigin(0.5);
        this.input.keyboard?.on('keydown', this.onKeyDown);
        this.events.once('shutdown', () => {
            this.input.keyboard?.off('keydown', this.onKeyDown);
        });
    }

    /** The lead: the best banked chain ever, full art. */
    private renderBestChain(stats: LifetimeStats): void {
        if (stats.bestChainFace.length === 0) {
            this.add
                .text(CX, 140, 'no chain banked yet', {
                    fontFamily: 'Arial',
                    fontSize: 18,
                    color: '#5a6a7a',
                })
                .setOrigin(0.5);
            return;
        }
        this.add
            .text(CX, 104, 'BEST CHAIN', {
                fontFamily: 'Arial',
                fontSize: 14,
                color: '#8a9db0',
                letterSpacing: 6,
            })
            .setOrigin(0.5);
        for (const [scale, alpha] of [
            [8, 0.32],
            [4.5, 0.48],
        ] as const) {
            this.add
                .image(CX, 150, Gen.glow)
                .setScale(scale)
                .setTint(0xffb84a)
                .setAlpha(alpha)
                .setBlendMode('ADD');
        }
        this.add
            .text(CX, 150, stats.bestChainFace, {
                fontFamily: 'Arial Black',
                fontSize: 38,
                color: '#ffce7a',
                stroke: '#4a3208',
                strokeThickness: 8,
            })
            .setOrigin(0.5);
        if (stats.bestChainCharacterId !== null) {
            this.add
                .sprite(
                    CX,
                    212,
                    Atlas.characters,
                    characterFrames(stats.bestChainCharacterId).front,
                )
                .setScale(0.3);
        }
    }

    /** Five columns — per-character records; locked colors stand dark. */
    private renderCharacterBoards(stats: LifetimeStats): void {
        const unlockedIds = saveStore().doc.unlocks.characters;
        const spacing = 176;
        const x0 = CX - spacing * 2;
        const y = 320;
        CHARACTERS.forEach((character, i) => {
            const x = x0 + i * spacing;
            const unlocked = characterUnlocked(character.id, unlockedIds);
            const sprite = this.add
                .sprite(x, y, Atlas.characters, characterFrames(character.id).front)
                .setScale(0.42);
            if (!unlocked) {
                sprite.setTint(0x151a22);
            }
            this.add
                .text(x, y + 52, character.name, {
                    fontFamily: 'Arial Black',
                    fontSize: 15,
                    color: unlocked ? '#e8f4ff' : '#4a5666',
                })
                .setOrigin(0.5);
            const record = stats.perCharacter[character.id];
            const lines = !unlocked
                ? ['locked']
                : record === undefined
                  ? ['no runs']
                  : [
                        `${record.runs} run${record.runs === 1 ? '' : 's'}, ${record.wins} win${record.wins === 1 ? '' : 's'}`,
                        record.bestChainFace.length > 0 ? record.bestChainFace : '—',
                        `best ${groupDigits(record.bestScore)}`,
                    ];
            lines.forEach((line, j) => {
                this.add
                    .text(x, y + 76 + j * 18, line, {
                        fontFamily: 'Arial',
                        fontSize: 11,
                        color: unlocked ? '#9fb4c8' : '#4a5666',
                        align: 'center',
                        wordWrap: { width: spacing - 16 },
                    })
                    .setOrigin(0.5, 0);
            });
        });
    }

    /** Lifetime totals + streaks, two columns of quiet numbers. */
    private renderLifetime(stats: LifetimeStats): void {
        const rows: [string, string][] = [
            ['runs', `${stats.runs} (${stats.wins} won, ${stats.deaths} lost)`],
            ['win streak', `${stats.winStreak} now, ${stats.bestWinStreak} best`],
            ['floors climbed', groupDigits(stats.totalFloors)],
            [
                'banks / voids',
                `${groupDigits(stats.totalBanks)} / ${groupDigits(stats.totalVoids)}`,
            ],
            ['perfect bounces', groupDigits(stats.totalPerfectBounces)],
            ['best run score', groupDigits(stats.bestRunScore)],
            [
                'fastest act',
                stats.fastestActTicks === null ? '—' : clockFace(stats.fastestActTicks),
            ],
        ];
        const x = 130;
        const y0 = 520;
        rows.forEach(([label, value], i) => {
            this.add
                .text(x, y0 + i * 26, label, {
                    fontFamily: 'Arial',
                    fontSize: 14,
                    color: '#8a9db0',
                })
                .setOrigin(0, 0.5);
            this.add
                .text(x + 190, y0 + i * 26, value, {
                    fontFamily: 'Arial Black',
                    fontSize: 14,
                    color: '#e8f4ff',
                })
                .setOrigin(0, 0.5);
        });
    }

    /** The lifetime ladder histogram — how often each tier was crossed. */
    private renderTierHistogram(stats: LifetimeStats): void {
        const x0 = 570;
        const y0 = 688;
        const barW = 40;
        const gap = 12;
        const maxH = 130;
        const peak = Math.max(1, ...stats.tierHistogram);
        this.add
            .text(x0 + (COMBO_TIER_NAMES.length * (barW + gap)) / 2, 500, 'TIER CROSSINGS', {
                fontFamily: 'Arial',
                fontSize: 13,
                color: '#8a9db0',
                letterSpacing: 4,
            })
            .setOrigin(0.5);
        stats.tierHistogram.forEach((count, i) => {
            const x = x0 + i * (barW + gap);
            const h = Math.max(2, Math.round((count / peak) * maxH));
            const warm = 0.35 + (0.65 * i) / (COMBO_TIER_NAMES.length - 1);
            const color = Display.Color.GetColor(
                255,
                Math.round(220 - 90 * warm),
                Math.round(140 - 100 * warm),
            );
            this.add.rectangle(x, y0, barW, h, color, count > 0 ? 0.9 : 0.25).setOrigin(0, 1);
            this.add
                .text(x + barW / 2, y0 + 12, COMBO_TIER_NAMES[i].slice(0, 4), {
                    fontFamily: 'Arial',
                    fontSize: 9,
                    color: '#8a9db0',
                })
                .setOrigin(0.5);
            if (count > 0) {
                this.add
                    .text(x + barW / 2, y0 - h - 10, `${count}`, {
                        fontFamily: 'Arial',
                        fontSize: 11,
                        color: '#e8f4ff',
                    })
                    .setOrigin(0.5);
            }
        });
    }
}
