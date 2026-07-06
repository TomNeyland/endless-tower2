/**
 * Mystery events — short PG risk/reward choices as data, resolved by the
 * node's PRE-ROLLED outcome (seeded at map generation from
 * `mystery:<nodeId>`; no meta-RNG, ever). Effects speak the run's existing
 * vocabulary: coins, hearts, and the one gift modifier — never score (score
 * has one authority) and never a killing blow (heart loss floors at 1;
 * mercy is the run's law, pillar 1).
 */

export interface MysteryEffect {
    coinsDelta?: number;
    /** Applied clamped to [1, hearts.max] — a mystery never ends a run. */
    heartsDelta?: number;
    /** A gift modifier folded into the next climbable commit. */
    giftModifierId?: string;
    /** The outcome, told in one sentence on the toast. */
    text: string;
}

export interface MysteryChoice {
    label: string;
    /**
     * Outcomes by ascending roll threshold: the pre-rolled value picks the
     * first entry whose `below` exceeds it. A single entry with below: 1 is
     * a certain outcome.
     */
    outcomes: { below: number; effect: MysteryEffect }[];
}

export interface MysteryEvent {
    id: string;
    title: string;
    prompt: string;
    choices: MysteryChoice[];
}

export const MYSTERY_EVENTS: readonly MysteryEvent[] = [
    {
        id: 'dusty_vault',
        title: 'The Dusty Vault',
        prompt: 'Loose bricks hide a sealed alcove. Something glints inside.',
        choices: [
            {
                label: 'Pry it open',
                outcomes: [
                    {
                        below: 0.6,
                        effect: { coinsDelta: 45, text: 'A forgotten purse — 45 coins.' },
                    },
                    { below: 1, effect: { coinsDelta: 0, text: 'Moths. A great many moths.' } },
                ],
            },
            {
                label: 'Leave it sealed',
                outcomes: [{ below: 1, effect: { text: 'Some doors stay shut. You climb on.' } }],
            },
        ],
    },
    {
        id: 'warm_hearth',
        title: 'The Warm Hearth',
        prompt: 'A kettle steams beside an open window. Nobody seems to mind.',
        choices: [
            {
                label: 'Rest a while',
                outcomes: [
                    { below: 1, effect: { heartsDelta: 1, text: 'Warmth returns. +1 heart.' } },
                ],
            },
            {
                label: 'Pocket the silverware',
                outcomes: [{ below: 1, effect: { coinsDelta: 25, text: 'Shameless. +25 coins.' } }],
            },
        ],
    },
    {
        id: 'updraft_shrine',
        title: 'The Updraft Shrine',
        prompt: 'A stone shrine hums with rising air. An offering bowl sits empty.',
        choices: [
            {
                label: 'Attune to the wind',
                outcomes: [
                    {
                        below: 1,
                        effect: {
                            giftModifierId: 'double_fuse',
                            text: 'The wind promises patience: Double Fuse rides your next climb.',
                        },
                    },
                ],
            },
            {
                label: 'Offer 15 coins',
                outcomes: [
                    {
                        below: 1,
                        effect: {
                            coinsDelta: -15,
                            heartsDelta: 1,
                            text: 'The shrine glows. +1 heart.',
                        },
                    },
                ],
            },
        ],
    },
    {
        id: 'rickety_lift',
        title: 'The Rickety Lift',
        prompt: 'A freight lift creaks on a frayed rope. The winch still turns.',
        choices: [
            {
                label: 'Ride it up',
                outcomes: [
                    {
                        below: 0.5,
                        effect: {
                            coinsDelta: 60,
                            text: 'It holds — and hauls a coin crate with you. +60 coins.',
                        },
                    },
                    {
                        below: 1,
                        effect: {
                            heartsDelta: -1,
                            text: 'The rope snaps. You catch a ledge, barely. −1 heart.',
                        },
                    },
                ],
            },
            {
                label: 'Take the stairs',
                outcomes: [
                    {
                        below: 1,
                        effect: {
                            coinsDelta: 10,
                            text: 'Slow and steady finds a dropped pouch. +10 coins.',
                        },
                    },
                ],
            },
        ],
    },
    {
        id: 'echo_well',
        title: 'The Echo Well',
        prompt: 'A wishing well sunk into the tower wall. Coins glitter far below.',
        choices: [
            {
                label: 'Drop a coin in',
                outcomes: [
                    {
                        below: 0.65,
                        effect: {
                            coinsDelta: 49,
                            text: 'The well approves — a jackpot echoes back. +49 coins.',
                        },
                    },
                    {
                        below: 1,
                        effect: {
                            coinsDelta: -1,
                            text: 'Plink. Silence. The well keeps your coin.',
                        },
                    },
                ],
            },
            {
                label: 'Walk on',
                outcomes: [{ below: 1, effect: { text: 'You keep your coins and your dignity.' } }],
            },
        ],
    },
    {
        id: 'old_climber',
        title: 'The Old Climber',
        prompt: 'A retired climber mends a rope by lamplight and waves you over.',
        choices: [
            {
                label: 'Listen to route wisdom',
                outcomes: [
                    {
                        below: 1,
                        effect: {
                            giftModifierId: 'double_fuse',
                            text: '"Breathe between landings." Double Fuse rides your next climb.',
                        },
                    },
                ],
            },
            {
                label: 'Trade supplies (−20 coins)',
                outcomes: [
                    {
                        below: 1,
                        effect: {
                            coinsDelta: -20,
                            heartsDelta: 1,
                            text: 'Bandages and tea. +1 heart.',
                        },
                    },
                ],
            },
        ],
    },
    {
        id: 'cracked_hourglass',
        title: 'The Cracked Hourglass',
        prompt: 'An enormous hourglass leaks sand through a hairline crack.',
        choices: [
            {
                label: 'Flip it',
                outcomes: [
                    {
                        below: 0.5,
                        effect: {
                            coinsDelta: 35,
                            text: 'Coins pour out with the sand. +35 coins.',
                        },
                    },
                    {
                        below: 1,
                        effect: {
                            coinsDelta: -20,
                            text: 'Your pocket seams split on the glass. −20 coins.',
                        },
                    },
                ],
            },
            {
                label: 'Let it run',
                outcomes: [
                    { below: 1, effect: { text: 'Time keeps its own counsel. You climb on.' } },
                ],
            },
        ],
    },
] as const;

const byId = new Map(MYSTERY_EVENTS.map((e) => [e.id, e]));

export function mysteryEventById(id: string): MysteryEvent {
    const event = byId.get(id);
    if (!event) {
        throw new Error(`mystery: unknown event ${id}`);
    }
    return event;
}

/**
 * The choice's worst-case coin charge — the stake a wallet must cover
 * before the choice may be taken. Every coin figure a mystery prints (a
 * label's "Offer 15 coins", an outcome's "−20 coins") must be chargeable
 * in full: resolving below the printed number is a lie on the label
 * (pillar 2 — the price tag is real, and DEVIATIONS entry 10's reasoning).
 * The overlay disables choices whose stake exceeds the wallet; zero-stake
 * choices (gains, free outs, heart gambles) are never gated.
 */
export function choiceCoinStake(choice: MysteryChoice): number {
    let stake = 0;
    for (const outcome of choice.outcomes) {
        const delta = outcome.effect.coinsDelta;
        if (delta !== undefined && delta < 0) {
            stake = Math.max(stake, -delta);
        }
    }
    return stake;
}

/** Resolve a choice against the node's pre-rolled value — pure and seeded. */
export function resolveMystery(
    event: MysteryEvent,
    choiceIndex: number,
    roll: number,
): MysteryEffect {
    const choice = event.choices[choiceIndex];
    if (!choice) {
        throw new Error(`mystery: ${event.id} has no choice ${choiceIndex}`);
    }
    for (const outcome of choice.outcomes) {
        if (roll < outcome.below) {
            return outcome.effect;
        }
    }
    throw new Error(
        `mystery: ${event.id} choice ${choiceIndex} thresholds do not cover roll ${roll}`,
    );
}

function fail(id: string, why: string): never {
    throw new Error(`mystery: degenerate event ${id} (${why})`);
}

/** Data validation — throws at load on degenerate events (the roster law). */
export function validateMysteryEvents(events: readonly MysteryEvent[]): void {
    const seen = new Set<string>();
    for (const e of events) {
        if (seen.has(e.id)) {
            fail(e.id, 'duplicate id');
        }
        seen.add(e.id);
        if (e.choices.length < 2) {
            fail(e.id, 'a mystery with one choice is a toll, not a choice');
        }
        if (!e.choices.some((c) => choiceCoinStake(c) === 0)) {
            fail(e.id, 'no zero-stake choice — a poor climber must always have a way out');
        }
        for (const choice of e.choices) {
            if (choice.outcomes.length === 0) {
                fail(e.id, 'choice with no outcomes');
            }
            let prev = 0;
            for (const o of choice.outcomes) {
                if (o.below <= prev) {
                    fail(e.id, 'outcome thresholds must be strictly ascending');
                }
                prev = o.below;
            }
            if (prev !== 1) {
                fail(e.id, 'outcome thresholds must end at 1 (cover every roll)');
            }
            for (const o of choice.outcomes) {
                if (o.effect.heartsDelta !== undefined && Math.abs(o.effect.heartsDelta) > 1) {
                    fail(e.id, 'heart swings beyond ±1 are not "light"');
                }
            }
        }
    }
}

validateMysteryEvents(MYSTERY_EVENTS);
