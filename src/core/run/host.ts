/**
 * RunHost — the map-side holder of the live run truth. Between segments the
 * orchestrator owns exactly one of these: the reconciled RunState, a
 * TuningStack carrying the build's relic layers (so hearts.max and shop
 * prices resolve through the build on the map too), and the relic trigger
 * runtime (Thick Skin's "+1 now" fires on a map shop purchase exactly as it
 * does mid-segment). During play a Sandbox scene hosts its own trio;
 * adopting the returned snapshot replaces this host whole — one live
 * authority per moment, never two.
 *
 * The map is tickless: run events emitted here carry tick 0 and flow to the
 * caller's sink (the orchestrator's diagnostics ring). `grantRelic` mirrors
 * RelicEffects.grantRelic — layers, triggers, command, in that order, so the
 * relic/acquired event finds the triggers attached. The impulse host throws:
 * impulse triggers ride movement events, and the map has no body to push —
 * one firing here is a wiring bug, never a shrug.
 */
import type { RelicSource } from '../events';
import { applyCharacterLayers, characterById } from '../meta/characters';
import { applyOwnedRelicLayers, applyRelicLayers } from '../relics/effects';
import { relicById } from '../relics/roster';
import { RelicEffectsRuntime } from '../relics/runtime';
import type { RelicDef } from '../relics/types';
import { TuningStack } from '../tuning';
import { type RunEmit, RunState, type RunSnapshot } from './state';

export class RunHost {
    readonly tuning: TuningStack;
    readonly run: RunState;
    private readonly runtime: RelicEffectsRuntime;

    /** A fresh run on a shareable seed string, as a character (RETURN). */
    static begin(seed: string, sink: RunEmit, characterId = 'beige'): RunHost {
        return new RunHost(
            (tuning, clock, emit) => new RunState({ seed, characterId }, tuning, clock, emit),
            sink,
            characterId,
        );
    }

    /** Adopt a segment's returned truth as the new live authority. */
    static adopt(snap: RunSnapshot, sink: RunEmit): RunHost {
        return new RunHost(
            (tuning, clock, emit) => RunState.restore(snap, tuning, clock, emit),
            sink,
            snap.characterId,
        );
    }

    private constructor(
        make: (tuning: TuningStack, clock: () => number, emit: RunEmit) => RunState,
        sink: RunEmit,
        characterId: string,
    ) {
        this.tuning = new TuningStack();
        // The character's permanent layers apply BEFORE the RunState exists:
        // a fresh Purple run must clamp its starting hearts against the
        // trait-resolved maximum, not the baseline's.
        applyCharacterLayers(characterById(characterId), this.tuning, 0);
        const emit: RunEmit = (event) => {
            sink(event);
            this.runtime.handleGame(event);
        };
        this.run = make(this.tuning, () => 0, emit);
        this.runtime = new RelicEffectsRuntime(this.tuning, {
            gainHeart: (source) => {
                this.run.gainHeart(source);
            },
            impulse: () => {
                throw new Error('relics: an impulse fired on the map — no body to push');
            },
        });
        // Restore path: the build's layers re-apply, the triggers re-attach,
        // no acquisition events re-fire (the RelicEffects contract, mirrored).
        applyOwnedRelicLayers(this.run.relicIds(), relicById, this.tuning, 0);
        for (const id of this.run.relicIds()) {
            this.runtime.attach(relicById(id));
        }
    }

    /** THE map-side acquisition path: layers, triggers, command — in that
     *  order (elite rewards and map-shop purchases come through here). */
    grantRelic(relicId: string, source: RelicSource): RelicDef {
        const relic = relicById(relicId);
        if (this.run.owns(relic.id)) {
            throw new Error(`relics: "${relic.id}" already in the build`);
        }
        const layersPushed = applyRelicLayers(relic, this.tuning, 0);
        this.runtime.attach(relic);
        this.run.acquireRelic(relic, source, layersPushed);
        return relic;
    }

    /** The HUD's heart row: count plus the build-resolved maximum. */
    heartsDisplay(): { count: number; max: number } {
        return { count: this.run.hearts, max: this.run.heartsMax() };
    }
}
