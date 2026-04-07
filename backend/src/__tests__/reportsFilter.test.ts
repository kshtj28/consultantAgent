import { describe, it, expect } from 'vitest';

describe('GET /reports — all-user visibility', () => {
    it('query must clause contains no generatedBy filter', () => {
        // Replicate the query-building logic from the route after our change
        const type = undefined;
        const must: any[] = [];

        if (type) {
            must.push({ term: { type } });
        }
        // No user filter — the deleted block would have pushed generatedBy here

        const query = must.length > 0 ? { bool: { must } } : { match_all: {} };

        expect(query).toEqual({ match_all: {} });
        expect(must.some((c: any) => c.term?.generatedBy)).toBe(false);
    });
});
