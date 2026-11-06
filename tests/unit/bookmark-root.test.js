import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorage } from '../../localstorage.js';
import { isSpaceFolderMissing } from '../../space-bookmarks.js';

function mockBookmarks(nodes) {
    const calls = { created: [], updated: [] };
    globalThis.chrome = {
        storage: { local: { async get() { return {}; }, async set() {} }, sync: { async get() { return {}; } } },
        bookmarks: {
            async search({ title }) { return nodes.filter(node => node.title === title); },
            async get(id) {
                const node = nodes.find(n => n.id === id);
                if (!node) throw new Error(`Can't find bookmark for id ${id}`);
                return [node];
            },
            async create(info) { const node = { id: 'new', ...info }; nodes.push(node); calls.created.push(info); return node; },
            async update(id, changes) { const node = nodes.find(n => n.id === id); Object.assign(node, changes); calls.updated.push([id, changes]); return node; }
        }
    };
    return calls;
}

test('an existing Moorings folder is used as is', async () => {
    const calls = mockBookmarks([{ id: 'root', title: 'Moorings' }, { id: 'legacy', title: 'Arcify' }]);
    assert.equal((await LocalStorage.getOrCreateArcifyFolder()).id, 'root');
    assert.deepEqual(calls, { created: [], updated: [] });
});

test('a legacy Arcify folder is renamed instead of creating an empty root', async () => {
    const calls = mockBookmarks([{ id: 'legacy', title: 'Arcify' }, { id: 'link', title: 'Arcify', url: 'https://arcify.io' }]);
    const folder = await LocalStorage.getOrCreateArcifyFolder();
    assert.equal(folder.id, 'legacy');
    assert.equal(folder.title, 'Moorings');
    assert.deepEqual(calls.created, []);
});

test('a root is created only when neither folder exists', async () => {
    const calls = mockBookmarks([]);
    await LocalStorage.getOrCreateArcifyFolder();
    assert.deepEqual(calls.created, [{ title: 'Moorings' }]);
});

test('a space folder counts as missing only when it no longer exists', async () => {
    mockBookmarks([{ id: 'kept', title: 'Frog', parentId: 'elsewhere' }, { id: 'link', title: 'Link', url: 'https://x.test/' }]);
    assert.equal(await isSpaceFolderMissing({ bookmarkFolderId: 'gone' }), true);
    assert.equal(await isSpaceFolderMissing({}), true);
    assert.equal(await isSpaceFolderMissing({ bookmarkFolderId: 'link' }), true);
    assert.equal(await isSpaceFolderMissing({ bookmarkFolderId: 'kept' }), false);
});
