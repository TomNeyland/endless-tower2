# CODEX_WRAPUP.md — carry it to 1.0

*The Claude orchestrator's session is at its usage limit. You (Codex) now
own EVERYTHING to the finish line. `CODEX_HANDOVER.md` is your orientation
(mission, forensics, process rules) and contains your first task (the
difficulty curve). THIS file is the rest of the flight plan plus the
orchestrator's judgment, so decisions land the way the project would have
made them. Sequence: difficulty → HANDS → run-texture → final verification.
Work one phase at a time; gates green between every milestone; push each
green milestone so work survives session death.*

## How to decide like the orchestrator

- **Docs win.** ETHOS.md > docs/design/*.md > code. If code and doc
  disagree, the code is wrong or a DEVIATIONS entry is missing.
- **User pins are law** (they're in the handover): 100+ floor rooms,
  difficulty with rhyme, rooms with faces, builds that become necessary,
  embodied bosses, no text-banner urgency, keyboard first-class, audio ON,
  PG everywhere, celebration earned not noisy, one punishment source (the
  line), the verbs stay pure (never an attack button, never input theft).
- **Instrument first, legislate on evidence** — prefer a measurement +
  pre-registered contingency over a speculative rule.
- **Declare, never hide**: any forced departure from a doc = numbered
  `docs/DEVIATIONS.md` entry.
- **Never push red. Never enable Pages. Never spend money.** Blocked only
  on those three and genuine publishing decisions — otherwise decide, note,
  and keep moving.

## PHASE: HANDS (after difficulty merges; epic #42)

Do the sub-passes in this order — tests first protects everything after.

### H1. Tests + CI (the no-tests moratorium ends here)
Port the existing Node harnesses into vitest rather than rewriting: the
map sweep, `npm run exam`, `harness/return.harness.ts`, the difficulty
sweep — plus unit coverage for `src/core/` seams (TuningStack fold/owners/
validation-throws, combo grammar transitions incl. one-air-inert and
same-tick bhop, jump curve math, save migrations + corrupt-refusal, rng
fork determinism). Add `npm test` and a test job to
`.github/workflows/deploy.yml`'s build job. Keep harnesses runnable too.

### H2. Audio identity (docs/design/audio.md is binding)
Unzip the three packs in `assets-staging/` into `public/assets/` (CC0 —
commit them; update the manifest). Semantic re-mapping per audio.md's
tables (impact pack → landings/bosses, casino pack → coins/shop/reward,
sci-fi → texture candidates). Implement the three buses (SFX/music/UI),
ducking, per-class anti-spam — some exists in AudioSystem; consolidate per
audio.md (the "one thin audio module" law). **Music ruling (made now):**
do NOT source external music (licensing risk, no network trust). Ship the
vertical-stem SYSTEM wired (base/pressure/glory layers with the documented
gates) over ambient beds built from existing pack sounds (looped, pitched,
low) — restraint over filler — and add a DEVIATIONS entry noting real
music is a post-1.0 human decision with the stem system ready for it.

### H3. Art pass (docs/design/art-direction.md is binding)
Per-act grading with Phaser 4 filters: vignette always (subtle, deepens
per act), per-act color grade (warm lift / amber dusk / cool violet),
bloom with a HIGH threshold (combo tiers and bosses only — idle play
produces none). Acts 2–3 parallax sets (the pack's sand/night backgrounds;
act 1's three-layer pattern is the template in ParallaxBackdrop). Audit
every light effect against the celebration budget (one shake law already
enforced; check bloom/trail budgets match combo tiers). Breather-band warm
tint (difficulty curve) stays subtle.

### H4. Performance at the new scale
100–200-floor segments: verify platform/coin/particle pooling, no GC
hitches across a full act (bridge stats + browser devtools), texture/audio
load budget, long-session stability (three full acts back-to-back). Fix
what's measured, not what's imagined.

### H5. Mobile
Thumb zones per DESIGN.md: left half = hold-to-run (left/right by touch
x within the zone), right half = jump (tap; hold for full height, release
cuts). Canvas already FIT/CENTER_BOTH. Touch targets ≥44px on map/shop/
menus; test via devtools device emulation. Keyboard/gamepad untouched.

### H6. Onboarding (teach momentum in 30 seconds)
First-run only: three staged hint moments in the sandbox/first segment,
each tied to a real event and dismissed by doing it — (1) "hold → to build
speed" until tier 1, (2) "jump at speed — speed becomes height" until a
2-floor link, (3) "walls keep your speed — flip after the bounce" until a
wall bounce. No modal walls of text; the title screen keeps showing the
attract loop. Store seen-flags in the save settings.

### H7. README + screenshots
Real gameplay screenshots (menu, mid-chain with the ladder glowing, the
map, a boss duel) captured from the actual game; how-to-play (controls,
the one-sentence law: "speed becomes height"); seed-sharing note; dev
section (commands, architecture pointer to docs/); credits (Kenney CC0,
Phaser, built end-to-end by AI agents with human playtesting). Keep the
Pages URL slot ready ("play at <pages-url> once enabled").

### H8. Ledger reconciliation
Sweep `docs/DEVIATIONS.md` — every entry either RATIFIED (with its doc
amendment), fixed, or explicitly carried. Close every GitHub issue that is
actually done (epics included); leave #8 (human feel gate) open.

## PHASE: run-texture (LAST system; docs/design/run-texture.md + #62/#63)

1. **Re-review against the shipped game** (the paper review was killed on
   purpose). Do two independent passes yourself, in separate sessions if
   possible: (a) adversarial critique — attack the tier arithmetic against
   the REAL shipped band tables, construct the worst legal room (motif ×
   modifier × act multiplier), try to game the offer weighting, check the
   8% perceptibility bar against the actual roster's effect sizes; (b) a
   cold playthrough simulation of a 15th run, logging moments / seams /
   inventions / exploits. Then amend the doc with rulings — the necessity
   ruling itself ("winnable by mastery, comfortable only by build") is a
   user-ratified pin: implement it, don't relitigate it.
2. **Implement**: TraitSpec bands (priced/gift/quirk) over the existing
   modifier machinery; ~8 geometry motifs as post-curve shape biases in
   the generator; atmosphere quirks within the art budget; the ≥1-trait
   guarantee per node with card lines per band; the offer guarantee as a
   validated map-gen rule; offer-mix weighting; the perceptibility audit
   in the harness (buff any relic under the bar); necessity margins bots
   (baseline vs built) asserting the act-by-act ordering; ETHOS gets its
   one clarifying line. All seeded from `fork('traits:<nodeId>')`;
   everything on the card before commitment (pillar 2).

## PHASE: final verification (the checklist in CODEX_HANDOVER.md is the bar)

Browser, real UI, console open: a full 3-act run (select → map with trait
lines → segments where difficulty and faces are FELT → all three bosses →
summit → results → feats/unlocks → museum); a death run; a seeded run
reproducing its offer; an exported session replaying divergence-free via
`npm run replay`; mobile emulation smoke; CI fully green. Then the
**closing commit essay** — the git log has been the design narrative all
along; write the ending: what was built, what it's for, and what the one
human toggle left is. Leave `main` pushed and clean.

## What stays human, always

Enabling GitHub Pages · the feel-gate sign-off (#8) · real music sourcing
· anything that costs money · the decision to post it anywhere.
