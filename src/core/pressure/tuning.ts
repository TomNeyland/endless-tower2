/**
 * Pressure-row validation that THROWS on degenerate resolved values at
 * layer-push time — the same economist law the combo and identity tables
 * enforce (a typo fails loud, never lies silently).
 *
 * The one binding rule here is playthrough-trace.md finding 7, implemented
 * where the trace put it: `hearts.max` FLOORS AT 1 — Purple's −1 trait (or
 * any stack of layers) can never take a build to zero hearts. A game whose
 * mercy system cannot exist is not a harder game, it is a broken table.
 */

function fail(key: string, value: number, why: string): never {
    throw new Error(`pressure tuning degenerate: ${key} = ${value} (${why})`);
}

/**
 * Throws on degenerate effective values. Called by TuningStack.pushLayer on
 * the post-push effective table, alongside the combo/identity validators.
 */
export function validatePressureTuning(t: Record<string, number>): void {
    if (t['line.rampPerFloor'] < 0) {
        fail('line.rampPerFloor', t['line.rampPerFloor'], 'the line cannot cool with height');
    }
    if (t['line.graceFraction'] <= 0) {
        fail('line.graceFraction', t['line.graceFraction'], 'grace must cover positive progress');
    }
    if (!Number.isInteger(t['segment.defaultFloors']) || t['segment.defaultFloors'] < 1) {
        fail(
            'segment.defaultFloors',
            t['segment.defaultFloors'],
            'default segment length must be a positive integer',
        );
    }
    if (!Number.isInteger(t['segment.sandboxFloors']) || t['segment.sandboxFloors'] < 1) {
        fail(
            'segment.sandboxFloors',
            t['segment.sandboxFloors'],
            'sandbox generation budget must be a positive integer',
        );
    }
    if (t['hearts.max'] < 1) {
        fail('hearts.max', t['hearts.max'], 'floors at 1 — playthrough-trace.md finding 7');
    }
    if (t['hearts.start'] < 1) {
        fail('hearts.start', t['hearts.start'], 'a run must begin alive');
    }
}
