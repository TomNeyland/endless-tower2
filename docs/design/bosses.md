# Bosses — the EXAM-phase design

*Authored by the manager session. Status: v1 — open for critique, binding for
the EXAM implementation session. Read ETHOS.md and docs/DESIGN.md first;
consumes the frozen combo contract (combo-scoring.md), pressure.md's line,
and the visual mandate recorded on issue #56.*

## Thesis

A boss duel is a climbing argument you win with combos. The boss's offense
and your defense are the same stat — momentum — so the fight is the spine
at its purest: it attacks how you earn, keep, route, and spend speed; you
answer with banked chains. And the duel is **visually embodied** (the
mandate): a creature you watch, a tower that fights, damage you can see
land. The spectator test governs everything: *someone watching must know
who is winning without reading a number.*

## The duel frame

- **Arena:** an endless upward segment — no exit door until the boss dies
  (the door materializes on defeat, lit). The death line is present and the
  boss commands it (surges are its voice). Camera rules unchanged.
- **Damage:** bosses consume `combo/banked` per the frozen contract —
  `damage = payout × boss.damagePerPoint`, all axes exposed for later
  curving. Banking IS attacking; the deliberate small-hop fizzle is a
  *timed strike*. After each boss attack resolves, a visible **openness
  window** (stance change, `boss.opennessMs` 2500, damage ×1.5) gives
  banking a timing decision without adding any input.
- **One punishment source, still.** Boss attacks never cost hearts
  directly — they attack *momentum* (drain it, redirect it, block routes),
  and the line converts lost momentum into lost hearts. Every threat
  funnels through the one visible danger; hearts remain line-only
  (pressure.md's law holds even here).
- **HP budget:** sized in expected banks — act 1 ≈ 3–4 decent chains, act 3
  ≈ 5–6 or two god-chains. Phases at ⅔ and ⅓ HP.

## Embodiment (the mandate, made mechanical)

1. **The boss is a creature, not a HUD element.** Double-resolution Kenney
   enemy sprites (256px — four times the player's height) make it the
   biggest living thing in the game with zero new art. It occupies the
   arena: perches on platforms ahead, crawls the walls, drops past you,
   keeps pace as you climb. Its position is part of the fight (its body
   blocks routes; its leaps crumble what it lands on).
2. **It reacts to your chain, live.** Reading `combo/link` and `combo/tier`:
   at SOARING+ it gets visibly agitated (animation tempo up, glances at
   you); this is the "break their chain" telegraph surface the combo
   contract promised — later bosses may target the fuse window.
3. **Damage lands visibly, scaled by bank loudness:** whisper = flinch;
   voice = stagger with knockback flash; roar = knockdown + a beat of
   helplessness. A SUPERNOVA bank should look like a building fell on it.
4. **Wear states:** at ⅔ and ⅓ the body changes (cracks, dimming, missing
   pieces — tint/frame swaps within the pack), each phase turn spending the
   one full-frame visual statement art-direction.md allows.
5. **Authored entrance and defeat:** an intro beat (it arrives; name card;
   the line ignites at its command) and a defeat beat (it falls PAST you,
   down into the line — the tower's own justice; then the door lights).

## The tower-attack toolkit (reusable, telegraphed, data-driven)

Every attack telegraphs on the tower itself before it resolves — glow,
shimmer, rumble — because risk is a price tag even mid-duel (pillar 2).
None touches the player's controls. All are data (`boss.attacks[]` with
cadence, targeting, and phase gates) so act bosses are compositions, not
code forks:

| Attack | Telegraph → resolution | What it attacks |
|---|---|---|
| **Crumble volley** | platforms glow, then crumble (`land` classification `crumble` — the reserved additive payload) | your routes |
| **Sticky spit** | goo splats visibly on floors (`sticky`: −30% speed on land) | your speed → your damage economy |
| **Line surge** | the line flares, then pulses upward (a `line.surge` tuning layer, pushed/popped) | your slack |
| **Gust** | wind streaks cross the arena, then a horizontal push | your aim |
| **Swarm** | critters spiral in as moving obstacles | your clean air |
| **Body slam** | the boss itself leaps to a platform band, crumbling on impact | wherever you were going |

## The three act bosses (each examines one verb)

Sprite selection and full movesets happen in the EXAM session's per-boss
workshop; the trio's identities and exam subjects are fixed here:

- **Act 1 — The Slime Sovereign** *(slime family; heavy, gloopy, patient).*
  Examines **KEEP**: sticky spit everywhere, slow crumble slams, small
  slime minions. The lesson: protect your speed. Generous cadence — this is
  the tutorial boss, and pillar 1 says the player should usually win.
- **Act 2 — The Whirring Warden** *(saw/block family; mechanical, rhythmic,
  precise).* Examines **ROUTE**: wall hazards on timers, gusts, surgical
  crumbles. The lesson: walls are chosen, not lucky. Its rhythm is learnable
  — mastery reads as dancing through its metronome.
- **Act 3 — The Summit Keeper** *(the tower awake; barnacle/worm/swarm
  composite).* Examines **everything under pressure**: commands long surge
  patterns, layers two attacks at once, and at ⅓ HP enters a sustained
  openness — the game's final invitation to bank the biggest chain of the
  run. Beating it IS the summit.

## Events (EXAM_SCHEMA_VERSION = 1)

| Event | Payload | When |
|---|---|---|
| `boss/spawned` | bossId, hp, phase | intro beat |
| `boss/telegraph` | attackId, kind, targetBand, resolveTick | attack windup |
| `boss/attack` | attackId, kind | resolution |
| `boss/hit` | damage, hpRemaining, bankRef {payout, chainFloors, mult, tier}, loudness, openness | a bank lands |
| `boss/phase` | phase, hpFrac | ⅔ / ⅓ turns |
| `boss/openness` | state: entered\|exited, multiplier | vulnerability window |
| `boss/defeated` | bossId, duel stats (banks, biggest hit, duration) | victory |

## Architecture

Engine-free core: `src/core/boss/types.ts` (BossDef as data: hp, phases,
attack compositions, cadences), `brain.ts` (seeded attack scheduler state
machine — telegraph/resolve/cooldown/phase logic; deterministic),
`damage.ts` (bank→damage conversion + openness). Game layer:
`BossSystem.ts` (sprite, movement through the arena, reaction/wear/beat
animations), `BossHud.ts` (name card + HP bar — present but supporting
cast; the *body* is the real health bar), attack visualizations riding the
existing Juice/Audio systems. Boss defs live in
`src/core/boss/defs/act{1,2,3}.ts`. Debug bridge: spawnBoss, setHp,
forceAttack, forceOpenness for the harness.

## Risks & gate questions (pre-registered)

Damage-per-bank tuning under relic inflation — the contract's exposed axes
exist precisely so EXAM can curve payout without touching the engine; tune
against the three IDENTITY synergy recipes at full stack. Openness ×1.5
must not collapse the duel into wait-for-window (cadence tuning; openness
is a bonus, not a gate). Boss body-blocking routes must never read as
unfair collision (body is an obstacle, telegraphed by its own visible
movement — never instant). Endless-arena chains have no exit-bank, so the
BEYOND tiers finally live — verify the ladder's top doesn't distort boss
HP math. The act-3 double-attack layering is the complexity ceiling of the
game; if it isn't readable at the gate, cut to sequenced-not-simultaneous
before cutting anything else.
