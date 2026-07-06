/**
 * Analysis over a regenerated event stream: the stats rollup for the feel
 * conversation (tier residency, floors/min, bounce histogram, assist shares,
 * tripwires), per-tick kinematics rows for plotting jump arcs and speed
 * traces, and marker-centered excerpts — the "what exactly happened when it
 * felt weird" query. Pure functions over events; engine-free by law.
 */
import type { MovementEvent, TickEvent } from '../events';
import { TICK_HZ } from '../movement/state';

export interface ReplayStats {
    ticks: number;
    seconds: number;
    tierResidency: number[];
    floorsClimbed: number;
    floorsPerMin: number;
    jumps: number;
    coyoteJumps: number;
    coyoteJumpShare: number;
    bufferedJumps: number;
    bufferedJumpShare: number;
    jumpCuts: number;
    wallBounces: number;
    perfectBounces: number;
    bounceHistogram: number[];
    stallsEntered: number;
    /** Tripwires — these must read 0 forever. */
    lockoutBlocked: number;
    wallDedupHits: number;
}

const HISTOGRAM_MAX = 10;

/** The same rollup the browser stats surface reports, regenerated offline. */
export function rollupStats(events: readonly MovementEvent[]): ReplayStats {
    let ticks = 0;
    const tierTicks = [0, 0, 0, 0, 0];
    let floorsClimbed = 0;
    let jumps = 0;
    let coyoteJumps = 0;
    let bufferedJumps = 0;
    let jumpCuts = 0;
    let wallBounces = 0;
    let perfectBounces = 0;
    let stallsEntered = 0;
    const bounceHistogram: number[] = new Array(HISTOGRAM_MAX + 1).fill(0);
    let lockoutBlocked = 0;
    let wallDedupHits = 0;

    for (const event of events) {
        switch (event.type) {
            case 'movement/tick':
                ticks += 1;
                tierTicks[event.tier] += 1;
                lockoutBlocked = event.lockoutBlocked;
                wallDedupHits = event.wallDedupHits;
                break;
            case 'movement/floor_crossed':
                if (event.direction === 'up') {
                    floorsClimbed += 1;
                }
                break;
            case 'movement/jump':
                jumps += 1;
                if (event.wasCoyote) {
                    coyoteJumps += 1;
                }
                if (event.wasBuffered) {
                    bufferedJumps += 1;
                }
                break;
            case 'movement/jump_cut':
                jumpCuts += 1;
                break;
            case 'movement/wall_bounce':
                wallBounces += 1;
                if (event.perfect) {
                    perfectBounces += 1;
                }
                break;
            case 'movement/land':
                bounceHistogram[Math.min(event.bouncesDuringAir, HISTOGRAM_MAX)] += 1;
                break;
            case 'movement/stall':
                if (event.state === 'entered') {
                    stallsEntered += 1;
                }
                break;
            default:
                break;
        }
    }

    const seconds = ticks / TICK_HZ;
    return {
        ticks,
        seconds,
        tierResidency: tierTicks.map((n) => (ticks > 0 ? n / ticks : 0)),
        floorsClimbed,
        floorsPerMin: seconds > 0 ? (floorsClimbed / seconds) * 60 : 0,
        jumps,
        coyoteJumps,
        // Alarm threshold: >15% means edge discipline is dead; tighten it.
        coyoteJumpShare: jumps > 0 ? coyoteJumps / jumps : 0,
        bufferedJumps,
        bufferedJumpShare: jumps > 0 ? bufferedJumps / jumps : 0,
        jumpCuts,
        wallBounces,
        perfectBounces,
        bounceHistogram,
        stallsEntered,
        lockoutBlocked,
        wallDedupHits,
    };
}

export const KINEMATICS_CSV_HEADER =
    'tick,x,y,vx,vy,speed,grounded,floorIndex,tier,gravityScale,axisX,jumpHeld,hangActive';

/** One CSV row per tick-firehose event — the jump-arc / speed-trace feed. */
export function kinematicsCsvRows(events: readonly MovementEvent[]): string[] {
    const rows: string[] = [];
    for (const event of events) {
        if (event.type !== 'movement/tick') {
            continue;
        }
        const e: TickEvent = event;
        rows.push(
            [
                e.tick,
                e.x,
                e.y,
                e.vx,
                e.vy,
                e.speed,
                e.grounded ? 1 : 0,
                e.floorIndex,
                e.tier,
                e.gravityScale,
                e.axisX,
                e.jumpHeld ? 1 : 0,
                e.hangActive ? 1 : 0,
            ].join(','),
        );
    }
    return rows;
}

/** Inclusive tick window [center - span, center + span]. */
export interface TickWindow {
    first: number;
    last: number;
}

export function windowAround(center: number, span: number): TickWindow {
    return { first: center - span, last: center + span };
}

export function inWindow(tick: number, window: TickWindow | null): boolean {
    return window === null || (tick >= window.first && tick <= window.last);
}

/**
 * Envelope keys, used to split an event into "where/when" and "what" for
 * compact excerpt rendering.
 */
const ENVELOPE_KEYS = new Set([
    'type',
    'tick',
    'x',
    'y',
    'vx',
    'vy',
    'speed',
    'grounded',
    'floorIndex',
]);

function round(n: number): number {
    return Math.round(n * 100) / 100;
}

/** One human-scannable line per event, for marker-centered excerpts. */
export function formatEventLine(event: MovementEvent): string {
    const payload: string[] = [];
    for (const [key, value] of Object.entries(event)) {
        if (ENVELOPE_KEYS.has(key)) {
            continue;
        }
        const shown = typeof value === 'number' ? round(value) : JSON.stringify(value);
        payload.push(`${key}=${shown}`);
    }
    const name = event.type.replace('movement/', '');
    // Run-economy events carry no kinematic envelope (a shop has no velocity).
    const at =
        'x' in event
            ? `x ${round(event.x)} y ${round(event.y)} vx ${round(event.vx)} vy ${round(event.vy)}`
            : '';
    return `[${String(event.tick).padStart(6, ' ')}] ${name.padEnd(13, ' ')} ${at}  ${payload.join(' ')}`;
}
