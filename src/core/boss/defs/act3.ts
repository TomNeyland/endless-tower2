/**
 * Act 3 — THE SUMMIT KEEPER (the tower awake; barnacle/worm/swarm
 * composite). Examines EVERYTHING under pressure: long surge patterns,
 * layered attacks (paired pattern entries — staggered telegraphs, two live
 * threats), and at 1/3 HP a SUSTAINED openness — the game's final
 * invitation to bank the biggest chain of the run. Beating it IS the
 * summit.
 */
import type { BossDef } from '../types';

export const SUMMIT_KEEPER: BossDef = {
    id: 'summit-keeper',
    name: 'THE SUMMIT KEEPER',
    act: 3,
    hpBanks: 5.5, // bosses.md: act 3 ≈ 5-6 decent banks, or two god-chains
    entranceTicks: 240, // the mountain takes its time waking up
    defeatBeatTicks: 130,
    doorFloorsAbove: 3,
    attacks: [
        {
            id: 'long-surge',
            kind: 'line_surge',
            telegraphTicks: 90, // the line flares long before it lunges
            surgeSpeedMul: 3.2,
            surgeDurationTicks: 260, // the LONG pattern — slack evaporates
        },
        {
            id: 'summit-volley',
            kind: 'crumble_volley',
            telegraphTicks: 78,
            platformCount: 3,
            bandFloors: [2, 7],
        },
        {
            id: 'void-spit',
            kind: 'sticky_spit',
            telegraphTicks: 66,
            platformCount: 3,
            bandFloors: [1, 5],
        },
        {
            id: 'night-swarm',
            kind: 'swarm',
            telegraphTicks: 60,
            swarmCount: 3,
            swarmSkin: 'fly',
            swarmPattern: 'drift',
            swarmLifeTicks: 460,
        },
        {
            id: 'keeper-slam',
            kind: 'body_slam',
            telegraphTicks: 84,
            platformCount: 2,
            bandFloors: [2, 5],
            collapseDelayTicks: 12,
        },
    ],
    phases: [
        {
            // Everything the run taught, one at a time, faster than act 2.
            cadenceTicks: 200,
            cadenceJitterTicks: 30,
            pattern: ['long-surge', 'void-spit', 'summit-volley', 'night-swarm'],
            sustainedOpenness: false,
        },
        {
            // The layered exam: paired entries stagger two telegraphs — the
            // complexity ceiling of the game, shipped in the doc's
            // pre-registered sequenced-readable shape.
            cadenceTicks: 190,
            cadenceJitterTicks: 25,
            pattern: [
                ['summit-volley', 'void-spit'],
                'long-surge',
                ['night-swarm', 'keeper-slam'],
                'summit-volley',
            ],
            sustainedOpenness: false,
        },
        {
            // The final invitation: still layered, still surging — but every
            // window between swings is HELD OPEN. Bank the biggest chain of
            // the run into its failing body.
            cadenceTicks: 230,
            cadenceJitterTicks: 25,
            pattern: [['long-surge', 'summit-volley'], ['void-spit', 'night-swarm'], 'keeper-slam'],
            sustainedOpenness: true,
        },
    ],
    presentation: {
        frameSet: 'barnacle', // manifest id — frames live in assets.ts BossFrames
        phaseTints: [0xffffff, 0xcdb8e8, 0x9a86c8],
        epithet: 'THE TOWER, AWAKE',
    },
};
