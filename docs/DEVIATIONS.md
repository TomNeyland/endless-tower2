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

## 3. `SessionRecording` embeds the tower layout (session-logs.md, schema)

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
