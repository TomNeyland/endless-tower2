/** Pure difficulty-curve evaluation: shaped ramp + seeded breather phrase. */
import { fork } from '../rng';
import type { TuningStack } from '../tuning';
import { DIFFICULTY_INDEX_TABLE } from './tuning';
import type {
    DifficultyGeometry,
    DifficultyProfile,
    DifficultySample,
    DifficultyShape,
    DifficultyTracePoint,
    SegmentDifficulty,
} from './types';

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function shapedProgress(shape: DifficultyShape, t: number): number {
    switch (shape) {
        case 'linear':
            return t;
        case 'easeIn':
            return t * t;
        case 'easeOut':
            return 1 - (1 - t) * (1 - t);
    }
}

function validateProfile(profile: DifficultyProfile): void {
    if (!(['linear', 'easeIn', 'easeOut'] as const).includes(profile.shape)) {
        throw new Error(`difficulty profile ${profile.id}: unknown shape ${profile.shape}`);
    }
    if (
        profile.startIndex < 0 ||
        profile.startIndex > 1 ||
        profile.endIndex < profile.startIndex ||
        profile.endIndex > 1
    ) {
        throw new Error(`difficulty profile ${profile.id}: index band must rise inside 0..1`);
    }
    if (profile.phraseAmplitude < 0 || profile.phraseAmplitude > 1) {
        throw new Error(`difficulty profile ${profile.id}: invalid phrase amplitude`);
    }
    if (!Number.isInteger(profile.cycles) || profile.cycles < 0) {
        throw new Error(`difficulty profile ${profile.id}: cycles must be a non-negative integer`);
    }
}

function profileProgress(profile: DifficultyProfile, t: number): number {
    if (profile.cycles === 0) {
        return shapedProgress(profile.shape, t);
    }
    const cycle = (t * profile.cycles) % 1;
    return 1 - Math.abs(cycle * 2 - 1);
}

function phraseEnvelope(progress: number, phase: number, period: number, width: number): number {
    const cycle = (((progress - phase) % period) + period) % period;
    if (cycle >= width) {
        return 0;
    }
    return Math.sin((Math.PI * cycle) / width);
}

/** Concrete post-curve bands at an already-clamped difficulty index. */
export function geometryForDifficulty(index: number, t: TuningStack): DifficultyGeometry {
    if (index < 0 || index > 1) {
        throw new Error(`difficulty geometry: index ${index} outside 0..1`);
    }
    const easy = DIFFICULTY_INDEX_TABLE[0];
    const hard = DIFFICULTY_INDEX_TABLE[1];
    const geometry: DifficultyGeometry = {
        gapMinPx:
            lerp(t.value(easy.gapMinPx), t.value(hard.gapMinPx), index) * t.value('tower.gapMul'),
        gapMaxPx:
            lerp(t.value(easy.gapMaxPx), t.value(hard.gapMaxPx), index) * t.value('tower.gapMul'),
        widthMinTiles: lerp(t.value(easy.widthMinTiles), t.value(hard.widthMinTiles), index),
        widthMaxTiles: lerp(t.value(easy.widthMaxTiles), t.value(hard.widthMaxTiles), index),
        density:
            lerp(t.value(easy.density), t.value(hard.density), index) * t.value('tower.densityMul'),
        scatterPx:
            lerp(t.value(easy.scatterPx), t.value(hard.scatterPx), index) *
            t.value('tower.scatterMul'),
    };
    if (
        geometry.gapMinPx <= 0 ||
        geometry.gapMinPx > geometry.gapMaxPx ||
        geometry.widthMinTiles < 1 ||
        geometry.widthMinTiles > geometry.widthMaxTiles ||
        geometry.density < 0 ||
        geometry.density > 1 ||
        geometry.scatterPx < 0
    ) {
        throw new Error(`difficulty geometry: post-curve bands invalid at index ${index}`);
    }
    return geometry;
}

export function evaluateDifficulty(
    spec: SegmentDifficulty,
    seed: number,
    totalFloors: number,
    floorIndex: number,
    frontier: number,
    tuning: TuningStack,
): DifficultySample {
    validateProfile(spec.profile);
    if (!Number.isInteger(spec.actIndex) || spec.actIndex < 1 || spec.actIndex > 3) {
        throw new Error(`difficulty: actIndex must be 1..3, got ${spec.actIndex}`);
    }
    if (!Number.isInteger(totalFloors) || totalFloors < 1) {
        throw new Error(`difficulty: totalFloors must be a positive integer, got ${totalFloors}`);
    }
    if (floorIndex < 0 || floorIndex > totalFloors) {
        throw new Error(`difficulty: floor ${floorIndex} outside segment 0..${totalFloors}`);
    }
    if (frontier < 0 || frontier > 1) {
        throw new Error(`difficulty: frontier ${frontier} outside 0..1`);
    }

    const progress = floorIndex / totalFloors;
    const actLift = (spec.actIndex - 1) * tuning.value('difficulty.actStep');
    const start = spec.profile.startIndex + actLift;
    const end = spec.profile.endIndex + actLift;
    const baselineIndex = lerp(start, end, profileProgress(spec.profile, progress));
    const period = tuning.value('difficulty.phrasePeriodFloors') / totalFloors;
    const width = tuning.value('difficulty.phraseWidthFloors') / totalFloors;
    const phase = fork(seed, `difficulty:phrase:${spec.profile.id}`)() * period;
    const envelope = phraseEnvelope(progress, phase, period, width);
    const relieved = Math.max(start, baselineIndex - spec.profile.phraseAmplitude * envelope);
    const phrase = relieved - baselineIndex;
    const requestedIndex = Math.min(1, Math.max(0, relieved));
    const unphrasedIndex = Math.min(frontier, Math.min(1, Math.max(0, baselineIndex)));
    const index = Math.min(frontier, requestedIndex);

    return {
        floorIndex,
        t: progress,
        baselineIndex,
        requestedIndex,
        index,
        frontier,
        phrase,
        breather: envelope > 0 && index < unphrasedIndex,
        saturated: requestedIndex > frontier,
        geometry: geometryForDifficulty(index, tuning),
    };
}

export function buildDifficultyTrace(
    spec: SegmentDifficulty,
    seed: number,
    totalFloors: number,
    frontier: number,
    tuning: TuningStack,
): DifficultyTracePoint[] {
    const trace: DifficultyTracePoint[] = [];
    for (let floorIndex = 0; floorIndex <= totalFloors; floorIndex += 1) {
        const { geometry: _, ...point } = evaluateDifficulty(
            spec,
            seed,
            totalFloors,
            floorIndex,
            frontier,
            tuning,
        );
        trace.push(point);
    }
    return trace;
}
