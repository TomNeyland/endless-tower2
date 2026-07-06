# FlappyTower — one-button mobile hands

*Status: binding mobile-control design. Codename: **FlappyTower**. This doc
narrows `movement.md`'s mobile-hands paragraph into a shipped rule set.*

## Thesis

Mobile is allowed to be a different affordance, not a different physics game.
On touch screens, the player gets one visible verb: **Launch**. The game layer
auto-paces horizontal input, and the button supplies jump press/hold/release.
Those facts still enter the existing `InputFrame` contract, so movement, walls,
combos, coins, bosses, replays, and pressure remain the same systems.

The button's meaning is the spine in one thumb:

> cash out built momentum into height.

## What FlappyTower is not

- Not a Flappy Bird impulse. Taps never add midair lift outside the existing
  jump, buffer, jump-cut, and apex-hang rules.
- Not a target-seeking autopilot. The mobile driver does not inspect the next
  platform, coin, boss, door, or death line to choose a route.
- Not a bank button. Banking remains the combo engine's grounded-grace outcome
  and run orchestration signal; player input never directly banks.
- Not a mobile fork of core physics. Delete the mobile shell and keyboard
  replays must remain byte-for-byte conceptually unchanged.

## The input contract

Desktop keeps keyboard movement:

- arrows / WASD produce `axisX`;
- Space / Z produce jump held and jump edges.

Touch devices use FlappyTower:

- the game layer emits an automatic `axisX`;
- the single on-screen button emits `jumpHeld`;
- the existing per-step latch derives `jumpPressedEdge`.

The core sees only:

```ts
{ axisX: -1 | 0 | 1, jumpPressedEdge: boolean, jumpHeld: boolean }
```

No new field joins `InputFrame`.

## The auto-pacer

The mobile axis is a committed runner, not a navigator.

1. It starts running right.
2. While grounded on the current platform, it keeps its current run direction
   until it reaches an edge guard.
3. Inside the left edge guard it presses right.
4. Inside the right edge guard it presses left.
5. In air it keeps the committed direction.
6. A wall bounce flips the committed direction away from the wall.
7. A landing may seed the committed direction from carried horizontal velocity,
   after which the edge-guard rule owns the platform.

The driver may know the platform the player is standing on because that is a
contact fact already reported by the engine boundary. It may not know which
future platform is "correct."

Initial tuning rows:

| Key | Value | Purpose |
|---|---:|---|
| `flappytower.edgeGuardPx` | 84 | Maximum inset before the pacer turns inward on a runway. |
| `flappytower.edgeGuardRunwayFrac` | 0.55 | Narrow ledges spend this share of their usable half-runway before turning. |
| `flappytower.directionSeedSpeed` | 90 | Landing speed needed to seed the next committed direction from carried velocity. |

The effective guard is
`min(edgeGuardPx, (platform.width / 2 - bodyHalfWidth) × edgeGuardRunwayFrac)`.
Turn thresholds include the body half-width, so the pacer protects the
character's feet rather than the sprite center. This keeps wide platforms
readable as long runways and makes narrow platforms spicy timing meters
without giving the driver any knowledge of future routes.

## The button

The visible button reads as **Launch**:

- press on ground: jump now;
- press in air: buffer/coyote through existing movement rules;
- hold: keep apex hang available;
- release while rising: jump-cut through the existing rule.

This gives one button four distinct feels without adding a verb:

- early low-speed hop;
- charged high-speed launch;
- held float at apex;
- cut drop for coins, ledges, or boss timing.

## Platform play

Desktop platforms are runways. FlappyTower platforms are timing meters.

A wide ledge gives the player a long visible speed cycle: slow turn, acceleration,
fast middle, braking turn. A narrow ledge compresses that cycle. The decision is
not "steer left or right"; it is "which phase of this ledge do I spend?"

Bad timing has natural costs:

- launch too early: low speed, low height;
- launch too late: edge skid, bad angle, possible walk-off;
- hold too long: overshoot or delay the next landing;
- release too early: drop short;
- hesitate: death line closes.

## Walls

Walls remain the routing law. A mobile launch may intentionally go the "wrong"
way to bank off a wall and return. The wall bounce flips the auto-pacer away from
the wall, but the bounce itself remains the same lossless core wall event.

This preserves the good desktop lesson:

> walls route momentum; jumps spend it.

## Coins and the wallet

Coins are still placed pickups, not combo drips and not button rewards. The
single button changes how a player chooses trajectories through coin fields:

- cut an arc to touch a loot ledge;
- hold through apex to reach higher coins;
- wait one more platform beat for a faster launch, at the price of line tempo.

The wallet remains the only economy currency. FlappyTower does not mint coins;
it makes the path to coins playable with one thumb.

## Combo and bosses

Combos become easier to explain on mobile:

- tap/hold to keep climbing and grow the chain;
- stop launching after a landing to let grace bank;
- in boss arenas, bank during an exposed/gold stance for the stronger hit.

Boss damage still consumes `combo/banked`. A mobile player never attacks with a
button; they cash the same chain the desktop player built.

## Pressure

The death line is the anti-autopilot. Without it, a one-button player could wait
for perfect platform phase forever. With it, waiting is a visible price. This is
why the auto-pacer must not target the route: the human's decision is when to
spend time and momentum.

## Definition of done

- Mobile gameplay exposes one visible button, not left/right/jump zones.
- The implementation is game-layer input policy only.
- `src/core` remains untouched unless a future tuning key is deliberately added
  as data.
- The one-button driver feeds normal `InputFrame`s.
- Keyboard controls remain unchanged.
- Existing harnesses stay green.
