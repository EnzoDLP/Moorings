# Moorings: Vertical Tab Spaces

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

A Chrome extension with vertical tab spaces whose pinned links always come back to where you moored them: navigate freely, and the saved link stays the same.

> **Fork notice.** Moorings is a modified fork of [Arcify](https://github.com/nisargkolhe/arcify) by Nisarg Kolhe, distributed under the same GPL-3.0 license. Changes in this fork are listed in its git history.

## How it works

- **Spaces** live in a Chrome bookmark folder named **Moorings**: each sub-folder is a space, and the order of the folders is the order of the spaces.
- **Pinned links are bookmarks** inside their space folder. Navigating in a pinned tab never changes the saved link; after a restart, the pin opens its saved URL again.
- **Folders** nest up to four levels inside a space (right-click a folder → **New Folder**, or drag a folder into another one).
- Unpinning removes the bookmark, and deleting a space deletes its folder with everything inside it.
- Space colors, temporary tabs and archived tabs stay in the extension's local storage: they are lost if the extension is removed, while the bookmarks remain.

## Install

```bash
npm ci --ignore-scripts
npm run build
```

`PUPPETEER_SKIP_DOWNLOAD=1` before `npm ci` avoids downloading the test browser when the end-to-end tests are not needed.

Then in Chrome:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `dist/` folder.
3. Open the sidebar with **⌥ S** (shortcuts can be changed in `chrome://extensions/shortcuts`).

After a rebuild, click the refresh icon on the Moorings card in `chrome://extensions`.

## Update from Arcify

```bash
git pull upstream main
npm run build
```

## Tests

- `npm run test:unit`: storage, migration and sync tests.
- `npm run test:e2e`: browser tests (needs the Puppeteer browser).

## License

GNU General Public License v3.0, see [LICENSE](LICENSE). Original work © Nisarg Kolhe and the Arcify contributors.
