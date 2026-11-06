import test from 'node:test';
import assert from 'node:assert/strict';
import { findSplitPairs } from '../../split-rows.js';

const tabs = [
    { id: 1, splitViewId: -1 }, { id: 2, splitViewId: 5 }, { id: 3, splitViewId: 8 },
    { id: 4, splitViewId: 5 }, { id: 6, splitViewId: 8 }, { id: 7 }
];

test('rows that share a split view pair up, the first row leading', () => {
    assert.deepEqual(findSplitPairs([1, 2, 3, 4, 6, 7], tabs), [{ lead: 2, partner: 4 }, { lead: 3, partner: 6 }]);
    assert.deepEqual(findSplitPairs([4, 2], tabs), [{ lead: 4, partner: 2 }]);
});

test('a split tab whose partner has no row stays a normal row', () => {
    assert.deepEqual(findSplitPairs([2, 3, 1], tabs), []);
});

test('a row listed twice does not pair with itself', () => {
    assert.deepEqual(findSplitPairs([2, 2, 1], tabs), []);
});
