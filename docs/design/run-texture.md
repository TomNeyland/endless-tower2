# Run Texture — the necessity curve & every room has a face

*Authored by the manager session from two user mandates: "eventually you
should NEED some bonuses to keep playing — the benefits need to be
meaningful" and "each room should have something about it — good, bad, or
indifferent." Status: v1 — SEQUENCED LAST by user decision: the adversarial review +
cold-reader playthrough re-run after HANDS, against the shipped difficulty
tables and polished game, then amendment, then implementation as the final
system before 1.0 verification. Builds on
difficulty-curve.md's band tables and map-modifiers.md's trait plumbing.*

## Part 1 — The necessity curve (#62)

### The ruling this demands

ETHOS pillar 1 says *every run is winnable from day one; skill is the
progression*. A tower that requires relics seems to collide with that. The
ruling: **winnable by mastery, comfortable only by build.** Relics are
in-run acquisitions — drafting IS one of the game's two skills (movement and
drafting), so requiring in-run build assembly is the roguelite completing
itself, not power-gating. The clarified law: a master can beat act 3 naked
(possible, brutal, a legitimate flex run); an ordinary good player needs the
build the run offered them. ETHOS gets one clarifying line to this effect.

### The mechanism (quantified, not vibes)

Difficulty bands already map to *required retained momentum* (bigger gaps
and sparser floors demand more sustained speed — the plateau math from the
retention fix gives us sustainable-speed-by-build). The necessity curve is
one companion column on the band table: **comfortable sustained tier**.

| Run position | Late-band difficulty index | Comfortable at |
|---|---|---|
| Act 1 | ≤ 0.60 | baseline (tier 2–3 entry) |
| Act 2 late | ~0.70 | tier 3 sustained — baseline *can*, but feels the squeeze |
| Act 3 mid+ | 0.76–0.90 | tier 3.5+ — between naked-max and built-max |

The squeeze is **geometric and legible**: failure reads as "I couldn't keep
enough speed," and the shop's speed relics visibly answer exactly that.
Death teaches drafting, never RNG resentment.

### The offer guarantee (the anti-ambush half)

Necessity is only fair if the run *offers* the answer. Two additions:
1. **Map guarantee**: every path through an act offers ≥2 relic
   opportunities (Elite + Shop already near-guarantee this — promote to a
   validated generation guarantee alongside the existing ones).
2. **Offer-mix weighting**: shop stock and Elite drops weight toward
   traversal-relevant relics (EARN/KEEP/ROUTE/SPEND ≈ 14 of 24) when the
   player owns none — a thin thumb on the scale, never a script. A
   greed-drafted all-economy build still meets act 3 underpowered: that is
   drafting consequence, roguelite-correct, and the death card may gently
   say so.

### The meaningful-bonus bar (perceptibility audit)

"Benefits need to be meaningful" becomes a testable rule: **every relic must
move a number the player can feel within one segment of acquiring it.** The
harness computes each relic's delta on its primary axis (sustainable speed,
floors-per-jump, fuse seconds, coast time); anything under ~8% on its own
axis gets buffed or redesigned. A run sees maybe 4–8 relics — none may be
filler.

### Verification

Two bots through the harness: baseline-build vs a 4-relic KEEP/EARN kit,
swept across act 1/2/3 band tables — assert margins order correctly
(baseline comfortable / tight / brutal-but-possible; built comfortable
through act 3), and the frontier law still holds naked (reachable ≠
comfortable).

## Part 2 — Every room has a face (#63)

### Traits: one struct, three bands

`TraitSpec { id, band: priced | gift | quirk, label, flavor, tuningLayers?,
genPatch?, skin? }` — the existing 12 modifiers become `band: priced`
(same machinery, one new field). New bands:

- **GIFTS** (pure good, uncommon): Double Fuse (exists) · Updraft Shaft (one
  marked band with rising air) · Coin Vein (a glittering floor band) ·
  Powerup Nest (2–3 guaranteed spawns) · Launch Ramp (segment starts with a
  speed pad). Green "no price" framing on the card.
- **QUIRKS** (indifferent, common — the mandate's heart): flavor with at
  most a ±5% nudge, always labeled honestly (flavor text, never a fake
  price). Two families:
  - *Atmosphere*: weather particles (pollen, drizzle, drifting seeds),
    tint-of-day variants, tileset accents (flowers, mushrooms, snow),
    ambience variants, passive fauna. Cheap, high memorability.
  - **Geometry motifs** (the sleeper mechanism): the generator gains a motif
    vocabulary — *Staircase* (directional bias), *Twin Lanes*, *Islands*
    (clustered platforms, voided space), *Spiral* (alternating wall-side
    bias), *Wide-then-Narrow rhythm*, *Zigzag*, *Canyon* (center void),
    *Meadow* (flat-band breathers) — ~8 at launch. A motif is a **shape
    bias applied within the difficulty index**, post-curve: the curve says
    how hard, the motif says what shape the hard takes. Reachability
    contract untouched; rooms gain mechanical personality with zero balance
    risk.

### The guarantee

Every node rolls ≥1 trait from `fork('traits:<nodeId>')`. Climb nodes (the
vanilla majority — the mandate's real target): 1 motif or atmosphere quirk
always, plus today's priced-modifier odds, plus a small gift chance.
Special nodes already wear their type as a face; they still roll a quirk
for flavor. The map card gains one trait line per band — priced in the
price/pay voice, gifts in green, quirks in italic flavor. Pillar 2 holds:
every face visible before commitment.

### Replayability arithmetic

8 motifs × ~6 atmospheres × 12 priced × 5 gifts across 21 nodes/run: the
face-space is large enough that consecutive runs stop rhyming. This is the
genre's replay flywheel (varied offer × binding choice × varied power) with
all three legs now specified.

## Interactions & risks (for the panel)

1. **Necessity vs pillar-1 wording** — resolved by the ruling above; ETHOS
   amendment must land with implementation.
2. **Quirk clutter vs the readability hierarchy** — atmosphere quirks obey
   art-direction's budget (weather stays behind the play layer; the player
   stays highest-contrast; the death line always wins).
3. **Compounding variance** (motif × priced modifier × curve): reachability
   is safe by construction; *feel* compounding uses the existing
   compound-danger card line, and the motif/modifier incompatibility list
   extends the existing matrix (e.g. Islands + Narrow Ledges capped).
4. **Card real estate** — one line per band, three max; flavor truncates
   before mechanics ever do.
5. **Offer-guarantee validation cost** — one more validated map guarantee;
   regen budget already instrumented (mean 0.037, huge headroom).
