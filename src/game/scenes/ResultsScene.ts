/**
 * The results scene — RETURN's run-end flow (docs/design/meta-progression.md):
 * summary first (BEST CHAIN leads, in the display face — the screenshot
 * stat), then the run's feats present their unlock MOMENTS one at a time
 * with weight (the celebration budget spends here, not mid-climb), then the
 * museum/menu handoff. A shared screenshot is a complete challenge: seed +
 * character + score are all on the summary face, seed tap-to-copy.
 *
 * The save was already committed by the orchestrator's endRun — this scene
 * only presents. Rendering split into ResultsView (the ~300-line law).
 */
import { type GameObjects, Scene } from 'phaser';
import { characterById } from '../../core/meta/characters';
import type { RunResultsData } from '../meta/MetaTracker';
import { ensureGeneratedTextures, Sfx } from '../assets';
import { ResultsView } from '../meta/ResultsView';
import { MuteButton } from '../systems/MuteButton';

export interface ResultsBootData {
    results: RunResultsData;
}

export class ResultsScene extends Scene {
    private results!: RunResultsData;
    private view!: ResultsView;
    /** Index into the unlock-moment queue; -1 = still on the summary. */
    private momentIndex = -1;
    private done = false;

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'm' || event.key === 'M') {
            if (this.done) {
                this.leave('MuseumScene');
            }
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            this.advance();
        }
    };

    /** Clicks over interactive objects (the seed's tap-to-copy) never
     *  double as an advance. */
    private readonly onPointerDown = (
        _pointer: unknown,
        currentlyOver: GameObjects.GameObject[],
    ): void => {
        if (currentlyOver.length === 0) {
            this.advance();
        }
    };

    constructor() {
        super('Results');
    }

    create(data: ResultsBootData): void {
        if (!data.results) {
            throw new Error('Results: booted without run results (endRun owns the handoff)');
        }
        ensureGeneratedTextures(this);
        this.results = data.results;
        this.momentIndex = -1;
        this.done = this.results.fires.length === 0;

        new MuteButton(this);
        const character = characterById(this.results.record.characterId);
        this.view = new ResultsView(this, this.results.record, character);
        this.view.renderSummary(this.results.fires.length);
        if (this.done) {
            this.view.renderHandoff();
        }

        this.input.keyboard?.on('keydown', this.onKeyDown);
        this.input.on('pointerdown', this.onPointerDown);
        this.events.once('shutdown', () => this.teardown());
    }

    /** Summary -> moment -> moment -> ... -> handoff -> menu. */
    private advance(): void {
        if (this.done) {
            // The handoff row is up; ENTER/click leaves to the menu.
            if (this.momentIndex >= 0 || this.results.fires.length === 0) {
                this.leave('MainMenu');
            }
            return;
        }
        this.momentIndex += 1;
        const fire = this.results.fires[this.momentIndex];
        const isLast = this.momentIndex >= this.results.fires.length - 1;
        // One stinger per moment, stepping up — earned, not noisy.
        this.sound.play(Sfx.magic, { volume: 0.55, rate: 1 + this.momentIndex * 0.08 });
        this.view.renderMoment(fire, this.momentIndex, this.results.fires.length);
        if (isLast) {
            this.done = true;
            this.view.renderHandoff();
        }
    }

    private leave(sceneKey: string): void {
        this.sound.play(Sfx.select, { volume: 0.5 });
        this.scene.start(sceneKey);
    }

    private teardown(): void {
        this.input.keyboard?.off('keydown', this.onKeyDown);
        this.input.off('pointerdown', this.onPointerDown);
        this.view.destroy();
    }
}
