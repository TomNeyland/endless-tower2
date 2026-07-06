import { describe, expect, test } from 'vitest';
import {
    freshSave,
    loadSaveDocument,
    MIGRATIONS,
    SAVE_SCHEMA_VERSION,
    serializeSave,
} from '../../src/core/persist/save';

describe('save schema', () => {
    test('the current document round-trips exactly', () => {
        const doc = freshSave();
        const loaded = loadSaveDocument(serializeSave(doc));
        expect(loaded.outcome).toBe('loaded');
        expect(loaded.writable).toBe(true);
        expect(loaded.doc).toEqual(doc);
    });

    test('corrupt current data is rejected and a future schema is never writable', () => {
        const corrupt = loadSaveDocument(JSON.stringify({ version: SAVE_SCHEMA_VERSION }));
        expect(corrupt.outcome).toBe('fresh-corrupt');
        expect(corrupt.warning).not.toBeNull();

        const future = loadSaveDocument(JSON.stringify({ version: SAVE_SCHEMA_VERSION + 1 }));
        expect(future.outcome).toBe('refused-future');
        expect(future.writable).toBe(false);
    });

    test('every schema bump requires an explicit migration entry', () => {
        expect(Object.keys(MIGRATIONS)).toHaveLength(SAVE_SCHEMA_VERSION - 1);
    });
});
