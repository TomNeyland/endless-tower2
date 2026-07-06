/**
 * Movement stats for the feel conversation: tier residency, floors/min,
 * bounce histogram, assist shares, and the tripwire counters that must read
 * zero forever. Bus consumer only — bridge surface, never a production UI.
 */
import type { EventBus, MovementEvent } from '../../core/events';
import { TICK_HZ } from '../../core/movement/state';
import type { PlayerSystem } from '../player/PlayerSystem';

export interface StatsSnapshot {
    ticks: number;
    seconds: number;
    tierResidency: number[];
    floorsClimbed: number;
    floorsPerMin: number;
    jumps: number;
    coyoteJumps: number;
    coyoteJumpShare: number;
    bufferedJumps: number;
    jumpCuts: number;
    wallBounces: number;
    perfectBounces: number;
    bounceHistogram: number[];
    lockoutBlocked: number;
    wallDedupHits: number;
}

const HISTOGRAM_MAX = 10;

export class MovementStats {
    private readonly bus: EventBus;
    private readonly player: PlayerSystem;

    private ticks = 0;
    private tierTicks = [0, 0, 0, 0, 0];
    private floorsClimbed = 0;
    private jumps = 0;
    private coyoteJumps = 0;
    private bufferedJumps = 0;
    private jumpCuts = 0;
    private wallBounces = 0;
    private perfectBounces = 0;
    private bounceHistogram: number[] = new Array(HISTOGRAM_MAX + 1).fill(0);

    private readonly onEvent = (event: MovementEvent): void => {
        switch (event.type) {
            case 'movement/tick':
                this.ticks += 1;
                this.tierTicks[event.tier] += 1;
                break;
            case 'movement/floor_crossed':
                if (event.direction === 'up') {
                    this.floorsClimbed += 1;
                }
                break;
            case 'movement/jump':
                this.jumps += 1;
                if (event.wasCoyote) {
                    this.coyoteJumps += 1;
                }
                if (event.wasBuffered) {
                    this.bufferedJumps += 1;
                }
                break;
            case 'movement/jump_cut':
                this.jumpCuts += 1;
                break;
            case 'movement/wall_bounce':
                this.wallBounces += 1;
                if (event.perfect) {
                    this.perfectBounces += 1;
                }
                break;
            case 'movement/land':
                this.bounceHistogram[Math.min(event.bouncesDuringAir, HISTOGRAM_MAX)] += 1;
                break;
            case 'movement/spawn':
                this.reset();
                break;
            default:
                break;
        }
    };

    constructor(bus: EventBus, player: PlayerSystem) {
        this.bus = bus;
        this.player = player;
        bus.onAny(this.onEvent);
    }

    reset(): void {
        this.ticks = 0;
        this.tierTicks = [0, 0, 0, 0, 0];
        this.floorsClimbed = 0;
        this.jumps = 0;
        this.coyoteJumps = 0;
        this.bufferedJumps = 0;
        this.jumpCuts = 0;
        this.wallBounces = 0;
        this.perfectBounces = 0;
        this.bounceHistogram = new Array(HISTOGRAM_MAX + 1).fill(0);
    }

    snapshot(): StatsSnapshot {
        const counters = this.player.counters();
        const seconds = this.ticks / TICK_HZ;
        return {
            ticks: this.ticks,
            seconds,
            tierResidency: this.tierTicks.map((n) => (this.ticks > 0 ? n / this.ticks : 0)),
            floorsClimbed: this.floorsClimbed,
            floorsPerMin: seconds > 0 ? (this.floorsClimbed / seconds) * 60 : 0,
            jumps: this.jumps,
            coyoteJumps: this.coyoteJumps,
            // Alarm threshold: >15% means edge discipline is dead; tighten it.
            coyoteJumpShare: this.jumps > 0 ? this.coyoteJumps / this.jumps : 0,
            bufferedJumps: this.bufferedJumps,
            jumpCuts: this.jumpCuts,
            wallBounces: this.wallBounces,
            perfectBounces: this.perfectBounces,
            bounceHistogram: [...this.bounceHistogram],
            lockoutBlocked: counters.lockoutBlocked,
            wallDedupHits: counters.wallDedupHits,
        };
    }

    destroy(): void {
        this.bus.offAny(this.onEvent);
    }
}
