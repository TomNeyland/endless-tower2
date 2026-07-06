/**
 * The flight recorder (docs/design/session-logs.md): always on in dev.
 * Records from scene start; M pins a tick-stamped marker with a HUD flash
 * (the core playtest gesture — remarks arrive pre-anchored to the exact
 * simulation moment); F9 exports the live session; run resets and scene
 * shutdown auto-save to the vault ring. Wall-clock stamps happen here in
 * the game layer, at the save/export boundary — core never reads a clock.
 */
import type { Scene } from 'phaser';
import type { EventBus, MovementEvent } from '../../core/events';
import type { InputRecorder, MarkerTag } from '../../core/input/recorder';
import {
    type SessionRecording,
    sessionFromRecording,
    shouldIndexEvent,
} from '../../core/input/session';
import type { ActiveSegment } from '../../core/pressure/segment';
import type { TowerLayout } from '../../core/tower';
import type { PlayerSystem } from '../player/PlayerSystem';
import { SessionVault } from './SessionVault';

/** The pressure context a session records, plus the one way to renew it. */
export interface SessionPressureContext {
    segment: ActiveSegment | null;
    heartsCarried: number | null;
    /** Restart the scene into a fresh segment (fresh line, fresh hearts). */
    restartSegment: () => void;
}

export class SessionLog {
    readonly vault = new SessionVault();

    private readonly scene: Scene;
    private readonly bus: EventBus;
    private readonly recorder: InputRecorder;
    private readonly player: PlayerSystem;
    private readonly tower: TowerLayout;
    private readonly pressure: SessionPressureContext;
    private startedAt = '';
    private disposed = false;
    private restartRequested = false;

    private readonly onBusEvent = (event: MovementEvent): void => {
        if (this.recorder.mode === 'recording' && shouldIndexEvent(event.type)) {
            this.recorder.recordIndexTick(event.type, event.tick);
        }
    };

    private readonly onMarkerKey = (): void => this.marker();
    private readonly onExportKey = (): void => this.exportLive();

    constructor(
        scene: Scene,
        bus: EventBus,
        recorder: InputRecorder,
        player: PlayerSystem,
        tower: TowerLayout,
        pressure: SessionPressureContext,
    ) {
        this.scene = scene;
        this.bus = bus;
        this.recorder = recorder;
        this.player = player;
        this.tower = tower;
        this.pressure = pressure;
        bus.onAny(this.onBusEvent);
        scene.input.keyboard?.on('keydown-M', this.onMarkerKey);
        scene.input.keyboard?.on('keydown-F9', this.onExportKey);
        this.beginSession();
    }

    /** Reset the player to spawn and start a fresh recording. */
    private beginSession(): void {
        this.player.beginRecording();
        this.startedAt = new Date().toISOString();
    }

    /**
     * Keep the flight recorder always-on: when a bridge replay or a manual
     * recorder stop leaves the harness idle, resume recording from a clean
     * spawn. Called once per render frame from the scene.
     *
     * In segment mode "a clean spawn" is not enough: an in-place player
     * reset under a live, mid-arena line would start a recording whose
     * tick-0 world state is not reconstructible from its own header (and
     * teleport the player to spawn under an active line — an unearned
     * catch, pillar 2's named failure). The ruling (docs/DEVIATIONS.md
     * entry 9): resume by restarting the scene into a fresh segment, so
     * every segment recording begins at scene create.
     */
    update(): void {
        if (this.disposed || this.recorder.mode !== 'idle') {
            return;
        }
        if (this.pressure.segment) {
            if (!this.restartRequested) {
                this.restartRequested = true;
                this.pressure.restartSegment();
            }
            return;
        }
        this.beginSession();
    }

    /** Pin a marker to the current tick, with the HUD acknowledgment flash. */
    marker(tag: MarkerTag | null = null): void {
        if (this.recorder.mode !== 'recording') {
            console.warn('et2: marker ignored — no live session (replay in progress?)');
            return;
        }
        const tick = this.player.currentTick;
        this.recorder.addMarker(tick, tag);
        this.flash(`MARKER ${tick}${tag ? ` ${tag}` : ''}`);
    }

    /** F9 / __ET2__.exportSession(): download the live session, undisturbed. */
    exportLive(): void {
        const session = this.buildSession('live-export');
        this.vault.download(session);
        this.flash(`EXPORTED ${session.ticks} TICKS`);
    }

    /** Auto-save into the ring; empty sessions are not worth a slot. */
    save(endReason: 'reset' | 'shutdown'): void {
        if (this.recorder.mode !== 'recording') {
            return;
        }
        const recording = this.recorder.stopRecording();
        if (recording.frames.length === 0) {
            return;
        }
        this.vault.push(
            sessionFromRecording(
                recording,
                this.tower,
                {
                    startedAt: this.startedAt,
                    savedAt: new Date().toISOString(),
                    endReason,
                },
                this.pressure.segment,
                this.pressure.heartsCarried,
            ),
        );
    }

    /** The run-reset path: save the session that just ended, start the next. */
    cycle(): void {
        this.save('reset');
        this.beginSession();
    }

    private buildSession(endReason: SessionRecording['endReason']): SessionRecording {
        return sessionFromRecording(
            this.recorder.snapshot(),
            this.tower,
            {
                startedAt: this.startedAt,
                savedAt: new Date().toISOString(),
                endReason,
            },
            this.pressure.segment,
            this.pressure.heartsCarried,
        );
    }

    /** Minimal HUD acknowledgment — a brief fading stamp, nothing more. */
    private flash(text: string): void {
        const label = this.scene.add
            .text(this.scene.scale.width / 2, 96, text, {
                fontFamily: 'monospace',
                fontSize: '18px',
                color: '#ffffff',
                backgroundColor: '#00000080',
                padding: { x: 8, y: 4 },
            })
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(1000);
        this.scene.tweens.add({
            targets: label,
            alpha: 0,
            delay: 350,
            duration: 450,
            onComplete: () => label.destroy(),
        });
    }

    destroy(): void {
        this.disposed = true;
        this.save('shutdown');
        this.scene.input.keyboard?.off('keydown-M', this.onMarkerKey);
        this.scene.input.keyboard?.off('keydown-F9', this.onExportKey);
        this.bus.offAny(this.onBusEvent);
    }
}
