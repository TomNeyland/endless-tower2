/**
 * One tuning-data table maps difficulty index 0..1 to generator bands.
 * The flat keys remain TuningStack-addressable; this table is the sole
 * structural mapping from those keys to geometry.
 */
export const DEFAULT_DIFFICULTY_TUNING = {
    'difficulty.easy.gapMinPx': 100,
    'difficulty.easy.gapMaxPx': 120,
    'difficulty.easy.widthMinTiles': 5,
    'difficulty.easy.widthMaxTiles': 7,
    'difficulty.easy.density': 0.75,
    'difficulty.easy.scatterPx': 12,
    'difficulty.hard.gapMinPx': 145,
    'difficulty.hard.gapMaxPx': 160,
    'difficulty.hard.widthMinTiles': 3,
    'difficulty.hard.widthMaxTiles': 4,
    'difficulty.hard.density': 0.25,
    'difficulty.hard.scatterPx': 70,
    'difficulty.actStep': 0.08,
    'difficulty.phrasePeriodFloors': 18,
    'difficulty.phraseWidthFloors': 4,
    'tower.gapMul': 1,
    'tower.platformWidthMul': 1,
    'tower.densityMul': 1,
    'tower.scatterMul': 1,
} satisfies Record<string, number>;

export type DifficultyTuningKey = keyof typeof DEFAULT_DIFFICULTY_TUNING;

export interface DifficultyBandKeys {
    index: 0 | 1;
    gapMinPx: DifficultyTuningKey;
    gapMaxPx: DifficultyTuningKey;
    widthMinTiles: DifficultyTuningKey;
    widthMaxTiles: DifficultyTuningKey;
    density: DifficultyTuningKey;
    scatterPx: DifficultyTuningKey;
}

export const DIFFICULTY_INDEX_TABLE: readonly DifficultyBandKeys[] = [
    {
        index: 0,
        gapMinPx: 'difficulty.easy.gapMinPx',
        gapMaxPx: 'difficulty.easy.gapMaxPx',
        widthMinTiles: 'difficulty.easy.widthMinTiles',
        widthMaxTiles: 'difficulty.easy.widthMaxTiles',
        density: 'difficulty.easy.density',
        scatterPx: 'difficulty.easy.scatterPx',
    },
    {
        index: 1,
        gapMinPx: 'difficulty.hard.gapMinPx',
        gapMaxPx: 'difficulty.hard.gapMaxPx',
        widthMinTiles: 'difficulty.hard.widthMinTiles',
        widthMaxTiles: 'difficulty.hard.widthMaxTiles',
        density: 'difficulty.hard.density',
        scatterPx: 'difficulty.hard.scatterPx',
    },
];

function fail(key: string, value: number, why: string): never {
    throw new Error(`difficulty tuning degenerate: ${key} = ${value} (${why})`);
}

/** Layer-push validation: bad geometry data fails before generation. */
export function validateDifficultyTuning(t: Record<string, number>): void {
    for (const band of DIFFICULTY_INDEX_TABLE) {
        const gapMin = t[band.gapMinPx];
        const gapMax = t[band.gapMaxPx];
        const widthMin = t[band.widthMinTiles];
        const widthMax = t[band.widthMaxTiles];
        const density = t[band.density];
        const scatter = t[band.scatterPx];
        if (gapMin <= 0 || gapMin > gapMax) {
            fail(band.gapMinPx, gapMin, 'gap band must be positive and ordered');
        }
        if (widthMin < 1 || widthMin > widthMax) {
            fail(band.widthMinTiles, widthMin, 'width band must be at least one tile and ordered');
        }
        if (density < 0 || density > 1) {
            fail(band.density, density, 'density is a probability');
        }
        if (scatter < 0) {
            fail(band.scatterPx, scatter, 'negative scatter');
        }
    }
    if (t['difficulty.actStep'] < 0) {
        fail('difficulty.actStep', t['difficulty.actStep'], 'acts cannot lower both bands');
    }
    if (t['difficulty.phrasePeriodFloors'] <= 0) {
        fail(
            'difficulty.phrasePeriodFloors',
            t['difficulty.phrasePeriodFloors'],
            'period must be positive',
        );
    }
    if (
        t['difficulty.phraseWidthFloors'] <= 0 ||
        t['difficulty.phraseWidthFloors'] > t['difficulty.phrasePeriodFloors']
    ) {
        fail(
            'difficulty.phraseWidthFloors',
            t['difficulty.phraseWidthFloors'],
            'width must fit inside its period',
        );
    }
    for (const key of [
        'tower.gapMul',
        'tower.platformWidthMul',
        'tower.densityMul',
        'tower.scatterMul',
    ] as const) {
        if (t[key] <= 0) {
            fail(key, t[key], 'post-curve multipliers must be positive');
        }
    }
    if (
        t['difficulty.easy.density'] * t['tower.densityMul'] > 1 ||
        t['difficulty.hard.density'] * t['tower.densityMul'] > 1
    ) {
        fail('tower.densityMul', t['tower.densityMul'], 'post-curve density exceeds one');
    }
    if (Math.round(t['difficulty.hard.widthMinTiles'] * t['tower.platformWidthMul']) < 1) {
        fail(
            'tower.platformWidthMul',
            t['tower.platformWidthMul'],
            'post-curve hard ledge is narrower than one tile',
        );
    }
    for (const [easyKey, hardKey, why] of [
        ['difficulty.easy.gapMinPx', 'difficulty.hard.gapMinPx', 'hard minimum gap regressed'],
        ['difficulty.easy.gapMaxPx', 'difficulty.hard.gapMaxPx', 'hard maximum gap regressed'],
        [
            'difficulty.hard.widthMinTiles',
            'difficulty.easy.widthMinTiles',
            'hard minimum width grew',
        ],
        [
            'difficulty.hard.widthMaxTiles',
            'difficulty.easy.widthMaxTiles',
            'hard maximum width grew',
        ],
        ['difficulty.hard.density', 'difficulty.easy.density', 'hard density grew'],
        ['difficulty.easy.scatterPx', 'difficulty.hard.scatterPx', 'hard scatter regressed'],
    ] as const) {
        if (t[easyKey] > t[hardKey]) {
            fail(hardKey, t[hardKey], why);
        }
    }
}
