# Session Logs & Replay Analysis

*Authored by the manager session. Cross-cutting, like art-direction and
audio. Status: v1 — binding; the export/marker/replay loop must exist
before the first human feel gate, because it is the instrument playtest
feedback flows through.*

## Thesis

Feel feedback is only actionable when it can be anchored to data. "That
jump felt weird" becomes fixable when it becomes "the jump at tick 4512:
takeoff 612 px/s, conversion 1191, cut after 80ms." Determinism makes this
nearly free: the simulation is a pure function of **(seed, tuning-layer
timeline, per-tick input frames)** — so the input recording *is* the
complete log. Everything else (events, velocities, arcs, stats) is
regenerable from it, bit-for-bit, anywhere the engine-free core runs —
including Node, with no browser.

## The flight recorder (always on in dev)

`SessionRecording = { version, startedAt, seed, character?, tuningTimeline
(tick-stamped layer pushes/pops incl. owner tags), inputFrames (per-tick,
run-length encoded — idle ticks compress to nothing), markers[], sparse
eventIndex }`

- Records from scene start, continuously; memory cost is trivial (~20
  bytes/tick raw, far less RLE'd; a 10-minute session is well under 1MB).
- The **sparse eventIndex** (tick stamps of banks, voids, heart losses,
  tier crossings) is a convenience index for humans scanning a session —
  never the source of truth (the replay regenerates ground truth).

## Markers — feedback pinned to ticks

**`M` drops a marker at the current tick** with an optional quick tag
(felt-bad / felt-great / bug). The HUD flashes acknowledgment. This is the
core playtest gesture: the player narrates by keypress while playing, and
every remark arrives pre-anchored to the exact simulation moment. Markers
ride inside the recording.

## Export

- **`F9` / `__ET2__.exportSession()`** — downloads
  `et2-session-<timestamp>.json` (and copies to clipboard when small
  enough). No server, no accounts; a file the player can hand over.
- **Auto-save on run end / segment end** to a localStorage ring of the
  last 5 sessions (`__ET2__.sessions.list() / export(n)`) — the "that run
  just now!" case needs no foresight.
- The event ring buffer remains for quick console looks
  (`__ET2__.events.tail(50)`), but export always prefers the recording.

## Headless replay & analysis (the manager's side of the loop)

`npm run replay -- path/to/session.json [--around <tick> --window 180]
[--csv out.csv] [--events] [--stats]`

A Node CLI over the engine-free core: re-runs the simulation from the
recording and emits — the full regenerated event stream, per-tick
kinematics CSV (for plotting jump arcs and speed traces), the stats
rollup (tier residency, floors/min, bounce histogram, assist shares,
tripwire counters), and marker-centered excerpts (`--around` slices ±N
ticks around a marker: the "what exactly happened when it felt weird"
query). Replay divergence from the recording's eventIndex is itself a
determinism alarm and fails loud.

## Contract for all future systems

Every system already speaks the bus (facts-only, tick-stamped, schema-
versioned) — that was the wedding discipline, and this doc is its payoff.
Two obligations going forward: (1) any new source of nondeterminism is
forbidden without extending the recording (this is why RNG is seeded and
forked by label); (2) run-scoped state changes (relic acquisitions, heart
changes, segment transitions) must flow through recorded channels
(tuning timeline / RunSignals) so full *runs* — not just segments —
replay end-to-end. PRESSURE through RETURN inherit this contract as-is.

## Scope now vs later

FEEL ships: recorder-to-file, markers, localStorage ring, the replay CLI
over movement. Later phases extend the recording with their signals
(RunSignals, shop purchases) — additive, versioned. Cloud/share-a-replay
is a HANDS-phase maybe; a file you can email is the 1.0 bar.
