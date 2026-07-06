import { describe, expect, test } from 'vitest';

describe.sequential('legacy proof harnesses', () => {
    test('map sweep remains green', async () => {
        await expect(import('../harness/map.harness')).resolves.toBeDefined();
    }, 60_000);

    test('EXAM remains green', async () => {
        await expect(import('../src/cli/exam-harness')).resolves.toBeDefined();
    }, 60_000);

    test('RETURN remains green', async () => {
        await expect(import('../harness/return.harness')).resolves.toBeDefined();
    }, 60_000);

    test('difficulty sweep remains green', async () => {
        await expect(import('../harness/difficulty.harness')).resolves.toBeDefined();
    }, 60_000);
});
