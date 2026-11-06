// Context-menu actions on a sidebar row: duplicate it, or show it in Chrome's split view.
import { spaceRequest } from './space-client.js';

const NOT_SPLIT = -1;
const NO_GROUP = -1;
const ACTIVATION_TIMEOUT_MS = 5000;

const isSplit = tab => typeof tab?.splitViewId === 'number' && tab.splitViewId !== NOT_SPLIT;

// The split view API ships in Chrome 155; older browsers simply get no split items.
export const canSplit = () => typeof chrome.tabs.createSplit === 'function';

// Index that puts `moving` right after `anchor`; Chrome reads it after removing `moving`.
export function indexBeside(anchor, moving) {
    return moving.index < anchor.index ? anchor.index : anchor.index + 1;
}

// Opens a copy of the row as a temporary tab of the same space: the current page for a
// live tab, the saved link for a pinned link that is not loaded.
export async function duplicateRow({ tab, isBookmarkOnly, url, spaceId, windowId }) {
    const copy = isBookmarkOnly
        ? await chrome.tabs.create({ url, windowId, active: true })
        : await chrome.tabs.duplicate(tab.id);
    if (copy && spaceId) await spaceRequest('assign', { tabId: copy.id, spaceId });
    return copy;
}

// Chrome only splits two adjacent tabs that share the pinned and group state.
export async function splitTabs(anchorId, otherId) {
    for (const id of [anchorId, otherId]) {
        const tab = await chrome.tabs.get(id);
        if (isSplit(tab)) await chrome.tabs.unsplit(tab.splitViewId);
    }
    const anchor = await chrome.tabs.get(anchorId);
    const other = await chrome.tabs.get(otherId);
    if (other.groupId !== anchor.groupId) {
        if (anchor.groupId === NO_GROUP) await chrome.tabs.ungroup(other.id);
        else await chrome.tabs.group({ groupId: anchor.groupId, tabIds: [other.id] });
    }
    const placed = await chrome.tabs.get(otherId);
    const current = await chrome.tabs.get(anchorId);
    if (Math.abs(placed.index - current.index) !== 1) {
        await chrome.tabs.move(placed.id, { index: indexBeside(current, placed) });
    }
    return chrome.tabs.createSplit([anchorId, otherId]);
}

function nextActivatedTab(windowId) {
    return new Promise((resolve, reject) => {
        const done = (fn, value) => {
            clearTimeout(timer);
            chrome.tabs.onActivated.removeListener(listener);
            fn(value);
        };
        const listener = info => { if (info.windowId === windowId) done(resolve, info.tabId); };
        const timer = setTimeout(() => done(reject, new Error('The tab did not open.')), ACTIVATION_TIMEOUT_MS);
        chrome.tabs.onActivated.addListener(listener);
    });
}

// Opens the row the way a click does (so a pinned link stays bound to its bookmark),
// then splits it with the tab that was active before.
export async function openRowInSplit({ tabElement, windowId }) {
    const [previous] = await chrome.tabs.query({ active: true, windowId });
    if (!previous) return;
    const activated = nextActivatedTab(windowId);
    tabElement.click();
    const openedId = await activated;
    if (openedId !== previous.id) await splitTabs(previous.id, openedId);
}

// Opens a new tab next to the row's tab, in the same space.
export async function splitWithNewTab({ tab, spaceId, windowId }) {
    const current = await chrome.tabs.get(tab.id);
    if (isSplit(current)) await chrome.tabs.unsplit(current.splitViewId);
    const created = await chrome.tabs.create({ splitWithTabId: tab.id, windowId });
    if (spaceId) await spaceRequest('assign', { tabId: created.id, spaceId });
    return created;
}

// Menu entries for a row, as { label, run } pairs.
export async function getRowActions({ tab, isBookmarkOnly, tabElement, spaceId, windowId }) {
    const url = tab.url || tabElement.dataset.url;
    const actions = [{ label: 'Duplicate', run: () => duplicateRow({ tab, isBookmarkOnly, url, spaceId, windowId }) }];
    if (!canSplit()) return actions;

    let live = null;
    try { if (!isBookmarkOnly && Number.isInteger(tab.id)) live = await chrome.tabs.get(tab.id); }
    catch { live = null; }
    if (live && isSplit(live)) {
        actions.push({ label: 'Exit Split View', run: () => chrome.tabs.unsplit(live.splitViewId) });
    } else if (live?.active) {
        actions.push({ label: 'Split with New Tab', run: () => splitWithNewTab({ tab, spaceId, windowId }) });
    } else {
        actions.push({ label: 'Open in Split View', run: () => openRowInSplit({ tabElement, windowId }) });
    }
    return actions;
}
