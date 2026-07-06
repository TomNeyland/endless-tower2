/**
 * Passive swarm seeding for the CHOICE Swarm modifier. This is not a second
 * hazard system: it writes initial critters into the same SwarmRuntime that
 * boss attacks command and the replay loop re-steps.
 */
import type { SegmentSpec, SegmentSwarmSpec } from '../pressure/segment';
import { fork, range, type Rng } from '../rng';
import type { PlatformSpec, TowerLayout } from '../tower';
import type { TuningStack } from '../tuning';
import type { SwarmRuntime, SwarmSpawn } from './swarm';

function platformFloor(platform: PlatformSpec, layout: TowerLayout, floorH: number): number {
    return Math.floor((layout.groundTopY - platform.topY) / floorH + 1e-6);
}

function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function passiveCandidates(
    layout: TowerLayout,
    segment: SegmentSpec,
    floorH: number,
): PlatformSpec[] {
    return layout.platforms.filter((p) => {
        const floor = platformFloor(p, layout, floorH);
        return p.id !== 0 && floor >= 3 && floor <= segment.floors - 2;
    });
}

function passiveSpawn(
    spec: SegmentSwarmSpec,
    platform: PlatformSpec,
    index: number,
    rng: Rng,
    t: TuningStack,
): SwarmSpawn {
    const amp = t.value('exam.passiveSwarmAmpX') * range(rng, 0.75, 1.25);
    const omegaSign = rng() < 0.5 ? -1 : 1;
    return {
        critterId: -(index + 1),
        skin: spec.skin,
        pattern: 'drift',
        scale: t.value('exam.passiveSwarmScale'),
        radiusPx: t.value('exam.passiveSwarmRadiusPx'),
        x0: platform.xCenter,
        y0: platform.topY - t.value('exam.passiveSwarmFloatPx'),
        ampX: amp,
        omega: omegaSign * t.value('exam.passiveSwarmOmega'),
        phase: range(rng, 0, Math.PI * 2),
        vy: 0,
        lifeTicks: t.value('exam.passiveSwarmLifeTicks'),
        spawnTick: 0,
    };
}

export function seedPassiveSwarm(
    swarm: SwarmRuntime,
    layout: TowerLayout,
    segment: SegmentSpec,
    t: TuningStack,
): void {
    const spec = segment.swarm;
    if (spec === undefined) {
        return;
    }
    const count = Math.round(segment.floors * t.value('exam.passiveSwarmPerFloor'));
    if (count < 1) {
        throw new Error(`passive swarm: density produced ${count} critters`);
    }
    const candidates = passiveCandidates(layout, segment, t.value('FLOOR_HEIGHT_PX'));
    if (count > candidates.length) {
        throw new Error(
            `passive swarm: ${count} critters requested but only ${candidates.length} platforms can host them`,
        );
    }
    const rng = fork(spec.seed, 'passive-swarm');
    const picked = shuffle(rng, candidates).slice(0, count);
    for (let i = 0; i < picked.length; i += 1) {
        swarm.spawn(passiveSpawn(spec, picked[i], i, rng, t));
    }
}
