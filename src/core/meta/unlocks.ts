/**
 * The unlock registry (docs/design/meta-progression.md): which feat grants
 * what, which relics/modifiers/characters are initial vs unlockable, and the
 * pool-filtering the shops and the map generator consume.
 *
 * The thesis is law: unlocks add BREADTH, never strength — 16 of the 24
 * roster relics are available from install (a full, winnable game); the 8
 * marked unlockable are the tools of brokenness, earned by approaching
 * brokenness (Compounder arrives on a SUPERNOVA bank). The last 3 map
 * modifiers unlock via act completions, keeping early maps simpler by
 * construction. Dense Fog and Surging Line stay data-only behind their
 * `rollable` flags; meta gating composes on top and never touches those
 * implementation flips.
 */
import { modifierById, rollableModifiers } from '../map/modifiers';
import type { ModifierSpec } from '../map/types';
import { RELICS, relicById } from '../relics/roster';
import type { RelicDef } from '../relics/types';
import { CHARACTERS, characterById } from './characters';
import { featById } from './feats';

export type UnlockKind = 'character' | 'relic' | 'modifier';

export interface UnlockGrant {
    kind: UnlockKind;
    id: string;
}

/**
 * The 8 unlockable relics — every rare, the legendary, and the escrow
 * doubler: the roster's local-breakers and run-redefiners. What remains
 * initial is the full tuning-and-bending band (all commons, all but one
 * uncommon): 16 relics, every archetype represented from install.
 */
export const UNLOCKABLE_RELICS: readonly string[] = [
    'compounder',
    'momentum-lock',
    'wall-charger',
    'skyhook',
    'launch-pad',
    'second-wind',
    'fireproof',
    'echo-walls',
];

/** The last 3 map modifiers — the winds and the pinch arrive with mastery. */
export const UNLOCKABLE_MODIFIERS: readonly string[] = ['narrow_ledges', 'headwind', 'tailwind'];

/** featId -> what it grants. Character grants derive from the roster. */
const RELIC_GRANTS: Record<string, string> = {
    'bank-supernova': 'compounder',
    'uptime-half': 'momentum-lock',
    'perfect-five': 'wall-charger',
    'leap-six': 'skyhook',
    'mult-three': 'launch-pad',
    'hard-way-out': 'second-wind',
    'bank-meteoric': 'fireproof',
    'deep-drink': 'echo-walls',
};

const MODIFIER_GRANTS: Record<string, string> = {
    'act1-complete': 'narrow_ledges',
    'act2-complete': 'headwind',
    'act3-complete': 'tailwind',
};

function buildGrantTable(): Map<string, UnlockGrant> {
    const grants = new Map<string, UnlockGrant>();
    const putOnce = (featId: string, grant: UnlockGrant): void => {
        featById(featId); // throws on unknown feat
        if (grants.has(featId)) {
            throw new Error(`unlocks: feat ${featId} grants twice`);
        }
        grants.set(featId, grant);
    };
    for (const character of CHARACTERS) {
        if (character.unlockFeat !== null) {
            putOnce(character.unlockFeat, { kind: 'character', id: character.id });
        }
    }
    for (const [featId, relicId] of Object.entries(RELIC_GRANTS)) {
        relicById(relicId); // throws on unknown relic
        putOnce(featId, { kind: 'relic', id: relicId });
    }
    for (const [featId, modifierId] of Object.entries(MODIFIER_GRANTS)) {
        modifierById(modifierId); // throws on unknown modifier
        putOnce(featId, { kind: 'modifier', id: modifierId });
    }
    return grants;
}

const GRANTS = buildGrantTable();

/** What a feat grants; null for feats that are trophies only. */
export function grantForFeat(featId: string): UnlockGrant | null {
    featById(featId); // unknown feat ids fail loud
    return GRANTS.get(featId) ?? null;
}

const UNLOCKABLE_RELIC_SET = new Set(UNLOCKABLE_RELICS);
const UNLOCKABLE_MODIFIER_SET = new Set(UNLOCKABLE_MODIFIERS);

/**
 * The relic pool a save can roll from: the 16 initials plus every unlockable
 * the save has earned. Shops and elite rewards consume this — pool size is
 * the breadth axis, never a stat.
 */
export function relicPool(unlockedRelicIds: ReadonlyArray<string>): RelicDef[] {
    const unlocked = new Set(unlockedRelicIds);
    return RELICS.filter((r) => !UNLOCKABLE_RELIC_SET.has(r.id) || unlocked.has(r.id));
}

/**
 * The modifier pool the map generator rolls from: rollable roster entries
 * minus the meta-locked three the save has not yet earned. Composes over the
 * roster's own `rollable` state — a data-only modifier stays out regardless.
 */
export function modifierPool(unlockedModifierIds: ReadonlyArray<string>): ModifierSpec[] {
    const unlocked = new Set(unlockedModifierIds);
    return rollableModifiers().filter(
        (m) => !UNLOCKABLE_MODIFIER_SET.has(m.id) || unlocked.has(m.id),
    );
}

/** Character availability: the baseline plus earned grants. */
export function characterUnlocked(
    characterId: string,
    unlockedCharacterIds: ReadonlyArray<string>,
): boolean {
    const character = characterById(characterId);
    return character.unlockFeat === null || unlockedCharacterIds.includes(character.id);
}

/** Registry validation — throws at module load on any dangling reference. */
export function validateUnlockRegistry(): void {
    for (const id of UNLOCKABLE_RELICS) {
        relicById(id);
        if (![...GRANTS.values()].some((g) => g.kind === 'relic' && g.id === id)) {
            throw new Error(`unlocks: unlockable relic ${id} has no granting feat`);
        }
    }
    for (const id of UNLOCKABLE_MODIFIERS) {
        modifierById(id);
        if (![...GRANTS.values()].some((g) => g.kind === 'modifier' && g.id === id)) {
            throw new Error(`unlocks: unlockable modifier ${id} has no granting feat`);
        }
    }
    for (const character of CHARACTERS) {
        if (character.unlockFeat !== null && !GRANTS.has(character.unlockFeat)) {
            throw new Error(`unlocks: character ${character.id} feat not in the grant table`);
        }
    }
    const initialCount = relicPool([]).length;
    if (initialCount !== RELICS.length - UNLOCKABLE_RELICS.length) {
        throw new Error(
            `unlocks: initial relic pool is ${initialCount}, expected ` +
                `${RELICS.length - UNLOCKABLE_RELICS.length} (16-of-24 is the design's number)`,
        );
    }
}

validateUnlockRegistry();
