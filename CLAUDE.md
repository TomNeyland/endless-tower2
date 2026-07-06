# CLAUDE.md

Endless Tower 2 — a momentum roguelite built with Phaser 4 + Vite + TypeScript.
Required reading order before building anything: `ETHOS.md` (how to think here),
then `docs/DESIGN.md` (the canonical spec), then the relevant design document in
`docs/design/` (per-system designs, written before code). `docs/research/` holds
the v1 archaeology — avoid reading it into context unless your task specifically
needs it (old ideas are old; the design docs already carry anything worth
keeping, and its epistemic-status header explains why the rest is suspect).

## Commands

```bash
npm run dev        # Vite dev server on http://localhost:8080
npm run build      # production build to dist/
npm run typecheck  # tsc --noEmit
npm run lint       # biome lint src
npm run format     # biome format --write src
npm run check      # typecheck + lint (run before every commit)
```

## Code law

- **No god files.** One system per module. Soft cap ~300 lines; a file passing it
  is a signal to split responsibilities, not to add a part 2.
- **Pure logic is engine-free.** Map generation, run state, economy, combo math,
  relic effects, RNG: plain TS in `src/core/`, no Phaser imports. Phaser scenes
  and systems (`src/game/`) stay thin and delegate.
- **No tests yet, by explicit decision.** Unit/e2e harness arrives in the final
  (HANDS) phase; during ideation, `npm run check` is the gate. Don't add test
  scaffolding early.
- **Assets only via the manifest.** Keys and paths live in `src/game/assets.ts`.
  Raw asset strings anywhere else are a bug. Art must stay swappable.
- **Fixed timestep stays on** (`fixedStep: true` in arcade config). v1 removed it
  and jump physics became framerate-dependent.
- **Event listener hygiene.** Never `off('evt', this.fn.bind(this))` — the bound
  ref is new each call and removes nothing (this leak shipped in ten v1 classes).
  Store the handler reference (or use arrow-function fields) and remove it in
  `shutdown`/`destroy`.
- **Debug never leaks.** Debug UI, spawner items, and diagnostic labels live
  behind the debug bridge (`window.__ET2__`), not in production scenes.
- **PG only.** Public repo: code, comments, commit messages, and issues stay
  professional.

## Phaser gotchas (paid for in v1 blood)

- Phaser zeroes velocity during collision separation. To read impact velocity,
  capture it in the collider's `processCallback` (4th arg), not `collideCallback`
  (3rd). This single mistake cost v1 weeks.
- Phaser's native `bounce.setTo()` caused jitter loops for wall bounces in v1;
  the custom redirect in the collision callback is deliberate.
- `setMaxVelocity` clamps silently — v1's momentum jumps were "broken" for weeks
  because the Y cap was 1000 while computed jumps exceeded it.
- One-way platforms: overlap + processCallback, land only when falling
  (`v_y > 0`) and previous-frame feet were above the platform top.

## Asset pack

`public/assets/kenney_new-platformer-pack-1.0/` (CC0, credit Kenney). Read its
`ASSETS_README.md` for structure. Prefer the XML atlases in `Spritesheets/` over
individual PNGs. 5 character colors × 9 animation states; 14 enemy types unused
by v1 are available for bosses. Three extra Kenney audio packs are staged
(gitignored) in `assets-staging/` for the audio pass.

## Playtesting

The human plays; Claude verifies. Automated checks go through the Chrome MCP
(rendering, console, inputs) and the deterministic scripted-input harness on the
debug bridge — do not attempt real-time play through the MCP.
