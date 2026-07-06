/**
 * Lifetime stats — memory, not power (docs/design/meta-progression.md).
 * Aggregates run records across a save's life: bests (the museum's flex
 * line), totals, the lifetime tier histogram, per-character records, win
 * streaks. RETURN renders memory, it doesn't mint it: every number here
 * folds from combo-scoring.md's session vocabulary and the run's own facts.
 *
 * Pure by law: fold functions return new objects; localStorage lives at the
 * game layer (persist/save.ts holds the document shape).
 */

export const TIER_HISTOGRAM_SIZE = 8;

/** One finished run, as the meta layer saw it — the fold input. */
export interface RunRecord {
    seed: string;
    characterId: string;
    reason: 'summit' | 'death_line';
    totalScore: number;
    coins: number;
    floorsClimbed: number;
    timeTicks: number;
    segments: number;
    actsCompleted: number;
    /** Ticks of the fastest completed act; null when no act completed. */
    fastestActTicks: number | null;
    bestChainFloors: number;
    bestChainMult: number;
    bestChainPayout: number;
    /** The display face: "31 FLOORS ×4.75 — 45,648". */
    bestChainFace: string;
    banks: number;
    voids: number;
    perfectBounces: number;
    heartsLost: number;
    tierHistogram: number[];
}

export interface CharacterRecord {
    runs: number;
    wins: number;
    bestChainPayout: number;
    bestChainFace: string;
    bestScore: number;
}

export interface LifetimeStats {
    runs: number;
    wins: number;
    deaths: number;
    winStreak: number;
    bestWinStreak: number;
    totalFloors: number;
    totalBanks: number;
    totalVoids: number;
    totalPerfectBounces: number;
    totalSegments: number;
    /** The museum's lead: the best banked chain, ever. */
    bestChainFloors: number;
    bestChainMult: number;
    bestChainPayout: number;
    bestChainFace: string;
    /** The character that banked it — the museum's full-art subject. */
    bestChainCharacterId: string | null;
    bestRunScore: number;
    bestRunFloors: number;
    fastestActTicks: number | null;
    tierHistogram: number[];
    perCharacter: Record<string, CharacterRecord>;
}

export function emptyLifetimeStats(): LifetimeStats {
    return {
        runs: 0,
        wins: 0,
        deaths: 0,
        winStreak: 0,
        bestWinStreak: 0,
        totalFloors: 0,
        totalBanks: 0,
        totalVoids: 0,
        totalPerfectBounces: 0,
        totalSegments: 0,
        bestChainFloors: 0,
        bestChainMult: 0,
        bestChainPayout: 0,
        bestChainFace: '',
        bestChainCharacterId: null,
        bestRunScore: 0,
        bestRunFloors: 0,
        fastestActTicks: null,
        tierHistogram: new Array(TIER_HISTOGRAM_SIZE).fill(0),
        perCharacter: {},
    };
}

function emptyCharacterRecord(): CharacterRecord {
    return { runs: 0, wins: 0, bestChainPayout: 0, bestChainFace: '', bestScore: 0 };
}

/** Fold one finished run into the lifetime stats. Pure — returns new. */
export function foldRunIntoStats(stats: LifetimeStats, run: RunRecord): LifetimeStats {
    if (run.tierHistogram.length !== TIER_HISTOGRAM_SIZE) {
        throw new Error(
            `stats: run tierHistogram has ${run.tierHistogram.length} rungs, ` +
                `the ladder has ${TIER_HISTOGRAM_SIZE}`,
        );
    }
    const won = run.reason === 'summit';
    const winStreak = won ? stats.winStreak + 1 : 0;
    const beatsBestChain = run.bestChainPayout > stats.bestChainPayout;

    const prevRecord = stats.perCharacter[run.characterId] ?? emptyCharacterRecord();
    const record: CharacterRecord = {
        runs: prevRecord.runs + 1,
        wins: prevRecord.wins + (won ? 1 : 0),
        bestChainPayout: Math.max(prevRecord.bestChainPayout, run.bestChainPayout),
        bestChainFace:
            run.bestChainPayout > prevRecord.bestChainPayout
                ? run.bestChainFace
                : prevRecord.bestChainFace,
        bestScore: Math.max(prevRecord.bestScore, run.totalScore),
    };

    return {
        runs: stats.runs + 1,
        wins: stats.wins + (won ? 1 : 0),
        deaths: stats.deaths + (won ? 0 : 1),
        winStreak,
        bestWinStreak: Math.max(stats.bestWinStreak, winStreak),
        totalFloors: stats.totalFloors + run.floorsClimbed,
        totalBanks: stats.totalBanks + run.banks,
        totalVoids: stats.totalVoids + run.voids,
        totalPerfectBounces: stats.totalPerfectBounces + run.perfectBounces,
        totalSegments: stats.totalSegments + run.segments,
        bestChainFloors: beatsBestChain ? run.bestChainFloors : stats.bestChainFloors,
        bestChainMult: beatsBestChain ? run.bestChainMult : stats.bestChainMult,
        bestChainPayout: beatsBestChain ? run.bestChainPayout : stats.bestChainPayout,
        bestChainFace: beatsBestChain ? run.bestChainFace : stats.bestChainFace,
        bestChainCharacterId: beatsBestChain ? run.characterId : stats.bestChainCharacterId,
        bestRunScore: Math.max(stats.bestRunScore, run.totalScore),
        bestRunFloors: Math.max(stats.bestRunFloors, run.floorsClimbed),
        fastestActTicks:
            run.fastestActTicks === null
                ? stats.fastestActTicks
                : stats.fastestActTicks === null
                  ? run.fastestActTicks
                  : Math.min(stats.fastestActTicks, run.fastestActTicks),
        tierHistogram: stats.tierHistogram.map((n, i) => n + run.tierHistogram[i]),
        perCharacter: { ...stats.perCharacter, [run.characterId]: record },
    };
}
