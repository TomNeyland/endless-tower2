/**
 * The boss roster — three act bosses as data, validated at module load
 * (a def typo fails loud before anything spawns it).
 */
import type { BossDef } from '../types';
import { validateBossDef } from '../types';
import { SLIME_SOVEREIGN } from './act1';
import { WHIRRING_WARDEN } from './act2';
import { SUMMIT_KEEPER } from './act3';

export { SLIME_SOVEREIGN } from './act1';
export { WHIRRING_WARDEN } from './act2';
export { SUMMIT_KEEPER } from './act3';

export const BOSS_ROSTER: readonly BossDef[] = [SLIME_SOVEREIGN, WHIRRING_WARDEN, SUMMIT_KEEPER];

const byId = new Map(BOSS_ROSTER.map((b) => [b.id, b]));

export function bossById(id: string): BossDef {
    const def = byId.get(id);
    if (!def) {
        throw new Error(`boss roster: unknown boss ${id}`);
    }
    return def;
}

/** The act's examiner — each act map's boss row commits to exactly this. */
export function bossForAct(act: number): BossDef {
    const def = BOSS_ROSTER.find((b) => b.act === act);
    if (!def) {
        throw new Error(`boss roster: no boss for act ${act}`);
    }
    return def;
}

// Fail loud at load — the roster is checked before anything rolls it.
for (const def of BOSS_ROSTER) {
    validateBossDef(def);
}
