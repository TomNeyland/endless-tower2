/** Shared world geometry. Kept separate so generation and reachability agree. */
export const TILE = 64;
export const TOWER_WIDTH = 1024;
/** Inner faces of the wall planes — the tower is exactly canvas-wide. */
export const WALL_LEFT_X = TILE;
export const WALL_RIGHT_X = TOWER_WIDTH - TILE;
/** The ground platform's id — the spawn floor. */
export const GROUND_PLATFORM_ID = 0;
