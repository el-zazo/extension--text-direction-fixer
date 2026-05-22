# Text Direction Fixer

> Toggle RTL (Right-to-Left) direction on any web element. Right-click for context menu, or use the interactive selection mode. Manage all your saved selectors from the Options dashboard.

**Manifest Version:** 3

---

## Features

- **Selection Mode** — Click the extension icon (or press `Ctrl` + double-click) to enter crosshair mode. Click any element to apply RTL; click an RTL-applied element to remove it.
- **Context Menu** — Right-click any element and choose "Toggle RTL Direction" from the Chrome context menu.
- **Persistent Selectors** — Every RTL toggle is saved per-page. Selectors are re-applied automatically when you revisit the page.
- **Mutation Observer** — A debounced (150 ms) `MutationObserver` watches for DOM changes and re-applies your saved selectors, so dynamically loaded content is handled automatically.
- **Badge Counter** — The extension badge shows the number of active (enabled) selectors for the current page.
- **Page-Level Toggle** — Enable or disable all RTL selectors for an entire page with a single switch.
- **Options Dashboard** — A full management UI with search, filter, sort, inline editing, import/export, and dark/light theme support.
- **Import with Merge Strategies** — Four strategies when importing data: Replace All, Merge (Keep Existing), Merge (Use Imported), and Skip Duplicates.

---

## Installation

### From Source (Development)

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the project root directory (the folder containing `manifest.json`).
5. The extension icon will appear in your browser toolbar.

### Pinning the Extension

For quick access, pin the extension to the toolbar:

1. Click the puzzle-piece icon in the Chrome toolbar.
2. Find "Text Direction Fixer" and click the pin icon.

---

## Usage

### Applying RTL

There are two ways to apply RTL to an element:

#### Method 1: Selection Mode (Click)

1. Click the **Text Direction Fixer** icon in the toolbar — or press `Ctrl` + double-click anywhere on the page.
2. A crosshair cursor appears and a notification confirms: "RTL Mode ON".
3. Hover over elements to preview them (shown with a dashed red outline).
4. Click an element to apply RTL. The element gets `direction: rtl`, `text-align: right`, and a solid indigo outline.
5. Click an already-applied element to remove RTL from it.
6. Press `Escape` to exit selection mode.

#### Method 2: Context Menu (Right-Click)

1. Right-click on any element on the page.
2. Select **"Toggle RTL Direction"** from the context menu.
3. If the element does not have RTL, it is applied. If it already has RTL, it is removed.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl` + Double-click | Enter/exit Selection Mode |
| `Escape` | Exit Selection Mode |
| `Ctrl` + `Shift` + `R` | Disable all RTL selectors for the current page |

### Badge Counter

The extension badge (on the toolbar icon) displays the number of **enabled** selectors for the current page. A blank badge means no selectors are active. The badge color is `#2196F3` (blue).

### Page Load Behavior

When you visit a page that has saved selectors:

- All **enabled** selectors are automatically applied to matching elements.
- A **persistent notification** appears in the top-right corner showing stats: total selectors, active, disabled, and how many were found in the DOM.
- If no matching elements are found for any active selector, a **warning** notification is shown, suggesting the selectors may be outdated.
- If the page is **disabled** (page toggle is off), an orange/amber warning notification appears and no selectors are applied.

### Disabling All RTL for a Page

- Press `Ctrl` + `Shift` + `R` to soft-disable all selectors on the current page. This sets every selector's `enabled` flag to `false` and removes RTL styles from all elements.
- Alternatively, use the **Options dashboard** to toggle the page-level switch.

---

## File Structure

```
text-direction-fixer/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker: context menu, icon click, badge
├── content.js             # Content script: RTL logic, selection mode, storage
├── styles.css             # Injected notification styles
├── icons/
│   ├── icon16.png         # Toolbar icon (16x16)
│   ├── icon48.png         # Extension management icon (48x48)
│   └── icon128.png        # Chrome Web Store icon (128x128)
├── options/
│   ├── options.html       # Options dashboard markup
│   ├── options.css        # Options dashboard styling (dark/light theme)
│   └── options.js         # Options dashboard logic (CRUD, import/export)
└── docs/
    ├── STORAGE.md         # Storage schema documentation
    ├── API.md             # Internal message-passing API
    └── OPTIONS.md         # Options dashboard user guide
```

---

## Permissions

| Permission | Justification |
|---|---|
| `activeTab` | Required to interact with the currently active tab when the extension icon is clicked. |
| `storage` | Required to persist RTL selector data and theme preference using `chrome.storage.local`. |
| `contextMenus` | Required to add the "Toggle RTL Direction" item to the browser right-click context menu. |

---

## How It Works

### Selector Path Generation

When you click an element in selection mode (or use the context menu), the extension generates a CSS selector path for that element. The algorithm prefers:

1. **ID selector** — If the element has an `id`, it uses `#id` (escaped via `CSS.escape`).
2. **Stable class names** — Up to 2 class names that don't match utility/dynamic patterns (prefixed with `js-`, `is-`, `has-`, `ng-`, `v-`, or starting with a digit are skipped).
3. **`:nth-of-type()` fallback** — If no stable classes are found, the element's position among siblings of the same tag is used.

The path is built by walking up from the element to `<body>`, stopping early if an ID is encountered.

### RTL Application

When RTL is applied to an element, the following inline styles are set with `!important`:

```css
direction: rtl !important;
text-align: right !important;
outline: 2px solid #6366f1 !important;
outline-offset: 2px !important;
```

The element also receives a `data-rtl-applied="true"` attribute. When RTL is removed, all four properties are cleared and the attribute is removed.

### Mutation Observer

A `MutationObserver` watches `document.body` for `childList` changes in the entire subtree. Changes are debounced with a 150 ms delay before `applyAllEnabledSelectors()` runs. This ensures dynamically added content (e.g., SPA navigation, lazy loading) automatically receives RTL styling.

---

## Options Dashboard

Open the options page by right-clicking the extension icon and selecting **Options**, or navigate to `chrome://extensions`, find Text Direction Fixer, and click **Details > Extension options**.

See **[docs/OPTIONS.md](docs/OPTIONS.md)** for the full user guide.

---

## Storage & Data

All data is stored in `chrome.storage.local`. See **[docs/STORAGE.md](docs/STORAGE.md)** for the complete schema.

## Internal Messages

The extension uses Chrome's message-passing API for communication between the background service worker and content scripts. See **[docs/API.md](docs/API.md)** for details.

---

## License

This project is provided as-is. See the repository for license information.
