/**
 * The map/run slice of the debug bridge: `window.__ET2_MAP__`. It lives on
 * its own handle because the run outlasts any single scene — Sandbox's
 * `__ET2__` bridge is created and destroyed with its scene, while the run
 * (and this harness surface) spans map → segment → map. Same law applies:
 * diagnostics only, nothing in the game reads it, invisible in production.
 *
 * Surfaces per map-modifiers.md: map state, jump-to-node, reveal-map, seed
 * override — plus commit() so the scripted harness can drive the loop.
 */
import type { Game } from 'phaser';
import type { MapEvent } from '../../core/map/events';
import type { NodeLabel } from '../../core/map/label';
import { type ActGraph, MAP_SCHEMA_VERSION } from '../../core/map/types';
import type { MapRunState } from '../../core/map/run';
import type { CommitRoute, RunOrchestrator } from '../systems/RunOrchestrator';

export interface Et2MapBridge {
    schemaVersion: number;
    /** The minimal run state (seed, act, position, passthrough currencies). */
    state(): MapRunState;
    graph(): ActGraph;
    reachable(): string[];
    label(nodeId: string): NodeLabel;
    events(count?: number): MapEvent[];
    /** Harness handle: drive the run loop without the scene's input path. */
    commit(nodeId: string): CommitRoute;
    jumpToNode(nodeId: string): void;
    revealMap(): ActGraph;
    setSeed(seed: string): void;
    /** Drive the loop manually — hidden tabs never fire rAF (the same need
     *  __ET2__.pump serves; the run bridge outlives that scene bridge). */
    pump(steps?: number): void;
}

declare global {
    interface Window {
        __ET2_MAP__?: Et2MapBridge;
    }
}

export function installMapBridge(run: RunOrchestrator, game: Game): void {
    window.__ET2_MAP__ = {
        schemaVersion: MAP_SCHEMA_VERSION,
        state: () => ({ ...run.state, path: [...run.state.path] }),
        graph: () => run.actGraph(),
        reachable: () => run.reachableIds(),
        label: (nodeId: string) => run.preview(nodeId),
        events: (count = 50) => run.recentEvents(count),
        commit: (nodeId: string) => run.commit(nodeId),
        jumpToNode: (nodeId: string) => run.debugJumpToNode(nodeId),
        revealMap: () => run.debugRevealMap(),
        setSeed: (seed: string) => run.debugSetSeed(seed),
        pump: (steps = 1) => {
            for (let i = 0; i < steps; i += 1) {
                game.loop.step(game.loop.now + 1000 / 60);
            }
        },
    };
}

export function removeMapBridge(): void {
    window.__ET2_MAP__ = undefined;
}
