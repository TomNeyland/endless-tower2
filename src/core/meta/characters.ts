/**
 * The five characters (docs/design/meta-progression.md) — permanent personal
 * tuning layers, balanced SIDEWAYS, never upward. A character is a build you
 * were born with: its traits ride the same TuningStack substrate relics and
 * modifiers use, owner-tagged `character:<id>` and folded in the base band
 * (before segment/powerup/boss layers — the character is closer to base
 * physics than anything the run adds on top).
 *
 * The thesis is law: NOTHING here makes a character stronger. Every trait
 * pair prices what it pays — Green keeps more but builds slower, Pink's
 * walls love her but her jumps spend more, Purple floats higher and breaks
 * sooner, Yellow's hands are faster under a hotter clock. If playtest ever
 * shows a strictly-best color, the balance failed (the museum's
 * per-character boards are the tell).
 */
import { validateLayerSpecs } from '../relics/effects';
import type { RelicLayerSpec } from '../relics/types';
import type { TuningStack } from '../tuning';

export type CharacterId = 'beige' | 'green' | 'pink' | 'purple' | 'yellow';

export interface CharacterDef {
    id: CharacterId;
    /** Display name — the Kenney color, worn proudly. */
    name: string;
    /** The epithet: "the Classic", "the Glider"... */
    epithet: string;
    /** One-line trait text for the select row and unlock cards. */
    traitLine: string;
    /** Permanent personal tuning layers (empty = the baseline). */
    layers: RelicLayerSpec[];
    /** Feat that unlocks this character; null = always unlocked (Beige). */
    unlockFeat: string | null;
}

export const DEFAULT_CHARACTER_ID: CharacterId = 'beige';

export const CHARACTERS: readonly CharacterDef[] = [
    {
        id: 'beige',
        name: 'BEIGE',
        epithet: 'the Classic',
        traitLine: 'the baseline — every number at its home value',
        layers: [],
        unlockFeat: null,
    },
    {
        id: 'green',
        name: 'GREEN',
        epithet: 'the Glider',
        traitLine: 'drag ×0.7, accel ×0.9 — keeps more, builds slower',
        layers: [
            { key: 'GROUND_DRAG', op: 'mul', value: 0.7 },
            { key: 'RUN_ACCEL_LOW', op: 'mul', value: 0.9 },
            { key: 'RUN_ACCEL_HIGH', op: 'mul', value: 0.9 },
        ],
        unlockFeat: 'bank-comet',
    },
    {
        id: 'pink',
        name: 'PINK',
        epithet: 'the Rebounder',
        traitLine: 'flip grace ×1.5, retention −0.04 — walls love you, jumps spend more',
        layers: [
            { key: 'STICK_FLIP_GRACE_MS', op: 'mul', value: 1.5 },
            { key: 'JUMP_RETENTION', op: 'add', value: -0.04 },
        ],
        unlockFeat: 'bounce-25-segment',
    },
    {
        id: 'purple',
        name: 'PURPLE',
        epithet: 'the Featherweight',
        traitLine: 'gravity ×0.9, max hearts −1 — floats higher, breaks sooner',
        layers: [
            // GRAVITY_RISE scales the whole gravity family (fall gravity is
            // rise × GRAVITY_FALL_MULT) — the same shape Low Gravity uses.
            { key: 'GRAVITY_RISE', op: 'mul', value: 0.9 },
            // hearts.max floors at 1 by validation (playthrough-trace.md
            // finding 7): this trait can never stack a build to zero.
            { key: 'hearts.max', op: 'add', value: -1 },
        ],
        unlockFeat: 'clean-act',
    },
    {
        id: 'yellow',
        name: 'YELLOW',
        epithet: 'the Sprinter',
        traitLine: 'accel ×1.15, grace fuse −12 ticks — faster hands, hotter clock',
        layers: [
            { key: 'RUN_ACCEL_LOW', op: 'mul', value: 1.15 },
            { key: 'RUN_ACCEL_HIGH', op: 'mul', value: 1.15 },
            { key: 'combo.groundGraceTicks', op: 'add', value: -12 },
        ],
        unlockFeat: 'touch-ceiling',
    },
] as const;

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

/** Lookup that fails loud — an unknown character id is a bug, never a shrug. */
export function characterById(id: string): CharacterDef {
    const character = BY_ID.get(id as CharacterId);
    if (!character) {
        throw new Error(`characters: unknown character id "${id}"`);
    }
    return character;
}

/**
 * Push a character's permanent layers (owner `character:<id>`). Runs the
 * same layer-spec validation relics use — the hard cap is engine safety for
 * characters too — then the stack's own resolved-table validation throws on
 * degenerates (hearts.max below 1 included).
 */
export function applyCharacterLayers(
    character: CharacterDef,
    tuning: TuningStack,
    tick: number,
): number {
    validateLayerSpecs(`character:${character.id}`, character.layers);
    character.layers.forEach((spec, i) => {
        tuning.pushLayer({
            id: `character:${character.id}:${i}`,
            owner: `character:${character.id}`,
            key: spec.key,
            op: spec.op,
            value: spec.value,
            tick,
        });
    });
    return character.layers.length;
}

/** Roster validation — throws at module load (a data typo fails loud). */
export function validateCharacterRoster(roster: readonly CharacterDef[]): void {
    const seen = new Set<string>();
    let baselines = 0;
    for (const c of roster) {
        if (seen.has(c.id)) {
            throw new Error(`characters: duplicate id ${c.id}`);
        }
        seen.add(c.id);
        if (c.unlockFeat === null) {
            baselines += 1;
            if (c.layers.length > 0) {
                throw new Error(`characters: the always-unlocked baseline must carry no layers`);
            }
        }
        validateLayerSpecs(`character:${c.id}`, c.layers);
    }
    if (baselines !== 1) {
        throw new Error(`characters: exactly one always-unlocked baseline expected, ${baselines}`);
    }
}

validateCharacterRoster(CHARACTERS);
