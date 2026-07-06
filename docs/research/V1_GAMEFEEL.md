# V1 Game-Feel Archaeology

Extracted from `~/code/endless-tower` (Angular + Phaser 3). Framing: v1's feel
"narrowly landed the plane" — **every number here is a known-mediocre baseline
that shipped, not a spec to copy.**

## Epistemic status — read before trusting anything below

v1's "solutions" may be patches and hacks layered on wrong approaches. Classify
every finding in this document before using it:

1. **Engine facts** (e.g., Phaser zeroes velocity during collision separation;
   `setMaxVelocity` clamps silently): properties of Phaser, not of v1. Safe to
   rely on, but re-verify against Phaser 4 before building on them.
2. **Player-feel observations** (e.g., zero vertical boost on walls felt more
   authentic; low accel + high ceiling created skill tiers): n=1 evidence from a
   mediocre build. Re-test cheaply in the sandbox; never assume.
3. **Patches on wrong approaches** (e.g., the 50px teleport-nudge off walls, the
   jump cooldown masking cascade-jumping, the custom redirect written after
   `bounce.setTo()` "jittered"): **symptoms, not solutions.** Each flags a
   decision v2 must make deliberately from first principles. If v2's clean
   architecture never produces the disease, do not import the cure.

Build from the design spec and current Phaser 4 idioms first; consult this file
to avoid v1's failure classes, not to inherit its fixes.

## Critical: v1's docs lie about its three flagship systems

1. **Jump never used `momentumCouplingFactor`.** The spec/CLAUDE.md sell
   `v_y = v_y0 + k·|v_x|` with k configurable (set to 2.0). The actual jump math
   (`GameConfiguration.ts:329-346`) never reads it — it hardcodes a linear
   1.0×→1.25× conversion. The famous formula is a fiction.
2. **Wall bounces are not timing-based.** CLAUDE.md claims "Perfect 50ms = 110% +
   boost / Good = 90% / Late = 80%". Reality (`WallCollision.ts`): input-direction
   based (press away = 0.8, neutral = 0.6, into-wall = 0.4), pure horizontal
   redirect, zero vertical boost (deliberately removed — felt MORE authentic).
3. **Physics was not fixed-timestep.** CLAUDE.md claims "fixed 60Hz decoupled from
   render"; `main.ts:28-42` explicitly removed it. v1's momentum jumps are
   framerate-sensitive.

Dead config (never wired to behavior): the entire `combos` block, most of
`platforms` (min/maxPlatformGap, platformWidth, platformHeightVariance), all
`walls.*Efficiency` + `minSpeedForBounce`, `jumpScalingExponent`, and the whole
4-preset system.

## Tuning constants (the shipped baseline)

### Physics / movement (`GameConfiguration.ts:98-107`, `MovementController.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `baseJumpSpeed` | 200 px/s | standing jump velocity |
| `gravity` | 800 px/s² | |
| `horizontalAcceleration` | 600 px/s² | deliberately low for skill gap (was 1200) |
| `maxHorizontalSpeed` | 1350 px/s | crept up 600→700→900→1350 over dev |
| `horizontalDrag` | 300 px/s² | low = "slippery" glide |
| `horizontalRetentionFactor` | 0.6 | horizontal speed kept after jump |
| vertical velocity cap | 10000 px/s | was 1000 and silently broke all momentum jumps |
| `JUMP_BUFFER_TIME` | 100 ms | |
| `COYOTE_TIME` | 100 ms | (spec claims none; code has it) |
| `JUMP_COOLDOWN` | 150 ms | anti-cascade lockout — the fix that unmasked momentum |

### Wall bounce — the real system (`WallCollision.ts`)

| Constant | Value | Note |
|---|---|---|
| bounce cooldown | 500 ms | `:18` |
| opposite-wall grace | 200 ms | pass through opposite wall — enables tunnel flow `:115` |
| min speed to bounce | 20 px/s | very forgiving `:180` |
| efficiency away/neutral/into | 0.8 / 0.6 / 0.4 | input-direction based `:239-248` |
| min bounce-away speed | 60 px/s | anti-stick `:336` |
| max wall-bounce speed | 800 px/s | BELOW the 1350 global cap — bounces can't reach top-tier speeds (bug?) `:358` |
| vertical transfer | 0 | pure horizontal, always `:350-354` |
| vertical clamp | ±600 px/s | `:367-373` |
| nudge-off-wall | 50 px | teleport hack to stop sticking `:284` |

### Rotation/spin (`Player.ts:216-262`)

speedThreshold 400, max input 1200, max angular 35 rad/s, exponent 1.5,
upright-lerp 0.15. Uses *captured initial* speed for the whole airtime so gravity
doesn't kill the spin. `rotationSpeed = pow(min((initSpeed-400)/800, 1), 1.5) * 35`.

### Combo (`ComboSystem.ts`) — the live one

timeout 2500 ms, max multiplier 5.0, +0.2/event. Points: wall-bounce 50,
perfect-wall-bounce 150 (**unreachable** — needs efficiency > 1.0, max is 0.8),
multi-platform 75, air-time 25 (min 1000 ms), speed-bonus 100 (> 400 px/s).
Platforms-skipped approximated as `floor(airTime/500)` — crude.
NOTE: `ScoreSystem.ts` contains a SECOND legacy combo system (3000 ms, resets on
every landing) that ran alongside and emitted conflicting events. v2: one system.

### Score / death line / platforms / walls / camera

- Score: 1 pt / 10 px climbed; milestones 100/250/500/1k/2k/5k/10k (bonus = value).
- Death line: riseSpeed 50 px/s CONSTANT (ramp was designed, never built);
  activates at 30 s OR 300 px; warningDistance 300; tiers >800 safe / >400 aware /
  >200 caution / >100 danger / ≤100 critical (shake intensity 2, 200 ms).
- Platforms: generate 1500 px ahead, cleanup 1000 px behind; checkpoint
  (wall-to-wall) every 100; verticalSpacing 100–160 px; layout modes
  tight/snake/scattered/staircase switch every 15; platform deletion starts at
  500 px height, max 50%, always ≥1 per row survives; difficulty =
  `min(3.0, height/1000)`; tileWidth 64.
- Walls: segmentHeight 640, generate 3000 px ahead, max 100 segments (evict
  oldest), update only when camera moves >50 px, flush at x=0 / x=width−64.
- Camera: plain Phaser `startFollow`, lerp 0.1, deadzone (w×0.3, h×0.2). Setup
  offset `(0, −h×0.2)` vs reset `(0, +h×0.1)` — inconsistent, a real bug.
- Player: scale 0.7, body 108×128, offsets 10/14 hardcoded for that scale.
- Canvas: 1024×768 FIT, antialias on, roundPixels true, activePointers 4.

## Core formulas

**Momentum jump** (`GameConfiguration.ts:329-346`):
```
speedPercent   = min(|v_x| / 1350, 1.0)
conversionRate = 1.0 + 0.25 * speedPercent      // linear 1.0→1.25
verticalSpeed  = 200 + |v_x| * conversionRate
horizontalAfterJump = v_x * 0.6
```
Examples: 0 → 200; ~350 → ~594; 700 → 1075.

**Wall bounce** (`WallCollision.ts:329-348`):
```
redirected = max(|v_x| * efficiency, 60)         // eff ∈ {0.4, 0.6, 0.8}
finalH = min(redirected, 800) * (side == 'left' ? +1 : -1)
finalV = clamp(v_y, -600, +600)                  // no vertical transfer
// then nudge 50px off the wall
```

**One-way platform** (`OneWayPlatform.ts:69-118`): collide only if `v_y > 0` AND
previous-frame feet ≤ platformTop + 10 AND bottom > platformTop; on land snap to
top, zero v_y. Implemented as overlap + processCallback.

## The engine gotcha that cost weeks

Phaser zeroes velocity during collision separation. `processCallback` (4th
collider arg) fires BEFORE separation — capture velocity there;
`collideCallback` (3rd arg) fires after and reads 0. The entire wall-bounce
system appeared broken until this was found.

## Lessons learned

- "Broken momentum" was two masking bugs, not the formula: a silent
  `setMaxVelocity` Y-cap, and cascade jumping bleeding momentum 800→240→72→21
  per press. Fixes: raise the cap + a jump cooldown separate from the buffer.
  **Buffer for feel, cooldown for stability — you need both.**
- Exponential jump scaling (exponents 1.8–5.0) produced 15,000+ px/s
  teleportation; v1 retreated to linear 1.0→1.25. A bounded curve could do
  better — this is a place v1 settled for "safe".
- "The Icy Tower feel comes from the jump, not the wall kick."
- Removing ALL vertical boost from wall bounces felt MORE authentic. Walls are
  direction tools; jumps are height tools. (Spine confirmation: walls route
  momentum, jumps spend it.)
- Phaser's native `bounce.setTo()` was tried twice, abandoned twice (jitter
  loops); logs say "deserves another try" — unresolved.
- Halving acceleration while raising the speed ceiling created emergent skill
  tiers (casual ~300 / basic ~500 / skilled ~900 px/s) purely via config. The
  one genuinely elegant discovery.
- The custom hybrid camera (~150 lines) caused outpacing/snap/infinite-scroll
  bugs, all from coupling camera to death line. Deleting it for bare
  `startFollow` + an independent death line fixed everything. **Coupling
  cascades failures; work with the framework.**
- v1 deliberately deleted wall-bounce screen flashes + camera shake as "visual
  pollution" — restraint reads better than noise.
- `.bind(this)` in `off()` never removes the listener (new ref each call).
  Fixed in 3 classes, still broken in ten others at ship.

## Known-gaps checklist (design these in from day one)

- [ ] Global tuning/balance pass (v1's #1 admission: never happened)
- [ ] Session-wide stats; persistence (v1 saved only audio settings)
- [ ] Reachability guarantee in platform generation (`isGapReachable` existed, unused)
- [ ] Death-line ramp (designed, never built)
- [ ] Platform variety: breakable / moving / boost
- [ ] Scale-agnostic player hitbox
- [ ] Audio unmuted (v1 shipped `masterVolume: 0.0`), music, mixing
- [ ] Particles actually enabled (v1 commented out its `.explode()` calls)
- [ ] Squash/stretch, parallax, post-processing, gamepad, mobile timings wired

## Known bugs in v1 (why it felt "quaint and buggy")

1. Biome reset requires 2 restarts (custom `resetGameSystems()` races vs
   `scene.restart()`)
2. Camera framing changes after restart (offset inconsistency)
3. Two combo systems emitting conflicting `combo-broken` events
4. Widespread `.bind(this)` listener leak across restarts (ten classes)
5. Wall-bounce speed cap (800) below global cap (1350) — top-tier bounce speeds
   unreachable
6. `perfect-wall-bounce` scoring branch unreachable (needs eff > 1.0)
7. Death kill-line uses `player.y + body.height`, inconsistent with the 0.7
   scale geometry
8. Debug platform-spawner item granted to every player on start
9. `console.log` in every hot path
