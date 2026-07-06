# V1 Asset Map — Kenney New Platformer Pack 1.0

Source: `~/code/endless-tower/public/assets/`. The pack was copied into this repo
at `public/assets/kenney_new-platformer-pack-1.0/` (cruft stripped). License:
**CC0** (confirmed via `License.txt` in the pack root); credit Kenney (optional
but do it). The pack's own `ASSETS_README.md` is an excellent hand-written
reference — read it before asset work.

## Pack contents (7.1M after cruft strip)

```
kenney_new-platformer-pack-1.0/
├── ASSETS_README.md / License.txt / previews
├── Sounds/        10 .ogg SFX (all were used by v1)
├── Sprites/
│   ├── Backgrounds/ {Default 128px, Double 256px}  14 files each
│   ├── Characters/  {Default 128px, Double 256px}  45 files each
│   ├── Enemies/     {Default 128px, Double 256px}  60 files each — UNUSED in v1
│   └── Tiles/       {Default 64px,  Double 128px}  314 files each
├── Spritesheets/  8 XML atlases (4 categories × default/double)
└── Vector/        433 SVGs mirroring Sprites/ — UNUSED in v1
```

v1 used roughly 15% of the pack. Unused-but-available: 4 character colors, 5
animation states per character, all 14 enemy types, 2 terrain palettes (sand,
purple), 8 backgrounds, all Double-res art, all SVGs.

## Characters

5 colors: beige, green, pink, purple, yellow. 9 states each: `idle`, `walk_a`,
`walk_b`, `jump`, `duck`, `climb_a`, `climb_b`, `hit`, `front`. v1 used only
beige × (idle, walk_a, walk_b, jump). Character-select, duck, climb, and
hit-reaction art exists at zero cost.

## Enemies (all unused by v1 — boss/hazard inventory)

bee, fly, ladybug, mouse, snail, frog, fish ×3, slime ×4, saw, block, barnacle,
worm ×2 — with animation frames. Atlas: `spritesheet-enemies-default.{png,xml}`.

## v1 key → path → usage map

Atlases (prefer these):
- `character` ← `Spritesheets/spritesheet-characters-default.{png,xml}` — player
  sprite + anims (frame names like `character_beige_idle`)
- `tiles` ← `Spritesheets/spritesheet-tiles-default.{png,xml}` — platforms
  (`terrain_grass_cloud_left/middle/right`), walls
  (`terrain_grass_vertical_top/middle/bottom`)

Individual images v1 loaded: 6 backgrounds
(`background_solid_{grass,sand,dirt,cloud,sky}`, `background_color_mushrooms`),
pickups (`gem_{blue,green,red,yellow}`, `coin_{gold,silver,bronze}`, `heart`,
`key_{blue,green,yellow}`), particle `star`.

## Audio (10 SFX, v1 semantic mapping)

| File | v1 use |
|---|---|
| `sfx_jump.ogg` | jump-normal |
| `sfx_jump-high.ogg` | jump-high |
| `sfx_bump.ogg` | wall-bounce |
| `sfx_gem.ogg` | wall-bounce-perfect |
| `sfx_coin.ogg` | combo-complete |
| `sfx_disappear.ogg` | combo-broken |
| `sfx_magic.ogg` | milestone |
| `sfx_hurt.ogg` | game-over |
| `sfx_select.ogg` | ui-select |
| `sfx_throw.ogg` | special-effect |

v1 shipped with `masterVolume: 0.0` ("until better sounds are found"). Three
additional Kenney audio packs are staged (gitignored) in `assets-staging/`:
sci-fi sounds (5.6M), casino audio (860K), impact sounds (784K) — extract and
audition during the audio pass.

## Rules carried into v2

- Whole pack copied (pruning saves nothing at 7M and costs re-copying later).
- ~1400 `*:Zone.Identifier` Windows sidecar files stripped on copy.
- v1's dead starter-template files (`bg.png`, `logo.png`, root `star.png`) not
  carried over.
- Prefer XML atlases over individual PNGs; scale that pattern to backgrounds and
  enemies if used in volume.
