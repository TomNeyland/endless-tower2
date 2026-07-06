# Meta Progression — the RETURN-phase design

*Authored by the manager session. Status: v1 — open for critique, binding for
the RETURN implementation session. Read ETHOS.md and docs/DESIGN.md first.
The lightest design on purpose: skill is the progression; meta is the frame
that makes skill legible across runs.*

## Thesis

Nothing in meta makes the player's character stronger. Every run is winnable
from install; what accumulates is **breadth** (characters, relics in the
pool), **memory** (stats, bests, the museum of your finest chains), and
**challenge** (seeds, and the unlocks that are themselves exams). The
Slay-the-Spire model, kept honest: unlocks change *what kind* of run you can
have, never *how strong* you start.

## Unlocks (achievement-driven, no currency)

No meta-currency, no grind loop — unlocks fire from **feats**, announced at
run end with weight (the unlock moment is a celebration-budget event).
Feats are expressed entirely in existing event/stat vocabulary
(session_final + run events — RETURN adds no new instrumentation to other
systems):

- **Characters** (the 5 Kenney colors, each a real movement variant played
  through the same verbs — traits are permanent personal tuning layers,
  balanced sideways, never upward):
  - *Beige — the Classic.* Baseline. Always unlocked.
  - *Green — the Glider.* Drag ×0.7, accel ×0.9 (keeps more, builds slower).
    Unlock: bank a COMET chain.
  - *Pink — the Rebounder.* Stick-flip grace ×1.5, retention −0.04 (walls
    love you, jumps spend more). Unlock: 25 wall bounces in one segment.
  - *Purple — the Featherweight.* Gravity ×0.9, hearts.max −1 (floats
    higher, breaks sooner). Unlock: finish an act without losing a heart.
  - *Yellow — the Sprinter.* Accel ×1.15, grace fuse −12 ticks (faster
    hands, hotter clock). Unlock: touch the ceiling (tier 4) in a run.
- **Relic pool growth:** 16 of the 24 roster relics available initially;
  8 marked *unlockable* enter the pool via feats (e.g., Compounder unlocks
  on a SUPERNOVA bank — the tools of brokenness are earned by approaching
  brokenness). New unlocks are visibly stamped NEW in shops.
- **Modifier pool growth:** the last 3 map modifiers unlock via act
  completions, keeping early maps simpler by construction.

## Stats & the museum

`stats.ts` aggregates session_final blocks across runs (localStorage,
versioned): bests (chain floors / mult / payout / height / fastest act),
totals, tier histogram lifetime, per-character records, win streaks. The
**museum page** leads with the flex line — *best chain, in the display
face, full art treatment* — because the screenshot stat is the retention
loop. Every stat the page shows already exists in combo-scoring.md's
session vocabulary; RETURN renders memory, it doesn't mint it.

## Seeds

- Seed visible on map and results screens (tap to copy; enter on the title
  screen's seeded-run option).
- Same seed + same character = same run offer (map, stock, geometry — the
  determinism spine already guarantees it).
- Results screen shows seed + character + score so a shared screenshot is a
  complete challenge. A "daily seed" (same for everyone, date-derived) is a
  cheap, high-value HANDS-phase addition — designed here, built there.

## Persistence

`src/core/persist/save.ts`: one versioned localStorage document
`{SAVE_SCHEMA_VERSION, unlocks, stats, settings, lastSeed}` written on
run end and settings change (never mid-segment — no IO in the hot path).
Corrupt/missing → fresh save + one console warning (fail loud in dev; a
player's first run must never be blocked by a broken save). Migrations are
explicit functions per version bump; unknown future versions refuse to
load rather than silently truncate.

## Events (RETURN_SCHEMA_VERSION = 1)

| Event | Payload | When |
|---|---|---|
| `meta/feat` | featId, trigger stat ref | feat condition met (fires once ever) |
| `meta/unlocked` | kind: character\|relic\|modifier, id | unlock granted |
| `meta/save_written` | version, bytes | persistence commit |

## Architecture

Engine-free: `src/core/meta/feats.ts` (feat conditions as data over the
stat/event vocabulary), `unlocks.ts` (registry + pool filtering for
shops/maps), `src/core/persist/save.ts`. Game layer: `ResultsScene.ts`
(run summary → feats → unlock moments, in that order), `MuseumScene.ts`
(stats/bests), title-screen seeded-run entry. Debug bridge: grantUnlock,
resetSave (dev only).

## Risks & gate questions (pre-registered)

Character traits must read as *sideways* in playtest — if any color is
strictly best, the balance failed (per-character best-boards in the museum
are the tell). Purple's −1 heart is the boldest trait: verify it reads as
identity, not punishment. Unlock pacing: the five character feats should
land across a player's first ~10 runs — if they all fire in run 2 the
breadth story collapses; feat thresholds are data, tune late. localStorage
limits are laughably sufficient; the only real persistence risk is schema
sloppiness, hence versioned migrations from day one.
