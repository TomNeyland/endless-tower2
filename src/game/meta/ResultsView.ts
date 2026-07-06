/**
 * Results rendering — pure presentation for the ResultsScene. The summary
 * face leads with BEST CHAIN in the display treatment (glow layers under
 * the display face — the screenshot line gets the full-art moment), carries
 * seed + character + score so a shared screenshot is a complete challenge,
 * and hosts the unlock-moment cards (scrim + glow + one card at a time —
 * the celebration budget, spent with weight).
 */
import type { GameObjects, Scene } from 'phaser';
import { groupDigits } from '../../core/format';
import type { CharacterDef } from '../../core/meta/characters';
import { characterById } from '../../core/meta/characters';
import type { RunRecord } from '../../core/meta/stats';
import { modifierById } from '../../core/map/modifiers';
import { relicById } from '../../core/relics/roster';
import { Atlas, characterFrames, Gen } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../dims';
import type { FeatFireRecord } from './MetaTracker';

const CX = GAME_WIDTH / 2;

/** Ticks at 60Hz -> "4:12". */
export function clockFace(ticks: number): string {
    const totalSeconds = Math.floor(ticks / 60);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export class ResultsView {
    private readonly scene: Scene;
    private readonly record: RunRecord;
    private readonly character: CharacterDef;
    private momentObjs: GameObjects.GameObject[] = [];
    private footer: GameObjects.Text | null = null;
    private copiedFlash: GameObjects.Text | null = null;

    constructor(scene: Scene, record: RunRecord, character: CharacterDef) {
        this.scene = scene;
        this.record = record;
        this.character = character;
    }

    renderSummary(fireCount: number): void {
        const s = this.scene;
        const won = this.record.reason === 'summit';
        s.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, won ? 0x0d1424 : 0x140d12, 1).setOrigin(0);

        s.add
            .text(CX, 96, won ? 'THE SUMMIT' : 'THE LINE', {
                fontFamily: 'Arial Black',
                fontSize: 52,
                color: won ? '#ffe9b0' : '#ff8a7a',
                stroke: won ? '#3a2f14' : '#3a1714',
                strokeThickness: 8,
            })
            .setOrigin(0.5);
        s.add
            .text(CX, 148, won ? 'the run is won' : 'the tower keeps the rest', {
                fontFamily: 'Arial',
                fontSize: 18,
                color: '#9fb4c8',
            })
            .setOrigin(0.5);

        // BEST CHAIN — the flex stat, display face, full-art treatment.
        s.add
            .text(CX, 222, 'BEST CHAIN', {
                fontFamily: 'Arial',
                fontSize: 15,
                color: '#8a9db0',
                letterSpacing: 6,
            })
            .setOrigin(0.5);
        if (this.record.bestChainFace.length > 0) {
            for (const [scale, alpha] of [
                [7, 0.35],
                [4, 0.5],
            ] as const) {
                s.add
                    .image(CX, 270, Gen.glow)
                    .setScale(scale)
                    .setTint(0xffb84a)
                    .setAlpha(alpha)
                    .setBlendMode('ADD');
            }
            s.add
                .text(CX, 270, this.record.bestChainFace, {
                    fontFamily: 'Arial Black',
                    fontSize: 40,
                    color: '#ffce7a',
                    stroke: '#4a3208',
                    strokeThickness: 8,
                })
                .setOrigin(0.5);
        } else {
            s.add
                .text(CX, 270, 'no chain banked', {
                    fontFamily: 'Arial',
                    fontSize: 22,
                    color: '#5a6a7a',
                })
                .setOrigin(0.5);
        }

        s.add
            .text(CX, 342, `score ${groupDigits(this.record.totalScore)}`, {
                fontFamily: 'Arial Black',
                fontSize: 26,
                color: '#e8f4ff',
            })
            .setOrigin(0.5);
        s.add
            .text(
                CX,
                382,
                `${this.record.floorsClimbed} floors — ${clockFace(this.record.timeTicks)} — ` +
                    `${this.record.actsCompleted}/3 acts — ${this.record.coins} coins`,
                { fontFamily: 'Arial', fontSize: 16, color: '#9fb4c8' },
            )
            .setOrigin(0.5);

        // Character + seed: the challenge line. Seed taps to copy.
        s.add
            .sprite(CX - 150, 452, Atlas.characters, characterFrames(this.character.id).front)
            .setScale(0.36);
        s.add
            .text(CX - 110, 452, `${this.character.name} ${this.character.epithet}`, {
                fontFamily: 'Arial Black',
                fontSize: 17,
                color: '#e8f4ff',
            })
            .setOrigin(0, 0.5);
        const seedText = s.add
            .text(CX + 150, 452, `seed ${this.record.seed} — tap to copy`, {
                fontFamily: 'Arial',
                fontSize: 14,
                color: '#8a9db0',
            })
            .setOrigin(0, 0.5)
            .setInteractive({ useHandCursor: true });
        seedText.on('pointerdown', () => this.copySeed());

        this.footer = s.add
            .text(
                CX,
                708,
                fireCount > 0
                    ? `${fireCount} feat${fireCount === 1 ? '' : 's'} earned — ENTER`
                    : '',
                { fontFamily: 'Arial Black', fontSize: 18, color: '#ffe9b0' },
            )
            .setOrigin(0.5);
    }

    /** One unlock moment: scrim, glow, the card. Replaces the previous. */
    renderMoment(fire: FeatFireRecord, index: number, total: number): void {
        this.clearMoment();
        const s = this.scene;
        const objs: GameObjects.GameObject[] = [];
        const scrim = s.add
            .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.68)
            .setOrigin(0)
            .setDepth(50);
        objs.push(scrim);

        const cy = GAME_HEIGHT / 2 - 20;
        const glowTint = this.momentTint(fire);
        const glow = s.add
            .image(CX, cy - 60, Gen.glow)
            .setScale(9)
            .setTint(glowTint)
            .setAlpha(0)
            .setBlendMode('ADD')
            .setDepth(50);
        s.tweens.add({ targets: glow, alpha: 0.55, duration: 420, ease: 'Sine.easeOut' });
        objs.push(glow);

        const add = (y: number, text: string, size: number, color: string, bold = false): void => {
            objs.push(
                s.add
                    .text(CX, y, text, {
                        fontFamily: bold ? 'Arial Black' : 'Arial',
                        fontSize: size,
                        color,
                        align: 'center',
                        wordWrap: { width: 560 },
                    })
                    .setOrigin(0.5)
                    .setDepth(51),
            );
        };

        add(cy - 130, `FEAT — ${fire.name}`, 20, '#8a9db0');
        add(cy - 92, fire.blurb, 16, '#9fb4c8');
        const grant = fire.grant;
        if (grant === null) {
            add(cy - 20, fire.name, 44, '#ffe9b0', true);
        } else if (grant.kind === 'character') {
            const c = characterById(grant.id);
            objs.push(
                s.add
                    .sprite(CX, cy - 16, Atlas.characters, characterFrames(c.id).front)
                    .setScale(0.9)
                    .setDepth(51),
            );
            add(cy + 62, `NEW CHARACTER — ${c.name} ${c.epithet}`, 26, '#ffe9b0', true);
            add(cy + 100, c.traitLine, 16, '#bfd8ee');
        } else if (grant.kind === 'relic') {
            const r = relicById(grant.id);
            objs.push(
                s.add
                    .image(CX, cy - 16, Gen.glow)
                    .setScale(2.2)
                    .setTint(r.tell.color)
                    .setBlendMode('ADD')
                    .setDepth(51),
            );
            add(cy + 62, `NEW RELIC — ${r.name}`, 26, '#ffe9b0', true);
            add(cy + 100, r.blurb, 16, '#bfd8ee');
        } else {
            const m = modifierById(grant.id);
            add(cy - 12, m.name.toUpperCase(), 34, '#ffe9b0', true);
            add(cy + 42, 'NEW MAP MODIFIER', 18, '#e8f4ff', true);
            add(cy + 78, `${m.price.length > 0 ? `${m.price} — ` : ''}${m.pay}`, 15, '#bfd8ee');
        }
        add(GAME_HEIGHT - 96, `${index + 1} / ${total} — ENTER`, 15, '#8a9db0');
        this.momentObjs = objs;
    }

    /** The final footer: museum or menu. */
    renderHandoff(): void {
        this.footer?.setText('M — museum      ENTER — menu');
    }

    private momentTint(fire: FeatFireRecord): number {
        if (fire.grant?.kind === 'relic') {
            return relicById(fire.grant.id).tell.color;
        }
        return 0xffb84a;
    }

    private clearMoment(): void {
        for (const obj of this.momentObjs) {
            obj.destroy();
        }
        this.momentObjs = [];
    }

    private copySeed(): void {
        navigator.clipboard?.writeText(this.record.seed);
        this.copiedFlash?.destroy();
        this.copiedFlash = this.scene.add
            .text(CX + 150, 474, 'copied', { fontFamily: 'Arial', fontSize: 13, color: '#ffe9b0' })
            .setOrigin(0, 0.5);
        this.scene.tweens.add({
            targets: this.copiedFlash,
            alpha: 0,
            delay: 700,
            duration: 400,
            onComplete: () => {
                this.copiedFlash?.destroy();
                this.copiedFlash = null;
            },
        });
    }

    destroy(): void {
        this.clearMoment();
        this.copiedFlash?.destroy();
    }
}
