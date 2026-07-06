# Playthrough Trace — the Epic 0 integration test

*A full run walked through every design document, boot to summit, hunting
seams. Authored by the manager session as Epic 0's capstone. Findings are
numbered; each names its resolution and owner.*

## The round

**Boot.** Title screen with the attract-mode sandbox playing behind the logo
— driven by the scripted-input harness, which exists for determinism testing
and gets a second job for free. Press any key. New save: Beige, 16 relics in
pool, act 1 map generates from a fresh seed.

**Map, act 1 (Meadow Ascent, morning palette).** Tower exterior, lit
windows. Row 0 offers Climb / Coin Rush. Preview shows the Climb's label:
28 floors, standard line, no modifiers. Commit → traversal animation →
segment.

**First climb.** HUD: 3 hearts, 0 coins, dark combo counter. Build to ~500
px/s, 3-floor jump — chain opens, fuse bar appears. Line ignites at floor
10, announced. Airborne wall bounce confirms +0.25 on the next link; SPARK
card at 4 chain-floors, pentatonic step one. A lazy 1-floor hop fizzles:
whisper bank, soft detune, tally. Exit door at 28 — walk through, chain
auto-banks, coins and score roll up, back to the map.

**Coin Rush** (gentle line ×0.7, coins ×2.5, 16 floors — short and loud).
**Shop**: stock of 3, buy Slow Fuse; its tuning layer pushes immediately and
persists across segments. **Challenge** (Sticky Patches + bounty): sticky
landings drain 30% speed — momentum attacked, line converts the loss to
pressure. One catch: heart lost, rescue launch, chain voided, rescue air
inert. **Elite** (Headwind, hot line): survived, guaranteed relic — Echo
Walls. Chains now drink deeper on shafts.

**Act 1 boss — the Slime Sovereign.** Endless arena, no door. Boss climbs
beside me, spitting goo, slamming platforms into crumbs. Chain builds to
METEORIC — the boss visibly agitates as tiers climb. Its slam resolves,
openness window opens, I small-hop *on purpose*: roar bank, knockdown, a
third of its health gone. Three more banks. It falls past me into its own
line. Door lights. Act 2: dusk, dunes, the Whirring Warden's metronome.
Act 3: violet night, the Summit Keeper, sustained openness at ⅓ HP —
biggest bank of the run — summit. Results: **"34 FLOORS ×4.25 — 49,130"**
in the display face, a feat fires, Green Glider unlocks, seed on screen.

## Findings

1. **Character select has no owner.** Five characters exist (RETURN) but no
   doc owns the select flow. → *Resolution: RETURN owns a select step on
   the title/menu path (a row of the five colors, traits in one line each);
   noted here, designed in the RETURN session.*
2. **Ladder vs segment length.** Standard segments (14–34 floors) cap
   in-segment chains at ~METEORIC; COMET (40) and above are reachable only
   in endless boss arenas or under chain-extending builds. → *Intended and
   now explicit: the ladder's top half belongs to bosses and god-runs.
   Results screens must not render unreached tiers as taunts (already in
   combo doc risks).*
3. **Low Gravity modifier reached into combo internals.** "Floors count
   +25% to combo base" would distort chainFloors (the ladder's integrity
   depends on floors being real). → **Amended** in map-modifiers.md: the
   pay is `combo.floorValue ×1.25` — same generosity, zero grammar
   distortion.
4. **Inter-node handoff undefined.** Between segment end and map return
   there's no full results screen (that's run-end only) — the map card
   shows the segment's delta (coins, score, bests) as a light toast. →
   *CHOICE implementation detail, recorded here.*
5. **`sticky`/`crumble` land classifications arrive with CHOICE, not
   EXAM.** Brittle Rows and Sticky Patches (map modifiers) need them
   before bosses do. → **Amended** in movement.md Amendment 1c.
6. **TuningStack layers need owner tags and a canonical order.** Relic
   layers persist for the run; modifier layers pop at segment end; powerup
   layers pop on expiry; boss surge layers pop with the attack. Without
   ownership, a segment pop could eat a relic. → *Contract recorded here,
   binding for all implementation sessions:* every layer carries an owner
   (`relic:<id>` / `segment:<nodeId>` / `powerup:<id>` / `boss:<attackId>`),
   pops are by-owner, and application order is canonical: **base → relics
   (acquisition order) → segment modifiers → powerups → boss layers.**
   Validation (which throws) runs on the fully-resolved table, so any
   degenerate stack fails loud at push time.
7. **Run-end vocabulary.** `run/ended {reason: death_line}` exists
   (pressure); victory needed a twin. → *The RunOrchestrator emits
   `run/ended {reason: summit}` after the act-3 boss; results scene keys
   off reason. Also: hearts/coins/relic-belt HUD persists on the map scene
   (continuity between climbs), and `hearts.max` validation floors at 1
   (Purple's −1 trait can never stack a build to zero).* 

## Verdict

The systems hold hands cleanly: movement's events feed combo's grammar,
combo's banks feed score and bosses, pressure's signals wire the RunSignal
port, the map prices what the TuningStack reprices, relics ride surfaces
that were frozen before they existed, and meta renders memory without
minting instrumentation. Seven findings, all resolved on paper before a
single downstream line of code — which is the entire argument for Epic 0.

## Second playthrough — independent cold reader (addendum)

A second mental playthrough was run by a fresh-eyes agent, firewalled from
this trace until its own round was written. Convergence was strong (it
independently hit findings 1, 4, and 7), and it found four seams the
author's pass walked past — including one this trace's own narration
stepped in. Rulings, all applied to the docs:

8. **Master volume stated twice, differently** (movement 0.8 vs audio ~0.7).
   → One authority: audio.md owns the level; movement.md now defers.
9. **The map's time of day contradicted the act mood table** ("always
   night" vs morning/dusk/night acts — and this trace said "morning
   palette" without noticing). → The map renders in the act's own palette;
   window lights are a UI glow layer that reads at any hour.
10. **`movement/stall` had no consumer anywhere** — the one nerve that
    dead-ended (and the Iron Lungs relic silently depended on it meaning
    something). → Stall's consumers are session stats (RETURN feat
    vocabulary: zero-stall segments) and a subtle audio hesitation cue
    under an active line; Iron Lungs re-keyed to line slack (+400px),
    which is real.
11. **Character colors camouflage in matching acts** (green/grass,
    beige/sand, purple/violet vs. readability rule #1). → Player contrast
    is guaranteed by treatment (permanent outline/rim pass), not hue;
    per-character-per-act contrast is a HANDS audit item.
12. **Hazard visibility at platform grain** (Sticky Patches vs pillar 2).
    → Modifier hazards render per-instance with the same visual language
    as their boss-attack twins.
13. **Exploit sweep rulings:** uncapped leap-streak multiplier is now an
    explicit design choice, stated in combo-scoring.md (glory may run
    away; engine safety and boss balance live elsewhere).
    Openness-window fizzle-farming is refused by the quadratic itself
    (forty 2-floor banks < one COMET bank) — noted, no change needed.
    Fireproof's heart engine and Coin Rush as the refarm habitat are
    named tuning watches: Coin Rush is the designated venue for the
    `refarmedFloorShare` alarm, and Fireproof is re-judged during
    IDENTITY's full-stack recipe tests.
14. **Unlock pacing** (three feats poppable in one strong run): thresholds
    are data; the RETURN session tunes against the acceptance target of
    roughly one character unlock per run across a player's first runs.

The cold reader's verdict stands as the epic's external sign-off: the
documents build the game, and the fizzle-strike is the idea worth building
it for. Two independent playthroughs beat one author's — permanently
adopted for future design phases.
