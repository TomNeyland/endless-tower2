/** Engine-free difficulty-curve data shared by presets, generation, and diagnostics. */

export type DifficultyShape = 'linear' | 'easeIn' | 'easeOut';

export interface DifficultyProfile {
    id: string;
    startIndex: number;
    endIndex: number;
    shape: DifficultyShape;
    /** Maximum seeded breather relief in difficulty-index units. */
    phraseAmplitude: number;
    /** Zero for ordinary ramps; boss arenas use a triangular cycle count. */
    cycles: number;
}

export interface SegmentDifficulty {
    profile: DifficultyProfile;
    /** One-based run act. Acts two and three lift both profile bands. */
    actIndex: number;
}

/** Concrete generator inputs evaluated from the single index table. */
export interface DifficultyGeometry {
    gapMinPx: number;
    gapMaxPx: number;
    widthMinTiles: number;
    widthMaxTiles: number;
    /** Chance that a gap roll comes from the denser lower half of its band. */
    density: number;
    /** Maximum horizontal edge-to-edge gap from the prior ledge. */
    scatterPx: number;
}

/** One floor of the exact curve the debug bridge exposes. */
export interface DifficultyTracePoint {
    floorIndex: number;
    t: number;
    baselineIndex: number;
    requestedIndex: number;
    index: number;
    frontier: number;
    phrase: number;
    breather: boolean;
    saturated: boolean;
}

export interface DifficultySample extends DifficultyTracePoint {
    geometry: DifficultyGeometry;
}
