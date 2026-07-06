# DEVIATIONS

*Every knowing divergence between a binding design document and the shipped
implementation, recorded loudly. A deviation that lives only in a code
comment is a deviation hidden from the audit. Entries stay until the design
is amended (manager session) or the implementation catches up — whichever
the ruling turns out to be.*

## 1. `wall_bounce.inputLeadTicks` is non-negative-only (movement.md, walls)

**The design says:** perfect-timing detection with "signed `inputLeadTicks`
in the payload, a `perfect` flag at ±5 ticks", so a combo engine can
"re-window 'perfect' without movement ever changing."

**What ships:** `inputLeadTicks` measures the most recent input edge toward
the wall *at or before* the impact tick — values in `[0, +N]` or the
`INPUT_LEAD_NEVER` sentinel. Presses in the 5 ticks *after* impact (the
negative half of the ±window) are not observable in the payload.

**Why:** the constraint set is internally over-determined. `wall_bounce`
must emit on the impact tick — the juice doctrine times squash and the
bounce sound to the reflection, and Amendment 1's intra-tick ordering
promise (walls → landing → jump) forbids a bounce event surfacing after a
later tick's landing. An impact-tick event cannot carry facts about future
ticks; the negative half of the window requires either deferring the event
(up to 83ms of late squash/audio on every ordinary bounce, plus reordering
against subsequent landings) or a follow-up event that is not in the frozen
v1 taxonomy. Physics is unaffected either way — detection is zero-effect by
design.

**Path back:** the field stays contractually signed, so delivering the
negative half later (a MASTERY-phase amendment: a late-kick delivery
channel, or a reclassification rule the combo engine owns) is a payload
value change, not a schema change. Until the manager session amends
movement.md or ratifies that channel, `perfect` means "kick pressed within
5 ticks at-or-before impact."

*(Ruled 2026-07-06: movement.md Amendment 2 ratified this as
anticipation-sided by design; the combo engine's own window follows suit —
`[0, +combo.perfectWindowTicks]` on the raw value.)*

## 2. `ContactReport` carries no `prevFeetY` (movement.md, architecture)

**The design says:** the architecture sketch lists
`ContactReport {landedPlatform?, prevFeetY}`.

**What ships:** `ContactReport { landing: {platformId, impactVy} | null }`.

**Why:** the same design paragraph rules "one-way platforms remain
engine-side (overlap + processCallback...)" — the previous-tick-feet
predicate is decided in the engine's processCallback, so a `prevFeetY`
handed to core feeds nothing (dead boundary data, forbidden by code law).
`impactVy` rides with the platform id because both are captured together
pre-separation, and the single nullable record makes a half-populated
landing unrepresentable. The per-step `landing` evidence is also what makes
grounding deterministic on multi-step frames (Phaser's `touching` flags
reset per render frame, not per physics step).

## 3. `combo/stumble` is an event the taxonomy table does not name (combo-scoring.md)

**The design says:** the COMBO_SCHEMA_VERSION 1 event table lists eight
combo/score events. The state machine separately specifies the stumble
transition (`CHAIN_AIR --land <2--> CHAIN_GROUND` when a charge absorbs the
fizzle) and the HUD draws the fuse against an absolute `graceDeadlineTick`
carried by `combo/link`.

**What ships:** a ninth event, `combo/stumble {chainId, chargesLeft,
graceDeadlineTick}`, additive under COMBO_SCHEMA_VERSION discipline (no
bump — the same mechanism the design's own EXAM reservation uses).

**Why:** the constraint set demands it: the stumble transition restarts the
fuse but confirms no link, so without an event the HUD's fuse would drain
against a stale deadline — a visibly lying jeopardy indicator, which the
spectator test forbids. Emitting a `combo/link` instead would violate the
grammar (a link is `floorsGained >= linkMinFloors` by definition).

**Path back:** if the manager session prefers a different shape (e.g. the
deadline folded into a future payload), the event is additive and unshipped
to consumers beyond the HUD/bridge — free to rename until PRESSURE/IDENTITY
wire relics that grant charges.

## 4. Array/class tuning rows land as scalar keys (combo-scoring.md, constants)

**The design says:** the constants table lists `combo.ladderFloors` with
value `[4,8,14,21,30,40,55,75]`, and `hud.bankWhisper/Voice/Roar` as three
named loudness classes (`<500 / <5000 / >=5000`).

**What ships:** eight scalar keys `combo.ladderFloors0..7`, and two
boundary keys `hud.bankWhisper` (below = whisper) and `hud.bankVoice`
(below = voice, at-or-above = roar).

**Why:** the TuningTable is numbers-only by construction — movement.md's
TuningStack (base + mul/add/set layers) is the one relic/modifier substrate
and its ops are numeric. An array value cannot ride a `mul` layer. Per-rung
scalar keys are also strictly more relic-expressive (a relic can lower one
threshold without touching the rest). The three loudness classes need only
two boundaries; a `bankRoar` key would be dead data (roar is the
complement).

**Path back:** none needed unless a future system wants non-numeric tuning
values, which would be a TuningStack design amendment first.

*(Extended, wave-1 fix session: the same ruling covers pressure.md's
`line.proximityTiers | [800, 400, 200, 80]` row, which ships as four scalar
keys `line.proximitySafePx/AwarePx/DangerPx/CriticalPx` plus
`line.proximityHysteresisPx` — identical in kind and rationale.)*

## 5. `SessionRecording` embeds the tower layout (session-logs.md, schema)

**The design says:** `SessionRecording = { version, startedAt, seed,
character?, tuningTimeline, inputFrames, markers[], sparse eventIndex }` —
the simulation is "a pure function of (seed, tuning-layer timeline,
per-tick input frames)."

**What ships:** the schema above, plus a `tower: TowerLayout` field (~12KB)
and an `endPosition` pair.

**Why:** the tower is not a pure function of the seed — it is generated
once at scene create from the seed AND the tuning table in force at that
moment (the reachability contract reads jump-curve constants). A session
whose base table was live-tuned before recording began would regenerate a
*different* tower from `(seed, baseTuning)` and every replay would read as
a determinism alarm. Embedding the geometry makes the file self-contained
("a file you can email is the 1.0 bar") and immune to generator evolution;
`seed` stays for provenance and shareability. `endPosition` is two floats
that turn the eventIndex divergence alarm into a bit-exact end-state check
nearly for free.

**Path back:** if the manager session prefers a seed-only file, the
recording instead needs to capture the tuning table at *scene create* (a
second table alongside `baseTuning`) and pin the generator's version; the
schema is versioned, so either ruling lands as an additive change.

*(Wave-1 fix session: the schema is now v2 — PRESSURE extended it with
`segment` (the armed segment, embedded like the tower and for the same
reason) and `heartsCarried`, per the doc's own "later phases extend the
recording with their signals" scope note. The bump is deliberate:
`TuningLayer` also gained its owner tag, so v1 files are refused loudly
rather than replayed wrongly.)*

*(EXAM session, 2026-07-06: v3 — the `examCommands` timeline and the
tower's per-platform `landClass` join the file (entry 15). Same refusal
precedent: a v2 file cannot represent a duel's world mutations and its
segment shape predates nullable doors, so it is refused loudly.)*

## 6. `line/proximity` carries `zone`, not `tier` (pressure.md, events table)

**The design says:** pressure.md's event table lists `line/proximity` with
payload `tier: safe|aware|danger|critical`.

**What ships:** the same closed 4-name set under the field name `zone`.

**Why:** combo-scoring.md's graft #1 ("`tier` joins the event envelope")
put a game-wide numeric speed-tier `tier` on every event's envelope, and
one interface cannot carry the name with two types. The envelope is the
global law; the event-local field renamed at integration (wave-1 merge).

**Path back:** if the manager session prefers the envelope field renamed
(e.g. `speedTier`), the proximity payload can reclaim `tier`; either way
is one mechanical rename — no consumer decides anything on the name.

## 7. Ignition starts one floor below the arena bottom (pressure.md, death line)

**The design says:** "the line ignites at the bottom of the arena", and the
constants table has no offset key.

**What ships:** ignition places the line at `arenaBottomY +
line.igniteOffsetPx` (128 — one floor below the arena bottom), and the key
sits in the tuning table like every other line constant.

**Why:** a line igniting exactly at the arena bottom is an instant catch on
a player standing at the base — activation would be an ambush on the
laziest possible frame, which pillar 2 forbids by name. The offset makes
ignition an announced moment with a visible approach. This lived only in a
code comment until the wave-1 review called it what it was: a deviation
hidden from the audit.

**Path back:** ratify by amending pressure.md's constants table with
`line.igniteOffsetPx` (manager session — it reads like a genuine design
improvement), or zero the key and accept the base-camper ambush.

## 8. `movement/tick` is the production step pump (movement.md, taxonomy)

**The design says:** the event table's `movement/tick` row reads "60Hz
firehose, debug bridge only".

**What ships:** ComboRelay pumps the combo engine's grace fuse
(`engine.step`) and score's `comboUptime` accounting from `movement/tick` —
a production-critical mechanism riding an event documented as debug-only. A
future optimization that gates the firehose behind the bridge would
silently kill grace banking.

**Why it stands for now:** the alternative (a first-class per-tick callback
into the relay from the world-step hook) would change the intra-tick
ordering between the fuse step and PRESSURE's same-tick run signals — an
ordering the review's behavioral harness verified as shipped. Reordering
production semantics to fix a documentation label is the wrong trade
without a manager ruling.

**Path back:** amend movement.md's tick row to acknowledge the production
pump (one line, like Amendment 1b), or rule for the first-class callback
and re-verify the same-tick bank/void ordering.

**RATIFIED** as movement.md Amendment 3 (2026-07-06): the label was wrong,
not the code — movement/tick is the canonical pulse and may never be gated
behind the bridge.

## 9. In-scene replay and recorder auto-resume are endless-sandbox-only (session-logs.md)

**The design says:** the recorder is always on; the doc does not
distinguish scene modes for the in-browser replay harness.

**What ships:** two gates, ruled in the wave-1 fix session. (1) The bridge's
`recorder.replay` and `verify.engineFacts` throw while a segment is active:
the in-scene harness resets the player but cannot reset a live line's
state, so a replay against mid-arena pressure would read as false
divergence — and the resumed recording after it would teleport the player
under an active line (an unearned catch, pillar 2's named failure) with a
tick-0 state not reconstructible from its own header. Segment sessions
replay headless (`npm run replay`), which now steps pressure fully.
(2) `SessionLog.update()`'s always-on auto-resume, in segment mode,
restarts the scene into a fresh segment instead of re-recording in place —
every segment recording begins at scene create, where its header is true.

**Path back:** if a future phase wants in-scene replay of segment sessions,
the honest route is a scene-boot replay mode (restart into the recording's
embedded segment, then arm the replay from tick 0) — the recording now
carries everything that needs.

## 10. Five modifiers ship as data only, outside the roll pool (map-modifiers.md, roster)

**The design says:** a starting roster of 12 priced mutators; node contents
roll from the node's forked stream.

**What ships:** all 12 modifiers exist as data (`src/core/map/modifiers.ts`)
with their tuning layers, genPatch, lootPatch, and price/pay text — but
five carry `rollable: false` and never appear on generated nodes: Brittle
Rows and Sticky Patches (their prices need movement.md Amendment 1c's
crumble/sticky land classifications, not yet built), Swarm (critter
entities), Dense Fog (the parallax-veil skin layer), and Surging Line
(`line.surge` is EXAM's toolkit). Rolling them today would print a price
on the label that the segment cannot charge — an unpriced pay is a lie on
the label, and pillar 2 cuts both ways.

**Path back:** each modifier flips `rollable: true` in the same commit that
lands its machinery; the validation and label plumbing already handle them.

*(EXAM session, 2026-07-06: the flip condition is met for **Brittle Rows**
and **Sticky Patches** — movement.md Amendment 1c's crumble/sticky land
classifications shipped with the platform field, and both modifiers now
roll. Three remain data-only: Swarm (the critter machinery now exists as
the boss's swarm attack, but the ambient per-segment spawner does not),
Dense Fog (the parallax veil), and Surging Line (the `line.surge` tuning
layers and the flare view now exist via boss attacks, but the ambient
telegraphed-pulse driver its genPatch describes does not).)*

## 11. The shop is a hearts-only overlay; bounties are placeholder economy (map-modifiers.md, node table)

**The design says:** Shop is "no climb — a scene. spend coins: relics,
hearts, rerolls"; Coin Rush pays "coins ×2.5 placement"; Climb pays "coins
by play."

**What ships:** shops sell hearts only (stock and price rolled from
`shop:<nodeId>`), rendered as a map overlay rather than a scene — relics
and rerolls do not exist until IDENTITY. In-segment placed loot does not
exist yet either, so "coins by play" is approximated by a per-node
`clearBounty` (data, rolled per type; Coin Rush's bounty carries its
loot-dense identity) paid on exit and multiplied by the node's lootPatch
coin multipliers — which keeps every coins-pay modifier honest today. The
field names (`clearBounty`, `NodeRewards.coinsMul`, `relicsOwed`) are the
reconciliation seam, and `MapRunState` is deliberately minimal and marked
for absorption into IDENTITY's RunState.

**Path back:** IDENTITY replaces the bounty with placed loot (coinsMul then
reprices placement), stocks the shop, and redeems `relicsOwed`.

**RESOLVED** at the wave-2 integration (2026-07-06): shop nodes launch
IDENTITY's real ShopScene (relics, hearts, rerolls — `ShopStock`/the overlay
deleted); "coins by play" is placed loot (`SegmentSpec.loot`, node presets
scale `coins.perFloor`, modifier `lootPatch.coinsMul` reprices placement);
`clearBounty` survives only where the design names a bounty (Challenge,
Boss); `relicsOwed` is gone — Elite clears grant their relic on the spot,
seeded from `fork(seed, 'relic:<nodeId>')`; `MapRunState` was absorbed into
RunState. One passthrough remains: `relicOddsAdd` (Challenge's relic-odds
boost) has no shop-odds consumer yet — its label line stays until a later
wave prices it into shop weighting.

## 12. The run bridge lives at `window.__ET2_MAP__` (+ a boot `__ET2_LOOP__.pump`) (map-modifiers.md, architecture)

**The design says:** "Debug bridge: seed override, jump-to-node,
reveal-map" — implying the existing bridge.

**What ships:** `window.__ET2__` is constructed and destroyed with the
Sandbox scene, but the run outlives any scene (map → segment → map), so
the run's diagnostics live on their own handle `window.__ET2_MAP__`
(state, graph, labels, events ring, commit, jumpToNode, revealMap,
setSeed, pump), installed by the RunOrchestrator and removed at run end.
A minimal `window.__ET2_LOOP__.pump` ships at game boot for the same
reason `__ET2__.pump` exists — hidden/occluded tabs never fire rAF, and
scripted verification needs frames before any scene bridge exists. Two
engine facts recorded for future harness work: `SceneManager.start/stop`
execute immediately (mid-step shear; the orchestrator hops scenes through
the active scene's ScenePlugin, which queues), and Phaser 4's TweenManager
computes its own delta from `Date.now()` (TweenManager.js:651), so pumped
frames advance clocks/physics but not tweens — scripted traversals need
real wall-clock time.

**Path back:** if a later phase merges the handles, fold `__ET2_MAP__` into
`__ET2__` once the bridge outlives scenes.

## 13. Relic heart-gains and the rescue impulse are unrecorded channels (session-logs.md / relics-economy.md)

**The design says:** session-logs.md's contract is "run-scoped state changes
must flow through recorded channels"; relics-economy.md gives relics
triggered effects including Fireproof/Thick Skin heart gains and Second
Wind's +400 px/s landing impulse.

**What ships:** every relic/powerup TUNING effect rides the recorded tuning
timeline (layer pushes/pops notify the recorder), so the physics of a
relic-laden session replays bit-for-bit. Two triggered effects do not have a
recorded channel yet: heart gains (RunState mutation) and Second Wind's
one-shot body impulse (a velocity write through the same sanctioned surface
as the hearts rescue — but unlike the rescue, not regenerated headless,
because the effects runtime consumes combo events the headless replay does
not currently re-derive). A session in which Fireproof/Thick Skin granted a
heart before a later catch, or Second Wind fired, will (correctly) trip the
divergence alarm — the deviation-9 precedent: the alarm is telling the
truth. Correspondingly, run-economy events (coin/, relic/, shop/, powerup/,
run/heart_gained) are excluded from the divergence eventIndex — they are
wallet/orchestration facts the physics replay does not regenerate, and
indexing them would make every coin pickup a false alarm.

**Path back:** session schema v3 adds a run-command timeline (frame-stamped
RunState commands + external impulses, recorded exactly like tuning
mutations), OR the headless replay grows the full combo+effects pipeline so
triggered effects regenerate instead of replaying. Either is additive under
SESSION_SCHEMA_VERSION discipline; the manager session picks the ruling.

*(EXAM session, 2026-07-06: the first path is now precedent — session v3's
`examCommands` timeline is exactly this pattern, built for the platform
field (entry 15). Extending it to heart gains and Second Wind remains
open; this entry stands.)*

## 14. `relic/acquired.source` admits `debug` (relics-economy.md, events table)

**The design says:** `source: shop|elite|mystery`.

**What ships:** the union plus `'debug'` — the bridge's grantRelic must mark
its acquisitions honestly (a debug grant masquerading as a shop purchase
would poison future stats/achievements). Debug never leaks into production
surfaces; the value only exists on bridge-driven grants.

## 15. The boss brain runs browser-side only; its world effects ride recorded channels (bosses.md / session-logs.md)

**The design says:** determinism is sacred — the scripted-input replay
harness must reproduce identical runs; bosses.md specifies a deterministic
seeded brain.

**What ships:** the brain IS deterministic (`fork(runSeed, 'boss:<nodeId>')`,
tick-driven), but the headless replay does not re-run it. Instead, every
PHYSICS consequence of its decisions travels a recorded channel and replays
bit-for-bit: surge/gust tuning layers ride the existing tuning timeline
(owner-tagged `boss:<attackId>`), and platform collapses, goo
classifications, swarm spawns, and the defeat door ride session v3's new
`examCommands` timeline (entry 13's run-command-timeline pattern,
realized). Touch-armed crumbles are NOT recorded — they regenerate from the
land events themselves. Boss facts (`boss/*` events) are excluded from the
replay divergence index for exactly the run-economy reason in entry 13: the
physics replay does not regenerate them, and indexing them would make every
duel a false alarm. Damage/hp/openness never touch physics, so the position
replay stays a pure function of the recording.

**Why:** re-running the brain headless requires re-running the combo engine
headless (damage consumes `combo/banked`, and phase turns feed back into
the schedule) — a much larger replay surface with its own divergence risks,
for zero physics fidelity gain today.

**Path back:** grow simulateSession with the combo relay pipeline, then step
the brain headless and drop `examCommands` for brain-issued commands (the
timeline stays for the bridge's forced attacks). Additive, and the harness's
determinism assertions on the brain make it mechanical.

## 16. Boss body contact has no physics; act-3 layering ships staggered-sequenced (bosses.md, embodiment/risks)

**The design says:** "its body blocks routes"; and, in the risks: "boss
body-blocking routes must never read as unfair collision (body is an
obstacle, telegraphed by its own visible movement — never instant)"; the
act-3 double-attack "if it isn't readable at the gate, cut to
sequenced-not-simultaneous before cutting anything else."

**What ships:** (1) The body blocks routes by LOOMING — a 256px creature
perching on the ledges you were about to use — but contact with it has no
hidden physics. A collideable body would need core-stepped deterministic
boss kinematics mirrored headless (its presentation movement is wall-clock
tweens, which the determinism law forbids as physics), and an invisible
speed tax on touch is pillar 2's named failure. Its mechanical truth is its
telegraphed attacks. (2) The Summit Keeper's paired pattern entries ignite
staggered (the second telegraph starts mid-first): two threats are live at
once, but no two telegraphs IGNITE simultaneously — the doc's
pre-registered readability cut, adopted at build time per the phase brief's
own authorization ("sequenced if simultaneous reads unclear").

**Path back:** (1) if the gate wants a physical body, the boss's anchor
must move into the core brain as f(tick) and its collider into both worlds
— an amendment-sized change. (2) True simultaneous ignition is a data
change (stagger 0) once the gate proves the read.

## 17. `doorFloorIndex` is nullable (pressure.md, events table)

**The design says:** `run/segment_start` carries `doorFloorIndex: number`;
the segment always builds its door ("the door never appears in boss arenas
until the boss dies" was reserved for EXAM).

**What ships:** `doorFloorIndex: number | null` on the event and the
pressure snapshot — null exactly in boss arenas, where the door does not
exist until `boss/defeated` commands one through the recorded channel
(PressureRuntime.setDoor). A fabricated index would be a lie on the wire;
the nullable field is the honest shape of "no exit door until it's won."

**Path back:** ratify by amending pressure.md's event table (one line), or
rule for a sentinel value — the consumers (HUD, replay analysis) already
handle null.
