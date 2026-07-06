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
