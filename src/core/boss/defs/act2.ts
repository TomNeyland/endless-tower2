/**
 * Act 2 — THE WHIRRING WARDEN (saw/block family; mechanical, rhythmic,
 * precise). Examines ROUTE: wall hazards on timers, gusts, surgical
 * crumbles. The lesson is "walls are chosen, not lucky" — its cadence has
 * ZERO jitter by design, so mastery reads as dancing through a metronome.
 */
import type { BossDef } from '../types';

export const WHIRRING_WARDEN: BossDef = {
    id: 'whirring-warden',
    name: 'THE WHIRRING WARDEN',
    act: 2,
    hpBanks: 4.5, // between the tutorial's 3.5 and the summit's 5.5
    entranceTicks: 190,
    defeatBeatTicks: 100,
    doorFloorsAbove: 3,
    attacks: [
        {
            id: 'wall-saws',
            kind: 'swarm',
            telegraphTicks: 66, // the walls whirr before the teeth arrive
            swarmCount: 2,
            swarmSkin: 'saw',
            swarmPattern: 'wall', // hazards riding the routing surfaces
            swarmLifeTicks: 380,
            swarmScale: 0.6,
        },
        {
            id: 'crosswind',
            kind: 'gust',
            telegraphTicks: 72, // streaks cross the arena, then the push
            gustAccelX: 750,
            gustDurationTicks: 160,
        },
        {
            id: 'surgical-cut',
            kind: 'crumble_volley',
            telegraphTicks: 84, // glow, then exactly two ledges are gone
            platformCount: 2,
            bandFloors: [2, 6],
        },
    ],
    phases: [
        {
            // The metronome states its theme: saws, then wind.
            cadenceTicks: 240, // 4s, FIXED — learnable by design
            cadenceJitterTicks: 0,
            pattern: ['wall-saws', 'crosswind'],
            sustainedOpenness: false,
        },
        {
            // The cuts join the rhythm; the beat holds.
            cadenceTicks: 210,
            cadenceJitterTicks: 0,
            pattern: ['wall-saws', 'surgical-cut', 'crosswind'],
            sustainedOpenness: false,
        },
        {
            // Full arrangement, faster tempo — same song, no surprises.
            cadenceTicks: 180,
            cadenceJitterTicks: 0,
            pattern: ['surgical-cut', 'wall-saws', 'crosswind', 'surgical-cut'],
            sustainedOpenness: false,
        },
    ],
    presentation: {
        frameSet: 'saw', // manifest id — saws do not squash; flat maps to rest there
        phaseTints: [0xffffff, 0xe8cfa8, 0xc9a878],
        epithet: 'WARDEN OF THE DUNE UPDRAFT',
    },
};
