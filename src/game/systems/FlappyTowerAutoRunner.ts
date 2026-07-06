import type { LandEvent, WallBounceEvent } from '../../core/events';
import { PLAYER_BODY } from '../../core/movement/state';
import type { PlatformSpec } from '../../core/tower';

export type FlappyTowerAxis = -1 | 1;

export interface FlappyTowerSampleContext {
    x: number;
    vx: number;
    grounded: boolean;
    platformId: number | null;
}

export interface FlappyTowerTuning {
    edgeGuardPx: number;
    edgeGuardRunwayFrac: number;
    directionSeedSpeed: number;
}

interface PlatformBounds {
    left: number;
    right: number;
    width: number;
}

export class FlappyTowerAutoRunner {
    private readonly platforms = new Map<number, PlatformBounds>();
    private direction: FlappyTowerAxis = 1;

    constructor(platforms: readonly PlatformSpec[]) {
        for (const p of platforms) {
            this.platforms.set(p.id, {
                left: p.xCenter - p.width / 2,
                right: p.xCenter + p.width / 2,
                width: p.width,
            });
        }
    }

    axis(ctx: FlappyTowerSampleContext, tuning: FlappyTowerTuning): FlappyTowerAxis {
        this.validateTuning(tuning);
        if (ctx.grounded) {
            if (ctx.platformId === null) {
                throw new Error('FlappyTower: grounded input sample without a platform id');
            }
            const platform = this.platforms.get(ctx.platformId);
            if (platform === undefined) {
                throw new Error(`FlappyTower: no bounds for platform ${ctx.platformId}`);
            }
            const bodyHalfWidth = PLAYER_BODY.width / 2;
            const usableHalfRunway = platform.width / 2 - bodyHalfWidth;
            if (usableHalfRunway <= 0) {
                throw new Error(
                    `FlappyTower: platform ${ctx.platformId} width ${platform.width} ` +
                        `cannot fit body half-width ${bodyHalfWidth}`,
                );
            }
            const guard = Math.min(
                tuning.edgeGuardPx,
                usableHalfRunway * tuning.edgeGuardRunwayFrac,
            );
            if (ctx.x <= platform.left + bodyHalfWidth + guard) {
                this.direction = 1;
            } else if (ctx.x >= platform.right - bodyHalfWidth - guard) {
                this.direction = -1;
            }
        }
        return this.direction;
    }

    onSpawn(): void {
        this.direction = 1;
    }

    onLand(event: LandEvent, tuning: FlappyTowerTuning): void {
        this.validateTuning(tuning);
        if (!this.platforms.has(event.platformId)) {
            throw new Error(`FlappyTower: land event names unknown platform ${event.platformId}`);
        }
        this.seedDirectionFromVelocity(event.vx, tuning);
    }

    onWallBounce(event: WallBounceEvent): void {
        this.direction = event.side === 'left' ? 1 : -1;
    }

    private seedDirectionFromVelocity(vx: number, tuning: FlappyTowerTuning): void {
        if (Math.abs(vx) >= tuning.directionSeedSpeed) {
            this.direction = vx < 0 ? -1 : 1;
        }
    }

    private validateTuning(tuning: FlappyTowerTuning): void {
        if (tuning.edgeGuardPx <= 0) {
            throw new Error(`FlappyTower: edgeGuardPx must be positive, got ${tuning.edgeGuardPx}`);
        }
        if (tuning.edgeGuardRunwayFrac <= 0 || tuning.edgeGuardRunwayFrac >= 1) {
            throw new Error(
                `FlappyTower: edgeGuardRunwayFrac must be in (0, 1), got ${tuning.edgeGuardRunwayFrac}`,
            );
        }
        if (tuning.directionSeedSpeed < 0) {
            throw new Error(
                `FlappyTower: directionSeedSpeed must be non-negative, got ${tuning.directionSeedSpeed}`,
            );
        }
    }
}
