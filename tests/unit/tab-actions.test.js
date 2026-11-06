import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateRow, getRowActions, indexBeside, openRowInSplit, splitTabs } from '../../tab-actions.js';

// A tab strip that enforces Chrome's split view rules.
function mockStrip(specs) {
    let strip = specs.map(spec => ({ windowId: 1, groupId: -1, splitViewId: -1, pinned: false, active: false, ...spec }));
    let nextId = 100, nextSplit = 1;
    const listeners = new Set();
    const assigned = [];
    const reindex = () => strip.forEach((tab, index) => { tab.index = index; });
    const find = id => {
        const tab = strip.find(t => t.id === id);
        if (!tab) throw new Error(`No tab with id: ${id}.`);
        return tab;
    };
    const insert = (tab, index) => { strip.splice(index ?? strip.length, 0, tab); reindex(); return { ...tab }; };
    reindex();
    globalThis.chrome = {
        runtime: { async sendMessage(message) { assigned.push(message); return { success: true, spaces: [] }; } },
        tabs: {
            onActivated: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
            async get(id) { return { ...find(id) }; },
            async query({ active }) { return strip.filter(t => t.active === active).map(t => ({ ...t })); },
            async move(id, { index }) { const tab = find(id); strip = strip.filter(t => t !== tab); insert(tab, index); },
            async group({ groupId, tabIds }) { tabIds.forEach(id => { find(id).groupId = groupId; }); return groupId; },
            async ungroup(id) { find(id).groupId = -1; },
            async unsplit(splitViewId) { strip.filter(t => t.splitViewId === splitViewId).forEach(t => { t.splitViewId = -1; }); },
            async createSplit([a, b]) {
                const [one, two] = [find(a), find(b)];
                if (Math.abs(one.index - two.index) !== 1) throw new Error('Tabs must be adjacent.');
                if (one.groupId !== two.groupId || one.pinned !== two.pinned) throw new Error('Tabs must share pinned and group state.');
                if (one.splitViewId !== -1 || two.splitViewId !== -1) throw new Error('Tabs are already split.');
                one.splitViewId = two.splitViewId = nextSplit;
                return nextSplit++;
            },
            async duplicate(id) { const source = find(id); return insert({ ...source, id: nextId++, splitViewId: -1 }, source.index + 1); },
            async create(props) { return insert({ id: nextId++, windowId: 1, groupId: -1, splitViewId: -1, pinned: false, url: props.url }); }
        }
    };
    const activate = id => { strip.forEach(t => { t.active = t.id === id; }); listeners.forEach(fn => fn({ tabId: id, windowId: 1 })); };
    return { strip: () => strip, assigned, activate };
}

const element = (dataset = {}, onClick = () => {}) => ({ dataset, click: onClick });

test('indexBeside accounts for Chrome removing the moved tab first', () => {
    assert.equal(indexBeside({ index: 2 }, { index: 5 }), 3);
    assert.equal(indexBeside({ index: 4 }, { index: 1 }), 4);
});

test('splitTabs moves a distant tab next to the anchor before splitting', async () => {
    const tabs = mockStrip([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    const splitViewId = await splitTabs(4, 1);
    assert.deepEqual(tabs.strip().map(t => t.id), [2, 3, 4, 1]);
    assert.ok(tabs.strip().filter(t => t.splitViewId === splitViewId).length === 2);
});

test('splitTabs leaves an existing split and aligns the tab group first', async () => {
    const tabs = mockStrip([{ id: 1, groupId: 7 }, { id: 2, splitViewId: 9 }, { id: 3, splitViewId: 9 }]);
    await splitTabs(1, 3);
    const [one, two, three] = [1, 2, 3].map(id => tabs.strip().find(t => t.id === id));
    assert.equal(two.splitViewId, -1);
    assert.equal(three.groupId, 7);
    assert.equal(one.splitViewId, three.splitViewId);
    assert.equal(Math.abs(one.index - three.index), 1);
});

test('duplicating a live tab copies it into the same space as a temporary tab', async () => {
    const tabs = mockStrip([{ id: 1, url: 'https://a.test/page' }]);
    const copy = await duplicateRow({ tab: { id: 1 }, isBookmarkOnly: false, spaceId: 's1', windowId: 1 });
    assert.equal(copy.url, 'https://a.test/page');
    assert.deepEqual(tabs.assigned, [{ type: 'spaceStore', action: 'assign', tabId: copy.id, spaceId: 's1' }]);
});

test('duplicating an unloaded pinned link opens its saved URL', async () => {
    mockStrip([]);
    const copy = await duplicateRow({ tab: {}, isBookmarkOnly: true, url: 'https://saved.test/', spaceId: 's1', windowId: 1 });
    assert.equal(copy.url, 'https://saved.test/');
});

test('opening a row in split view pairs it with the previously active tab', async () => {
    const tabs = mockStrip([{ id: 1, active: true }, { id: 2 }, { id: 3 }]);
    await openRowInSplit({ tabElement: element({}, () => tabs.activate(3)), windowId: 1 });
    const [one, three] = [1, 3].map(id => tabs.strip().find(t => t.id === id));
    assert.notEqual(one.splitViewId, -1);
    assert.equal(one.splitViewId, three.splitViewId);
});

test('the menu offers the split action that fits the row', async () => {
    mockStrip([{ id: 1, active: true }, { id: 2, splitViewId: 4 }, { id: 3 }]);
    const labels = async (tab, isBookmarkOnly = false) =>
        (await getRowActions({ tab, isBookmarkOnly, tabElement: element({ url: 'https://x.test/' }), spaceId: 's1', windowId: 1 })).map(a => a.label);
    assert.deepEqual(await labels({ id: 1 }), ['Duplicate', 'Split with New Tab']);
    assert.deepEqual(await labels({ id: 2 }), ['Duplicate', 'Exit Split View']);
    assert.deepEqual(await labels({ id: 3 }), ['Duplicate', 'Open in Split View']);
    assert.deepEqual(await labels({}, true), ['Duplicate', 'Open in Split View']);
});
