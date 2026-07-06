/**
 * Canvas dimensions — a LEAF module, on purpose. main.ts imports every
 * scene, and scenes need these numbers; when they lived in main.ts, any
 * module-scope read (`const CX = GAME_WIDTH / 2`) evaluated mid-cycle and
 * hit the temporal dead zone — a guaranteed boot crash from the entry
 * point. A leaf module is fully evaluated before anyone reads it, so
 * layout constants may be derived at module scope again.
 */
export const GAME_WIDTH = 1024;
export const GAME_HEIGHT = 768;
