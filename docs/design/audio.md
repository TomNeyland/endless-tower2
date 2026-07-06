# Audio Identity

*Authored by the manager session. Status: v1 — open for critique, binding until
amended. Companion to art-direction.md: light is the visual reward, sound is
the kinesthetic one.*

## Thesis

v1 shipped with master volume 0.0 — a game with no voice. v2 treats audio as
the other half of game feel: every momentum event has a sound signature, the
mix whispers during routine play and roars only when the player earns it, and
by late-game a god-run should be *audible* from across the room.

## Sound attaches to events, never polls

Audio subscribes to the same movement/combo event stream that score and art
consume. If a sound wants to exist, its trigger must be a named event with a
payload — the payload drives variation:

- **Jump**: pitch and body scale with momentum tier at takeoff. A standing hop
  is a soft note; a full-speed launch has bass under it.
- **Wall bounce**: brightness tracks redirect efficiency — clean redirects
  ring, weak ones thud.
- **Landing**: intensity tracks speed kept; a momentum-preserving landing
  sounds like a skip, a dead stop sounds like a drop.
- **Combo escalation**: rising stingers on a pentatonic ladder, one step per
  tier — any escalation order sounds musical; breaking the chain lands a soft
  detune, disappointment without punishment (pillar 1).
- **Heart loss**: the one deliberately hard sound in the game, followed by the
  skyward-launch whoosh — hurt, then hope, in one phrase.
- **Death line proximity**: a low rumble that swells as it nears — audio as
  HUD. Eyes on the tower, ears on the threat.

## Inventory and sourcing

- The pack's 10 SFX are the starting palette (v1's semantic mapping table:
  `docs/research/V1_ASSETS.md`).
- Three staged Kenney audio packs (`assets-staging/`: sci-fi, casino, impact)
  get auditioned during the HANDS pass — impact for landings/bosses, casino
  for coin/shop/reward voice, sci-fi as texture candidates.
- Music sourcing is a HANDS-phase decision (CC0/properly-licensed only; the
  pack contains no music). The *system* below is designed now so music drops
  in without rework.

## Music: vertical layers, not tracks

Per act, one composition in stacked stems, mixed by game state:

1. **Base layer** — always on; calm, melodic, act-themed
2. **Pressure layer** — drums/pulse; fades in with death-line proximity
3. **Glory layer** — full arrangement; unlocked by sustained high combo tiers

The music literally performs the spine: hesitation strips the arrangement
down, mastery builds it up. Boss duels get their own two-layer piece
(menace base + phase-turn escalation).

## Mix architecture

- Three buses: SFX / music / UI, each with independent volume, master on top.
  **Defaults ON** (master ~0.7) — persisted in settings.
- Ducking: music dips ~3dB under milestone/boss stingers, recovers fast.
- Anti-spam: per-class cooldowns (no identical sample twice within ~80ms);
  rapid repeats get pitch-jittered variants, never machine-gun repetition.
- Everything routes through one thin audio module (engine-free policy applies:
  the mapping of event → sound-choice is data, the Phaser sound calls live in
  one place).

## Anti-patterns (refused by name)

- Shipping muted "until better sounds are found" (v1)
- Same-sample spam on repeated events
- Loud celebration for routine play — the mix must keep headroom so earned
  moments have somewhere to go
- Audio that ignores game state (flat pitch/volume regardless of momentum)
