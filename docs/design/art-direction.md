# Art Direction

*Authored by the manager session. Status: v1 — open for critique, binding until
amended. Read ETHOS.md first; the taste section is the parent of this document.*

## Thesis

The Kenney pack's ceiling is direction, not assets. v1 proved the floor: flat
solid-color backgrounds, no depth, no grading, debug text on the title screen.
v2's job is to make the same sprites read as a *directed* game: every act a
distinct mood, every visual effect earned by play, every layer serving
readability first. If the game earns better art someday, the manifest swap
makes it cheap — nothing in this document assumes specific pixels, only
specific *decisions*.

## The three acts, three moods

Momentum is the game's currency; light is the art direction's. Each act climbs
from ground toward sky, and the palette climbs with it.

| | Act 1 — Meadow Ascent | Act 2 — Dune Updraft | Act 3 — Violet Summit |
|---|---|---|---|
| Terrain family | grass | sand | purple |
| Time of day | bright morning | burning dusk | starlit night |
| Background layers | sky + clouds + hill silhouettes | sand haze + heat sky | deep night + faint stars |
| Weather particles | drifting seeds/leaves, sparse | fine sand streaks on wind | slow snow/star motes |
| Grading (filter) | barely-there warm lift | amber gradient, warm vignette | cool blue-violet, strong vignette |
| Death line reads as | grass fire | rising sandstorm | creeping void |
| Mood word | *hopeful* | *urgent* | *mythic* |

The run's emotional shape: the world gets darker and stranger as the player
gets stronger. By act 3 a god-run is a comet crossing a night sky.

## Depth model

Never a flat backdrop again. Minimum three layers, all cheap `tileSprite`s
with camera scroll factors:

1. **Sky layer** (scrollFactor ~0.05) — solid/gradient base color per act
2. **Far layer** (scrollFactor ~0.2) — silhouettes: hills, dunes, peaks
3. **Near layer** (scrollFactor ~0.5) — clouds / haze / motes drifting

Plus the play layer (1.0) and a weather-particle layer just behind it.
Parallax is the single cheapest "this is a real place" signal we can buy.

## Readability hierarchy (non-negotiable)

1. **The player is always the highest-contrast object on screen** — and this
   is guaranteed by *treatment*, not hue: the character carries a permanent
   outline/rim-light pass, because three of the five character colors
   (green, beige, purple) color-match a terrain family and would otherwise
   camouflage in their own act. Contrast per character-per-act is a HANDS
   audit item.
2. Hazards are saturated and warm; safe geometry is cooler and calmer.
3. The death line is unmissable at any grading — it carries its own light.
4. UI whispers: small, consistent corner HUD; the tower is the show.
5. Backgrounds never contain shapes that read as platforms.

Any effect that fights this hierarchy loses, no matter how pretty.

## Earned light (the celebration budget)

Phaser 4's Filter system (bloom, vignette, gradient grading) is the grading
rack, with hard rules so celebration stays earned:

- **Vignette**: always on, subtle, deepens per act. The frame of the painting.
- **Grading**: per-act gradient map, constant within an act, brief warm push
  on milestone moments.
- **Bloom**: high threshold. Idle play produces none. It exists for combo
  escalation, relic god-runs, and boss-phase turns — light is the reward.
- **Momentum made visible**: as sustained speed crosses tiers, the character
  earns motion trails → afterimages → a faint glow. A stranger watching should
  be able to *see* that a run has gone god-mode without reading a number.
- **Screen shake budget**: shake is spent on combo escalations, boss slams,
  and heart-loss — never on routine landings. Duration ≤ 200ms, and never
  stacks.

## Motion identity

- Squash on land, stretch at jump apex — scale distortions ≤ 15%, restore in
  under 120ms; snappy, not rubbery.
- Airborne spin scales with momentum (v1's one good visual instinct —
  re-derive constants in the sandbox).
- Landing dust: small, directional, tells you your speed was kept or lost.
- The 9 character animation states all get used (idle, walk×2, jump, duck,
  climb×2, hit, front) — `hit` on heart-loss, `duck` on landing squash,
  `front` for menus/map.

## UI surface

- Title screen: the game playing behind the logo (attract-mode sandbox), one
  input hint. No documentation dumps.
- Map scene: the tower exterior **in the act's own palette** (morning, dusk,
  night — the mood table governs everywhere), with nodes as *glowing* windows
  climbing the silhouette — the glow is a UI light layer that reads at any
  hour (warm lamps at morning, beacons at night). The map should *be* the
  tower, not a flowchart floating in void.
- Consistent 4px-grid spacing; pack UI sprites (`hud_*`) before custom art.
- Fonts: one display face for shoutouts/titles, one clean face for numbers.
  (Web-safe stack first; a bundled font is a HANDS-phase decision.)

## Anti-patterns (v1's ghosts, refused by name)

- Flat single-color background stretched to canvas
- Title screen as manual
- Debug labels/items in production surfaces
- Celebration spam (constant flashes/shake for routine play)
- Effects that mask the player or repaint hazards as friendly

## Interfaces to other systems

- Per-act palette/particle/grading config is **data** (like all constants) —
  modifiers may reference it (a "night climb" modifier borrows act 3 grading).
- Combo escalation tiers drive bloom/trail intensity via the combo event
  stream — art listens to the same events score does; it never polls.
- Boss phases may override grading briefly (phase turns are allowed one
  full-frame statement).
