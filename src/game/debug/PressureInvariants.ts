/**
 * PRESSURE's invariants as a re-runnable harness (instrumentation gate #2):
 * pressure.md pre-registers "the one-catch-per-invuln rule needs a harness
 * test (line rising through a stationary invulnerable player must not drain
 * a second heart)" and "rescueVy must clear the line's next ~2s of rise or
 * mercy reads as a double-tap". Until now those were commit-message claims;
 * an engine-fact assertion is only real when it can be re-run before every
 * human gate.
 *
 * The run is fully pump-driven (synchronous fixed steps through the game
 * loop), so it works in hidden tabs where rAF never fires — the playtest
 * protocol's environment. In a FOCUSED tab, rAF steps interleave with pump
 * and shift tick counts; run this through the Chrome harness or an
 * unfocused window, like verify.engineFacts.
 *
 * One story, seven checks: fresh segment -> announced ignition -> a real
 * contact catch (heart, invuln, rescue) -> the immediate re-catch refused ->
 * the rescue outruns the line past the whole invuln window -> a second
 * catch, then the line rises THROUGH the invulnerable player draining
 * nothing -> the expired shield catches again, and at zero hearts the run
 * ends for real. The forced pressure mutations are unrecorded by design —
 * the session this leaves behind is a harness artifact, not a playtest.
 */
import type { Game } from 'phaser';
import { PLAYER_BODY } from '../../core/movement/state';
import type { Et2Bridge } from './Bridge';

export interface PressureInvariantCheck {
    name: string;
    pass: boolean;
    detail: string;
}

export interface PressureInvariantReport {
    ok: boolean;
    checks: PressureInvariantCheck[];
}

export function runPressureInvariants(
    game: Game,
    getApi: () => Et2Bridge | undefined,
): PressureInvariantReport {
    const pump = (steps: number): void => {
        const loop = game.loop;
        for (let i = 0; i < steps; i += 1) {
            loop.step(loop.now + 1000 / 60);
        }
    };
    const checks: PressureInvariantCheck[] = [];
    const check = (name: string, pass: boolean, detail: string): void => {
        checks.push({ name, pass, detail });
    };
    const playerFeetY = (api: Et2Bridge): number => {
        const frame = api.events.tickFrames(1)[0];
        return frame.y + PLAYER_BODY.height / 2;
    };

    const before = getApi();
    if (!before) {
        throw new Error('pressure verify: no bridge — run from a live scene');
    }
    before.pressure.startSegment();
    pump(5); // process the queued scene.restart into segment mode
    const et2 = getApi();
    if (!et2 || et2 === before) {
        throw new Error('pressure verify: scene restart did not rebuild the bridge');
    }
    let s = et2.pressure.state();
    if (s === null) {
        throw new Error('pressure verify: segment did not arm');
    }
    check('segment arms dormant', s.lineMode === 'dormant', `lineMode ${s.lineMode}`);

    // Announced ignition by the time half of the dual trigger (player idles).
    const graceTicks = Math.round(((et2.tuning.get('line.graceMs') as number) * 60) / 1000);
    pump(graceTicks + 5);
    s = et2.pressure.state();
    check('dual-trigger ignition fires', s?.lineMode === 'active', `lineMode ${s?.lineMode}`);
    const h0 = s?.hearts ?? 0;

    // A real contact catch: pin the line just above the standing player's
    // feet at exactly base speed, and let the catch test find them.
    et2.pressure.lineSpeedOverride(et2.tuning.get('line.baseSpeed') as number);
    et2.pressure.lineTeleport(playerFeetY(et2) - 10);
    pump(3);
    s = et2.pressure.state();
    check(
        'the line catches on contact: one heart, invuln armed, rescue up',
        s !== null && s.hearts === h0 - 1 && s.invulnTicksLeft > 0,
        `hearts ${h0}->${s?.hearts}, invulnTicksLeft ${s?.invulnTicksLeft}`,
    );

    const refused = et2.pressure.forceCatch();
    s = et2.pressure.state();
    check(
        'one catch per invuln window (forceCatch refused)',
        refused === false && s?.hearts === h0 - 1,
        `forceCatch ${refused}, hearts ${s?.hearts}`,
    );

    // The rescue must outrun the line's rise past the whole invuln window —
    // mercy is never a double-tap (pressure.md's pre-registered gate risk).
    pump(100); // invuln is 96 ticks; the line rose ~1.7s at base speed
    s = et2.pressure.state();
    check(
        'rescueVy outruns the line past the invuln window (no double-tap)',
        s !== null && s.hearts === h0 - 1 && s.gapPx !== null && s.gapPx > 0,
        `hearts ${s?.hearts}, gapPx ${s?.gapPx?.toFixed(1)}`,
    );

    // Second contact catch, then the line rises THROUGH the invulnerable
    // player (1200 px/s overtakes the decelerating rescue arc mid-air) —
    // and must drain nothing while the shield holds.
    et2.pressure.lineTeleport(playerFeetY(et2) - 10);
    et2.pressure.lineSpeedOverride(1200);
    pump(60);
    s = et2.pressure.state();
    check(
        'line rising through an invulnerable player drains nothing',
        s !== null && s.hearts === h0 - 2 && s.gapPx !== null && s.gapPx <= 0,
        `hearts ${s?.hearts} (expected ${h0 - 2}), gapPx ${s?.gapPx?.toFixed(1)} (inside the line)`,
    );

    // The shield is a window, not a pardon: when it expires inside the
    // consumed zone the catch lands — and the last heart's catch is final.
    pump(45);
    s = et2.pressure.state();
    check(
        'expired shield catches again; zero hearts ends the run',
        s !== null && s.hearts === h0 - 3 && s.ended === 'death_line',
        `hearts ${s?.hearts}, ended ${s?.ended}`,
    );

    et2.pressure.stopSegment();
    pump(5);
    const cleaned = getApi();
    check(
        'harness cleans up to the endless sandbox',
        cleaned !== undefined && cleaned.pressure.state() === null,
        `state ${JSON.stringify(cleaned?.pressure.state() ?? 'no bridge')}`,
    );

    return { ok: checks.every((c) => c.pass), checks };
}
