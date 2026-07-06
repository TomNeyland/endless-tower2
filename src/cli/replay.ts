/**
 * Headless replay & analysis CLI (docs/design/session-logs.md) — the
 * manager's side of the playtest loop. Re-simulates a session file over the
 * engine-free core (no browser, no Phaser) and answers "what exactly
 * happened when it felt weird":
 *
 *   npm run replay -- path/to/et2-session.json            summary + alarm
 *   npm run replay -- s.json --stats                      feel-stats rollup
 *   npm run replay -- s.json --events                     event stream JSONL
 *   npm run replay -- s.json --csv out.csv                per-tick kinematics
 *   npm run replay -- s.json --around 4512 --window 180   marker excerpt
 *
 * Replay divergence from the recording's eventIndex or end position is a
 * determinism alarm: it prints the drift and exits 1. Runs under tsx
 * (`npm run replay`), pure Node — no wall-clock ever enters the simulation.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { assertSessionShape, type SessionRecording } from '../core/input/session';
import {
    formatEventLine,
    inWindow,
    KINEMATICS_CSV_HEADER,
    kinematicsCsvRows,
    rollupStats,
    type TickWindow,
    windowAround,
} from '../core/replay/analysis';
import {
    compareAgainstRecording,
    type SimulationResult,
    simulateSession,
} from '../core/replay/simulate';
import { DEFAULT_TUNING, type TuningKey } from '../core/tuning';

function usage(): never {
    console.error(
        'usage: npm run replay -- <session.json> [--around <tick> [--window <n>]] ' +
            '[--csv <out.csv>] [--events] [--stats]',
    );
    process.exit(2);
}

function parseIntStrict(value: string, name: string): number {
    const n = Number(value);
    if (!Number.isInteger(n)) {
        throw new Error(`replay: --${name} expects an integer, got "${value}"`);
    }
    return n;
}

function printSummary(session: SessionRecording): void {
    const seconds = (session.ticks / 60).toFixed(1);
    console.log(`session   ${session.startedAt} -> ${session.savedAt} (${session.endReason})`);
    console.log(`seed      ${session.seed}`);
    console.log(`ticks     ${session.ticks} (${seconds}s at 60Hz)`);
    console.log(`tower     ${session.tower.platforms.length} platforms`);
    if (session.segment !== null) {
        const { spec } = session.segment;
        const hearts = session.heartsCarried === null ? 'fresh run' : session.heartsCarried;
        console.log(`segment   ${spec.segmentId} (${spec.floors} floors, hearts: ${hearts})`);
    } else {
        console.log('segment   none (endless sandbox)');
    }

    const deltas: string[] = [];
    for (const key of Object.keys(DEFAULT_TUNING) as TuningKey[]) {
        if (session.baseTuning[key] !== DEFAULT_TUNING[key]) {
            deltas.push(`${key} ${DEFAULT_TUNING[key]}->${session.baseTuning[key]}`);
        }
    }
    console.log(`tuning    base deltas: ${deltas.length > 0 ? deltas.join(', ') : 'none'}`);
    console.log(
        `          layers at start: ${session.baseLayers.length}, ` +
            `timeline changes: ${session.tuningTimeline.length}`,
    );

    if (session.markers.length === 0) {
        console.log('markers   none');
    } else {
        for (const [i, m] of session.markers.entries()) {
            console.log(`marker    #${i} tick ${m.tick}${m.tag ? ` [${m.tag}]` : ''}`);
        }
    }
}

function printStats(result: SimulationResult): void {
    const s = rollupStats(result.events);
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    console.log('--- stats ---');
    console.log(`time            ${s.seconds.toFixed(1)}s (${s.ticks} ticks)`);
    console.log(`tier residency  ${s.tierResidency.map(pct).join(' / ')}`);
    console.log(`floors climbed  ${s.floorsClimbed} (${s.floorsPerMin.toFixed(1)}/min)`);
    console.log(
        `jumps           ${s.jumps} (coyote ${s.coyoteJumps} = ${pct(s.coyoteJumpShare)}, ` +
            `buffered ${s.bufferedJumps} = ${pct(s.bufferedJumpShare)}, cuts ${s.jumpCuts})`,
    );
    console.log(`wall bounces    ${s.wallBounces} (perfect ${s.perfectBounces})`);
    console.log(`bounces/air     [${s.bounceHistogram.join(', ')}]`);
    console.log(`stalls          ${s.stallsEntered}`);
    console.log(
        `tripwires       lockoutBlocked ${s.lockoutBlocked}, wallDedupHits ${s.wallDedupHits}`,
    );
    if (s.coyoteJumpShare > 0.15) {
        console.log('ALARM           coyoteJumpShare > 15% — edge discipline is dead; tighten it');
    }
    if (s.lockoutBlocked !== 0 || s.wallDedupHits !== 0) {
        console.log('ALARM           tripwire counter nonzero — the input path is broken');
    }
}

function printExcerpt(
    session: SessionRecording,
    result: SimulationResult,
    window: TickWindow,
): void {
    console.log(`--- excerpt: ticks ${window.first}..${window.last} ---`);
    const lines: { tick: number; order: number; text: string }[] = [];
    let order = 0;
    for (const event of result.events) {
        if (event.type !== 'movement/tick' && inWindow(event.tick, window)) {
            order += 1;
            lines.push({ tick: event.tick, order, text: formatEventLine(event) });
        }
    }
    for (const m of session.markers) {
        if (inWindow(m.tick, window)) {
            order += 1;
            lines.push({
                tick: m.tick,
                order,
                text: `[${String(m.tick).padStart(6, ' ')}] ===== MARKER${m.tag ? ` (${m.tag})` : ''} =====`,
            });
        }
    }
    lines.sort((a, b) => a.tick - b.tick || a.order - b.order);
    for (const line of lines) {
        console.log(line.text);
    }
    if (lines.length === 0) {
        console.log('(no events in window)');
    }
}

function main(): void {
    const { values, positionals } = parseArgs({
        args: process.argv.slice(2),
        allowPositionals: true,
        options: {
            around: { type: 'string' },
            window: { type: 'string' },
            csv: { type: 'string' },
            events: { type: 'boolean', default: false },
            stats: { type: 'boolean', default: false },
        },
    });
    if (positionals.length !== 1) {
        usage();
    }

    const session = assertSessionShape(JSON.parse(readFileSync(positionals[0], 'utf8')));
    printSummary(session);

    console.log(`replaying ${session.ticks} ticks over the engine-free core...`);
    const result = simulateSession(session);

    // The determinism alarm — divergence fails loud before any analysis.
    const divergence = compareAgainstRecording(session, result);
    if (!divergence.ok) {
        console.error('DIVERGENCE — replay does not reproduce the recording:');
        for (const finding of divergence.findings) {
            console.error(`  ${finding}`);
        }
        process.exit(1);
    }
    const indexedTypes = Object.keys(result.eventIndex).length;
    const indexedTicks = Object.values(result.eventIndex).reduce((n, l) => n + l.length, 0);
    console.log(
        `divergence: none — eventIndex (${indexedTypes} types, ${indexedTicks} stamps) ` +
            'and end position reproduced exactly',
    );

    let window: TickWindow | null = null;
    if (values.around !== undefined) {
        const span = values.window === undefined ? 180 : parseIntStrict(values.window, 'window');
        window = windowAround(parseIntStrict(values.around, 'around'), span);
    }

    if (values.stats) {
        printStats(result);
    }
    if (values.csv !== undefined) {
        const rows = kinematicsCsvRows(
            window === null ? result.events : result.events.filter((e) => inWindow(e.tick, window)),
        );
        writeFileSync(values.csv, `${KINEMATICS_CSV_HEADER}\n${rows.join('\n')}\n`);
        console.log(`csv: wrote ${rows.length} rows to ${values.csv}`);
    }
    if (values.events) {
        for (const event of result.events) {
            if (event.type !== 'movement/tick' && inWindow(event.tick, window)) {
                console.log(JSON.stringify(event));
            }
        }
    }
    if (window !== null && !values.events && values.csv === undefined) {
        printExcerpt(session, result, window);
    }
}

main();
