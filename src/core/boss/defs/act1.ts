/**
 * Act 1 — THE SLIME SOVEREIGN (slime family; heavy, gloopy, patient).
 * Examines KEEP: sticky spit everywhere, slow crumble slams, small slime
 * minions. The lesson is "protect your speed", and the cadence is generous
 * — this is the tutorial boss, and pillar 1 says the player usually wins.
 */
import type { BossDef } from '../types';

export const SLIME_SOVEREIGN: BossDef = {
    id: 'slime-sovereign',
    name: 'THE SLIME SOVEREIGN',
    act: 1,
    hpBanks: 3.5, // bosses.md: act 1 ≈ 3-4 decent banks
    entranceTicks: 210, // a long, readable arrival — 3.5s of menace
    defeatBeatTicks: 110,
    doorFloorsAbove: 3,
    attacks: [
        {
            id: 'royal-spit',
            kind: 'sticky_spit',
            telegraphTicks: 80, // slow, gloopy windup
            platformCount: 3,
            bandFloors: [1, 5],
        },
        {
            id: 'sovereign-slam',
            kind: 'body_slam',
            telegraphTicks: 96, // the heave before the leap — read it, move
            platformCount: 1,
            bandFloors: [2, 4],
            collapseDelayTicks: 14,
        },
        {
            id: 'royal-court',
            kind: 'swarm',
            telegraphTicks: 60,
            swarmCount: 2, // small slime minions, drifting lazily
            swarmSkin: 'slime',
            swarmPattern: 'drift',
            swarmLifeTicks: 420,
        },
    ],
    phases: [
        {
            // The tutorial phase: goo only, one lesson at a time.
            cadenceTicks: 300, // 5s between swings — generous
            cadenceJitterTicks: 40,
            pattern: ['royal-spit'],
            sustainedOpenness: false,
        },
        {
            // Cracked: the slams begin. Still one threat at a time.
            cadenceTicks: 250,
            cadenceJitterTicks: 40,
            pattern: ['royal-spit', 'sovereign-slam'],
            sustainedOpenness: false,
        },
        {
            // Failing: the court arrives, the rhythm tightens a notch.
            cadenceTicks: 210,
            cadenceJitterTicks: 30,
            pattern: ['sovereign-slam', 'royal-spit', 'royal-court'],
            sustainedOpenness: false,
        },
    ],
    presentation: {
        frameSet: 'slime', // manifest id — frames live in assets.ts BossFrames
        phaseTints: [0xffffff, 0xd9f0c0, 0xb8c9a0], // fresh -> dulled -> failing
        epithet: 'KEEPER OF THE MEADOW GATE',
    },
};
