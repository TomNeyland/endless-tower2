# Movement & Feel — the FEEL-phase design

*Authored by the manager session, synthesizing a three-way design panel (Icy
Tower purist / modern feel engineer / systems architect) and two adversarial
judges. Panel pitched; this document decides. Status: binding for the FEEL
implementation session. Read ETHOS.md and docs/DESIGN.md first.*

## Thesis

One legible law the player can feel in their thumbs: **run speed is the only
currency — jumps spend it on height along a convex curve, walls route it
losslessly, and nothing else touches it.** Every input answers within one 60Hz
tick or is forgiven by a named window. Every constant is data in a runtime
tuning table. Every gameplay fact is an event. The sandbox must pass the human
feel gate naked — and the same design must still be excellent five epics later
when relics multiply its constants.

## Decisions and their provenance

The panel's three designs and two judgments converged on most of this. Where
they fought, these are the rulings:

- **Jump curve**: feel-engineer's linear-velocity coupling (quadratic in felt
  height — accelerating returns) with a soft knee + tanh hard cap. The knee
  **tracks the effective ceiling** (systems-architect's self-repricing
  insight) so natural play is never compressed under any relic ceiling; the
  **hard cap is absolute** so no relic stack can ever outrun the camera or
  platform generation. v1's blowup class is mathematically dead either way.
- **Walls**: lossless 1.0 reflection, zero input required, zero vertical
  transfer. **Rejected:** purist's 0.85 neutral efficiency (a tax — the spine
  forbids it; a do-nothing player bleeding 15% per bounce is v1's disease in
  gentler form) and systems-architect's 1.10 perfect-kick (a pump — walls must
  not out-earn running; "the feel comes from the jump, not the wall kick").
  **Kept from both:** perfect-timing *detection* (signed `inputLeadTicks` in
  the payload, a `perfect` flag at ±5 ticks) with zero physics effect — the
  combo engine celebrates it now, and a >1.0 wall is a future *relic*, priced
  as visibly broken. Wall efficiency lives in the tuning table (base 1.0) so
  sticky-wall modifiers and pump relics arrive as data.
- **Wall engine**: purist's custom-plane resolution, unanimously grafted. The
  two walls are axis-aligned planes resolved inside the fixed step (snap to
  plane, reflect, emit) — **arcade colliders are not involved.** Zero latency,
  tunnel-proof at any speed (≤20px/step vs 64px walls), and correct at any
  efficiency — including the sticky modifiers that would re-fire a
  collider-based idiom. v1's nudge/cooldown/grace hacks have no disease left
  to cure.
- **Ground feel**: the ice stays. Ground drag 350 (a 900px/s coast survives
  ~2.6s) — systems-architect's crisp-stop 800 rejected as "the least Icy
  Tower number in any design" (judge). Crisp stops become a *Grippy Floors*
  node modifier someday. Two-regime acceleration for a tight first ten
  seconds and an expensive top end.
- **Air is spent, not earned**: AIR_ACCEL 400 (systems-architect), rejecting
  feel-engineer's 900 — at 900, a long flight refunds the jump's 35% spend
  and the exchange economy is fiction (spine-correctness bug both judges
  flagged). AIR_DRAG 0: airborne momentum is sacred.
- **Assists, instrumented**: buffer + coyote + jump-cut + apex hang adopted
  (judges 2–0 over purist's austerity), but under purist's discipline: every
  assist is tagged in events and counted on the bridge, with alarm thresholds
  that would prove it's faking mastery.

## The physics, exactly

Fixed timestep 60Hz (law). All constants below are entries in the tuning
table; **the values are the starting table, not the truth** — the feel gate
owns the truth, and converged values get committed back the same session.

### Jump (the exchange)

```
s        = |vx| at takeoff             (after 100 px/s deadband: s < 100 → 0)
raw      = JUMP_BASE + EXCHANGE_K · s                      # 640 + 0.9·s
knee     = min(JUMP_BASE + EXCHANGE_K · maxSpeed_eff, HARD_CAP − SPAN)
vy_jump  = raw                         if raw ≤ knee       # identity in play
         = knee + SPAN·tanh((raw−knee)/SPAN)               # SPAN = 650
                                       hard asymptote HARD_CAP = 2400 px/s
vx      *= JUMP_RETENTION (0.70)       # the spend, applied at takeoff
```

Height = vy²/2g is quadratic in run speed: +0.4 floors per 100px/s when
casual, +0.8 when skilled — the power fantasy is in the derivative. Ladder at
baseline (g=1500): standing 1.07 floors (mounts one floor — zero-speed is
never a softlock, v1's 25px standing hop is refused), 500→3.1, 900→5.5,
1400 (ceiling)→9.4, relic-era asymptote 15 floors absolute. Teachable rule:
"jump speed is your run speed plus ninety percent."

### Gravity

RISE 1500 px/s²; FALL ×1.35; **hold-gated apex hang** ×0.6 while |vy| ≤ 60
and jump held (~0.13s where spins and future shoutouts live — float is
earned, not ambient); terminal fall 1300, **clamped manually in core** —
`body.maxVelocity` is set sky-high (4000) and never used as a gameplay clamp
(v1's silent symmetric-clamp bug, refused structurally). Gravity is applied
via core Actions (Phaser config gravity = 0) so a relic can someday mutate it.

### Run

Two-regime grounded accel: **1600 px/s² below 400 px/s** (0→400 in 0.25s —
hand-in-glove), **500 above** (the last 400 px/s costs 0.8s of runway that
does not fit on one floor — the ceiling is a career, reached through routing,
not held keys). TURN_ACCEL 2600 when input opposes velocity (crisp skids;
emits `reversal`). Ground drag 350 (no input — the glide). MAX_RUN_SPEED 1400,
manual clamp. Speed tiers published as **fractions of the effective ceiling**
TIER_FRACS [0.29, 0.50, 0.71, 0.89] + 50 px/s hysteresis — the ladder
self-reprices when a relic raises the ceiling (systems-architect, verbatim).

### Input forgiveness (each named, tagged, counted)

- **Buffer 100ms**, edge-stamped, consumed on the landing tick using
  **landing-tick vx** — buffering never cheats the exchange (purist's honest
  buffer). Same-tick bhop keeps full speed before drag: a real skill reward.
- **Coyote 80ms**, walk-off only (jump-departure flag blocks double-jumps),
  events tagged `wasCoyote`; bridge tracks `coyoteJumpShare` — **if >15% of
  jumps are coyote-sourced, edge discipline is dead; tighten it** (purist).
- **Jump-cut** ×0.45 once, on release while rising, allowed after 80ms of
  ascent; payload carries `floorsForfeited` (commitment priced, v1-style
  fixed jumps refused). Fallback if the arc kink reads ugly: release-gravity
  ×3.0, a one-line swap.
- **Anti-cascade is structural, not a timer**: edge-triggered presses only, a
  one-press buffer consumed atomically, one jump per grounded episode
  (latch). A 3-tick reground lockout exists solely as an engineering guard
  against separation jitter, with a bridge counter `lockoutBlocked` that
  **must read 0 forever** — a nonzero count means the input path is broken;
  diagnose loudly, never widen the window (that would be re-importing v1's
  mask).

### Walls (the routing law)

Airborne or grounded contact with |vx| ≥ 150: `vx := −vx · wallEfficiency`
(1.0), vy untouched, snap to plane, emit `wall_bounce`. Below 150: `wall_touch`
(a lean, not a bounce — no sound, no combo food). After a bounce, 120ms of
**stick-flip grace**: input toward the old direction reads neutral, so the
shuttle flip is teachable ("flip after the bounce") and only 7+ ticks of
wrong-way holding bleeds speed through TURN_ACCEL — skill expresses through
route planning and the flip, never through a physics tax. Payload carries
`inputLeadTicks` (signed), `perfect` (±5 ticks), `bounceIndexInAir`,
`timeSinceLastBounceMs` — everything a combo engine needs to price chains and
re-window "perfect" without movement ever changing (the panel's best wedding
detail, grafted verbatim).

## Event taxonomy (v1 of the nervous-system vocabulary)

**Design law** (purist, adopted): events carry **facts and physically-grounded
classifications only** — never point values, never combo state, never
judgments a downstream system might re-decide. `EVENT_SCHEMA_VERSION = 1` is
exported. Envelope on every event: `{tick, x, y, vx, vy, speed, grounded,
floorIndex}` — tick is the canonical timebase.

| Event | Key payload beyond envelope | When |
|---|---|---|
| `movement/spawn` | `{reason: initial\|reset}` | Sandbox (re)start — consumers clear state |
| `movement/jump` | `launchSpeedX, vyJump, conversionFraction, retainedSpeedX, predictedHeightPx, wasBuffered, wasCoyote, takeoffPlatformId` | jump executes |
| `movement/jump_cut` | `vyBefore, vyAfter, riseMs, floorsForfeited` | early release cut |
| `movement/left_ground` | `{reason: jump\|walkoff, takeoffSpeed}` | grounded→air |
| `movement/apex` | `apexHeightPx, floorsAboveTakeoff, hangActive` | vy crosses 0 |
| `movement/land` | `impactVy, airTicks, floorsGained (exact), platformId, momentumRetained, bouncesDuringAir, sameTickJump` | air→grounded |
| `movement/wall_bounce` | `side, impactSpeedX, exitSpeedX, efficiency, inputLeadTicks, perfect, airborne, bounceIndexInAir, timeSinceLastBounceMs, heightAtBounce` | plane reflection |
| `movement/wall_touch` | `side, impactSpeedX` | sub-threshold contact |
| `movement/floor_crossed` | `floorIndex, direction, cumulativeThisAir, airborne` | 128px line crossed |
| `movement/speed_tier` | `tier, previousTier, thresholds (self-describing px/s)` | tier boundary ±hysteresis |
| `movement/ceiling` | `state: entered\|exited, effectiveMaxSpeed, source` | the screen-on-fire signal |
| `movement/stall` | `state: entered\|exited, durationTicks` | grounded <80px/s >750ms — hesitation as a fact; the death line will tax it, movement never knows |
| `movement/reversal` | `speedBefore, viaWallBounce` | vx sign flip ≥300 |
| `movement/tick` | full kinematic frame | 60Hz firehose, debug bridge only |

Reserved (do not implement, do not repurpose): a ceiling-bump event slot for
EXAM-phase tower mutation.

**Amendment 1** (accepted from the combo design, 2026-07-06; additive,
implement no later than MASTERY): (a) `tier` (current speed-tier index) joins
the envelope — two consumers need tier-at-event and stateful reconstruction
would ship known-desynced; (b) the intra-tick event order is a documented
promise: walls → landing → jump, and specifically land-before-left_ground on
same-tick-bhop ticks (the combo state machine depends on it); (c) landing
classifications (crumble, sticky) will extend `land` additively under
EVENT_SCHEMA_VERSION discipline — needed first by CHOICE's Brittle Rows /
Sticky Patches modifiers, reused by EXAM's boss attacks.

## Camera

Iron law: reads player kinematics, **nothing else, ever**. X locked at 512
(the tower is exactly canvas-wide — an entire bug class deleted by level
geometry). Y follows a proxy: anchor 0.60 of screen height from top,
velocity lookahead 0.20s clamped ±180px with its own 0.08 lerp, follow lerp
**0.12 up / 0.08 down** (falls never yank), **no deadzone** (v1 evidence:
deadzones make apexes read dead-then-jerky), follows down freely — upward
pressure is the death line's job, and the camera will never know it exists.
Shake is applied post-transform by the juice layer via Phaser's camera effect;
deleting juice leaves a perfect camera.

## Juice (all sprite-only, all event-driven, all deletable)

Doctrine: triggered by bus events, scaled by kinematic magnitude, silent below
threshold. Global `juiceScale` knob for live restraint auditions. Priority:
squash/stretch (launch 0.80x/1.25y·80ms; land up to 1.45x/0.60y·110ms by
impact; wall 0.70x/1.15y·70ms) → landing dust (≥400 impact, 4–12 particles) →
run dust (≥0.5×ceiling) → the spin (captured-launch-speed drive, v1's one
good visual instinct: `((launch−500)/900)^1.5 · 24 rad/s`, upright in 90ms) →
pitch-scaled audio (jump pitch 1.0→1.2 by conversionFraction; `sfx_gem`
reserved exclusively for perfect-flag bounces — the skill sound; ±3% jitter;
**master volume ships audible — the level is audio.md's call, one authority**) → speed wind at 0.71×ceiling → afterimage
trail at 0.86×ceiling (the master's crown) → ONE shake trigger (land impact
≥1100: 2px, 90ms). Combo shoutouts and celebration audio are deliberately
absent — they arrive in MASTERY as an *escalation*, not an inflation. The
sandbox also carries act-1's visual identity from day one (parallax layers,
palette, per `art-direction.md`) — a flat blue box cannot pass a joy gate.

## Architecture (boundary: core decides, Phaser detects)

Per fixed step, the game layer feeds core `InputFrame {axisX, jumpPressedEdge,
jumpHeld}` + `ContactReport {landedPlatform?, prevFeetY}`; core returns
`Actions {setVelocity, gravityScale}` + events. Core owns walls entirely (the
planes are math, not bodies). One-way platforms remain engine-side (overlap +
processCallback, land only when vy>0 and previous-tick feet above top — the
idiom gets re-verified on Phaser 4.2 by harness assertion before anything is
built on it). Hook `WORLD_STEP`, never `scene.update` (fixedStep runs 0..n
steps per render frame; latch input per physics step or replays diverge).

```
src/core/tuning.ts        TuningTable type + DEFAULT_TUNING + TuningStack
                          (base + ordered {key, op: mul|add|set} layers,
                          tick-stamped; THE relic/modifier substrate)
src/core/events.ts        typed union + deterministic ~30-line emitter
src/core/movement/        state.ts / jump.ts / wall.ts / run.ts / tiers.ts /
                          logic.ts (fixed op order per tick: latch input →
                          walls → landing → jump → run → timers/tiers → emit)
src/core/tower.ts         seeded sandbox generator (spacing 100–160 varied,
                          widths varied; reachability vs the curve is the
                          GENERATOR's contract, with real clearance margins)
src/core/input/recorder.ts  per-tick InputFrame + tuning-mutation record/replay
src/game/player/PlayerSystem.ts   body, platforms, ContactReport, Actions
src/game/player/PlayerAnimator.ts squash/stretch/spin/dust — bus consumer
src/game/systems/InputMap.ts | CameraRig.ts | JuiceSystem.ts | AudioSystem.ts
src/game/debug/Bridge.ts   window.__ET2__: live tuning get/set, event ring
                           buffer (1024), recorder start/replay, stats
src/game/scenes/Sandbox.ts composition root, nothing else
```

Player body: world-unit 44×58, bottom-aligned, independent of sprite scale
(v1's scale-welded hitbox refused).

## Instrumentation & the gates

1. **Engine-fact assertions run first** (scripted harness): executed jump vy
   equals the curve's prediction; reflected speed equals impact speed;
   one-way landing predicate honored on Phaser 4.2. Drift = stop the line.
2. **Determinism gate before every human gate**: record 30s, replay, compare
   per-tick position hashes. Divergence = stop.
3. **Tripwire counters that must read zero**: `lockoutBlocked`,
   `wallDedupHits`. **Alarm**: `coyoteJumpShare > 15%`.
4. **Stats for the feel conversation**: tier residency %, floors/min, bounce
   count/efficiency histogram, sustained-speed traces.
5. **The human feel gate**: raw climbing, empty room, no roguelite systems.
   The question is not "does it work" — it is *does floor-skipping at tier-2
   speed produce the grin*. Converged FeelTuner values are committed to
   `tuning.ts` the same session (the shipped table is always the last table
   that passed).

## Feel-gate A/B shortlist (pre-registered experiments)

1. `JUMP_RETENTION` 0.70 vs 0.65 (the primary knob — chain sustainability vs
   spend-weight).
2. Gravity family: 1500/×1.35 vs 1200-recomputed (float vs snap).
3. Apex hang 0.6 vs off (1.0) — purist's objection, tested not assumed.
4. Lossless-wall texture: if bounces read "dead," fix with sound/squash
   weight first; a +40px/s keep-alive experiment exists as a FeelTuner
   toggle only — never a shipped dead constant.
5. Jump-cut 0.45 vs 0.35 vs release-gravity swap.
6. `CAM_ANCHOR` 0.60 vs 0.55 on deep falls.
7. `PLAYER_SCALE` 0.5 vs 0.45/0.55 — early human feedback on the placeholder
   (character at native 128px) was "the dude feels big / the stage feels
   narrow"; the 0.5 ruling (one tile tall, ~8% of screen height) is the
   predicted fix, but the gate confirms the proportion, not the prediction.

## Risks

The exchange may feel grindy (retention + AIR_ACCEL 400 together bite harder
than either alone — watch sustained-speed plateaus under honest play); gravity
1500 may read heavy against the source fantasy's float (the apex hang and
earned airtime are the counterweights — A/B #2/#3); lossless walls may feel
textureless (risk #4's ladder); locked-X camera hard-couples playfield to
canvas width (chosen deliberately, flagged for CHOICE-phase map design); all
feel evidence is n=1 by design — the gate is human hands, and the tuning table
plus recorder exist precisely so that iteration is minutes, not rebuilds.
