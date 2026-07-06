# The Difficulty Curve — intra-segment progression

*Authored by the manager session from a direct user mandate ("it needs to get
harder the higher you go... by some sort of rhyme and reason"). Status: v1 —
binding for the difficulty-curve implementation session (pre-HANDS). Companion
to #61 (segments scale to 100+ floors): length and curve ship together —
neither works without the other.*

## Thesis

A segment's geometry must tell the same story its death line already tells:
the higher you climb, the more the tower demands. Today the generator is
statistically flat — floor 95 rolls the same dice as floor 5 — which reads
fine at 30 floors and monotone at 100+. The fix is a **curve, not a knob**,
with three properties: it keys to **progress fraction** (length-independent),
it **phrases** (build → peak → release, never a grind), and it respects the
**reachability frontier** absolutely (hard = demands retained momentum, never
luck).

## The curve model

Every intra-segment generation parameter becomes a function of
`t = floorIndex / totalFloors` (0 at the segment floor, 1 at the door):

```
value(t) = lerp(startBand, endBand, shape(t)) + phrase(t)
```

- **shape(t)**: the baseline ramp — `linear` | `easeIn` (late difficulty) |
  `easeOut` (front-loaded), per node-type profile.
- **phrase(t)**: a periodic relief term — every `phrasePeriod` floors
  (~18), difficulty relaxes toward the band floor for `phraseWidth` floors
  (~4): the breather ledge. Amplitude is per-profile. Phrasing is seeded from
  the segment's fork so replays reproduce it exactly.
- Curved parameters: vertical gap band (min/max), platform width (tiles),
  platforms-per-band density, lateral scatter. Everything already flowing
  through generator params — no new generator architecture, new *inputs*.

## Profiles as data (per node type, in presets)

| Type | start → end (difficulty index 0–1) | shape | phrasing |
|---|---|---|---|
| Climb | 0.15 → 0.60 | linear | standard |
| Coin Rush | 0.10 → 0.25 | easeOut | generous |
| Challenge | 0.30 → 0.75 | linear | standard |
| Elite | 0.45 → 1.00 | easeIn | none — the endgame saturates the frontier |
| Boss arena | 0.40 → 0.70 (cycles) | — | EXAM's brain owns spikes |

The **difficulty index** maps to concrete bands in one place (a small table
in the tuning data: index 0 = gaps 100–120/width 5–7/density high; index 1 =
gaps 145–160/width 3–4/density low, scatter wide). **Act multiplier**:
acts 2/3 add +0.08/+0.16 to both ends of every profile — the whole run
climbs, not just each level.

## Laws

1. **The reachability contract is the frontier.** The generator's existing
   guarantee (every configuration reachable against the movement curve with
   margin) clamps the difficulty index — the curve may approach the
   frontier, never cross it. Difficulty saturates rather than breaking
   physics.
2. **Length-independence.** All curves are t-based; `floors` (per #61:
   Climb ~100–130 default, user may push to 200) is one preset number and
   the curve stretches in tune. No absolute-floor thresholds anywhere.
3. **Determinism.** Curve evaluation and phrasing are pure functions of
   (spec, seed) — replays and shared seeds reproduce every ledge.
4. **Modifiers compose.** Narrow Ledges et al. multiply the *output* bands
   (post-curve), keeping their price/pay labels honest at every height.
5. **Legibility.** The player should *feel* the phrase turns — the breather
   band gets a subtle visual tell (per art-direction restraint: slightly
   warmer platform tint, nothing labeled).

## Knock-ons shipped in the same session

- `segment.defaultFloors` 30 → 100; preset floor ranges scale per #61
  (Coin Rush stays proportionally short).
- Line pacing over long climbs: `line.rampPerFloor` retuned so the ramp's
  total over 100 floors matches its old 30-floor arc (per-floor value ÷ ~3),
  grace floors scale with segment length fraction, not absolute count.
- Economy density: coins and bounty are priced **per floor**, not per
  segment, so a 100-floor Climb doesn't silently triple the wallet.
- Ladder: COMET (40) and up become in-segment reachable — intended; the
  results screen taunt-guard already exists.

## Verification

Harness: sweep 500 segments × all profiles at 100 and 200 floors — assert
monotone-with-phrasing difficulty index, reachability contract never
violated, determinism byte-exact, and the frontier saturation engages on
Elite endgames. Bridge: a difficulty trace (index per floor) in the debug
surface so playtests can see the curve they're feeling.
