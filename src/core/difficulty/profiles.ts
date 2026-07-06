/**
 * The five binding node profiles from difficulty-curve.md. Presets select
 * these records directly; the curve owns behavior, while the numbers stay
 * visible and mutable as data.
 */
import type { DifficultyProfile } from './types';

export const DIFFICULTY_PROFILES = {
    climb: {
        id: 'climb',
        startIndex: 0.15,
        endIndex: 0.6,
        shape: 'linear',
        phraseAmplitude: 0.12,
        cycles: 0,
    },
    coinRush: {
        id: 'coin_rush',
        startIndex: 0.1,
        endIndex: 0.25,
        shape: 'easeOut',
        phraseAmplitude: 0.18,
        cycles: 0,
    },
    challenge: {
        id: 'challenge',
        startIndex: 0.3,
        endIndex: 0.75,
        shape: 'linear',
        phraseAmplitude: 0.12,
        cycles: 0,
    },
    elite: {
        id: 'elite',
        startIndex: 0.45,
        endIndex: 0.9,
        shape: 'easeIn',
        phraseAmplitude: 0.06,
        cycles: 0,
    },
    boss: {
        id: 'boss',
        startIndex: 0.4,
        endIndex: 0.7,
        shape: 'linear',
        phraseAmplitude: 0,
        cycles: 6,
    },
} as const satisfies Record<string, DifficultyProfile>;
