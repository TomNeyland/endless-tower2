/**
 * The boss's BODY — the mandate made visible (issue #56, bosses.md
 * Embodiment). A double-resolution Kenney enemy at scale 2 (~4 player
 * heights), the biggest living thing in the game: it PERCHES on ledges
 * ahead of you, drops past you, keeps pace as you climb; it AGITATES when
 * your chain reaches SOARING; damage LANDS on it scaled by loudness
 * (whisper = flinch, voice = stagger with knockback flash, roar =
 * knockdown + a helpless beat); phase turns wear it down (tint + one
 * full-frame statement); the openness window is a visible STANCE (gold
 * exposure aura + an exposed crawl, held exactly while the brain holds the
 * window — the banking timing decision the doc promises); it arrives in an
 * authored entrance and falls PAST you into its own line on defeat. The
 * spectator test governs: watch the body, know the score.
 *
 * Presentation only, by law: its position never touches physics — the
 * boss's mechanical truth is its telegraphed attacks (the doc's own
 * ruling: body-blocking must never read as unfair collision, so contact
 * has no hidden physics; the body blocks routes by LOOMING, not by
 * colliding).
 */
import { BlendModes, type GameObjects, type Scene, type Tweens } from 'phaser';
import type { BossDef } from '../../core/boss/types';
import type { ComboBus } from '../../core/combo/bus';
import type { ComboTierEvent } from '../../core/combo/types';
import type {
    BossDefeatedEvent,
    BossHitEvent,
    BossOpennessEvent,
    BossPhaseEvent,
    BossSpawnedEvent,
    BossTelegraphEvent,
    EventBus,
} from '../../core/events';
import type { TuningStack } from '../../core/tuning';
import { Atlas, type BossFrameSet, bossFrames, Gen } from '../assets';
import { GAME_HEIGHT } from '../main';
import type { PlayerSystem } from '../player/PlayerSystem';
import type { ExamFieldSystem } from '../systems/ExamFieldSystem';
import type { JuiceSystem } from '../systems/JuiceSystem';
import type { TowerView } from '../systems/TowerView';

const BOSS_SCALE = 2; // 128px frames -> 256px: four player-heights
const BOSS_DEPTH = 3.5; // among the tower, behind the player's story
const SOARING_TIER = 3;
const REPOSE_MS = 2600;
/** The openness stance: gold — the same money color a multiplied bit earns. */
const OPEN_TINT = 0xffd75a;

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

    private readonly frames: BossFrameSet;
    private sprite: GameObjects.Image;
    private aura: GameObjects.Image;
    private auraTween: Tweens.Tween | null = null;
    private moveTween: Tweens.Tween | null = null;
    private mood: Mood = 'entering';
    private agitated = false;
    private open = false;
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
        // health bar. A hit inside the openness window flashes GOLD (the
        // stance's own color): a multiplied bank READS as multiplied.
        const flash = e.openness ? OPEN_TINT : 0xffffff;
        if (e.loudness === 'whisper') {
            this.flashTint(flash, 90);
            this.nudge(10, 70);
            return;
        }
        if (e.loudness === 'voice') {
            this.flashTint(flash, 170);
            this.nudge(34, 150);
            return;
        }
        // ROAR: knockdown + a beat of helplessness — a building fell on it.
        this.mood = 'helpless';
        this.moveTween?.stop();
        this.sprite.setTexture(Atlas.enemiesDouble, this.frames.flat);
        this.flashTint(flash, 220);
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

    /**
     * The openness window, VISIBLE (bosses.md: "a visible openness window
     * (stance change...) gives banking a timing decision"): a gold exposure
     * aura pulses around the body and its animation slumps to an exposed
     * crawl for exactly the window the brain holds open. The brain emits no
     * `exited` on defeat (a dead boss has no stance), so onDefeated also
     * drops it.
     */
    private readonly onOpenness = (e: BossOpennessEvent): void => {
        if (e.state === 'entered' && this.mood !== 'falling') {
            this.open = true;
            this.aura.setPosition(this.sprite.x, this.sprite.y).setVisible(true).setAlpha(0.2);
            this.auraTween?.stop();
            this.auraTween = this.scene.tweens.add({
                targets: this.aura,
                alpha: { from: 0.2, to: 0.55 },
                duration: 340,
                yoyo: true,
                repeat: -1,
            });
        } else {
            this.closeStance();
        }
    };

    private closeStance(): void {
        this.open = false;
        this.auraTween?.stop();
        this.auraTween = null;
        this.aura.setVisible(false);
    }

    private readonly onDefeated = (_e: BossDefeatedEvent): void => {
        // The authored defeat: it falls PAST you, down into its own line —
        // the tower's justice — and the door lights after the beat.
        this.closeStance();
        this.mood = 'falling';
        this.moveTween?.stop();
        this.sprite.setTexture(Atlas.enemiesDouble, this.frames.flat);
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
        this.frames = bossFrames(def.presentation.frameSet);

        this.sprite = scene.add
            .image(0, 0, Atlas.enemiesDouble, this.frames.rest)
            .setScale(BOSS_SCALE)
            .setDepth(BOSS_DEPTH)
            .setVisible(false);
        // The exposure aura — the openness window's stance light. Behind the
        // body, additive, gold; alive only while the brain holds it open.
        this.aura = scene.add
            .image(0, 0, Gen.glow)
            .setDisplaySize(420, 420)
            .setTint(OPEN_TINT)
            .setBlendMode(BlendModes.ADD)
            .setDepth(BOSS_DEPTH - 0.1)
            .setVisible(false);

        bus.on('boss/spawned', this.onSpawned);
        bus.on('boss/telegraph', this.onTelegraph);
        bus.on('boss/hit', this.onHit);
        bus.on('boss/phase', this.onPhase);
        bus.on('boss/openness', this.onOpenness);
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
        // at SOARING+ reads from across the room, and the openness stance
        // slumps to an exposed crawl — the window is visible in the body
        // itself, not just the aura.
        const tempo = this.mood === 'helpless' ? 900 : this.open ? 680 : this.agitated ? 130 : 420;
        if (now >= this.frameAt && this.mood !== 'helpless' && this.mood !== 'falling') {
            this.frameAt = now + tempo;
            this.frameFlip = !this.frameFlip;
            const frames = this.frames.move;
            this.sprite.setTexture(Atlas.enemiesDouble, this.frameFlip ? frames[0] : frames[1]);
        }
        // It watches you (and glances get quicker when it is worried).
        this.sprite.setFlipX(kin.x > this.sprite.x);
        // The exposure aura rides the body wherever its tweens carry it.
        if (this.open) {
            this.aura.setPosition(this.sprite.x, this.sprite.y);
        }

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
                this.sprite.setTexture(Atlas.enemiesDouble, this.frames.move[0]);
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
        this.bus.off('boss/openness', this.onOpenness);
        this.bus.off('boss/defeated', this.onDefeated);
        this.comboBus.off('combo/tier', this.onTier);
        this.comboBus.off('combo/banked', this.onChainEnded);
        this.comboBus.off('combo/voided', this.onChainEnded);
        this.comboBus.off('combo/reset', this.onChainEnded);
        this.auraTween?.stop();
        this.moveTween?.stop();
        this.aura.destroy();
        this.sprite.destroy();
    }
}
