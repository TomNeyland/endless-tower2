/**
 * The swarm — critters as moving obstacles (EXAM's toolkit; bosses.md).
 * Engine-free and REPLAYABLE: critter positions are pure functions of
 * (spawn command, tick), the contact test is pure math against the player's
 * deterministic kinematics, and the tax is momentum — NEVER hearts, never
 * the controls (pressure.md's one-punishment law holds: only the line
 * converts lost speed into lost hearts).
 *
 * Spawns arrive as exam commands (the boss brain decides browser-side; the
 * recording replays them frame-stamped), so the headless replay re-derives
 * every drain bit-for-bit by stepping this same code.
 */

/** How a critter moves. Both are closed-form in (tick − spawnTick). */
export type SwarmPattern = 'drift' | 'wall';

/** Presentation hint only — the view picks sprites by this; physics never
 *  reads it. */
export type SwarmSkin = 'slime' | 'saw' | 'bee' | 'fly';

export interface SwarmSpawn {
    critterId: number;
    skin: SwarmSkin;
    pattern: SwarmPattern;
    /** Visual size and contact size travel with the spawn so replay never
     *  guesses from presentation skin. */
    scale: number;
    radiusPx: number;
    /** Anchor position at spawnTick. */
    x0: number;
    y0: number;
    /** Horizontal sway: x = x0 + ampX · sin(omega · dt + phase). */
    ampX: number;
    omega: number;
    phase: number;
    /** Vertical drift px/s (negative = upward, riding with the climb). */
    vy: number;
    lifeTicks: number;
    spawnTick: number;
}

export interface CritterState extends SwarmSpawn {
    /** Last tick this critter connected — drives the re-hit cooldown. */
    lastHitTick: number;
}

export interface SwarmContact {
    critterId: number;
    x: number;
    y: number;
}

export interface SwarmStepResult {
    /** Critters that connected this tick (cooldown-gated). One combined
     *  drain applies however many connect — a swarm is one obstacle cloud,
     *  not a multiplier stack. */
    contacts: SwarmContact[];
    expiredIds: number[];
}

const TICK_HZ = 60;

export function critterPosition(c: SwarmSpawn, tick: number): { x: number; y: number } {
    const dt = tick - c.spawnTick;
    const seconds = dt / TICK_HZ;
    return {
        x: c.x0 + c.ampX * Math.sin(c.omega * seconds + c.phase),
        y: c.y0 + c.vy * seconds,
    };
}

export class SwarmRuntime {
    private critters = new Map<number, CritterState>();

    spawn(cmd: SwarmSpawn): void {
        for (const [key, value] of Object.entries({
            x0: cmd.x0,
            y0: cmd.y0,
            ampX: cmd.ampX,
            omega: cmd.omega,
            phase: cmd.phase,
            vy: cmd.vy,
            spawnTick: cmd.spawnTick,
        })) {
            if (!Number.isFinite(value)) {
                throw new Error(`swarm: critter ${cmd.critterId} has non-finite ${key}`);
            }
        }
        if (
            !Number.isFinite(cmd.scale) ||
            !Number.isFinite(cmd.radiusPx) ||
            !Number.isFinite(cmd.lifeTicks) ||
            cmd.scale <= 0 ||
            cmd.radiusPx <= 0 ||
            cmd.lifeTicks < 1
        ) {
            throw new Error(`swarm: degenerate critter ${cmd.critterId}`);
        }
        if (this.critters.has(cmd.critterId)) {
            throw new Error(`swarm: duplicate critter id ${cmd.critterId}`);
        }
        this.critters.set(cmd.critterId, { ...cmd, lastHitTick: -100000 });
    }

    clear(): void {
        this.critters.clear();
    }

    /**
     * One fixed tick: expire lifetimes, test contact against the player.
     * Caller applies the drain (vx ×= exam.swarmSpeedKeep once when any
     * contact list is non-empty) through its body surface — the same
     * boundary the rescue launch uses, in both worlds.
     */
    step(
        tick: number,
        player: { x: number; y: number },
        hitCooldownTicks: number,
    ): SwarmStepResult {
        const contacts: SwarmContact[] = [];
        const expiredIds: number[] = [];
        for (const c of this.critters.values()) {
            if (tick - c.spawnTick >= c.lifeTicks) {
                expiredIds.push(c.critterId);
                continue;
            }
            const pos = critterPosition(c, tick);
            const dx = pos.x - player.x;
            const dy = pos.y - player.y;
            const r2 = c.radiusPx * c.radiusPx;
            if (dx * dx + dy * dy <= r2 && tick - c.lastHitTick >= hitCooldownTicks) {
                c.lastHitTick = tick;
                contacts.push({ critterId: c.critterId, x: pos.x, y: pos.y });
            }
        }
        for (const id of expiredIds) {
            this.critters.delete(id);
        }
        return { contacts, expiredIds };
    }

    /** Live critters with their current positions — the view's read surface. */
    positions(tick: number): (SwarmContact & {
        skin: SwarmSkin;
        pattern: SwarmPattern;
        scale: number;
    })[] {
        const out: (SwarmContact & { skin: SwarmSkin; pattern: SwarmPattern; scale: number })[] =
            [];
        for (const c of this.critters.values()) {
            const pos = critterPosition(c, tick);
            out.push({
                critterId: c.critterId,
                x: pos.x,
                y: pos.y,
                skin: c.skin,
                pattern: c.pattern,
                scale: c.scale,
            });
        }
        return out;
    }

    count(): number {
        return this.critters.size;
    }
}
