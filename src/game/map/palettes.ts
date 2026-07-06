/**
 * Per-act map palettes (art-direction.md's mood table, amended ruling 9:
 * the map renders in the act's OWN palette — morning, dusk, night — and the
 * window lights are a UI glow layer that reads at any hour). Data, like all
 * constants.
 */

export interface ActPalette {
    name: string;
    mood: string;
    skyTop: number;
    skyBottom: number;
    /** Far silhouettes: hills, dunes, peaks. */
    far: number;
    towerFill: number;
    towerEdge: number;
    /** The lit window pane. */
    windowLit: number;
    /** The UI glow layer around windows — bright at any hour. */
    glow: number;
    /** Taken-path warm trail. */
    trail: number;
    /** Faint un-taken edges. */
    edgeLine: number;
    text: string;
    textDim: string;
    stars: boolean;
}

export const ACT_PALETTES: Record<number, ActPalette> = {
    1: {
        name: 'MEADOW ASCENT',
        mood: 'bright morning',
        skyTop: 0x7fc4ea,
        skyBottom: 0xf6e3bc,
        far: 0x92b56d,
        towerFill: 0x3e4a40,
        towerEdge: 0x5a6b58,
        windowLit: 0xffd77a,
        glow: 0xffc75a,
        trail: 0xffb03a,
        edgeLine: 0xe8f4ff,
        text: '#fff6e0',
        textDim: '#d7e3d0',
        stars: false,
    },
    2: {
        name: 'DUNE UPDRAFT',
        mood: 'burning dusk',
        skyTop: 0x3d2a55,
        skyBottom: 0xff9440,
        far: 0x8a5a33,
        towerFill: 0x43301f,
        towerEdge: 0x6b4a2c,
        windowLit: 0xffc46b,
        glow: 0xff9d3f,
        trail: 0xffa14e,
        edgeLine: 0xffd9a8,
        text: '#ffe9cf',
        textDim: '#d9b894',
        stars: false,
    },
    3: {
        name: 'VIOLET SUMMIT',
        mood: 'starlit night',
        skyTop: 0x0c0920,
        skyBottom: 0x2c1a4d,
        far: 0x1d1535,
        towerFill: 0x241a3a,
        towerEdge: 0x453064,
        windowLit: 0xd9b8ff,
        glow: 0xb98cff,
        trail: 0xcf9aff,
        edgeLine: 0x9d86c8,
        text: '#efe4ff',
        textDim: '#a998cc',
        stars: true,
    },
};

export function actPalette(actIndex: number): ActPalette {
    const palette = ACT_PALETTES[actIndex];
    if (!palette) {
        throw new Error(`palettes: no act ${actIndex}`);
    }
    return palette;
}
