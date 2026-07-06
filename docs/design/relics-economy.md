# Relics & Economy — the IDENTITY-phase design

*Authored by the manager session. Status: v1 — open for critique, binding for
the IDENTITY implementation session. Read ETHOS.md and docs/DESIGN.md first;
builds on the TuningStack (movement.md), the frozen consumer contract
(combo-scoring.md), and node rewards (map-modifiers.md).*

## Thesis

A build is a **personal physics engine**. Every relic amplifies how momentum
is earned, kept, routed, or spent — and relics stack multiplicatively, on
purpose, until a good run goes visibly, gloriously broken (pillar 1: the
explicit goal is five-floor leaps, perma-combo, screen on fire). The player
should be able to say what their build *does* in one sentence, and a
spectator should be able to see it without reading anything.

## Relic mechanics

A relic is `{id, name, blurb, rarity, effects, tell}` where effects use
**exactly the two frozen surfaces** from the consumer contract:

1. **Tuning layers** — ordered `{key, op: mul|add|set}` entries on any table
   key (movement, combo, line, juice). Acquisition order = application
   order (the TuningStack is ordered and tick-stamped; replays capture
   builds for free). Validation throws on degenerate values at push.
2. **Event subscriptions** — triggered effects consuming the bus
   (`combo/banked`, `movement/ceiling`, `run/heart_lost`…), scaling with
   **payload values, never event counts** (the law).

Relics never touch engine internals, never add code paths to movement or
combo. **One absolute limit relics cannot cross:** movement.md's
EXCHANGE_HARD_CAP (the 15-floor asymptote) is engine safety, not a stat —
the knee moves, the ceiling moves, the asymptote never does.

**Every relic has a visible tell** — a small persistent aura/trinket accent
on the character or its trail (within art-direction's budget) — so a
stacked build is *readable on the body*. The build is part of the spectacle.

## Starting roster (24 — every entry names its hook; provenance-blind)

**EARN** *(how speed is built)*
- Sprinter's Creed (common): run accel ×1.2
- Cold Start (common): +60% accel for 0.5s after every landing
- Turn Artist (uncommon): TURN_ACCEL ×1.35 — skids become weapons
- Second Wind (rare): on `heart_lost` rescue, +400 px/s on first ground contact

**KEEP** *(how speed survives)*
- Long Glide (common): ground drag ×0.6 — the ice gets icier
- Momentum Lock (rare): drag = 0 while at tier ≥2 — the classic, now priced
- Featherfall (uncommon): fall gravity ×0.88 — arcs hang longer
- Iron Lungs (uncommon): stall threshold ×2 — hesitation forgiven longer

**ROUTE** *(what walls give)*
- Flip Coach (common): stick-flip grace ×1.5
- Echo Walls (uncommon): bounce escrow cap ratio 1.0 → 2.0 — chains drink deeper
- Wall Charger (rare): **wall efficiency 1.05** — the priced spine-breaker; walls
  finally pump, visibly, because you *bought* it
- Perfect Ear (uncommon): combo perfect window +3 ticks

**SPEND** *(what jumps buy)*
- High Voltage (uncommon): EXCHANGE_K +0.08 — every jump converts hotter
- Deep Pockets (uncommon): JUMP_RETENTION +0.06 — spend less per leap
- Skyhook (rare): apex hang band ×2 and hang gravity ×0.5 — own the top of every arc
- Launch Pad (rare): +25% jump velocity for 2s after a `combo/tier` crossing

**CHAIN** *(what the nervous system pays)*
- Slow Fuse (common): grace fuse +24 ticks
- Golden Floors (common): combo floorValue +5
- Stumble Charm (uncommon): +1 stumble charge (fizzle forgiveness)
- Safety Net (uncommon): void refund 0 → 0.5
- Compounder (legendary): chainExponent +0.15 — the quadratic gets hungrier
- Fireproof (rare): on `combo/banked` with tier ≥ COMET, gain 1 heart (payload-scaled, once per segment)

**BODY** *(survival economy)*
- Thick Skin (common): hearts.max +1 (and +1 now)
- Long Grace (uncommon): line ignition grace ×1.5

Rarity gates power: commons tune, uncommons bend, rares break locally,
legendaries redefine a run. Named synergy recipes are design targets, not
accidents — *Momentum Lock + Echo Walls + Slow Fuse* = the perma-combo
comet; *High Voltage + Skyhook + Launch Pad* = the sky-castle build;
*Compounder + Safety Net* = the gambler. The IDENTITY session playtests
these three recipes explicitly as its power-fantasy acceptance test.

## Coins (the economy, distinct from score)

Score is glory; **coins are economy** — they buy things, they never measure
skill. Sources: placed pickups in segments (density by node type), node
completion bounties (Challenge/Elite), Mystery outcomes. Collection has
magnet radius (`coins.magnetPx` 48) and satisfying audio-visual per
audio.md (casino pack candidates). No coin drip from combos — keeping the
streams separate keeps both legible (combo relics like Fireproof convert
*through* explicit relic effects, not ambient leakage).

## Shops

Stock (seeded from `fork(seed, 'shop:<nodeId>')`): 3 relics
(rarity-weighted by act: act 1 leans common, act 3 leans rare), 1 heart
(price escalates per heart bought this run), 1 reroll (price doubles).
Prices tuned so a normal act affords ~1.5 relics — choices, not shopping
sprees. Browsing shows full relic text + tell preview on the character.
Leaving is free; the door back to the map is always lit.

## Timed powerups (in-segment spice)

Spawned by the generator (visible on approach, seeded): Spring Shoes (+20%
jump velocity, 8s), Coin Storm (coin shower follows you, 6s), Ghost (line
cannot catch you, 5s — it still rises), Overdrive (accel ×1.5, 6s). Short,
loud, legible; they layer over the relic build via temporary tuning layers
(same substrate, auto-popped on expiry — nothing new to invent).

## RunState (the single source of run truth)

Engine-free `src/core/run/state.ts`: `{seed, actIndex, nodeId, path[],
hearts, coins, relics[], stumbleCharges, unlocked tells}` — serializable
(future save/continue and seed-sharing ride on this), mutated only through
typed commands (`acquireRelic`, `spendCoins`, `loseHeart`…), each emitting
its event. The RunOrchestrator (map-modifiers.md) reads/writes RunState;
scenes only read. RUN_SCHEMA_VERSION = 1.

## Events

| Event | Payload | When |
|---|---|---|
| `relic/acquired` | relicId, rarity, source: shop\|elite\|mystery, layersPushed | acquisition |
| `coin/collected` | value, total, magnetized | pickup |
| `coin/spent` | amount, total, item | purchase |
| `shop/entered` / `shop/left` | nodeId, stock / purchases | shop scene |
| `powerup/started` / `powerup/expired` | id, durationTicks | timed spice |
| `run/heart_gained` | source, heartsNow | Thick Skin, Fireproof, shop |

## Architecture

Engine-free: `src/core/relics/types.ts` + `roster.ts` (the 24 as data) +
`effects.ts` (subscription effects, payload-scaled, validated),
`src/core/economy/coins.ts`, `src/core/run/state.ts`. Game layer:
`ShopScene.ts`, `RelicBelt.ts` (HUD strip of owned tells),
`PowerupSystem.ts`. Debug bridge: grantRelic/setCoins/grantHeart for
harness and playtest; a `build` snapshot getter (the one-sentence build
readout).

## Risks & gate questions (pre-registered)

Wall Charger (1.05) compounding across long shafts — bounded by the
absolute cap, but verify the *feel* of bought-pump vs. earned-speed
doesn't hollow the running game (bridge stat: share of speed from walls,
per movement.md's instrumentation). Fireproof's heart engine needs its
once-per-segment limiter playtested against boss arenas (unbounded
chains). Shop pricing is the real difficulty dial of the roguelite —
tune against full-run playtests, not sandbox intuition. Relic tells must
survive art-direction's readability hierarchy (the player stays highest
contrast; tells live in trail/aura, never silhouette). The three synergy
recipes are the acceptance test: if none of them produces the grin at
full stack, IDENTITY has failed regardless of how clean the code is.
