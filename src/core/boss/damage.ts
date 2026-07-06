/**
 * Bank → damage conversion and boss health (docs/design/bosses.md), per the
 * frozen consumer contract: BOSSES consume `combo/banked` directly — damage
 * is their own f(payout, chainFloors, mult, tierReached) — and consumers
 * scale with payload values, never event counts. The shipped curve is
 * deliberately flat (`damage = payout × boss.damagePerPoint`, openness
 * ×boss.opennessMult) with every axis exposed for later curving; forty
 * 2-floor fizzle banks still lose to one COMET bank because the quadratic
 * already priced that (the exploit sweep's own ruling).
 *
 * Loudness classes share the bank boundaries (`hud.bankWhisper/Voice`) —
 * one vocabulary of loud across HUD, audio, and the boss's body.
 */
import type { ComboBankedEvent } from '../combo/types';
import type { BossHitLoudness } from '../events';
import type { TuningStack } from '../tuning';
import type { BossDef } from './types';

export interface BankRef {
    payout: number;
    chainFloors: number;
    mult: number;
    tier: number;
}

export interface BossHitResult {
    damage: number;
    hpRemaining: number;
    hpMax: number;
    bankRef: BankRef;
    loudness: BossHitLoudness;
    openness: boolean;
    /** 1-3 after this hit; a crossed threshold reports the NEW phase. */
    phase: number;
    phaseTurned: boolean;
    defeated: boolean;
}

export function bankLoudness(payout: number, t: TuningStack): BossHitLoudness {
    if (payout < t.value('hud.bankWhisper')) {
        return 'whisper';
    }
    return payout < t.value('hud.bankVoice') ? 'voice' : 'roar';
}

/** The one damage formula — pure, every axis from the table. */
export function bankDamage(payout: number, openness: boolean, t: TuningStack): number {
    const base = payout * t.value('boss.damagePerPoint');
    return Math.round(openness ? base * t.value('boss.opennessMult') : base);
}

/** HP budget in expected banks, priced by the reference decent bank. */
export function bossHpFor(def: BossDef, t: TuningStack): number {
    return Math.round(def.hpBanks * t.value('boss.decentBankPayout'));
}

export function phaseForHp(hp: number, hpMax: number): number {
    const frac = hp / hpMax;
    if (frac > 2 / 3) {
        return 1;
    }
    return frac > 1 / 3 ? 2 : 3;
}

/** Boss health bookkeeping: hp, phase crossings, duel stats. Pure state —
 *  the brain schedules, the health counts, the game layer narrates. */
export class BossHealth {
    readonly hpMax: number;
    private hp: number;
    private _banks = 0;
    private _biggestHit = 0;

    constructor(def: BossDef, t: TuningStack) {
        this.hpMax = bossHpFor(def, t);
        this.hp = this.hpMax;
    }

    hpRemaining(): number {
        return this.hp;
    }

    hpFrac(): number {
        return this.hp / this.hpMax;
    }

    phase(): number {
        return this.hp <= 0 ? 3 : phaseForHp(this.hp, this.hpMax);
    }

    defeated(): boolean {
        return this.hp <= 0;
    }

    banks(): number {
        return this._banks;
    }

    biggestHit(): number {
        return this._biggestHit;
    }

    /** Apply a bank. Banks after defeat are a caller bug — the duel ended. */
    applyBank(bank: ComboBankedEvent, openness: boolean, t: TuningStack): BossHitResult {
        if (this.defeated()) {
            throw new Error('boss: bank applied after defeat');
        }
        const phaseBefore = this.phase();
        const damage = bankDamage(bank.payout, openness, t);
        this.hp = Math.max(0, this.hp - damage);
        this._banks += 1;
        this._biggestHit = Math.max(this._biggestHit, damage);
        const phase = this.phase();
        return {
            damage,
            hpRemaining: this.hp,
            hpMax: this.hpMax,
            bankRef: {
                payout: bank.payout,
                chainFloors: bank.chainFloors,
                mult: bank.mult,
                tier: bank.tierReached,
            },
            loudness: bankLoudness(bank.payout, t),
            openness,
            phase,
            phaseTurned: phase !== phaseBefore && this.hp > 0,
            defeated: this.hp <= 0,
        };
    }

    /** Debug-bridge hp pin (harness). Never a gameplay surface. */
    debugSetHp(hp: number): void {
        if (!Number.isFinite(hp) || hp < 0 || hp > this.hpMax) {
            throw new Error(`boss: debugSetHp(${hp}) outside [0, ${this.hpMax}]`);
        }
        this.hp = hp;
    }
}
