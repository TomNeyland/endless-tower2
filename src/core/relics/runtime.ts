/**
 * Relic effects, surface 2: event subscriptions interpreted from the
 * roster's closed trigger grammar, scaling with payload VALUES, never event
 * counts (the law). Surface 1 (validation + layer application) lives in
 * ./effects.ts; the two files ARE the two frozen surfaces.
 *
 * Triggered effects produce three command kinds, applied by the thin game
 * pump (RelicEffects system): tuning pushes/pops (recorded automatically in
 * the session's tuning timeline — replays reproduce the physics), heart
 * gains (RunState command), and the one-shot rescue impulse (applied through
 * the same sanctioned body-velocity channel the hearts rescue uses). Heart
 * gains and impulses are outside the recorded channels for now — see
 * docs/DEVIATIONS.md entry 13.
 */
import type { AnyComboEvent } from '../combo/types';
import type { MovementEvent } from '../events';
import type { TuningStack } from '../tuning';
import type { RelicDef, RelicLayerSpec } from './types';

/** What the runtime asks its host to do beyond tuning layers. */
export interface EffectHost {
    /** Grant one heart (clamped at hearts.max by RunState). Returns whether
     *  the heart actually landed — RunState.gainHeart's boolean, forwarded:
     *  full hearts refuse, and limiters must not spend on a refusal. */
    gainHeart(source: string): boolean;
    /** One-shot horizontal impulse through the sanctioned body channel. */
    impulse(vxAdd: number): void;
}

interface TimedHold {
    owner: string;
    layerIds: string[];
    expiresAtTick: number;
}

interface GateHold {
    relicId: string;
    minTier: number;
    layers: RelicLayerSpec[];
    layerIds: string[] | null;
}

interface HeartTrigger {
    relicId: string;
    minTierReached: number;
    oncePerSegment: boolean;
    usedThisSegment: boolean;
}

/**
 * The subscription runtime: feed it both streams (movement/pressure/economy
 * bus and the combo bus) plus the 60Hz tick it already rides, and it holds
 * every triggered effect. Deterministic: pure function of the event
 * sequence; layer ids come from a local counter.
 */
export class RelicEffectsRuntime {
    private readonly t: TuningStack;
    private readonly host: EffectHost;

    /** timed-layers holds, keyed `relic:<id>#<triggerIndex>` for refresh. */
    private timed = new Map<string, TimedHold>();
    private gates: GateHold[] = [];
    private heartTriggers: HeartTrigger[] = [];
    /** relicId -> vxAdd, armed by heart_lost, paid on the next landing. */
    private armedImpulses = new Map<string, number>();
    private impulseArmers = new Map<string, number>();
    private acquireHearts = new Set<string>();
    private landTimed: { key: string; layers: RelicLayerSpec[]; durationTicks: number }[] = [];
    private tierTimed: { key: string; layers: RelicLayerSpec[]; durationTicks: number }[] = [];
    private seq = 0;

    constructor(tuning: TuningStack, host: EffectHost) {
        this.t = tuning;
        this.host = host;
    }

    /** Register a relic's triggers. Layers are the caller's job (apply once
     *  at acquisition, re-apply on restore). */
    attach(relic: RelicDef): void {
        relic.triggers.forEach((trigger, i) => {
            const key = `relic:${relic.id}#${i}`;
            switch (trigger.effect) {
                case 'timed-layers':
                    (trigger.on === 'movement/land' ? this.landTimed : this.tierTimed).push({
                        key,
                        layers: trigger.layers,
                        durationTicks: trigger.durationTicks,
                    });
                    break;
                case 'gated-layers':
                    this.gates.push({
                        relicId: relic.id,
                        minTier: trigger.minTier,
                        layers: trigger.layers,
                        layerIds: null,
                    });
                    break;
                case 'arm-landing-impulse':
                    this.impulseArmers.set(relic.id, trigger.vxAdd);
                    break;
                case 'gain-heart':
                    if (trigger.on === 'combo/banked') {
                        this.heartTriggers.push({
                            relicId: relic.id,
                            minTierReached: trigger.minTierReached,
                            oncePerSegment: trigger.oncePerSegment,
                            usedThisSegment: false,
                        });
                    } else {
                        this.acquireHearts.add(relic.id);
                    }
                    break;
            }
        });
    }

    /** The movement/pressure/economy stream (the main bus). */
    handleGame(e: MovementEvent): void {
        const tier = (e as { tier?: number }).tier;
        if (typeof tier === 'number') {
            this.reconcileGates(tier, e.tick);
        }
        switch (e.type) {
            case 'movement/tick':
                this.step(e.tick);
                return;
            case 'movement/land': {
                for (const spec of this.landTimed) {
                    this.pushTimed(spec.key, spec.layers, e.tick, spec.durationTicks);
                }
                if (this.armedImpulses.size > 0) {
                    // Direction of travel at the landing — zero speed
                    // amplifies to zero (relics amplify momentum, the law).
                    const dir = Math.sign(e.vx);
                    if (dir !== 0) {
                        for (const vxAdd of this.armedImpulses.values()) {
                            this.host.impulse(vxAdd * dir);
                        }
                    }
                    this.armedImpulses.clear();
                }
                return;
            }
            case 'run/heart_lost':
                for (const [relicId, vxAdd] of this.impulseArmers) {
                    this.armedImpulses.set(relicId, vxAdd);
                }
                return;
            case 'run/segment_start':
                for (const ht of this.heartTriggers) {
                    ht.usedThisSegment = false;
                }
                return;
            case 'relic/acquired':
                if (this.acquireHearts.has(e.relicId)) {
                    this.host.gainHeart(e.relicId);
                }
                return;
            case 'movement/spawn':
                // Fresh spawn: momentum-derived boosts do not survive it.
                for (const hold of this.timed.values()) {
                    this.popHold(hold);
                }
                this.timed.clear();
                this.armedImpulses.clear();
                this.reconcileGates(e.tier, e.tick);
                return;
            default:
                return;
        }
    }

    /** The combo/score stream (the combo bus). */
    handleCombo(e: AnyComboEvent): void {
        switch (e.type) {
            case 'combo/tier':
                for (const spec of this.tierTimed) {
                    this.pushTimed(spec.key, spec.layers, e.tick, spec.durationTicks);
                }
                return;
            case 'combo/banked':
                for (const ht of this.heartTriggers) {
                    if (e.tierReached < ht.minTierReached) {
                        continue; // payload-scaled: the gate reads the value
                    }
                    if (ht.oncePerSegment && ht.usedThisSegment) {
                        continue; // Fireproof's limiter (boss arenas chain forever)
                    }
                    // Once per segment means once per GAIN: a bank at full
                    // hearts refuses the heart and must not burn the charge
                    // (pillar 1 errs generous — the boolean is the truth).
                    const gained = this.host.gainHeart(ht.relicId);
                    if (gained && ht.oncePerSegment) {
                        ht.usedThisSegment = true;
                    }
                }
                return;
            default:
                return;
        }
    }

    /** Expire timed holds; rides the 60Hz tick the bus already carries. */
    step(tick: number): void {
        for (const [key, hold] of this.timed) {
            if (tick >= hold.expiresAtTick) {
                this.popHold(hold);
                this.timed.delete(key);
            }
        }
    }

    /** Live triggered-layer count — bridge/harness introspection. */
    activeHolds(): { timed: number; gatesActive: number } {
        return {
            timed: this.timed.size,
            gatesActive: this.gates.filter((g) => g.layerIds !== null).length,
        };
    }

    /** Refresh, never stack: a re-trigger replaces its own hold. */
    private pushTimed(
        key: string,
        layers: readonly RelicLayerSpec[],
        tick: number,
        durationTicks: number,
    ): void {
        const existing = this.timed.get(key);
        if (existing) {
            this.popHold(existing);
        }
        const owner = key.split('#')[0];
        const layerIds = layers.map((spec) => {
            const id = `${key}:t${this.seq++}`;
            this.t.pushLayer({ id, owner, key: spec.key, op: spec.op, value: spec.value, tick });
            return id;
        });
        this.timed.set(key, { owner, layerIds, expiresAtTick: tick + durationTicks });
    }

    private popHold(hold: TimedHold): void {
        for (const id of hold.layerIds) {
            this.t.removeLayer(id);
        }
    }

    /** Gated layers (Momentum Lock): held exactly while the envelope's tier
     *  clears the floor. Idempotent — reconciled from every event's tier. */
    private reconcileGates(tier: number, tick: number): void {
        for (const gate of this.gates) {
            const want = tier >= gate.minTier;
            if (want && gate.layerIds === null) {
                gate.layerIds = gate.layers.map((spec) => {
                    const id = `relic:${gate.relicId}:gate:${this.seq++}`;
                    this.t.pushLayer({
                        id,
                        owner: `relic:${gate.relicId}`,
                        key: spec.key,
                        op: spec.op,
                        value: spec.value,
                        tick,
                    });
                    return id;
                });
            } else if (!want && gate.layerIds !== null) {
                for (const id of gate.layerIds) {
                    this.t.removeLayer(id);
                }
                gate.layerIds = null;
            }
        }
    }
}
