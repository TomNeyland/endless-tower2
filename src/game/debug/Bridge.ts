/**
 * The debug bridge: window.__ET2__. All diagnostics live here — live tuning
 * get/set, the event ring buffer, the input recorder/replay harness, and the
 * stats surface. Debug never leaks into production scenes: this object is
 * invisible unless you open the console, and nothing in the game reads it.
 */
import {
    EVENT_SCHEMA_VERSION,
    type EventBus,
    type MovementEvent,
    type MovementEventType,
    type TickEvent,
} from '../../core/events';
import type { Recording, ReplayReport } from '../../core/input/recorder';
import {
    DEFAULT_TUNING,
    type TuningKey,
    type TuningLayer,
    type TuningStack,
    type TuningTable,
} from '../../core/tuning';
import type { PlayerSystem } from '../player/PlayerSystem';
import {
    EngineFactChecker,
    type EngineFactReport,
    syntheticFactScript,
    waitUntil,
} from './EngineFacts';
import type { MovementStats, StatsSnapshot } from './Stats';

const RING_SIZE = 1024;
const TICK_RING_SIZE = 600;

export interface Et2Bridge {
    schemaVersion: number;
    tuning: {
        get(key?: TuningKey): number | TuningTable;
        set(key: TuningKey, value: number): void;
        defaults(): TuningTable;
        layers(): readonly TuningLayer[];
        pushLayer(layer: TuningLayer): void;
        removeLayer(id: string): boolean;
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
    reset(): void;
}

declare global {
    interface Window {
        __ET2__?: Et2Bridge;
    }
}

interface BridgeDeps {
    bus: EventBus;
    tuning: TuningStack;
    player: PlayerSystem;
    stats: MovementStats;
    resetSandbox: () => void;
}

export class DebugBridge {
    private readonly deps: BridgeDeps;
    private ring: MovementEvent[] = [];
    private tickRing: TickEvent[] = [];
    private lastRecording: Recording | null = null;

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
        window.__ET2__ = this.buildApi();
    }

    private buildApi(): Et2Bridge {
        const { tuning, player, stats, resetSandbox } = this.deps;
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
            reset: resetSandbox,
        };
    }

    /** Drive the synthetic fact script through the real replay harness. */
    private async runEngineFacts(): Promise<EngineFactReport> {
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
        window.__ET2__ = undefined;
    }
}
