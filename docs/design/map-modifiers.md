# Map & Modifiers — the CHOICE-phase design

*Authored by the manager session. Status: v1 — open for critique, binding for
the CHOICE implementation session. Read ETHOS.md and docs/DESIGN.md first;
consumes pressure.md's segment spec and the TuningStack from movement.md.*

## Thesis

The map is where momentum becomes strategy. Every node is a **priced
momentum economy**: the mutators, the loot, and the danger are printed on
the label before the player commits (pillar 2 — risk is a price tag, never
an ambush). Path choice *is* build strategy: the greedy line pays double,
the icy floors keep your speed slippery, the elite guards a relic — and you
chose all of it, three rows ago, on purpose.

## Seeded determinism (the run's spine of randomness)

One **run seed** (shareable string). All randomness forks from it by
labeled stream: `fork(runSeed, 'map:act2')`, `fork(runSeed,
'segment:<nodeId>')`, `fork(runSeed, 'shop:<nodeId>')` — so any system can
regenerate its own stream independently and a seed reproduces the entire
run offer: map shape, node contents, shop stock, segment geometry.
Implementation: a small, well-tested seeded PRNG; prior-art check at
implementation time (candidate: `pure-rand`, battle-tested under
fast-check; fallback: sfc32/mulberry32, public-domain standards, ~40
lines). `Math.random` is forbidden in core paths (already law). Replays and
"beat my seed" (RETURN phase) ride on this for free.

## Run structure

3 acts × 7 rows. Row 0: 2–3 entry nodes (the first choice). Rows 1–5: width
2–4. Row 6: the act boss, all paths converge. Edges connect adjacent rows
only, no crossings (Slay-the-Spire's readable-braid rule), every node has
1–3 upward edges, all nodes reachable, all paths reach the boss.

**Generation guarantees** (validated post-generation; on violation,
regenerate deterministically with a bumped fork counter — never patched by
hand): every path through an act contains ≥1 Shop and ≥2 non-Climb
specials; no Elite in row 1; no two Shops adjacent on a path; Mystery count
per act 1–3. Validation failures throw after `map.maxRegens` (16) — a
generation bug fails loud, never ships a degenerate act.

## Node types (each a distinct momentum economy, not a reskin)

| Type | Segment shape | Line profile | Reward profile |
|---|---|---|---|
| **Climb** | 24–32 floors, standard gen | standard | coins by play + combo glory |
| **Coin Rush** | 14–18 floors, loot-dense, wide ledges | gentle (0.7× base, long grace) | coins ×2.5 placement |
| **Challenge** | 22–28 floors, exactly 1 nasty modifier | standard | large fixed bounty + relic-odds boost |
| **Elite** | 26–34 floors, 1–2 modifiers, tight gen | hot (1.3× base, short grace) | **guaranteed relic** |
| **Shop** | no climb — a scene | — | spend coins: relics, hearts, rerolls |
| **Mystery** | text event, seeded outcomes | — | risk/reward choice; PG flavor |
| **Boss** | EXAM-phase arena (no exit door until won) | boss-owned (surges) | act completion + big bounty |

Node contents (which modifiers, what loot table, shop stock) are rolled at
map generation from the node's forked stream and **shown on the map** —
hovering/selecting a node reveals its full label before commitment.

## Modifiers (priced mutators, arriving as data)

A modifier is `{id, name, blurb, price, pay, tuningLayers[], genPatch?,
lootPatch?, skin?}` — the mechanical truth is a set of TuningStack layers
(movement/combo/line keys) plus optional generation/loot patches, pushed at
`run/segment_start` and popped at segment end (tick-stamped, replay-safe —
exactly the substrate movement.md built). **Every modifier states its price
and its pay in one breath** on the map label. Validation throws on
degenerate values (combo-scoring.md's law, reused).

Starting roster (12 — enough for real path texture; the pool grows via
RETURN unlocks; names PG and physical):

| Modifier | Price (what it costs you) | Pay (what it gives) |
|---|---|---|
| Icy Floors | ground drag ×0.4 (slippery holds) | coins +50% |
| Low Gravity | gravity ×0.8 (floatier, slower rhythm) | combo floorValue ×1.25 |
| Greedy Line | line speed ×1.5 | all loot ×2 |
| Narrow Ledges | platform widths −30% | coins +75% |
| Brittle Rows | 15% of platforms crumble after one touch | relic-odds boost |
| Headwind | air accel ×0.5 | leap spice +0.25 |
| Tailwind | line grace −50% | run accel +20% (you're faster too) |
| Dense Fog | far-visibility skin (parallax veil) | coins +60% |
| Sticky Patches | 10% of platforms drain 30% speed on land | bounty +big |
| Swarm | passive Kenney critters as moving obstacles | coins +50% |
| Double Fuse | combo grace ×2 (a GIFT modifier — pay with no price; rare) | — |
| Surging Line | line surges in telegraphed pulses (EXAM's toolkit, previewed) | loot ×1.75 |

Physics-touching modifiers must respect spine law: nothing may make walls a
tax or a pump at baseline; nothing touches the player's inputs. Skins ride
along (Dense Fog is also weather; every modifier may carry an atmosphere
patch per art-direction.md).

## The map scene (the tower is the map)

Per art-direction.md: the act's tower exterior at night, **nodes as lit
windows** climbing the silhouette — the map IS the place you're climbing,
not a flowchart in a void. Current node pulses; reachable nodes glow;
taken path stays warm-lit behind you. Selecting a node opens its label
card: type, modifiers (price/pay), rewards, line profile. Confirm →
traversal animation (the character climbs the exterior to that window) →
`map/node_committed` → segment starts. Seed string is visible on the map
screen (tap to copy). Keyboard + pointer both first-class.

## Events (MAP_SCHEMA_VERSION = 1)

| Event | Payload | When |
|---|---|---|
| `map/generated` | actIndex, seed, graph summary (rows, counts by type) | act map created |
| `map/node_previewed` | nodeId, full label | preview opened |
| `map/node_committed` | nodeId, type, modifiers, rewards | player confirms |
| `run/act_completed` | actIndex, path taken, stats ref | boss down |

`map/node_committed` hands pressure.md its segment spec verbatim; modifiers
arrive as pre-built tuning layers. Facts-only law applies.

## Architecture

Engine-free core: `src/core/rng.ts` (forkable seeded streams — shared by
everything), `src/core/map/types.ts` (NodeSpec, ModifierSpec, ActGraph),
`src/core/map/gen.ts` (graph generation + validation), `src/core/map/
modifiers.ts` (the roster as data + validation). Game layer:
`src/game/scenes/MapScene.ts` (tower-exterior rendering, node cards,
traversal), `src/game/systems/RunOrchestrator.ts` (map → segment → results
→ map loop; owns the RunSignal wiring until IDENTITY's RunState assumes
it). Debug bridge: seed override, jump-to-node, reveal-map.

## Risks & gate questions (pre-registered)

Guarantee constraints vs. 2–4 width can over-constrain small acts (watch
regen counts; loosen guarantees before widening rows). Modifier stacking on
Elites (2 slots) needs a compatibility matrix pass at implementation
(Tailwind+Greedy Line is spicy-good; Sticky+Narrow may be misery — misery
is a price players didn't legibly choose if the interaction is non-obvious;
the label card must state compound danger plainly). Map readability at a
glance vs. label depth: the card carries the detail, the silhouette carries
the shape — if players open every card every row, the icons have failed.
Mystery events need a PG-writing pass with seeded outcomes (no meta-RNG).
