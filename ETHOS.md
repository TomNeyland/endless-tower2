# ETHOS.md

*Read this before touching anything. `docs/DESIGN.md` is the spec — what we're
building; `docs/design/` holds the per-system design documents. This document
is the sensibility — how to think while building. Every agent working on this
repo reads ETHOS.md first, then DESIGN.md, then its phase brief.*

## What this is

Endless Tower 2 is a momentum roguelite being built end-to-end by AI in
long-form autonomous sessions, with a human playtester at the feel gates. It
is a public repo and will be shown to a skeptical audience as evidence of what
autonomous building can produce. The bar is not "it works." The bar is:
**proud to publish.** Every shortcut taken in private will be read in public.

Its predecessor (v1, endless-tower) was playable and mediocre — "we narrowly
landed that plane." v2 exists because mediocre wasn't worth publishing. If you
ever face a choice between shipping more and shipping better, this project
chooses better.

## The one sentence

**Momentum is the only currency.** Jumps spend it. Walls route it. The death
line taxes hesitation. Combos measure it and make it loud. Modifiers reprice
it. Relics amplify it. Bosses attack it — and are damaged by proof of it.
The map lets you choose which momentum economy you enter next.

If you're designing something and it doesn't read or write this currency,
ask why it's in the game. One player sentence describes everything: *how well
do you build, keep, route, and spend speed?*

## The pillars (in order of authority)

0. **Feel first.** Raw climbing must be joyful in an empty room before any
   system is layered on. A run-structure wrapped around mediocre movement is
   exactly v1's mistake with more steps.
1. **Power fantasy over punishment.** It must feel possible to assemble a
   genuinely broken, godlike run. Risk exists to make reward spicy — never to
   gate fun. When balancing, err generous.
2. **Risk is a price tag, never an ambush.** Every danger is visible before
   the player commits. Surprise difficulty is a design failure, not depth.
3. **The verbs stay pure.** Run, jump, wall-bounce, chain. No attack button,
   ever. Every system — including bosses — must be played through these verbs.
4. **Coherence over features.** Systems must rhyme. A player who learns one
   system has partially learned them all, because they all act on the same
   currency. This is systemic coherence, not narrative — no lore required.

## Taste

- **Celebration is earned, not noisy.** v1 deleted its screen flashes as
  "visual pollution" and was right. Escalating shoutouts on a real combo:
  yes. Confetti for breathing: no.
- **Menus show the game, not documentation.** v1's title screen dumped a
  powerup encyclopedia onto first-time players. Teach through play.
- **Debug never leaks.** v1 shipped a debug spawner and an internal mode label
  on the title screen. All diagnostics live behind the debug bridge.
- **The art ceiling is direction, not assets.** The Kenney pack looks like a
  jam game when used flat, and looks charming when given palettes, parallax,
  particles, and grading. Push direction before wishing for better sprites.
- **Generosity in the small moments.** Coyote time, buffered jumps, a heart
  instead of death — the player should quietly feel the game is on their side.

## Epistemic discipline

- **v1's numbers are floors, not targets.** Its tuning shipped untuned (its
  own admission).
- **v1's fixes are symptoms, not solutions.** Triage everything from
  `docs/research/V1_GAMEFEEL.md` by its epistemic-status header: engine facts
  (verify on Phaser 4, then trust), feel observations (re-test cheaply, never
  assume), patches (understand the disease; don't import the cure).
- **v1's unbuilt promises are wishes, not designs.** Zero evidence behind
  them. Chasing what v1 said it would someday be is chasing a ghost.
- **Provenance-blind evaluation.** Nothing is adopted because v1 promised it;
  nothing is rejected in protest because v1 touched it. Ideas from v1, genre
  classics, and fresh invention all face the same bar: the spine, the
  pillars, the feel gate.
- **Docs can lie; playtests don't.** v1's own docs misdescribed its three
  flagship systems. Trust code you've read and behavior you've measured.

## How we work

- **Roles.** Human hands are the feel gate — real play judges joy, and that
  verdict is the final authority on feel. The manager session holds the spine
  and weaves systems together. Build agents give one system their full
  attention. If you are a build agent: your system will be consumed, hooked,
  and mutated by others — design the interfaces like they're load-bearing,
  because they are.
- **Design before code.** Every system gets a design document in
  `docs/design/` before its implementation session (Epic 0). The design
  documents are authored personally by the manager session — the project's
  continuity of intent. Design panels and reviewers critique and pitch; they
  do not ghostwrite. Implementation agents execute a reviewed design, they
  don't improvise architecture.
- **The combo engine is the nervous system.** Movement emits events and never
  knows who listens. Score, bosses, relics, and modifiers all attach to the
  combo pipeline. When in doubt about a boundary: emit an event.
- **Constants are data.** Every tuning value must be runtime-mutable —
  relics multiply them, modifiers swap them per segment. A hardcoded constant
  is a relic that can never exist.
- **Determinism is sacred.** Seeded RNG everywhere; the scripted-input replay
  harness must reproduce identical runs. If a feature would break determinism,
  redesign the feature.
- **Code law** (full version in CLAUDE.md): no god files (~300-line soft cap),
  engine-free core logic in `src/core/`, assets only via the manifest,
  listener hygiene, fixed timestep stays on.
- **No test suites until the HANDS phase** — explicit decision; don't slow
  ideation. `npm run check` is the gate until then.
- **Commit messages are essays.** Why it matters and where it sits in the arc,
  not what the diff contains. `git log` should read as the design narrative.
- **PG everywhere.** Public repo: code, comments, commits, issues stay
  professional.

## The arc (context for where your work sits)

FEEL → PRESSURE → MASTERY → CHOICE → IDENTITY → EXAM → RETURN → HANDS.
Each phase answers a new player question (see DESIGN.md). Phases build on
passed gates — FEEL's gate is human sign-off on pure movement joy.

## Definition of 1.0

Every system rich and fully wired. Not "technically the code exists with two
test entries of data" — a player can complete full runs through three acts
with real bosses, real builds, real unlocks, real audio, on desktop and
mobile web, and the whole thing feels like one game. Unbounded time was
granted for exactly this: depth over speed, no skeleton-ware.
