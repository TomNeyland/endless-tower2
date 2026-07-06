# Combo & Scoring — the MASTERY-phase design

*Authored by the manager session, synthesizing a three-way design panel (arcade
scoring historian / systems economist / celebration designer) and two
adversarial judges. Panel pitched; this document decides. Status: binding for
the MASTERY implementation session. Consumes `movement.md`'s event taxonomy;
v1's combo/scoring is disavowed entirely and owes it nothing. Read ETHOS.md
and docs/DESIGN.md first.*

## Thesis

The combo engine is momentum **measured and made loud** — and it is the
game's nervous system: movement feeds it, score reads it now, bosses read it
as damage, relics bend its constants, modifiers reprice its economy. One law
governs everything, and it is the spine restated: **NO CLOCK, NO FARM** —
zero value accrues from time; only landings pay; landings pay only via floors
actually climbed; style is escrowed mid-air and confirmed only when a landing
proves the climb. The player-facing shape is a wager: a chain is at-risk
until banked, the only thing that can void it is the one always-visible
danger, and the payout is quadratic in floors so greed grows with success.

## Decisions and their provenance

**Winner: the arcade-historian design** (both judges, independently), for the
three things the rivals lacked: real jeopardy (void-on-heart-loss makes
extend-vs-bank a live wager — the economist's bank-everything had no tension,
and its multiplier was "one axis wearing two costumes"), true base×mult
orthogonality (mult grows only from *style*, never plain continuation), and
the only design that honors movement.md's re-windowing gift (its own perfect
window on raw `inputLeadTicks` — the widen-the-window relic class exists
because of this). The celebration designer's economy was refused (link-count
multipliers made fifteen timid hops out-earn five bold leaps — the mastery
signal inverted) but its applause engineering is grafted nearly wholesale.

**Grafts adopted (judge-consensus):**
1. *One-air-inert after void* (celebration): `heart_lost` voids the chain AND
   marks the rescue-launch air inert — its landing cannot open a fresh chain
   from unearned height. Without this, the mercy launch mints combos.
2. *Consumer law* (economist, verbatim into the contract): **consumers scale
   with payload values, never event counts** — kills the deliberate
   2-floor-bank-spam class for boss/relic procs before EXAM exists.
3. *Tuning validation throws* (economist): degenerate `combo.*` values
   (linkMinFloors < 1, groundGraceTicks < 1, negative caps) crash at
   layer-push time. A modifier typo fails loud, never perma-chains silently.
4. *Floor-grid invariant* (celebration): harness-assert
   `land.floorsGained === land.floorIndex − left_ground.floorIndex`;
   `floorGridDrift` tripwire must read 0 forever.
5. *Bank loudness classes* (celebration): whisper / voice / roar by payout
   size — a tiny fizzle bank stays near-silent, so banking-on-failure never
   reads as fanfare (the detune-then-tally phrase scales with the pot).
6. *Shake scheduler* (celebration): one shake class game-wide; priority
   tier > bank > movement-land; same-tick losers are **dropped, never
   queued**; shakes arbitrate to the max, never sum, always ≤200ms.
7. *`GLORY_SUSTAIN_MS` = 4000* at tier ≥ SOARING gates audio.md's glory music
   layer (closes on break with a fade) — "sustained" now has a number.
8. *Stumble charges* (celebration): `combo.stumblesAllowed` = 0 baseline; a
   relic-purchasable mercy that forgives one fizzle without banking. Richer
   relic food than the refund fraction alone.
9. *EXAM reservation* (economist): tower-mutation landing classifications
   (crumble, sticky) extend the `land` payload **additively** under schema
   versioning — bosses can never force a breaking change on the engine.

**The ruling the judges split on — cross-chain altitude refarm** (bank,
descend, re-climb the same floors in slow-line segments): judge-0 demanded
the celebration design's segment high-water mint as a mandatory graft;
judge-1 showed that graft drags in a second qualification grammar that
starves descend-to-route play and ships with its own pre-registered
replacement. **Ruling: instrument first, legislate on evidence.** The bridge
gains `refarmedFloorShare` (chain floors earned at-or-below the segment
high-water at chain start). The contingency is pre-specified here in one
sentence — a `combo.highWaterGate` tuning flag that, when true, counts only
above-high-water floors into `chainFloors` — but it is **not implemented**
until real segment shapes (PRESSURE/CHOICE) produce alarm evidence; if they
do, the first response is a node-modifier price, the flag second. Refarm is
untestable in a sandbox with no segments; measuring before legislating is
the repo's own epistemic law applied to itself.

## Grammar

**Definitions.** A **LINK** is a `movement/land` with `floorsGained ≥
combo.linkMinFloors` (2). A **FIZZLE** is any landing below that (0, 1, or
negative floors). **SPICE** is style accrued mid-air — counted airborne wall
bounces, combo-perfect bounces, ceiling entry — always **provisional** until
that air ends in a link; fizzle discards the air's ledger silently. Grounded
bounces, `wall_touch`, `reversal`, `jump_cut`, `apex` are not combo food
(air *time* pays nothing — Icy Tower paid no airtime either). Links are
assist-agnostic: buffered, coyote, and same-tick-bhop jumps link identically
(generosity; assist share is tracked in stats).

**The one window.** After any link, `combo.groundGraceTicks` (48 = 0.80s) of
grounded time to leave the ground again, drawn as a draining fuse bar. No air
window, no bounce timer, no perfect-chain timer. While airborne, **nothing
can break a chain — air is sacred.**

**State machine** (explicit discriminated union; stepped at 60Hz + event-fed):

```
IDLE_GROUND --left_ground--> IDLE_AIR (open provisional ledger)
IDLE_AIR    --land ≥2------> CHAIN_GROUND  [combo/started + link 0; start fuse]
IDLE_AIR    --land <2------> IDLE_GROUND   [discard ledger, silent]
CHAIN_GROUND --left_ground-> CHAIN_AIR     (new ledger)
CHAIN_GROUND --fuse out----> IDLE_GROUND   [banked{grace}]
CHAIN_AIR   --land ≥2------> CHAIN_GROUND  [confirm spice w/ caps, add floors,
                                            link, tier crossings, restart fuse]
CHAIN_AIR   --land <2------> IDLE_GROUND   [banked{fizzle}; air spice evaporates
                                            — unless a stumble charge absorbs it]
CHAIN_*     --heart_lost---> IDLE_*        [voided; NEXT AIR MARKED INERT]
CHAIN_*     --segment_end / bank_now-----> [banked{exit|forced}]
```

`movement/spawn` hard-resets everything (`combo/reset`). `bank_now` is an
**orchestration-only** signal — contractually never wirable to player input
(it would be an attack-shaped button; the verbs stay pure). Intra-tick
ordering rides movement's documented op order: a same-tick bhop processes
land-then-left_ground — link confirmed, fuse escaped, rhythm never touches
the window. A `land` arriving while the engine believes it is grounded
increments `comboAltDrift` — a tripwire that must read 0 forever.

## Payout math

Two orthogonal axes, spectator-readable as **"23 FLOORS ×3.25"**:

- **BASE** (how far): `round(combo.floorValue × chainFloors^combo.chainExponent)`
  = `10 × floors²` at baseline — Icy Tower's exact formula; increasing
  marginal floor value is the compulsion engine, and it makes n small banks
  strictly worse than one big one (the incentive always points toward
  extension, which is exactly the at-risk direction).
- **MULT** (how well): `1 + Σ confirmed spice`, growing **only from style**:
  counted airborne bounce +0.25 (counted ≤ `bounceFloorsCapRatio` ×
  that landing's floorsGained — the escrow cap); combo-perfect bounce
  (own ±5-tick window on raw `inputLeadTicks`) +0.25 more; LEAP link
  (≥4 floors) +0.5, consecutive leaps +0.25 each beyond the first
  (Tetris back-to-back); hot landing (speed tier ≥3, self-repricing via
  movement's TIER_FRACS) +0.25; `ceiling` entered during a chain +1.0,
  once per chain.

**PAYOUT = round(base × mult)**, integers always. The multiplier has **no
ceiling, by explicit choice**: glory numbers are allowed to run away in
god-runs — engine safety lives in movement's absolute exchange cap, and boss
balance lives in EXAM's own damage conversion, so an unbounded scoreboard
endangers nothing but modesty. Continuous accrual,
discrete payment: HUD and boss telegraphs read live `chainFloors/mult/
provisionalPayout` from `combo/link`; score and boss damage are paid **only
at `combo/banked`**. Fizzle, grace, and exit bank 100% — breaking a chain is
*cashing out*, disappointment without punishment. `heart_lost` **voids**:
`voidRefundFraction` (0.0 baseline; the "Safety Net" relic sets 0.5). The
wager is pillar-2 clean because the death line is always visible.

## Anti-degeneracy (the grammar refuses; no patches)

1. **Stationary shaft ping-pong** (movement.md's flagged farm): spice is
   escrowed and capped against the closing landing's floorsGained — ping-pong
   ends in a fizzle that discards the ledger; even a +2 link confirms at most
   2 bounces. The escrow IS the refusal.
2. **Ground-hop metronome**: every landing must climb ≥2 floors or it banks.
3. **Within-air descend-reclimb**: floors are net (takeoff→landing); a
   returning air fizzles.
4. **Bounce-grinding honest routes**: per-air cap bounds mult growth to
   ~+0.5 per climbed floor; payout stays polynomial in floors, no time term.
5. **Stall-camping**: the fuse banks at 48 grounded ticks.
6. **Ceiling oscillation**: +1.0 once per chain.
7. **Height re-grinding**: height points pay high-water floors only (score
   side).
8. **Segment-boundary abuse**: `segment_end` auto-banks; chains never cross
   segments.
9. **Rescue-launch minting**: the post-void air is inert (graft #1).
10. **Cross-chain refarm**: instrumented (`refarmedFloorShare`), contingency
    pre-specified, not legislated — see the ruling above.

## The escalation ladder (the dopamine engine)

Eight named tiers on `chainFloors`, crossed **live** mid-chain; the theme is
art-direction's own currency — light — climbing toward "a god-run is a comet":

**SPARK** (4) · **KINDLED** (8) · **BLAZING** (14) · **SOARING** (21) ·
**METEORIC** (30) · **COMET** (40) · **SUPERNOVA** (55) · **BEYOND** (75,
then ×2, ×3… every 20 floors — stinger and card only, effects plateau).

Sized so a great baseline chain (~25–40 floors) reaches METEORIC/COMET;
SUPERNOVA/BEYOND live where they should — boss arenas and relic god-runs.
Multiple thresholds in one leap fire only the highest (one card, one stinger).

- **Audio** (per audio.md): one pentatonic step per tier (~1.5 octaves across
  the ladder); glory music layer at sustained (≥4000ms) tier ≥ SOARING; bank
  = soft detune resolving into a tally scaled by loudness class
  (whisper/voice/roar by payout); void = combo stays **silent** — the
  heart-loss sound owns that moment, the counter shatters visually only.
- **Visual** (within the earned-light budget): shoutout cards near the player
  (never center-screen), rise-and-fade ~600ms, one at a time. SPARK ignites
  the counter and the first faint character glow (bloom's threshold crossed
  only here); BLAZING = first shake + brief warm grading push; SOARING/
  METEORIC = bloom and trail step up; COMET = the trail reads as a comet
  tail; SUPERNOVA = one full-frame warm pulse (the milestone allowance,
  spent here); BEYOND plateaus.
- **Shake** (scheduler law, graft #6): tier crossings ≥ BLAZING spend 3px/
  120ms, first crossing per tier per chain; arbitrate max with movement's
  2px landing shake, drop losers, never queue, never sum.

**Spectator test:** a watcher hears a rising pentatonic ladder, sees the
character grow luminous and the world grade warmer, and sees a draining fuse
at every touchdown — size, quality, and jeopardy legible with zero numbers.

## Score

`TOTAL = height points + combo points`, one authority (`score/updated`).
Height: 10/floor, **segment high-water only**, deliberately small (a full
40-floor segment = 400 vs thousands per decent chain) — score measures run
*quality*, not run length. The flex stat is **BEST CHAIN**, leading the
post-run screen in the display face: `31 FLOORS ×4.75 — 45,648` — the
screenshot line. Session stats (engine-owned, `score/session_final`):
bestChainFloors/Mult/Payout, longestChainLinks, tallestSingleLink, totals,
banksByReason, voids, perfectBounces, bounceEfficiency, **comboUptime** (the
perma-combo bragging stat relics chase), tierHistogram, bestLeapStreak,
assistShareInChains. This is RETURN-phase achievement vocabulary, free.

## Event taxonomy (COMBO_SCHEMA_VERSION = 1)

| Event | Key payload | When |
|---|---|---|
| `combo/started` | chainId, startTick, startFloorIndex, entryFloorsGained, chainFloors, mult | opener link (same-tick `combo/link` 0 follows) |
| `combo/link` | chainId, linkIndex, floorsGained, chainFloors, mult, multDelta, spiceConfirmed{…}, **graceDeadlineTick (absolute)**, provisionalPayout | every link |
| `combo/spice` | chainId, kind: bounce\|perfect\|ceiling, provisionalMultDelta/Total | airborne style mid-chain (explicitly provisional; HUD may whisper) |
| `combo/tier` | chainId, tierIndex, tierName, isRepeat, chainFloors, thresholds (self-describing) | highest ladder crossing per link |
| `combo/banked` | chainId, **reason: fizzle\|grace\|exit\|forced**, chainFloors, links, mult, basePoints, **payout**, tierReached, spiceTotals, start/end floor+tick | **THE payout authority** — score adds payout; bosses apply their own curve over the exposed axes |
| `combo/voided` | chainId, reason, chainFloorsLost, multLost, unpaidPayout, refundPaid | heart_lost mid-chain / hard reset |
| `combo/reset` | reason: spawn | movement/spawn |
| `score/height` | floorIndex, pointsAwarded, total | new segment high-water floor |
| `score/updated` | totalScore, heightPoints, comboPoints, delta, source | any change — single HUD authority |
| `score/session_final` | full stat block | segment end + run end |

**The frozen consumer contract:** (1) SCORE consumes `banked.payout`;
(2) BOSSES consume `combo/banked` directly — damage = their own
f(payout, chainFloors, mult, tierReached) — and read `link`/`tier` live for
telegraphs; build-then-fizzle is the deliberate attack; (3) RELICS touch
exactly two surfaces — TuningStack layers on `combo.*` keys and event
subscriptions — never engine internals; (4) NODE MODIFIERS push/pop
per-segment tuning layers. **Law: consumers scale with payload values, never
event counts.** `bank_now` is orchestration-only, forever.

## Constants (all relic-mutable via TuningStack; validation throws on degenerates)

| Key | Value | Meaning |
|---|---|---|
| `combo.linkMinFloors` | 2 | link threshold (fixed px-free floors — deliberately NOT self-repricing: perma-combo is the named power fantasy) |
| `combo.groundGraceTicks` | 48 (0.80s) | the one window; the visible fuse |
| `combo.floorValue` / `combo.chainExponent` | 10 / 2.0 | base = 10 × floors² (Icy Tower, cited); exponent is itself relic substrate |
| `combo.multWallBounce` / `multPerfect` | +0.25 / +0.25 | counted airborne bounce; perfect via own window |
| `combo.bounceFloorsCapRatio` | 1.0 | escrow cap (an "Echo Walls" relic sets 2.0) |
| `combo.perfectWindowTicks` | 5 | combo's OWN window on raw inputLeadTicks (relic-widenable) |
| `combo.leapFloors` / `multLeap` / `multLeapStreak` | 4 / +0.5 / +0.25 | leap + back-to-back |
| `combo.hotLandingTier` / `multHotLanding` | 3 / +0.25 | self-reprices via TIER_FRACS |
| `combo.multCeiling` | +1.0 | once per chain |
| `combo.ladderFloors` | [4,8,14,21,30,40,55,75] | SPARK→BEYOND |
| `combo.ladderRepeatEvery` | 20 | BEYOND ×n cadence |
| `combo.voidRefundFraction` | 0.0 | "Safety Net" relic substrate |
| `combo.stumblesAllowed` | 0 | relic-purchasable fizzle-forgiveness charges |
| `combo.highWaterGate` | false | pre-specified refarm contingency — **do not implement until evidence** |
| `score.heightPointsPerFloor` | 10 | high-water only |
| `juice.comboShakeMinTier/AmpPx/Ms` | BLAZING / 3 / 120 | shake budget spend |
| `audio.glorySustainMs` | 4000 | glory-layer gate at ≥ SOARING |
| `hud.bankWhisper/Voice/Roar` | <500 / <5000 / ≥5000 pts | bank loudness classes |

## Architecture

Engine-free core (no Phaser imports, files under the cap):
`src/core/combo/types.ts` (typed unions, ChainState, RunSignal,
COMBO_SCHEMA_VERSION) · `engine.ts` (the four-state machine:
`handle(MovementEvent|RunSignal)` + `step(tick)` → ComboEvent[]; tripwires
`comboAltDrift`, `negativePayout`, `floorGridDrift`) · `spice.ts`
(provisional ledger, caps, mult arithmetic) · `ladder.ts` (tiers/repeats) ·
`tuning.ts` (DEFAULT_COMBO_TUNING merged into the movement TuningTable —
relics and modifiers work with zero combo-specific plumbing; **validation
throws on degenerate values at layer-push**). `src/core/score/score.ts` is a
**sibling consumer**, not part of the engine (consumes `banked` +
`floor_crossed`; owns high-water, totals, session stats). Game layer:
`ComboHud.ts` (counter, ×mult, fuse bar, cards), combo handlers in the
existing Juice/Audio systems (including the shake scheduler), a combo slice
on the debug bridge (ring buffer, stats, tripwires, forceBank/forceVoid for
the harness). If `engine.ts` crowds the 300-line cap, the pre-approved seam
is the economist's grammar/payout factoring (state machine with zero point
math; pricing pure). **Inbound port:** `RunSignal = segment_end | heart_lost
| bank_now` — published now, wired by PRESSURE; until then sandbox chains
never void (strictly generous, safe). Determinism: pure function of (event
sequence, ticks, tuning history); no wall-clock, no RNG.

## Amendments to movement.md (accepted asks — additive, implement by MASTERY)

1. **`tier` joins the event envelope** (or minimally: a `speed_tier` snapshot
   fires right after `movement/spawn`). Two consumers (hot-landing spice,
   audio's pitch-by-tier) otherwise ship a known-desynced stateful
   reconstruction — a fail-loud repo doesn't do that.
2. **Intra-tick event order becomes a documented promise**: walls → landing →
   jump; specifically land-before-left_ground on same-tick-bhop ticks. The
   combo state machine depends on it; a future refactor must not silently
   reorder it.
3. **EXAM reservation**: tower-mutation landing classifications (crumble,
   sticky) extend `land` additively under EVENT_SCHEMA_VERSION discipline.

## Risks & feel-gate A/Bs (pre-registered)

Grace 48 vs 66 ticks (aim-then-jump rhythm) · linkMinFloors 2 vs 3 (chain
entry at ~260 px/s may be too free) · quadratic swinginess (chainExponent is
the knob; Best Chain as flex stat is the mitigation) · bank-on-fizzle
emotional read (detune-then-tally + loudness classes; verify at gate) ·
void-vs-pillar-1 (the one true punishment; re-judge in playtest;
voidRefundFraction is the soften knob) · the tension is untestable before
PRESSURE exists (chains can't void in the sandbox — known, accepted) ·
tiers 7–8 are aspirational dead air until EXAM/IDENTITY (results screen must
not taunt with unreached tiers).
