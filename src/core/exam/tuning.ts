/**
 * DEFAULT_EXAM_TUNING — the EXAM-phase rows (boss damage conversion, the
 * openness window, land-classification physics, the wind force, the swarm),
 * merged into the movement TuningTable exactly like the combo and identity
 * rows so relics and modifiers reprice the duel with zero new plumbing — and
 * the validation that THROWS on degenerate values at layer-push time (the
 * economist law, third application).
 *
 * The frozen contract (combo-scoring.md): bosses consume `combo/banked` and
 * apply their own curve over the exposed axes — `boss.damagePerPoint` is
 * that curve's first coefficient, deliberately flat at 1 until relic-era
 * playtests demand shape. HP budgets are sized in expected boss-strike banks
 * (bosses.md): `hp = def.hpBanks × boss.decentBankPayout`. Early live play
 * showed the raw 25-floor ×2 chain was too soft a reference once openness
 * and arena-length chains entered; the row now prices the bank that should
 * visibly move a boss without deleting the tutorial.
 */

export const DEFAULT_EXAM_TUNING = {
    // --- The frozen damage contract (bosses.md: all axes readable) ---
    'boss.damagePerPoint': 1, // damage = payout × this; EXAM's own curve knob
    'boss.decentBankPayout': 30000, // reference boss-strike bank (hp = hpBanks × this)
    'boss.opennessMs': 2500, // the stance-change window after each attack resolves
    'boss.opennessMult': 1.5, // damage multiplier inside the window — a bonus, not a gate
    // --- Land classifications (movement.md Amendment 1c, landed) ---
    'land.stickyKeep': 0.7, // vx multiplier on a sticky landing: −30% speed, the goo drinks
    'land.crumbleDelayTicks': 42, // glow-before-collapse after a crumble ledge is touched (0.7s)
    // --- The wind: a world force in the air, never a hand on the input ---
    'wind.accelX': 0, // px/s² applied airborne; gusts push it via boss:<attackId> layers
    // --- The swarm: moving obstacles that tax momentum, never hearts ---
    'exam.swarmSpeedKeep': 0.75, // vx multiplier when a critter connects
    'exam.swarmHitCooldownTicks': 45, // per-critter re-hit lockout (0.75s)
    'exam.swarmRadiusPx': 52, // contact radius around a critter's center
} satisfies Record<string, number>;

export type ExamTuningKey = keyof typeof DEFAULT_EXAM_TUNING;

function fail(key: string, value: number, why: string): never {
    throw new Error(`exam tuning degenerate: ${key} = ${value} (${why})`);
}

/**
 * Throws on degenerate effective values. Called by TuningStack.pushLayer on
 * the post-push effective table, alongside the combo/identity validations.
 */
export function validateExamTuning(t: Record<string, number>): void {
    const v = (key: ExamTuningKey): number => t[key];

    if (v('boss.damagePerPoint') <= 0) {
        fail('boss.damagePerPoint', v('boss.damagePerPoint'), 'banks must damage the boss');
    }
    if (v('boss.decentBankPayout') <= 0) {
        fail('boss.decentBankPayout', v('boss.decentBankPayout'), 'hp budget needs a reference');
    }
    if (v('boss.opennessMs') < 0) {
        fail('boss.opennessMs', v('boss.opennessMs'), 'negative window');
    }
    if (v('boss.opennessMult') < 1) {
        fail('boss.opennessMult', v('boss.opennessMult'), 'openness must reward, never punish');
    }
    const keep = v('land.stickyKeep');
    if (keep <= 0 || keep > 1) {
        fail('land.stickyKeep', keep, 'sticky keeps a fraction of speed in (0, 1]');
    }
    if (v('land.crumbleDelayTicks') < 1) {
        fail('land.crumbleDelayTicks', v('land.crumbleDelayTicks'), 'the glow must exist');
    }
    if (!Number.isFinite(v('wind.accelX'))) {
        fail('wind.accelX', v('wind.accelX'), 'non-finite wind');
    }
    const swarmKeep = v('exam.swarmSpeedKeep');
    if (swarmKeep <= 0 || swarmKeep > 1) {
        fail('exam.swarmSpeedKeep', swarmKeep, 'critters tax a fraction of speed in (0, 1]');
    }
    if (v('exam.swarmHitCooldownTicks') < 1) {
        fail(
            'exam.swarmHitCooldownTicks',
            v('exam.swarmHitCooldownTicks'),
            'per-tick drains would delete momentum',
        );
    }
    if (v('exam.swarmRadiusPx') <= 0) {
        fail('exam.swarmRadiusPx', v('exam.swarmRadiusPx'), 'a contactless obstacle is a lie');
    }
}
