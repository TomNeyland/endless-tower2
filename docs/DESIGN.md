# Endless Tower 2 — Design

*A momentum roguelite: Icy Tower's power fantasy, restructured as a run-based climb.*

## Vision

Endless Tower 2 takes the kinesthetic core of Icy Tower — horizontal speed converts
into jump height, walls redirect momentum, combos celebrate sustained mastery — and
gives it the structure of a modern roguelite: discrete levels chosen on a branching
map, relics that stack into visibly powerful builds, bosses that examine the build,
and light meta-progression across runs.

v1 (endless-tower) proved the mechanics could work and shipped a playable MVP. Its
own post-mortem verdict: the plane landed, narrowly. v2 exists to be the version
built with excellence as the bar. See `docs/research/V1_GAMEFEEL.md` for the full
archaeology — v1's tuning values are a **known-mediocre baseline to beat, not a
spec to copy** (and v1's docs lie about its three flagship systems; trust only the
mined report).

## Design pillars

0. **Feel first.** The raw act of climbing must be joyful in an empty room before
   any roguelite system is built on top. This is a hard gate.
1. **Power fantasy over punishment.** It must feel possible to assemble a genuinely
   broken, godlike run. Risk exists to make reward spicy — never to gate fun.
2. **Risk is a price tag, never an ambush.** Every modifier and danger is visible
   before the player commits to it.
3. **The verbs stay pure.** Run, jump, wall-bounce, chain. No attack button, ever.
   Every system must be played through these verbs.
4. **Coherence, not features.** Systems are verbs acting on one shared quantity
   (see The Spine). A player who learns one system has partially learned them all.

## The spine: momentum is the only currency

Every system reads or writes the player's speed:

| System | Relationship to momentum |
|---|---|
| Jump | **Spends** it — speed converts to height |
| Walls | **Route** it — pure redirection, never a tax |
| Death line | **Taxes hesitation** — the cost of standing still |
| Combos | **Measure** it — score is momentum sustained, made loud |
| Modifiers | **Reprice** it — each node changes how it's earned or kept |
| Relics | **Amplify** it — a build is a personal physics engine |
| Bosses | **Attack** it — their offense and your damage are the same stat |
| Map | **Prices** it — choose which momentum economy you enter next |

One sentence describes the whole game: *how well do you build, keep, route, and
spend speed?*

## The purpose arc

Each phase answers a new player question. Built in this order; each layer must
work before the next begins.

1. **FEEL** — is moving, alone in a room, already joyful? *(movement sandbox)*
2. **PRESSURE** — does speed have stakes? *(death line, hearts, exit door)*
3. **MASTERY** — is skill legible and loud? *(combos, shoutouts, score)*
4. **CHOICE** — does a run have decisions? *(node map, priced modifiers)*
5. **IDENTITY** — does a run become YOUR run? *(relics, shops, builds)*
6. **EXAM** — does the build get tested? *(combo-damage boss duels)*
7. **RETURN** — does mastery accumulate? *(unlocks, characters, seeds, stats)*
8. **HANDS** — is it excellent in a stranger's hands? *(audio, polish, perf, deploy)*

## Systems

### The run

A run is 3 acts. Each act is a Slay-the-Spire-style branching node map (~7 rows)
ending in a boss. Beat act 3's boss to reach the summit and win the run. Acts are
visually distinct biomes (the Kenney pack has three terrain palettes: grass, sand,
purple — plus background variety v1 never used).

### Node types

| Node | What it is |
|---|---|
| **Climb** | Core: a bounded tower segment (~20–40 floors). Reach the exit door at the top while the death line rises. |
| **Coin Rush** | Short, low-danger, loot-dense. |
| **Challenge** | A nasty mutator, a big reward. |
| **Elite** | Brutal segment; guaranteed relic. |
| **Shop** | Spend coins: relics, hearts, rerolls. |
| **Mystery** | An event — a risk/reward choice presented as text. |
| **Boss** | Combo-damage duel (below). No exit door until it's won. |

### Hearts (pillar 1 in action)

Getting caught by the death line costs one heart and launches the player skyward
with brief invulnerability — the run continues mid-segment. Zero hearts = run over.
Shops sell hearts back. Death is a resource drain, not a rage quit.

### Modifiers

Every node displays its mutators on the map before the player commits — *Icy Walls
(slippery, +50% coins)*, *Low Gravity*, *Greedy Line (faster death line, double
loot)*. Modifiers mutate how momentum is earned/kept in that segment.

### Relics

Permanent-for-the-run passives, designed to stack multiplicatively. v1's ten timed
powerups get promoted to relics (Momentum Lock, Wall Grip, Air Walker, Midas
Touch…) plus new ones. The explicit design goal: a good run should assemble a
visibly broken machine — five-floor leaps, perma-combo, screen on fire. Timed
powerups still spawn inside segments as moment-to-moment spice.

### Combos

One combo system (v1 accidentally shipped two competing ones). Multi-floor jumps,
wall bounces, air time, chained within a timeout window; escalating Icy Tower-style
shoutouts with screen shake. The combo engine emits an event stream that other
systems consume — score in normal segments, damage in boss fights.

### Bosses: combo-damage duels

A boss segment has no exit door; the tower keeps generating until the duel
resolves. The boss has an HP bar. **Completed combos convert to damage**, scaled by
the multiplier — the dopamine engine is the weapon, so combo relics are damage
relics, and a stacked build doesn't just survive the exam, it deletes it. Bosses
fight back by mutating the tower (crumbling platforms, wall hazards, telegraphed
death-line surges, sticky floors that drain momentum) — never by touching the
player's controls. Phases at ⅔ and ⅓ HP. Act bosses use the pack's 14 unused enemy
types; each gets a design workshop in the EXAM phase.

### Meta (light)

Achievements unlock characters (5 Kenney colors, each a distinct movement trait)
and add relics to the pool. Stats and best-runs page. Seeded runs are shareable.
No permanent stat grinding — skill is the progression.

## Architecture

- **Stack:** Phaser 4 (4.2+), Vite, TypeScript strict, no UI framework.
  Rationale + alternatives considered: `docs/research/ENGINE_CHOICE.md`.
- **Scenes:** `Boot → Preloader → MainMenu → Map → Climb → Shop/Event →
  GameOver/Victory`, HUD as an overlay scene. Scenes stay thin.
- **Pure logic engine-free:** map generation, run state, economy, combo math,
  relic effects, RNG live in plain TS modules with no Phaser imports — testable
  without a browser (test harness arrives in HANDS phase).
- **Seeded determinism:** one run RNG, seeded and forkable per system, so runs are
  shareable and replayable.
- **Fixed timestep:** arcade physics `fixedStep: true, fps: 60`. v1 turned this
  off and its jump became framerate-dependent. Never again.
- **Asset manifest:** all keys/paths in `src/game/assets.ts`. Art is swappable by
  design (future: purchased pack or text2image pipeline — a file swap + one
  manifest edit, zero code hunt).
- **Debug bridge:** `window.__ET2__` exposes game state, physics traces, and a
  scripted-input harness (synthetic inputs fed through the fixed timestep) so
  automated playtests can verify physics deterministically. Debug UI never leaks
  into production surfaces (v1 shipped a debug spawner item and an "AI Mode" label
  on the title screen).

## Playtest protocol

- **Human (Tom):** the feel gate. Real-time play judgment.
- **Automated (Claude via Chrome):** rendering, inputs, console, screenshots, and
  deterministic physics verification through the scripted-input harness — not
  real-time play.

## Art direction

The Kenney pack's ceiling is higher than v1 suggests. v1's look came from flat
solid-color backgrounds, no depth, debug leakage, and zero post-processing — not
from the sprites. v2 commits to: per-act palettes, layered parallax, particle
weather, squash/stretch character animation, and Phaser 4 Filters (bloom, vignette,
gradient maps) for whole-frame grading. Every act should have a distinct mood using
only pack assets. If the game earns it, upgraded art swaps in via the manifest.

## Content rules

This repo is public-facing: all code, comments, commits, issues, and docs stay
professional and PG.
