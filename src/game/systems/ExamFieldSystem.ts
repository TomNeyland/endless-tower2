/**
 * The platform field + swarm at the Phaser boundary (EXAM). All rules live
 * in the engine-free core (exam/field.ts, exam/swarm.ts) — the same code the
 * headless replay steps — so this system only:
 *
 *  1. arms PlayerSystem's contact-time classifier,
 *  2. arms crumble ledges from the land events (the regenerable channel),
 *  3. steps field + swarm once per fixed tick AFTER pressure (handler
 *     registration order in the scene — mirrored exactly by simulateSession),
 *  4. applies the physical consequences (disabled bodies, drained speed)
 *     through the sanctioned surfaces, and narrates them via TowerView,
 *  5. is the ONE door for commanded mutations: issue() applies a command
 *     and records it on the exam-command timeline in the same breath — a
 *     command that reached the world unrecorded cannot exist.
 */
import { Physics, type Scene } from 'phaser';
import type { EventBus, LandEvent } from '../../core/events';
import { applyExamCommand, type ExamCommand } from '../../core/exam/commands';
import { type FieldChange, PlatformField } from '../../core/exam/field';
import { seedPassiveSwarm } from '../../core/exam/passive-swarm';
import { SwarmRuntime } from '../../core/exam/swarm';
import type { InputRecorder } from '../../core/input/recorder';
import { doorPlacementFor, type SegmentSpec } from '../../core/pressure/segment';
import type { TowerLayout } from '../../core/tower';
import type { TuningStack } from '../../core/tuning';
import type { PlayerSystem } from '../player/PlayerSystem';
import type { PressureSystem } from './PressureSystem';
import type { TowerView } from './TowerView';

export class ExamFieldSystem {
    readonly field: PlatformField;
    readonly swarm = new SwarmRuntime();

    private readonly world: Physics.Arcade.World;
    private readonly player: PlayerSystem;
    private readonly t: TuningStack;
    private readonly bus: EventBus;
    private readonly recorder: InputRecorder;
    private readonly towerView: TowerView;
    private readonly layout: TowerLayout;
    private readonly pressure: PressureSystem;
    private lastContactTick = -1;

    private readonly onWorldStep = (): void => this.step();

    private readonly onLand = (e: LandEvent): void => {
        // The regenerable channel: a touch arms a crumble ledge. Never
        // recorded — the headless replay re-derives it from this same event.
        this.field.handleLand(e.platformId, e.tick, this.t.value('land.crumbleDelayTicks'));
    };

    constructor(
        scene: Scene,
        layout: TowerLayout,
        player: PlayerSystem,
        pressure: PressureSystem,
        towerView: TowerView,
        bus: EventBus,
        tuning: TuningStack,
        recorder: InputRecorder,
        segment: SegmentSpec,
    ) {
        this.player = player;
        this.t = tuning;
        this.bus = bus;
        this.recorder = recorder;
        this.towerView = towerView;
        this.layout = layout;
        this.pressure = pressure;
        this.field = new PlatformField(layout.platforms);
        seedPassiveSwarm(this.swarm, layout, segment, tuning);

        player.setLandClassifier((platformId) => this.field.classification(platformId));
        bus.on('movement/land', this.onLand);
        this.world = scene.physics.world;
        // Registered after PlayerSystem's and PressureSystem's handlers
        // (construction order in the scene) — the exam step always runs on
        // post-movement, post-pressure state, exactly like the headless loop.
        this.world.on(Physics.Arcade.Events.WORLD_STEP, this.onWorldStep);
    }

    /**
     * THE commanded-mutation door: apply + record, one breath. The boss
     * brain's decisions and the bridge's forced attacks both come through
     * here, so every command that touched the world is on the timeline.
     */
    issue(cmd: ExamCommand): void {
        const tick = this.player.currentTick;
        applyExamCommand(
            {
                field: this.field,
                swarm: this.swarm,
                setDoor: (platformId) => {
                    this.pressure.setDoor(
                        doorPlacementFor(this.layout, platformId, this.t.value('FLOOR_HEIGHT_PX')),
                    );
                },
            },
            cmd,
            tick,
        );
        this.recorder.recordExamCommand(cmd);
        if (cmd.op === 'classify') {
            this.towerView.applyClass(cmd.platformId, cmd.classification);
        }
    }

    /** Contacted-this-tick marker for the swarm view's hit pulse. */
    contactHappenedAt(): number {
        return this.lastContactTick;
    }

    private step(): void {
        const kin = this.player.kinematics();
        for (const change of this.field.step(kin.tick)) {
            this.applyChange(change);
        }
        const contacts = this.swarm.step(
            kin.tick,
            { x: kin.x, y: kin.y },
            this.t.value('exam.swarmHitCooldownTicks'),
        );
        if (contacts.contacts.length > 0) {
            // One combined drain per tick, through the sanctioned surface —
            // the swarm taxes momentum, never hearts, never the controls.
            this.player.applySpeedKeep(this.t.value('exam.swarmSpeedKeep'));
            this.lastContactTick = kin.tick;
        }
    }

    private applyChange(change: FieldChange): void {
        switch (change.kind) {
            case 'collapse_started':
                this.towerView.setCollapsing(change.platformId);
                break;
            case 'removed':
                this.player.disablePlatform(change.platformId);
                this.towerView.removePlatform(change.platformId);
                break;
            case 'classified':
                // Commanded classifications already narrated in issue();
                // regenerated ones (none today) would land here too.
                this.towerView.applyClass(change.platformId, change.classification);
                break;
        }
    }

    destroy(): void {
        this.world.off(Physics.Arcade.Events.WORLD_STEP, this.onWorldStep);
        this.bus.off('movement/land', this.onLand);
    }
}
