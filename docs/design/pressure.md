# Pressure — death line, hearts, segments, exit

*Authored by the manager session. Status: v1 — open for critique, binding for
the PRESSURE implementation session. Consumes movement.md's vocabulary and
fulfills combo-scoring.md's RunSignal port. Read ETHOS.md and docs/DESIGN.md
first.*

## Thesis

PRESSURE gives speed stakes without ever touching the player's controls. The
death line is the tax on hesitation (the spine's fourth verb: hesitation has
a price). Hearts make failure a resource drain instead of a rage quit
(pillar 1). The exit door bounds a climb into a level you can *win*. All
three are honest: visible, telegraphed, priced — never an ambush (pillar 2).

## The death line

**Its job is tempo, not execution.** The player's execution test is the
tower; the line just makes standing still expensive. Design consequences:

- **Dormant start, announced ignition.** Each segment begins with the line
  dormant. It activates after `line.graceMs` (10s) OR when the player climbs
  `line.graceFloors` (10) — whichever first (v1's dual trigger, a fine
  shape). Activation is a visible, audible moment: the line ignites at the
  bottom of the arena (per-act skin: grass fire / sandstorm / creeping void,
  per art-direction.md). Never a silent start.
- **Speed = max(base, catch-up), never pity.**
  `lineSpeed = max(line.baseSpeed, catchUp)` where catch-up engages only
  when the player's gap exceeds `line.slackPx` (1400): the line accelerates
  (`line.catchUpFactor` 1.6 × base) until back inside slack. The line stays
  *relevant* on god-runs without ever being unfair — and it **never slows
  down to spare a struggling player** (pity would make pressure dishonest
  and quietly insult the feel; hearts are the mercy system, not the line).
- **A designed ramp, per segment, as data.** `line.rampPerFloor` (+0.6 px/s
  per floor climbed) raises base speed gently across a segment, so late
  floors are hotter than early ones. All line constants live in the tuning
  table — node modifiers reprice them (*Greedy Line: faster, double loot*),
  and EXAM's surge attacks are `line.surge` tuning layers pushed/popped by
  the boss (reserved here, built there).
- **Proximity is a broadcast, not a secret.** `line/proximity` events at
  tier boundaries (gap px: 800 safe / 400 aware / 200 danger / 80 critical,
  hysteresis 40) drive the audio rumble swell (audio.md), the pressure music
  stem, and a restrained screen-edge treatment at danger+ (per
  art-direction's readability hierarchy — the line carries its own light and
  is unmissable at any grading). The camera never reacts (iron law).

### The line's look (binding — v1's programmer art is refused by name)

The death line is not a line. It is **the world ending from below** — a
living surface with three layers, all buildable from generated textures,
particles, and blend modes (no new art assets required):

1. **The consumed zone**: everything below the edge sinks into the act's
   consumption palette — a vertical gradient from the edge color down to
   near-black, drawn over the world so the tower visibly *ceases to exist*
   down there. Not a rectangle of color on top of a visible world.
2. **The edge**: a bright, additive-blended band that **undulates** (two or
   three layered, offset, slowly-scrolling strips — never a straight
   ruler line) and pulses gently with proximity tier.
3. **The breath**: particles rising off the edge — embers for act 1's grass
   fire, grit streaks for act 2's sandstorm, slow star-motes for act 3's
   creeping void — sparse at `safe`, denser and faster at `danger+`.

Urgency is carried by the line's own light, the audio swell, and the
screen-edge treatment. **Never by text.** v1's "DANGER — CLIMB NOW!"
banner class is refused: no words, no arrows, no flashing labels. A
spectator should find the line beautiful and the player should find it
terrifying, and it should be the same rendering doing both.

## Hearts (the mercy that preserves the fantasy)

Caught by the line = **one heart lost, not death**:

1. `run/heart_lost` fires (combo voids per its contract; the rescue air is
   inert — combo-scoring.md graft #1).
2. The **rescue launch**: player is flung skyward from the catch point
   (`hearts.rescueVy` −1500 px/s, vx preserved ×0.5), invulnerable for
   `hearts.invulnMs` (1600) with the classic blink. The launch is authored
   as *hurt, then hope* (audio.md's phrase) — the hard hit sound, then the
   whoosh, then you're above the line with your momentum story intact.
3. During invulnerability the line cannot catch again (and the line does not
   pause — the world stays honest).
4. Zero hearts → the catch is final: `run/ended {reason: death_line}`, run
   over, results screen.

Hearts are run-scoped state (owned by RunState when IDENTITY builds it; a
minimal `hearts.count` lives with the segment orchestrator until then).
Baseline `hearts.max` 3, `hearts.start` 3 — generous by design; shops sell
them back (IDENTITY). Heart loss is the game's one true punishment, and the
combo void rides on it — one moment, one lesson, always self-inflicted in
plain sight.

## Segments and the exit door

A **segment** is a bounded climb: `{floors, generatorParams, lineProfile,
modifiers[]}` — pure data, authored by CHOICE-phase node types; PRESSURE
builds the runtime. The **exit door** is a physical object on the top floor
(pack asset: door tiles; lit and unmissable). Entering it (overlap + up/press
is not required — walking through suffices; the verbs stay pure):

- `run/segment_end {reason: exit, floorsClimbed, timeTicks, heartsLost}` —
  combo auto-banks (never punish finishing), score emits `session_final`
  for the segment, the results/map handoff runs (CHOICE phase owns what
  comes after; until then the sandbox loops).
- The door never appears in boss arenas until the boss dies (EXAM contract).

Segment floors are finite; the generator keeps a small buffer of floors
above the door's floor purely for visual continuity (the tower doesn't
visibly end at a cliff of nothing).

## Events (PRESSURE_SCHEMA_VERSION = 1)

| Event | Key payload | When |
|---|---|---|
| `run/segment_start` | segmentId, floors, lineProfile, modifiers | segment begins |
| `line/state` | state: dormant\|active, igniteTick | ignition (and re-dormancy if ever designed) |
| `line/proximity` | tier: safe\|aware\|danger\|critical, gapPx, direction | tier crossing ± hysteresis |
| `run/heart_lost` | heartsRemaining, gapAtCatch, catchFloorIndex | line catch |
| `run/segment_end` | reason: exit, floorsClimbed, timeTicks, heartsLost | door entered |
| `run/ended` | reason: death_line, finalStats ref | zero-heart catch |

`run/heart_lost` and `run/segment_end` are exactly the RunSignal wiring
combo-scoring.md published. Facts-only law applies (no score, no judgment).

## Constants (tuning-table entries; all modifier/relic-repricable)

| Key | Value | Meaning |
|---|---|---|
| `line.baseSpeed` | 55 px/s | dormant→active base rise speed |
| `line.rampPerFloor` | +0.6 px/s | designed ramp across a segment |
| `line.graceMs` / `line.graceFloors` | 10000 / 10 | dual activation trigger |
| `line.slackPx` / `line.catchUpFactor` | 1400 / 1.6 | catch-up leash (relevance, not pity) |
| `line.proximityTiers` | [800, 400, 200, 80] px | broadcast boundaries, hysteresis 40 |
| `hearts.max` / `hearts.start` | 3 / 3 | generous baseline |
| `hearts.rescueVy` / `hearts.rescueVxKeep` | −1500 px/s / 0.5 | the skyward mercy |
| `hearts.invulnMs` | 1600 | blink window; line cannot re-catch |
| `segment.doorBufferFloors` | 6 | visual continuity above the exit |

## Architecture

Engine-free core: `src/core/pressure/line.ts` (position/speed/ramp/catch-up
state machine, proximity tiers — pure), `src/core/pressure/segment.ts`
(segment spec type, floor budget, door placement, end conditions),
orchestrated by a thin `src/game/systems/PressureSystem.ts` (renders the
line per act skin, applies catch test vs player body, spawns the door,
emits events through the existing bus). Camera and movement remain ignorant
of all of it — the line reads player position; nothing reads the line except
consumers of its events. HUD gains hearts + a gap indicator at danger tiers.
Debug bridge: line teleport/speed override, forceCatch, forceExit for the
scripted harness; `line/proximity` history in the ring buffer.

## Risks & gate A/Bs (pre-registered)

Catch-up leash values (1400/1.6) are the honesty-vs-relevance balance — too
tight reads as rubber-band punishment for skill; A/B against pure-constant.
`rescueVy` −1500 must clear the line's next ~2s of rise or mercy reads as a
double-tap. The one-catch-per-invuln rule needs a harness test (line rising
through a stationary invulnerable player must not drain a second heart).
Door-walk-through must be un-missable at 1400 px/s (widen trigger to full
floor width). Grace floors vs. speedrunners: a tier-4 opener can out-climb
ignition entirely — acceptable (that IS the fantasy), the catch-up leash
keeps the line in the story.
