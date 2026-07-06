/**
 * The boss's BODY — the mandate made visible (issue #56, bosses.md
 * Embodiment). A double-resolution Kenney enemy at scale 2 (~4 player
 * heights), the biggest living thing in the game: it PERCHES on ledges
 * ahead of you, drops past you, keeps pace as you climb; it AGITATES when
 * your chain reaches SOARING; damage LANDS on it scaled by loudness
 * (whisper = flinch, voice = stagger with knockback flash, roar =
 * knockdown + a helpless beat); phase turns wear it down (tint + one
 * full-frame statement); it arrives in an authored entrance and falls
 * PAST you into its own line on defeat. The spectator test governs: watch
 * the body, know the score.
 *
 * Presentation only, by law: its position never touches physics — the
 * boss's mechanical truth is its telegraphed attacks (the doc's own
 * ruling: body-blocking must never read as unfair collision, so contact
 * has no hidden physics; the body blocks routes by LOOMING, not by
 * colliding).
 */
import type { GameObjects, Scene, Tweens } from 'phaser';
import type { BossDef } from '../../core/boss/types';
import type { ComboBus } from '../../core/combo/bus';
import type { ComboTierEvent } from '../../core/combo/types';
import type {
    BossDefeatedEvent,
    BossHitEvent,
    BossPhaseEvent,
    BossSpawnedEvent,
    BossTelegraphEvent,
    EventBus,
} from '../../core/events';
import type { TuningStack } from '../../core/tuning';
import { Atlas } from '../assets';
import { GAME_HEIGHT } from '../main';
import type { PlayerSystem } from '../player/PlayerSystem';
import type { ExamFieldSystem } from '../systems/ExamFieldSystem';
import type { JuiceSystem } from '../systems/JuiceSystem';
import type { TowerView } from '../systems/TowerView';

const BOSS_SCALE = 2; // 128px frames -> 256px: four player-heights
const BOSS_DEPTH = 3.5; // among the tower, behind the player's story
const SOARING_TIER = 3;
const REPOSE_MS = 2600;

type Mood = 'entering' | 'roaming' | 'leaping' | 'helpless' | 'falling';

export class BossBody {
    private readonly scene: Scene;
    private readonly def: BossDef;
    private readonly player: PlayerSystem;
    private readonly examField: ExamFieldSystem;
    private readonly towerView: TowerView;
    private readonly juice: JuiceSystem;
    private readonly bus: EventBus;
    private readonly comboBus: ComboBus;
    private readonly t: TuningStack;

    private sprite: GameObjects.Image;
    private moveTween: Tweens.Tween | null = null;
    private mood: Mood = 'entering';
    private agitated = false;
    private frameFlip = false;
    private frameAt = 0;
    private repositionAt = 0;
    private phaseTint: number;

    private readonly onSpawned = (e: BossSpawnedEvent): void => {
        void e;
        // The arrival: it drops from above the player's view onto a perch,
        // heavy enough to feel (the entrance spends a boss impact).
        const kin = this.player.kinematics();
        this.sprite.setVisible(true).setPosition(kin.x, kin.y - GAME_HEIGHT);
        const perch = this.perchNear(4);
        this.mood = 'entering';
        this.moveTween = this.scene.tweens.add({
            targets: this.sprite,
            x: perch.x,
            y: perch.y,
            duration: 1200,
            ease: 'Quad.easeIn',
            onComplete: () => {
                this.juice.bossImpact(3, 140);
                this.mood = 'roaming';
            },
        });
    };

    private readonly onTier = (e: ComboTierEvent): void => {
        // It REACTS to your chain, live: SOARING+ reads as agitation —
        // the "break their chain" telegraph surface, embodied.
        this.agitated = e.tierIndex >= SOARING_TIER;
    };

    private readonly onChainEnded = (): void => {
        this.agitated = false;
    };

    private readonly onTelegraph = (e: BossTelegraphEvent): void => {
        if (e.kind !== 'body_slam' || this.mood === 'falling') {
            return;
        }
        // The slam IS the boss: it leaps to the band it is about to break,
        // arriving exactly at resolve — its own body is the telegraph.
        const target = this.towerView.platformAnchor(e.targetPlatformIds[0] ?? -1);
        if (!target) {
            return;
        }
        this.mood = 'leaping';
        this.moveTween?.stop();
        this.moveTween = this.scene.tweens.add({
            targets: this.sprite,
            x: target.x,
            y: target.y - 90,
            duration: Math.max(120, ((e.resolveTick - e.tick) * 1000) / 60),
            ease: 'Quad.easeIn',
            onComplete: () => {
                this.juice.bossImpact(4, 160);
                if (this.mood === 'leaping') {
                    this.mood = 'roaming';
                    this.repositionAt = this.scene.time.now + 900;
                }
            },
        });
    };

    private readonly onHit = (e: BossHitEvent): void => {
        if (this.mood === 'falling') {
            return;
        }
        // Damage lands VISIBLY, scaled by loudness — the body is the real
        // health bar.
        if (e.loudness === 'whisper') {
            this.flashTint(0xffffff, 90);
            this.nudge(10, 70);
            return;
        }
        if (e.loudness === 'voice') {
            this.flashTint(0xffffff, 170);
            this.nudge(34, 150);
            return;
        }
        // ROAR: knockdown + a beat of helplessness — a building fell on it.
        this.mood = 'helpless';
        this.moveTween?.stop();
        this.sprite.setTexture(Atlas.enemiesDouble, this.def.presentation.flatFrame);
        this.flashTint(0xffffff, 220);
        this.juice.bossImpact(4, 180);
        this.scene.tweens.add({
            targets: this.sprite,
            y: this.sprite.y + 46,
            angle: { from: -6, to: 6 },
            duration: 160,
            yoyo: true,
            repeat: 2,
        });
        this.scene.time.delayedCall(820, () => {
            if (this.mood === 'helpless') {
                this.sprite.setAngle(0);
                this.mood = 'roaming';
                this.repositionAt = 0; // it scrambles back into the fight
            }
        });
    };

    private readonly onPhase = (e: BossPhaseEvent): void => {
        // Wear states: the body changes at 2/3 and 1/3 — and each phase
        // turn spends its one allowed full-frame statement.
        this.phaseTint = this.def.presentation.phaseTints[Math.min(2, e.phase - 1)];
        this.sprite.setTint(this.phaseTint);
        this.scene.cameras.main.flash(240, 255, 236, 210, false);
        this.nudge(24, 200);
    };

    private readonly onDefeated = (_e: BossDefeatedEvent): void => {
        // The authored defeat: it falls PAST you, down into its own line —
        // the tower's justice — and the door lights after the beat.
        this.mood = 'falling';
        this.moveTween?.stop();
        this.sprite.setTexture(Atlas.enemiesDouble, this.def.presentation.flatFrame);
        const kin = this.player.kinematics();
        this.scene.tweens.add({
            targets: this.sprite,
            y: kin.y + GAME_HEIGHT * 1.4,
            angle: 200,
            alpha: 0.35,
            duration: (this.def.defeatBeatTicks * 1000) / 60 + 500,
            ease: 'Quad.easeIn',
            onComplete: () => this.sprite.setVisible(false),
        });
    };

    constructor(
        scene: Scene,
        def: BossDef,
        player: PlayerSystem,
        examField: ExamFieldSystem,
        towerView: TowerView,
        juice: JuiceSystem,
        bus: EventBus,
        comboBus: ComboBus,
        tuning: TuningStack,
    ) {
        this.scene = scene;
        this.def = def;
        this.player = player;
        this.examField = examField;
        this.towerView = towerView;
        this.juice = juice;
        this.bus = bus;
        this.comboBus = comboBus;
        this.t = tuning;
        this.phaseTint = def.presentation.phaseTints[0];

        this.sprite = scene.add
            .image(0, 0, Atlas.enemiesDouble, def.presentation.restFrame)
            .setScale(BOSS_SCALE)
            .setDepth(BOSS_DEPTH)
            .setVisible(false);

        bus.on('boss/spawned', this.onSpawned);
        bus.on('boss/telegraph', this.onTelegraph);
        bus.on('boss/hit', this.onHit);
        bus.on('boss/phase', this.onPhase);
        bus.on('boss/defeated', this.onDefeated);
        comboBus.on('combo/tier', this.onTier);
        comboBus.on('combo/banked', this.onChainEnded);
        comboBus.on('combo/voided', this.onChainEnded);
        comboBus.on('combo/reset', this.onChainEnded);
    }

    /** Per render frame: animation tempo, facing, and the roam brain. */
    update(): void {
        const now = this.scene.time.now;
        const kin = this.player.kinematics();

        // Two-frame animation whose TEMPO is the reaction channel: agitation
        // at SOARING+ reads from across the room.
        const tempo = this.mood === 'helpless' ? 900 : this.agitated ? 130 : 420;
        if (now >= this.frameAt && this.mood !== 'helpless' && this.mood !== 'falling') {
            this.frameAt = now + tempo;
            this.frameFlip = !this.frameFlip;
            const frames = this.def.presentation.moveFrames;
            this.sprite.setTexture(Atlas.enemiesDouble, this.frameFlip ? frames[0] : frames[1]);
        }
        // It watches you (and glances get quicker when it is worried).
        this.sprite.setFlipX(kin.x > this.sprite.x);

        if (this.mood !== 'roaming' || now < this.repositionAt) {
            return;
        }
        this.repositionAt = now + REPOSE_MS + (this.agitated ? -800 : 0);

        // Keep pace: if the player climbed past (or fell away from) its
        // perch band, move — ahead of you when you climb, dropping past you
        // when it repositions below.
        const floorH = this.t.value('FLOOR_HEIGHT_PX');
        const bossAbovePlayerFloors = (kin.y - this.sprite.y) / floorH;
        if (bossAbovePlayerFloors < 2 || bossAbovePlayerFloors > 9) {
            const perch = this.perchNear(this.agitated ? 3 : 5);
            this.moveTween?.stop();
            this.moveTween = this.scene.tweens.add({
                targets: this.sprite,
                x: perch.x,
                y: perch.y,
                duration: 700,
                ease: 'Sine.easeInOut',
            });
        }
    }

    /** An intact perch a few floors above the player — its stage marks. */
    private perchNear(floorsAbove: number): { x: number; y: number } {
        const kin = this.player.kinematics();
        const floorH = this.t.value('FLOOR_HEIGHT_PX');
        const targetY = kin.feetY - floorsAbove * floorH;
        let best: { x: number; y: number } | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const id of this.examField.field.intactIds()) {
            const anchor = this.towerView.platformAnchor(id);
            if (!anchor) {
                continue;
            }
            const dist = Math.abs(anchor.y - targetY);
            if (dist < bestDist) {
                bestDist = dist;
                best = { x: anchor.x, y: anchor.y - 90 };
            }
        }
        // No intact perch in reach: cling to a wall beside the player.
        return best ?? { x: kin.x < 512 ? 880 : 144, y: targetY };
    }

    private flashTint(color: number, ms: number): void {
        this.sprite.setTint(color);
        this.scene.time.delayedCall(ms, () => {
            this.sprite.setTint(this.phaseTint);
            if (this.mood !== 'helpless' && this.mood !== 'falling') {
                this.sprite.setTexture(Atlas.enemiesDouble, this.def.presentation.moveFrames[0]);
            }
        });
    }

    /** A quick displacement that reads as impact, then settle back. */
    private nudge(px: number, ms: number): void {
        const kin = this.player.kinematics();
        const away = Math.sign(this.sprite.x - kin.x) || 1;
        this.scene.tweens.add({
            targets: this.sprite,
            x: this.sprite.x + away * px,
            duration: ms,
            yoyo: true,
            ease: 'Quad.easeOut',
        });
    }

    destroy(): void {
        this.bus.off('boss/spawned', this.onSpawned);
        this.bus.off('boss/telegraph', this.onTelegraph);
        this.bus.off('boss/hit', this.onHit);
        this.bus.off('boss/phase', this.onPhase);
        this.bus.off('boss/defeated', this.onDefeated);
        this.comboBus.off('combo/tier', this.onTier);
        this.comboBus.off('combo/banked', this.onChainEnded);
        this.comboBus.off('combo/voided', this.onChainEnded);
        this.comboBus.off('combo/reset', this.onChainEnded);
        this.moveTween?.stop();
        this.sprite.destroy();
    }
}
