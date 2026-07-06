# CODEX_HANDOVER.md — emergency resume protocol

*You (Codex, or any capable agent) are picking this project up after the
previous orchestrator's session died at an unknown point. This document
teaches you to determine where things stand and cleanly resume. It was
written mid-flight; everything after "State as of writing" may be stale —
trust the forensics over the snapshot.*

## Mission and finish line

Endless Tower 2: a momentum roguelite (Phaser 4 + Vite + TS), built
end-to-end by AI, public showcase repo. The finish line: **ETHOS-defined
1.0** — full 3-act runs with bosses, builds, unlocks, audio, working on
desktop and mobile web; every system rich and fully wired (no
skeleton-ware); typecheck/lint/build/harnesses green; everything pushed to
`main`; GitHub Pages deploy workflow in place. **Do NOT enable Pages** —
that flip is the human's, on purpose. PG content everywhere: public repo.

**Read order before touching anything:** `ETHOS.md` → `docs/DESIGN.md` →
the relevant `docs/design/*.md` → `docs/DEVIATIONS.md`. The design docs are
binding; in any conflict, docs win over code and ETHOS wins over docs. Do
NOT read `docs/research/` (v1 archaeology; old ideas are old).

## State as of writing (2026-07-06, ~08:45)

- **DONE and pushed**: scaffold; all 10 design docs + playthrough traces;
  FEEL (movement sandbox); PRESSURE (death line/hearts/door); MASTERY
  (combo engine/ladder/score); LOGS (flight recorder + `npm run replay`);
  CHOICE (3-act node map, 12 priced modifiers, run loop); IDENTITY
  (RunState, 24 relics, coins, shop, powerups); EXAM (3 embodied bosses,
  attack toolkit, land classifications); RETURN (save/feats/characters/
  museum/seeds); all with review→fix→gate cycles. Human feel verdict
  applied (JUMP_RETENTION 0.78, the plateau fix).
- **IN FLIGHT / HANDED OFF (updated 2026-07-06 ~09:00)**:
  1. *Difficulty curve + 100-floor segments* (`docs/design/difficulty-curve.md`
     + issue #61): **deliberately handed to Codex at ZERO implementation.**
     The prior builder was killed before its first commit; its empty branch
     was deleted; no difficulty code exists anywhere. Whoever picks this up
     implements the doc from scratch: engine-free curve model in core,
     profiles in `src/core/map/presets.ts`, #61 knock-ons (floors 30→100,
     line pacing ÷~3, per-floor economy pricing), the 500-segment sweep
     harness, gates green, essay commits on a fresh branch, then merge.
  2. *Run-texture design review* — critics + cold-reader on
     `docs/design/run-texture.md` (issues #62, #63) were running in the
     orchestrator's session. If their findings are lost, re-critique the
     doc yourself (its own risks section lists where to press), amend, then
     implement — AFTER the difficulty curve lands (it builds on the band
     tables).
- **REMAINING ROADMAP (in order)**:
  1. Land the difficulty curve (however far it got — see forensics).
  2. Amend + implement `run-texture.md` (necessity curve, traits/motifs,
     offer guarantee, perceptibility audit).
  3. **HANDS** (epic #42 + children, `docs/design/audio.md` +
     `art-direction.md`): audio identity (extract the 3 Kenney zips in
     `assets-staging/` — gitignored, on disk), per-act Phaser 4 filter
     grading, acts 2–3 parallax, perf pass at 100+ floor scale, mobile
     thumb-zones, onboarding (teach momentum in 30s; title shows the game),
     **vitest suite for `src/core/` + CI test job** (the no-tests
     moratorium ends at HANDS — this is the one phase where tests are IN
     scope), README with real screenshots, DEVIATIONS reconciliation.
  4. Final verification: full-run browser smoke (menu → select → map →
     segments → boss → summit → results → museum), console sweep, replay
     CLI round-trip, close remaining GitHub issues, final push.

## Forensics: determine the actual state

```bash
cd /Users/tom/code/endless-tower2
git status                 # uncommitted/conflicted state?
git log --oneline -15      # how far did main get? (commit essays tell the story)
git branch -a              # any wave*/... branches = unmerged builder work
git worktree list          # leftovers in .claude/worktrees = dead builders
gh issue list --state open # the living ledger (epics + #61 #62 #63)
gh run list --limit 3      # CI truth on the last push (build job must be green;
                           #   deploy job red = Pages not enabled = EXPECTED)
```

Then run the gates + harnesses (they are the ground truth of health):

```bash
npm install
npm run typecheck && npm run lint && npm run build   # never pipe these (masks exits)
npm run exam                          # boss/EXAM harness (58 assertions)
npx tsx harness/return.harness.ts    # RETURN harness (32 assertions)
ls harness/ scratchpad/ 2>/dev/null   # other harnesses waves left behind
```

## Resume protocol by observed state

1. **Clean tree, main == origin/main, gates green** → nothing was lost.
   Continue the roadmap at the first unfinished item (check `git log` and
   the issues to see what landed).
2. **Unmerged `wave*/...` branch with commits** → a builder finished but
   the merge died. Read its commits (`git log main..<branch>`), run gates
   ON THE BRANCH (worktree it), then merge to main yourself, resolve
   conflicts per the design docs, re-run all gates + harnesses, commit an
   essay-style merge, push.
3. **Mid-merge conflict markers in the tree (UU files)** → an integrator
   died mid-merge. `git merge --abort` if incoherent, or finish the merge
   by hand: design docs win; keep ALL systems' appends on the shared
   surfaces (events.ts, tuning tables, Bridge, Sandbox, assets).
4. **Dirty tree, no merge in progress** → a fixer died mid-edit. Run
   typecheck: if the delta is coherent and gates pass, commit it as
   `fix(salvage): ...` with a note; if incoherent, `git stash` it, verify
   gates on HEAD, and re-derive the fix from review findings (check
   `docs/DEVIATIONS.md` and recent commit messages for what was being
   fixed).
5. **Stale worktrees under `.claude/worktrees/`** → inspect each for
   committed branches worth salvaging (`git -C <wt> log --oneline -5`),
   then `git worktree remove --force <wt>` and `git worktree prune`.
6. **Push fails on SSH** → the remote is already HTTPS
   (`gh auth setup-git` was run); if it regressed, re-run that. Retry once.

## Non-negotiable process rules (survive the handover)

- **Code law** (`CLAUDE.md`): no god files (~300-line soft cap), `src/core/`
  engine-free AND IO-free, assets only via `src/game/assets.ts`, listener
  hygiene, fixed timestep stays on, debug only behind `window.__ET2__`.
- **Determinism is sacred**: no `Date.now`/`Math.random` in core paths;
  seeded labeled forks (`fork(seed,'label')`); the recorder/replay must
  reproduce sessions bit-for-bit (`npm run replay` on an exported session
  is the check). Any new nondeterminism must extend the recording.
- **TuningStack owner tags**: every layer owned (`character:`/`relic:`/
  `segment:`/`powerup:`/`boss:`), pops by owner, canonical fold order
  (base → character+relics → segment → powerups → boss), validation throws
  on degenerate values.
- **Deviations ledger**: any forced departure from a design doc gets a
  numbered entry in `docs/DEVIATIONS.md` — never a silent code comment.
- **Commit essays**: subject `type(scope): ...`, body explains WHY and
  where it sits in the arc. End with the Co-Authored-By trailer matching
  the existing log (or your own equivalent — keep the convention visible).
- **Never push red.** Gates + harnesses green before every push.
- **User pins that bind design** (from the session): segments ~100+ floors
  (maybe 200 — keep it one preset number, everything t-based); difficulty
  must rise with height by rhyme and reason (phrasing, not grind); builds
  must become *necessary* late-run (winnable by mastery, comfortable only
  by build); every room has a face (good/bad/indifferent); bosses must
  LOOK like bossing (embodied, reactive); no text-banner urgency; keyboard
  is first-class everywhere; audio ships ON.

## You are not here to land the plane — you are here to finish the flight

Safe resumption is the floor. The mandate is the **fully delivered vision**,
and it is done only when every box below ticks:

- [ ] Difficulty curve + 100-floor segments merged, harness-proven
      (monotone-with-phrasing, reachability frontier holds at 100 AND 200)
- [ ] Run-texture implemented: necessity curve tuned (baseline-bot vs
      built-bot margins order correctly per act), every node rolls ≥1 trait,
      ≥8 geometry motifs shipping, offer guarantee validated in map gen,
      perceptibility audit passing for all 24 relics
- [ ] HANDS complete: audio identity ON (SFX mapped, music stems or
      compliant fallback, mixing/ducking), per-act filter grading + acts 2–3
      parallax, perf clean at 100+ floors (no GC hitches in a full act),
      mobile thumb-zones playable, onboarding teaches momentum in 30s,
      vitest suite green over src/core + CI test job added, README with
      real screenshots and how-to-play
- [ ] A full 3-act run completes in a real browser: menu → character select
      → map → segments (traits visible, difficulty felt) → all three bosses
      → summit → results → feats/unlocks → museum. Console clean throughout.
- [ ] A death run and a seeded run both behave (seed reproduces the offer).
- [ ] An exported session replays divergence-free via `npm run replay`.
- [ ] All GitHub issues closed except human-gated ones (feel gate #8);
      DEVIATIONS ledger reconciled; CI build job green on the final push.
- [ ] `main` pushed. The only remaining human act: playtests and the Pages
      flip.

If you complete all of this, write the final commit essay as the project's
closing statement — the log has been the design narrative all along; give
it an ending.

## The human's role when they return

They playtest with the flight recorder: `M` drops tick-pinned markers,
`F9` exports a session file, `npm run replay -- <file> --around <tick>`
regenerates the exact moment for analysis. Tuning verdicts land as
tuning-table edits (data, not code). They flip Pages when they decide to
publish. If you finish everything: leave main pushed, CI green, README
accurate, issues closed except the epics' human-gated items (feel-gate
issue #8 stays open until a human says "joyful").
