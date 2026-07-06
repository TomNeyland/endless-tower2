# Engine Choice — Phaser 4 (decided 2026-07-05)

Four parallel research passes (Phaser status, engine comparison, three.js-for-2D,
Godot web export) fed this decision.

## Verdict: Phaser 4 (^4.2) + Vite + TypeScript, no UI framework

- Phaser 4.0 "Caladan" went stable 2026-04-10 after a long RC cycle; 4.1 and 4.2
  followed with fixes/features. Official position: "If you're starting a new
  project, there's no reason to start on Phaser 3."
- Built-in Arcade physics (AABB, tunable) is exactly this game's physics model;
  v1's hard-won Phaser knowledge (collision callbacks, one-way platforms)
  transfers directly.
- v4 highlights we can use: RenderNode-based WebGL renderer, unified Filter
  system on any GameObject/camera (bloom/vignette/gradient-map for art
  direction), `SpriteGPULayer` for particle-heavy scenes.
- Largest 2D web ecosystem, docs, and production track record; official
  Vite + TS template (this repo's seed).

## Alternatives considered

| Option | Why not |
|---|---|
| Angular + Phaser (v1's stack) | The framework added an EventBus bridge and build complexity for one canvas tag. Nothing else. |
| PixiJS v8 | Renderer only — we'd hand-build physics/input/scenes (rebuilding Phaser badly). |
| three.js | 3D renderer; consensus across forums/benchmarks: wrong tool for 2D games. Its 2D usage is rare and hand-rolled. |
| Excalibur.js | Nice TS-first API but pre-1.0 and a fraction of the ecosystem. |
| Kaplay / LittleJS | Jam-grade / size-constrained tools, not production platformer engines. |
| Godot 4 web export | Workable since 4.3 (single-threaded default) but multi-MB wasm tax, WebGL-2-only renderer, browser OOM gotchas on long sessions, and none of the v1 knowledge transfers. |

## Risk & fallback

Phaser 4 stable was ~3 months old at decision time, and most "start on 4"
guidance is Phaser's own. Mitigation: v4 deliberately preserved v3's API shape
(official migration guide: an afternoon for standard games), so if v4 renderer
issues block us, the fallback to 3.90 is cheap. Custom WebGL pipelines are the
one expensive-to-migrate area — avoid writing any until confident on v4.
