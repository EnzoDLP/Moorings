// Shows the two tabs of a Chrome split view as one sidebar row, like Arc. The partner's row
// stays in the DOM (hidden) so order, drag and drop and refreshes keep working unchanged.
const NOT_SPLIT = -1;
const DEBOUNCE_MS = 80;

const isSplitTab = tab => typeof tab.splitViewId === 'number' && tab.splitViewId !== NOT_SPLIT;

// Pairs tab ids that share a split view; the first id of a pair leads and shows the other.
export function findSplitPairs(rowIds, tabs) {
    const splitOf = new Map(tabs.filter(isSplitTab).map(tab => [tab.id, tab.splitViewId]));
    const waiting = new Map();
    const pairs = [];
    for (const id of new Set(rowIds)) {
        const splitViewId = splitOf.get(id);
        if (splitViewId === undefined) continue;
        if (waiting.has(splitViewId)) {
            pairs.push({ lead: waiting.get(splitViewId), partner: id });
            waiting.delete(splitViewId);
        } else {
            waiting.set(splitViewId, id);
        }
    }
    return pairs;
}

function buildPartner(partnerRow, focusTab) {
    const chip = document.createElement('div');
    chip.className = 'split-partner';
    const icon = document.createElement('img');
    icon.className = 'split-partner-icon';
    icon.alt = '';
    icon.src = partnerRow.querySelector('.tab-favicon')?.src || '';
    const title = document.createElement('span');
    title.className = 'split-partner-title';
    title.textContent = partnerRow.querySelector('.tab-title-display')?.textContent || '';
    chip.append(icon, title);
    chip.addEventListener('click', event => {
        event.stopPropagation();
        focusTab(Number(partnerRow.dataset.tabId));
    });
    chip.addEventListener('auxclick', event => event.stopPropagation());
    // Right-clicking a half opens that tab's own menu.
    chip.addEventListener('contextmenu', event => {
        event.preventDefault();
        event.stopPropagation();
        partnerRow.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY
        }));
    });
    return chip;
}

// Highlights a pair when its hidden half is the active tab.
export function syncSplitActive(root) {
    root.querySelectorAll('.tab.split-lead').forEach(lead => {
        const partner = root.querySelector(`.tab[data-tab-id="${lead.dataset.splitPartner}"]`);
        const partnerActive = Boolean(partner?.classList.contains('active'));
        lead.classList.toggle('split-active', partnerActive);
        lead.querySelector('.split-partner')?.classList.toggle('focused', partnerActive);
    });
}

export function decorateSplitRows(root, tabs, focusTab) {
    root.querySelectorAll('.split-partner').forEach(chip => chip.remove());
    root.querySelectorAll('.tab.split-lead, .tab.split-hidden').forEach(row => {
        row.classList.remove('split-lead', 'split-hidden', 'split-active');
        delete row.dataset.splitPartner;
    });
    const rows = [...root.querySelectorAll('.tab[data-tab-id]')];
    // A visible row leads, so a pair is not lost inside a collapsed folder.
    const visible = rows.filter(row => row.offsetParent !== null);
    const rowById = new Map();
    for (const row of [...visible, ...rows.filter(row => !visible.includes(row))]) {
        const id = Number(row.dataset.tabId);
        if (!rowById.has(id)) rowById.set(id, row);
    }
    for (const { lead, partner } of findSplitPairs([...rowById.keys()], tabs)) {
        const leadRow = rowById.get(lead);
        const partnerRow = rowById.get(partner);
        leadRow.classList.add('split-lead');
        leadRow.dataset.splitPartner = String(partner);
        partnerRow.classList.add('split-hidden');
        leadRow.insertBefore(buildPartner(partnerRow, focusTab), leadRow.querySelector('.tab-close'));
    }
    syncSplitActive(root);
}

const isChip = node => node.nodeType === Node.ELEMENT_NODE && node.classList.contains('split-partner');

// Keeps split rows in sync with renders, title updates and split changes in this window.
// Renders are only watched while the window has a split, so the sidebar pays nothing otherwise.
export function installSplitRows({ root, windowId, focusTab }) {
    let timer;
    let watching = false;
    const observer = new MutationObserver(mutations => {
        if (mutations.some(m => m.type === 'childList' && ![...m.addedNodes, ...m.removedNodes].every(isChip))) schedule();
        if (mutations.some(m => m.type === 'attributes')) syncSplitActive(root);
    });
    const refresh = async () => {
        const tabs = await chrome.tabs.query({ windowId });
        if (tabs.some(isSplitTab)) {
            if (!watching) observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
            watching = true;
        } else {
            observer.disconnect();
            watching = false;
            if (!root.querySelector('.split-lead, .split-hidden')) return;
        }
        root.querySelectorAll('.space').forEach(space => decorateSplitRows(space, tabs, focusTab));
    };
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(() => refresh().catch(error => console.warn('Split rows refresh failed:', error)), DEBOUNCE_MS);
    }
    chrome.tabs.onUpdated.addListener((_id, change, tab) => {
        if (tab.windowId === windowId && change.splitViewId !== undefined) schedule();
    });
    chrome.tabs.onRemoved.addListener(schedule);
    schedule();
}
