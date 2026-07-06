/**
 * The debug bridge: window.__ET2__. All diagnostics live here — live tuning
 * get/set, the event ring buffer, the input recorder/replay harness, and the
 * stats surface. Debug never leaks into production scenes: this object is
 * invisible unless you open the console, and nothing in the game reads it.
 */
import type { ChainSummary, ComboTripwires } from '../../core/combo/engine';
import {
    type AnyComboEvent,
    type AnyComboEventType,
    COMBO_SCHEMA_VERSION,
    type SessionStats,
} from '../../core/combo/types';
import {
    EVENT_SCHEMA_VERSION,
    type EventBus,
    type MovementEvent,
    type MovementEventType,
    type TickEvent,
} from '../../core/events';
import type { MarkerTag, Recording, ReplayReport } from '../../core/input/recorder';
import type { SessionRecording } from '../../core/input/session';
import {
    DEFAULT_TUNING,
    type TuningKey,
    type TuningLayer,
    type TuningStack,
    type TuningTable,
} from '../../core/tuning';
import type { PressureSnapshot, SegmentSpec } from '../../core/pressure/segment';
import type { PlayerSystem } from '../player/PlayerSystem';
import type { PressureSystem } from '../systems/PressureSystem';
import {
    EngineFactChecker,
    type EngineFactReport,
    syntheticFactScript,
    waitUntil,
} from './EngineFacts';
import type { Game } from 'phaser';
import type { ComboRelay } from '../systems/ComboRelay';
import type { SessionLog } from '../systems/SessionLog';
import type { SessionSummary } from '../systems/SessionVault';
import type { MovementStats, StatsSnapshot } from './Stats';

const RING_SIZE = 1024;
const TICK_RING_SIZE = 600;
const COMBO_RING_SIZE = 512;

export interface Et2Bridge {
    schemaVersion: number;
    tuning: {
        get(key?: TuningKey): number | TuningTable;
        set(key: TuningKey, value: number): void;
        defaults(): TuningTable;
        layers(): readonly TuningLayer[];
        pushLayer(layer: TuningLayer): void;
        removeLayer(id: string): boolean;
        /** Pop-by-owner (the finding-6 contract): removes every layer the
         *  owner holds, returns how many. */
        removeByOwner(owner: string): number;
    };
    events: {
        recent(count?: number, type?: MovementEventType): MovementEvent[];
        tickFrames(count?: number): TickEvent[];
        clear(): void;
    };
    recorder: {
        record(): void;
        stop(): Recording;
        replay(recording?: Recording): void;
        report(): ReplayReport | null;
        lastRecording(): Recording | null;
    };
    stats: {
        snapshot(): StatsSnapshot;
        reset(): void;
    };
    verify: {
        /** Instrumentation gate #1, re-runnable: drives a synthetic scripted
         *  replay and checks the three engine facts. Drift = stop the line. */
        engineFacts(): Promise<EngineFactReport>;
    };
    /** PRESSURE: segment mode + death-line harness (docs/design/pressure.md).
     *  startSegment/stopSegment restart the scene — re-read window.__ET2__. */
    pressure: {
        startSegment(spec?: Partial<SegmentSpec>): SegmentSpec;
        stopSegment(): void;
        state(): PressureSnapshot | null;
        lineTeleport(y: number): void;
        lineSpeedOverride(pxPerSec: number | null): void;
        /** Force a catch attempt now; false while invulnerable — the
         *  one-catch-per-invuln invariant's harness handle. */
        forceCatch(): boolean;
        forceExit(): boolean;
    };
    combo: {
        schemaVersion: number;
        recent(count?: number, type?: AnyComboEventType): AnyComboEvent[];
        /** Session stat block (score-owned) — includes refarmedFloorShare. */
        stats(): SessionStats;
        /** The three counters that must read 0 forever. */
        tripwires(): ComboTripwires;
        /** Live chain view for the harness — never a payout surface. */
        chain(): ChainSummary;
        /** Inject run signals (orchestration-only port; harness use). */
        forceBank(): void;
        forceVoid(): void;
        clear(): void;
    };
    /**
     * Drive the game loop manually for N render frames (~1 fixed step each).
     * Hidden tabs never fire requestAnimationFrame, so scripted verification
     * through the Chrome harness stalls without this — the playtest protocol
     * (DESIGN.md) requires deterministic checks to run unattended.
     */
    pump(steps?: number): void;
    /** Download the live session (same as F9): file + clipboard when small. */
    exportSession(): void;
    /** Pin a tick-stamped marker to the live session, optionally tagged. */
    marker(tag?: MarkerTag): void;
    /** The auto-saved ring of the last five sessions. */
    sessions: {
        list(): SessionSummary[];
        get(index: number): SessionRecording;
        export(index: number): void;
    };
    reset(): void;
}

declare global {
    interface Window {
        __ET2__?: Et2Bridge;
    }
}

interface BridgeDeps {
    game: Game;
    bus: EventBus;
    tuning: TuningStack;
    player: PlayerSystem;
    stats: MovementStats;
    combo: ComboRelay;
    session: SessionLog;
    resetSandbox: () => void;
    pressure: {
        system: PressureSystem;
        startSegment: (spec?: Partial<SegmentSpec>) => SegmentSpec;
        stopSegment: () => void;
    };
}

export class DebugBridge {
    private readonly deps: BridgeDeps;
    private ring: MovementEvent[] = [];
    private tickRing: TickEvent[] = [];
    private comboRing: AnyComboEvent[] = [];
    private lastRecording: Recording | null = null;

    private readonly onComboEvent = (event: AnyComboEvent): void => {
        this.comboRing.push(event);
        if (this.comboRing.length > COMBO_RING_SIZE) {
            this.comboRing.shift();
        }
    };

    private readonly onEvent = (event: MovementEvent): void => {
        if (event.type === 'movement/tick') {
            this.tickRing.push(event);
            if (this.tickRing.length > TICK_RING_SIZE) {
                this.tickRing.shift();
            }
            return;
        }
        this.ring.push(event);
        if (this.ring.length > RING_SIZE) {
            this.ring.shift();
        }
    };

    constructor(deps: BridgeDeps) {
        this.deps = deps;
        deps.bus.onAny(this.onEvent);
        deps.combo.comboBus.onAny(this.onComboEvent);
        window.__ET2__ = this.buildApi();
    }

    private buildApi(): Et2Bridge {
        const { tuning, player, stats, combo, session, resetSandbox, pressure } = this.deps;
        return {
            schemaVersion: EVENT_SCHEMA_VERSION,
            tuning: {
                get: (key?: TuningKey) => (key ? tuning.value(key) : tuning.snapshot()),
                set: (key: TuningKey, value: number) => {
                    tuning.setBase(key, value);
                },
                defaults: () => ({ ...DEFAULT_TUNING }),
                layers: () => tuning.layerList(),
                pushLayer: (layer: TuningLayer) => tuning.pushLayer(layer),
                removeLayer: (id: string) => tuning.removeLayer(id),
                removeByOwner: (owner: string) => tuning.removeByOwner(owner),
            },
            events: {
                recent: (count = 50, type?: MovementEventType) => {
                    const source = type ? this.ring.filter((e) => e.type === type) : this.ring;
                    return source.slice(-count);
                },
                tickFrames: (count = 120) => this.tickRing.slice(-count),
                clear: () => {
                    this.ring = [];
                    this.tickRing = [];
                },
            },
            recorder: {
                record: () => player.beginRecording(),
                stop: () => {
                    this.lastRecording = player.stopRecording();
                    return this.lastRecording;
                },
                replay: (recording?: Recording) => {
                    this.assertEndlessSandbox('recorder.replay');
                    const source = recording ?? this.lastRecording;
                    if (!source) {
                        throw new Error('bridge: no recording to replay');
                    }
                    if (recording) {
                        this.lastRecording = recording;
                    }
                    player.beginReplay(source);
                },
                report: () => player.lastReplayReport(),
                lastRecording: () => this.lastRecording,
            },
            stats: {
                snapshot: () => stats.snapshot(),
                reset: () => stats.reset(),
            },
            verify: {
                engineFacts: () => this.runEngineFacts(),
            },
            pressure: {
                startSegment: (spec?: Partial<SegmentSpec>) => pressure.startSegment(spec),
                stopSegment: () => pressure.stopSegment(),
                state: () => pressure.system.snapshot(),
                lineTeleport: (y: number) => pressure.system.debugLineTeleport(y),
                lineSpeedOverride: (pxPerSec: number | null) =>
                    pressure.system.debugLineSpeedOverride(pxPerSec),
                forceCatch: () => pressure.system.debugForceCatch(),
                forceExit: () => pressure.system.debugForceExit(),
            },
            combo: {
                schemaVersion: COMBO_SCHEMA_VERSION,
                recent: (count = 50, type?: AnyComboEventType) => {
                    const source = type
                        ? this.comboRing.filter((e) => e.type === type)
                        : this.comboRing;
                    return source.slice(-count);
                },
                stats: () => combo.score.sessionStats(),
                tripwires: () => combo.engine.tripwires(),
                chain: () => combo.engine.summary(),
                forceBank: () => combo.signal({ type: 'run/bank_now', tick: player.currentTick }),
                forceVoid: () => combo.signal({ type: 'run/heart_lost', tick: player.currentTick }),
                clear: () => {
                    this.comboRing = [];
                },
            },
            pump: (steps = 1) => {
                const loop = this.deps.game.loop;
                for (let i = 0; i < steps; i += 1) {
                    loop.step(loop.now + 1000 / 60);
                }
            },
            exportSession: () => session.exportLive(),
            marker: (tag?: MarkerTag) => session.marker(tag ?? null),
            sessions: {
                list: () => session.vault.list(),
                get: (index: number) => session.vault.get(index),
                export: (index: number) => session.vault.download(session.vault.get(index)),
            },
            reset: resetSandbox,
        };
    }

    /**
     * The in-scene replay harness resets the player but cannot reset a live
     * segment's line/hearts — replaying against mid-arena pressure state
     * would read as false divergence (docs/DEVIATIONS.md entry 9). Segment
     * sessions replay headless (`npm run replay`); in-scene replay is the
     * endless sandbox's tool.
     */
    private assertEndlessSandbox(surface: string): void {
        if (this.deps.pressure.system.inSegmentMode()) {
            throw new Error(
                `bridge: ${surface} requires the endless sandbox — call ` +
                    '__ET2__.pressure.stopSegment() first (segment sessions replay ' +
                    'headless via npm run replay)',
            );
        }
    }

    /** Drive the synthetic fact script through the real replay harness. */
    private async runEngineFacts(): Promise<EngineFactReport> {
        this.assertEndlessSandbox('verify.engineFacts');
        const { bus, tuning, player } = this.deps;
        const script = syntheticFactScript(
            player.seed,
            tuning.baseSnapshot(),
            tuning.layersSnapshot(),
        );
        const checker = new EngineFactChecker(bus, tuning);
        checker.start();
        try {
            player.beginReplay(script);
            await waitUntil(() => player.lastReplayReport() !== null, 20000);
        } finally {
            checker.stop();
        }
        return checker.report();
    }

    destroy(): void {
        this.deps.bus.offAny(this.onEvent);
        this.deps.combo.comboBus.offAny(this.onComboEvent);
        window.__ET2__ = undefined;
    }
}
