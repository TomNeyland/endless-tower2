/**
 * Engine-fact assertions (instrumentation gate #1), re-runnable from the
 * bridge before every human gate: executed jump vy equals the curve's
 * prediction and survives the engine round-trip unclamped, reflected wall
 * speed equals impact speed x efficiency, one-way landings happen only while
 * falling. A synthetic scripted recording drives the real replay harness so
 * the checks exercise Phaser physics, not core math alone. Drift = stop the
 * line.
 */
import {
    EVENT_SCHEMA_VERSION,
    type EventBus,
    type JumpEvent,
    type LandEvent,
    type TickEvent,
    type WallBounceEvent,
} from '../../core/events';
import type { Recording } from '../../core/input/recorder';
import { jumpVyForSpeed } from '../../core/movement/jump';
import { FIXED_DT, type InputFrame } from '../../core/movement/state';
import type { TuningLayer, TuningStack, TuningTable } from '../../core/tuning';

const SCRIPT_TICKS = 480;
const JUMP_PRESS_TICKS = [60, 300];
const JUMP_HOLD_TICKS = 25;
const EPSILON = 1e-6;
/** Engine round-trip comparisons cross float32-ish body math; be tolerant. */
const ROUNDTRIP_EPSILON = 1e-3;

export interface EngineFactReport {
    ok: boolean;
    jumpsChecked: number;
    bouncesChecked: number;
    landingsChecked: number;
    failures: string[];
}

/**
 * Hold right for eight seconds with two jump presses: guarantees jumps off
 * the ground run, airborne wall bounces, and landings on this sandbox's
 * geometry — every fact gets exercised.
 */
export function syntheticFactScript(
    seed: number,
    baseTuning: TuningTable,
    baseLayers: TuningLayer[],
): Recording {
    const frames: InputFrame[] = [];
    for (let i = 0; i < SCRIPT_TICKS; i += 1) {
        frames.push({
            axisX: 1,
            jumpPressedEdge: JUMP_PRESS_TICKS.includes(i),
            jumpHeld: JUMP_PRESS_TICKS.some((p) => i >= p && i < p + JUMP_HOLD_TICKS),
        });
    }
    return {
        schemaVersion: EVENT_SCHEMA_VERSION,
        seed,
        baseTuning,
        baseLayers,
        frames,
        mutations: [],
        positions: [],
    };
}

export class EngineFactChecker {
    private readonly bus: EventBus;
    private readonly t: TuningStack;
    private jumps = 0;
    private bounces = 0;
    private landings = 0;
    private failures: string[] = [];
    /** Ticks where the engine must hand a predicted vy back to core. */
    private expectedVy = new Map<number, number>();

    private readonly onJump = (e: JumpEvent): void => {
        this.jumps += 1;
        const s = e.launchSpeedX < this.t.value('SPEED_DEADBAND') ? 0 : e.launchSpeedX;
        const predicted = jumpVyForSpeed(s, this.t);
        if (Math.abs(e.vyJump - predicted) > EPSILON) {
            this.failures.push(
                `jump@${e.tick}: vyJump ${e.vyJump} != curve prediction ${predicted}`,
            );
        }
        if (Math.abs(e.vy + e.vyJump) > EPSILON) {
            this.failures.push(`jump@${e.tick}: envelope vy ${e.vy} != -vyJump ${-e.vyJump}`);
        }
        // Next tick, the body must hand back exactly -vyJump (then rise
        // gravity applies) — a silent engine clamp is v1's disease.
        this.expectedVy.set(e.tick + 1, -e.vyJump + this.t.value('GRAVITY_RISE') * FIXED_DT);
    };

    private readonly onTick = (e: TickEvent): void => {
        const expected = this.expectedVy.get(e.tick);
        if (expected === undefined) {
            return;
        }
        this.expectedVy.delete(e.tick);
        if (Math.abs(e.vy - expected) > ROUNDTRIP_EPSILON) {
            this.failures.push(
                `tick@${e.tick}: post-jump vy ${e.vy} != expected ${expected} — engine clamped?`,
            );
        }
    };

    private readonly onWallBounce = (e: WallBounceEvent): void => {
        this.bounces += 1;
        const predicted = e.impactSpeedX * this.t.value('WALL_EFFICIENCY');
        if (Math.abs(e.exitSpeedX - predicted) > EPSILON) {
            this.failures.push(
                `bounce@${e.tick}: exitSpeedX ${e.exitSpeedX} != impact*efficiency ${predicted}`,
            );
        }
        if (Math.abs(Math.abs(e.vx) - e.exitSpeedX) > EPSILON) {
            this.failures.push(`bounce@${e.tick}: envelope |vx| ${e.vx} != exit ${e.exitSpeedX}`);
        }
    };

    private readonly onLand = (e: LandEvent): void => {
        this.landings += 1;
        if (!(e.impactVy > 0)) {
            this.failures.push(
                `land@${e.tick}: impactVy ${e.impactVy} — one-way landed while not falling`,
            );
        }
    };

    constructor(bus: EventBus, tuning: TuningStack) {
        this.bus = bus;
        this.t = tuning;
    }

    start(): void {
        this.bus.on('movement/jump', this.onJump);
        this.bus.on('movement/tick', this.onTick);
        this.bus.on('movement/wall_bounce', this.onWallBounce);
        this.bus.on('movement/land', this.onLand);
    }

    stop(): void {
        this.bus.off('movement/jump', this.onJump);
        this.bus.off('movement/tick', this.onTick);
        this.bus.off('movement/wall_bounce', this.onWallBounce);
        this.bus.off('movement/land', this.onLand);
    }

    report(): EngineFactReport {
        const failures = [...this.failures];
        if (this.jumps < 1) {
            failures.push('script exercised no jumps — harness broken');
        }
        if (this.bounces < 1) {
            failures.push('script exercised no wall bounces — harness broken');
        }
        if (this.landings < 2) {
            failures.push('script exercised fewer than 2 landings — harness broken');
        }
        return {
            ok: failures.length === 0,
            jumpsChecked: this.jumps,
            bouncesChecked: this.bounces,
            landingsChecked: this.landings,
            failures,
        };
    }
}

/** Debug-bridge-only polling helper (never core: wall time is not sim time). */
export function waitUntil(condition: () => boolean, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            if (condition()) {
                clearInterval(timer);
                resolve();
            } else if (Date.now() - startedAt > timeoutMs) {
                clearInterval(timer);
                reject(new Error(`verify: timed out after ${timeoutMs}ms waiting for replay`));
            }
        }, 100);
    });
}
