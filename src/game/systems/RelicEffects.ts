/**
 * The relic pump at the Phaser boundary — thin by law. All decisions live in
 * core (relics/effects.ts): this system feeds the runtime both event streams
 * (movement/pressure/economy bus + combo bus), and applies its two
 * non-tuning commands through their sanctioned channels: heart gains via
 * RunState's typed command, the rescue impulse via PlayerSystem's
 * body-velocity surface (the same boundary the hearts rescue uses).
 *
 * Acquisition (`grantRelic`) is the one entry point for a relic joining the
 * build: layers pushed (owner `relic:<id>`, acquisition order = fold order),
 * triggers attached, RunState command emitted — shop, elite reward, mystery
 * outcome, and the debug bridge all come through here. On scene create the
 * caller re-applies the serialized build's layers FIRST (tower generation
 * reads the effective table), then constructs this system, which re-attaches
 * triggers without re-firing acquisition events.
 */
import type { AnyComboEvent } from '../../core/combo/types';
import type { ComboBus } from '../../core/combo/bus';
import type { EventBus, MovementEvent, RelicSource } from '../../core/events';
import { applyRelicLayers } from '../../core/relics/effects';
import { relicById } from '../../core/relics/roster';
import { RelicEffectsRuntime } from '../../core/relics/runtime';
import type { RunState } from '../../core/run/state';
import type { TuningStack } from '../../core/tuning';
import type { PlayerSystem } from '../player/PlayerSystem';

export class RelicEffects {
    readonly runtime: RelicEffectsRuntime;

    private readonly bus: EventBus;
    private readonly comboBus: ComboBus;
    private readonly tuning: TuningStack;
    private readonly run: RunState;
    private readonly player: PlayerSystem;

    private readonly onMovement = (e: MovementEvent): void => {
        this.runtime.handleGame(e);
    };

    private readonly onCombo = (e: AnyComboEvent): void => {
        this.runtime.handleCombo(e);
    };

    constructor(
        bus: EventBus,
        comboBus: ComboBus,
        tuning: TuningStack,
        run: RunState,
        player: PlayerSystem,
    ) {
        this.bus = bus;
        this.comboBus = comboBus;
        this.tuning = tuning;
        this.run = run;
        this.player = player;
        this.runtime = new RelicEffectsRuntime(tuning, {
            gainHeart: (source) => this.run.gainHeart(source),
            impulse: (vxAdd) => this.player.applyExternalImpulse(vxAdd),
        });
        // Restore path: the build's layers were re-applied before the tower
        // generated; here the triggers re-attach, eventlessly.
        for (const id of run.relicIds()) {
            this.runtime.attach(relicById(id));
        }
        bus.onAny(this.onMovement);
        comboBus.onAny(this.onCombo);
    }

    /** THE acquisition path: layers, triggers, command — in that order, so
     *  the relic/acquired event (Thick Skin's "+1 now" subscription) finds
     *  the triggers already attached. */
    grantRelic(relicId: string, source: RelicSource): void {
        const relic = relicById(relicId);
        if (this.run.owns(relic.id)) {
            throw new Error(`relics: "${relic.id}" already in the build`);
        }
        const layersPushed = applyRelicLayers(relic, this.tuning, this.player.currentTick);
        this.runtime.attach(relic);
        this.run.acquireRelic(relic, source, layersPushed);
    }

    destroy(): void {
        this.bus.offAny(this.onMovement);
        this.comboBus.offAny(this.onCombo);
    }
}
