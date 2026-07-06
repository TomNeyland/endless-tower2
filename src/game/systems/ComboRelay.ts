/**
 * The combo relay: the one pump between the movement bus and the combo
 * pipeline. Feeds every movement event to the engine, steps the fuse once
 * per fixed tick, routes engine output through the sibling score consumer,
 * and publishes the combined combo/score stream on its own bus. Thin by
 * law — all decisions live in src/core.
 *
 * Run signals (heart_lost / segment_end / bank_now) are recognized BY NAME:
 * PRESSURE is building their emitters in parallel and nothing here imports
 * them. Until they fire, chains never void — strictly generous, safe
 * (combo-scoring.md's own contingency for the sandbox era).
 */
import { ComboEngine } from '../../core/combo/engine';
import {
    ComboBus,
    type ComboEvent,
    RUN_SIGNAL_NAMES,
    type RunSignal,
} from '../../core/combo/types';
import type { EventBus, MovementEvent } from '../../core/events';
import { ScoreKeeper } from '../../core/score/score';
import type { TuningStack } from '../../core/tuning';

export class ComboRelay {
    readonly comboBus = new ComboBus();
    readonly engine: ComboEngine;
    readonly score: ScoreKeeper;

    private readonly movementBus: EventBus;

    private readonly onMovement = (event: MovementEvent): void => {
        // By-name run-signal recognition (see header). The envelope's tick is
        // the only payload the port consumes.
        if ((RUN_SIGNAL_NAMES as readonly string[]).includes(event.type)) {
            this.signal({ type: event.type as RunSignal['type'], tick: event.tick });
            return;
        }
        this.distribute(this.engine.handle(event));
        for (const scoreEvent of this.score.handleMovement(event)) {
            this.comboBus.emit(scoreEvent);
        }
        if (event.type === 'movement/tick') {
            this.distribute(this.engine.step(event.tick));
        }
    };

    constructor(movementBus: EventBus, tuning: TuningStack) {
        this.movementBus = movementBus;
        this.engine = new ComboEngine(tuning);
        this.score = new ScoreKeeper(tuning);
        movementBus.onAny(this.onMovement);
    }

    /**
     * Inject a run signal directly — the bridge's forceBank/forceVoid path
     * for the harness, and the same entry PRESSURE's events reach by name.
     */
    signal(sig: RunSignal): void {
        this.distribute(this.engine.handle(sig));
        if (sig.type === 'run/segment_end') {
            // The stat block pays out at segment end (score/session_final).
            for (const scoreEvent of this.score.finalize(sig.tick)) {
                this.comboBus.emit(scoreEvent);
            }
        }
    }

    /** Emit each combo event, then the score events it caused — score reads
     *  payloads only (the frozen consumer contract), so this ordering keeps
     *  `score/updated` downstream of its `combo/banked` authority. */
    private distribute(events: ComboEvent[]): void {
        for (const event of events) {
            this.comboBus.emit(event);
            for (const scoreEvent of this.score.handleCombo(event)) {
                this.comboBus.emit(scoreEvent);
            }
        }
    }

    destroy(): void {
        this.movementBus.offAny(this.onMovement);
        this.comboBus.clear();
    }
}
