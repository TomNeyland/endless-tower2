/**
 * A bit-exact, engine-free mirror of the one slice of Phaser 4.2 Arcade
 * physics the sandbox actually uses, so a recording replays in Node with
 * identical floats. Every operation below was transcribed from the Phaser
 * 4.2.0 source (node_modules/phaser/src/physics/arcade) — same ops, same
 * order, same comparisons:
 *
 * - Body.update: `prev = pos; pos += vel * delta` (velocity is untouched by
 *   updateMotion here — the carrier has gravity, drag and acceleration off —
 *   except for the ±maxVelocity clamp, mirrored below).
 * - World.separate: strict-AABB `intersects` runs BEFORE the process
 *   callback; config gravity is zero so SeparateY runs before SeparateX,
 *   and a successful Y separation ends the intersection so X never runs.
 * - PlayerSystem.processOneWay: land only when `velocity.y > 0` and the
 *   previous-step feet were at most 2px below the platform top (the exact
 *   stored topY, not the derived body top).
 * - GetOverlapY (falling branch): `overlap = body.bottom - platform.top`,
 *   rejected above `deltaAbsY + OVERLAP_BIAS(4)` — unreachable given the
 *   2px gate, asserted loudly rather than silently skipped.
 * - ProcessY.RunImmovableBody2 (blockedState 0, body1 on top):
 *   `pos.y -= overlap; velocity.y = 0` (bounce 0, slideFactor 1).
 * - StaticBody: `position = gameObject.(x,y) - origin·(w,h)` — the platform
 *   rects are centered, so the derived edges below repeat Phaser's float
 *   arithmetic (topY + h/2 - h/2 is NOT topY at the ULP level).
 *
 * The collider iterates platforms in creation order; after a separation the
 * zeroed velocity fails the process gate for the rest of the array, exactly
 * as in the engine.
 */
import type { PlatformField } from '../exam/field';
import {
    type Actions,
    type BodySnapshot,
    FIXED_DT,
    type LandingContact,
    PLAYER_BODY,
} from '../movement/state';
import type { TowerLayout } from '../tower';

/** Mirror of PlayerSystem's BODY_MAX_VELOCITY — never a gameplay clamp. */
const BODY_MAX_VELOCITY = 4000;
/** Mirror of PlayerSystem's PLATFORM_BODY_HEIGHT. */
const PLATFORM_BODY_HEIGHT = 40;
/** Phaser World.OVERLAP_BIAS default. */
const OVERLAP_BIAS = 4;

interface StaticRect {
    id: number;
    /** Exact platform top as stored on the game object (`getData('topY')`). */
    gateTopY: number;
    /** Body edges exactly as Phaser derives them from the centered rect. */
    left: number;
    right: number;
    top: number;
    bottom: number;
    /** StaticBody.width — the exact game-object width, not right minus left. */
    width: number;
}

function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

export class HeadlessWorld {
    private readonly statics: StaticRect[];
    /** The platform field (EXAM): removed ledges stop colliding; landings
     *  carry the ledge's classification. Null = fieldless session — the
     *  exact mirror of PlayerSystem without a field lookup. */
    private field: PlatformField | null = null;
    private x: number;
    private y: number;
    private prevY: number;
    private vx = 0;
    private vy = 0;

    constructor(layout: TowerLayout) {
        this.statics = layout.platforms.map((p) => {
            // add.rectangle(xCenter, topY + h/2, w, h) with origin 0.5, then
            // StaticBody position = gameObject.xy - origin*(w,h) — repeated
            // float-for-float.
            const goY = p.topY + PLATFORM_BODY_HEIGHT / 2;
            const left = p.xCenter - p.width * 0.5;
            const top = goY - PLATFORM_BODY_HEIGHT * 0.5;
            return {
                id: p.id,
                gateTopY: p.topY,
                left,
                right: left + p.width,
                top,
                bottom: top + PLATFORM_BODY_HEIGHT,
                width: p.width,
            };
        });
        // PlayerSystem.reset: body.reset(spawnX - w/2, spawnFeetY - h).
        const spawnX = (layout.wallLeftX + layout.wallRightX) / 2;
        this.x = spawnX - PLAYER_BODY.width / 2;
        this.y = layout.groundTopY - PLAYER_BODY.height;
        this.prevY = this.y;
    }

    /**
     * One engine step up to the WORLD_STEP handler: integrate, then run the
     * one-way collider. Returns the per-step collider evidence.
     */
    step(): LandingContact | null {
        // Body.update: prev = pos, computeVelocity clamp, pos += vel * delta.
        const prevX = this.x;
        this.prevY = this.y;
        this.vx = clamp(this.vx, -BODY_MAX_VELOCITY, BODY_MAX_VELOCITY);
        this.vy = clamp(this.vy, -BODY_MAX_VELOCITY, BODY_MAX_VELOCITY);
        this.x = this.x + this.vx * FIXED_DT;
        this.y = this.y + this.vy * FIXED_DT;
        const dx = this.x - prevX;
        const dy = this.y - this.prevY;

        let landing: LandingContact | null = null;
        for (const s of this.statics) {
            if (this.field?.isRemoved(s.id)) {
                // A crumbled ledge's body is disabled in the engine — the
                // collider never reaches the process callback. Mirrored.
                continue;
            }
            if (!this.intersects(s)) {
                continue;
            }
            // processOneWay: pass through unless falling onto the top.
            if (this.vy <= 0) {
                continue;
            }
            const prevFeetY = this.prevY + PLAYER_BODY.height;
            if (prevFeetY > s.gateTopY + 2) {
                continue;
            }
            // GetOverlapY, falling branch (static _dy is 0).
            const overlap = this.y + PLAYER_BODY.height - s.top;
            if (overlap > Math.abs(dy) + OVERLAP_BIAS) {
                // Unreachable given the 2px gate — if it fires, the mirror
                // has drifted from the engine. Fail loud, never skip.
                throw new Error(
                    `headless world: overlap ${overlap} exceeded maxOverlap on platform ${s.id}`,
                );
            }
            // ProcessY.RunImmovableBody2, else branch: processY(-overlap, 0).
            const impactVy = this.vy;
            this.y = this.y + -overlap;
            this.vy = 0;
            landing = {
                platformId: s.id,
                impactVy,
                classification: this.field?.classification(s.id),
            };
            // World.separate then re-tests intersection and, when the
            // separated bottom still sits a ULP inside the platform, runs
            // SeparateX on the same pair. Mirrored exactly.
            if (this.intersects(s)) {
                this.separateX(s, dx);
            }
        }
        return landing;
    }

    /** World.intersects — strict rect-vs-rect against the live body. */
    private intersects(s: StaticRect): boolean {
        return !(
            this.x + PLAYER_BODY.width <= s.left ||
            this.y + PLAYER_BODY.height <= s.top ||
            this.x >= s.right ||
            this.y >= s.bottom
        );
    }

    /**
     * SeparateX for dynamic-vs-immovable-static, blockedState 0 (a static's
     * `blocked` flags are never set by GetOverlap): GetOverlapX picks the
     * branch by _dx sign, rejects beyond `deltaAbsX + bias`, and ProcessX
     * stores |overlap| then pushes the body out on the platform-free side
     * with `velocity.x = 0` (bounce 0, slideFactor 1).
     */
    private separateX(s: StaticRect, dx: number): void {
        let raw = 0;
        const maxOverlap = Math.abs(dx) + OVERLAP_BIAS;
        if (dx > 0) {
            raw = this.x + PLAYER_BODY.width - s.left;
            if (raw > maxOverlap) {
                raw = 0;
            }
        } else if (dx < 0) {
            raw = this.x - s.width - s.left;
            if (-raw > maxOverlap) {
                raw = 0;
            }
        }
        if (raw === 0) {
            return;
        }
        const overlap = Math.abs(raw);
        const body1OnLeft =
            Math.abs(this.x + PLAYER_BODY.width - s.left) <= Math.abs(s.right - this.x);
        this.x = body1OnLeft ? this.x + -overlap : this.x + overlap;
        this.vx = 0;
    }

    /** Arm the platform field — PlayerSystem.setPlatformField's mirror. */
    setPlatformField(field: PlatformField): void {
        this.field = field;
    }

    /** The swarm drain / external writes mirror: velocity only, after this
     *  tick's Actions — exactly PlayerSystem's sanctioned body surface. */
    applySpeedKeep(keep: number): void {
        this.vx *= keep;
    }

    /** What PlayerSystem hands the core: post-integration, post-collision. */
    bodySnapshot(): BodySnapshot {
        return {
            x: this.x + PLAYER_BODY.width / 2,
            y: this.y + PLAYER_BODY.height / 2,
            feetY: this.y + PLAYER_BODY.height,
            vx: this.vx,
            vy: this.vy,
        };
    }

    /**
     * PlayerSystem.applyExternalLaunch mirrored: the hearts rescue writes
     * body velocity ONLY, after this tick's Actions — the launch wins the
     * tick it fires on, and next tick's integration reads it as a fact.
     */
    applyRescueLaunch(vy: number, vxKeep: number): void {
        this.vy = vy;
        this.vx *= vxKeep;
    }

    /** Apply core Actions verbatim, exactly as PlayerSystem.step does. */
    applyActions(actions: Actions): void {
        this.vx = actions.vx;
        this.vy = actions.vy;
        if (actions.snapX !== null) {
            this.x = actions.snapX - PLAYER_BODY.width / 2;
        }
    }

    /** The recorded position pair for this tick: [center x, feet y]. */
    positionPair(): [number, number] {
        return [this.x + PLAYER_BODY.width / 2, this.y + PLAYER_BODY.height];
    }
}
