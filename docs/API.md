# Internal Message API

The Text Direction Fixer extension uses Chrome's message-passing API (`chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`) for communication between the background service worker and content scripts. This document describes every message type, its payload, direction, and behavior.

---

## Overview

```
┌──────────────────┐                    ┌──────────────────┐
│  background.js   │                    │   content.js     │
│  (service worker)│                    │  (content script)│
│                  │                    │                  │
│                  │  TOGGLE_SELECTION  │                  │
│                  │  _MODE ──────────► │                  │
│                  │                    │                  │
│                  │  APPLY_RTL_CONTEXT │                  │
│                  │  _MENU ──────────► │                  │
│                  │                    │                  │
│                  │  UPDATE_BADGE ◄─── │                  │
│                  │                    │                  │
└──────────────────┘                    └──────────────────┘
```

There are **three** message types in total:

| Message Type | Direction | Trigger |
|---|---|---|
| `TOGGLE_SELECTION_MODE` | Background → Content | User clicks the extension toolbar icon |
| `APPLY_RTL_CONTEXT_MENU` | Background → Content | User clicks "Toggle RTL Direction" in the context menu |
| `UPDATE_BADGE` | Content → Background | Content script needs to update the badge count |

---

## Messages (Background → Content)

These messages are sent from `background.js` to `content.js` using `chrome.tabs.sendMessage(tab.id, message)`.

### `TOGGLE_SELECTION_MODE`

Toggles the selection mode on/off in the content script. When selection mode is active, the cursor changes to a crosshair and the user can click elements to apply or remove RTL.

**Payload:**

```javascript
{ type: "TOGGLE_SELECTION_MODE" }
```

**Triggered by:** User clicking the extension icon in the toolbar.

**Background code:**

```javascript
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SELECTION_MODE" }).catch(() => {
        // Content script not ready (e.g. chrome:// pages)
    });
});
```

**Content script handler:**

```javascript
if (message.type === "TOGGLE_SELECTION_MODE") toggleSelectionMode();
```

**Behavior in content script:**
- If selection mode is **off** → turns it **on**: sets `document.body.style.cursor = "crosshair"`, shows notification "RTL Mode ON — Click elements (ESC to exit)".
- If selection mode is **on** → turns it **off**: resets cursor, removes hover outline from the currently hovered element, shows notification "RTL Mode OFF".
- The same behavior can also be triggered by `Ctrl` + double-click directly in the content script (no message involved).

**Error handling:** If the content script is not injected (e.g., on `chrome://` pages, new tab page, or Chrome Web Store), the `catch()` silently absorbs the error.

---

### `APPLY_RTL_CONTEXT_MENU`

Applies or removes RTL on the last right-clicked element. This is triggered when the user selects the "Toggle RTL Direction" item from the browser's right-click context menu.

**Payload:**

```javascript
{ type: "APPLY_RTL_CONTEXT_MENU" }
```

**Triggered by:** User clicking "Toggle RTL Direction" in the Chrome context menu.

**Background code:**

```javascript
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "toggle-rtl" && tab) {
        chrome.tabs.sendMessage(tab.id, { type: "APPLY_RTL_CONTEXT_MENU" }).catch(() => {
            // Content script not ready (e.g. chrome:// pages)
        });
    }
});
```

**Content script handler:**

```javascript
if (message.type === "APPLY_RTL_CONTEXT_MENU") handleContextMenuRTL();
```

**Behavior in content script:**
- The content script tracks the last right-clicked element via a `contextmenu` event listener that stores `e.target` in `lastRightClickedElement`.
- If the element already has `data-rtl-applied="true"`: finds the matching selector in storage, sets `enabled: false`, removes RTL from all elements matching that selector, updates the badge, and shows notification "RTL removed via context menu".
- If the element does not have RTL: generates a CSS selector path, creates or re-enables the selector entry in storage, applies RTL to the element, updates the badge, and shows notification "RTL applied via context menu".
- Extension UI elements (elements inside `#rtl-notification`) are guarded and ignored.

**Error handling:** Same silent catch as `TOGGLE_SELECTION_MODE`.

---

## Messages (Content → Background)

### `UPDATE_BADGE`

Updates the extension badge text and background color for the current tab. The badge displays the count of enabled selectors for the active page.

**Payload:**

```javascript
{ type: "UPDATE_BADGE", count: number }
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `string` | Yes | Must be `"UPDATE_BADGE"` |
| `count` | `number` | Yes | The number of enabled selectors. If `0` or missing, the badge text is cleared. |

**Triggered by:**
- After applying or removing RTL (both selection mode and context menu).
- After disabling all selectors for a page (`Ctrl` + `Shift` + `R`).
- On page load (via `init()` → `updateBadgeFromStorage()`).

**Content script code:**

```javascript
function updateBadge(count) {
    try {
        chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count });
    } catch (e) { /* extension context invalidated */ }
}
```

**Background handler:**

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "UPDATE_BADGE") {
        const count = message.count || 0;
        const text = count > 0 ? count.toString() : "";

        chrome.action.setBadgeText({
            text: text,
            tabId: sender.tab.id
        });

        chrome.action.setBadgeBackgroundColor({
            color: "#2196F3",
            tabId: sender.tab.id
        });
    }
});
```

**Behavior:**
- If `count > 0`: badge displays the number as text with blue (`#2196F3`) background.
- If `count === 0` or `count` is falsy: badge text is set to `""` (empty string), effectively hiding it.
- The badge is set **per tab** using `sender.tab.id`, so different tabs can show different counts.

**Error handling:** The `try/catch` in the content script handles the case where the extension context has been invalidated (e.g., after an update or reload of the extension).

---

## Context Menu

The background service worker creates a context menu item on install:

```javascript
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "toggle-rtl",
        title: "Toggle RTL Direction",
        contexts: ["all"]
    });
});
```

| Property | Value | Description |
|---|---|---|
| `id` | `"toggle-rtl"` | Unique identifier used in the `onClicked` listener. |
| `title` | `"Toggle RTL Direction"` | The label shown in the browser's context menu. |
| `contexts` | `["all"]` | The menu item appears on all types of right-click contexts (page, link, image, selection, etc.). |

---

## Extension Icon Action

The extension's toolbar icon has a default title but no popup:

```json
"action": {
    "default_title": "Toggle RTL Selection Mode"
}
```

Because there is no `default_popup` defined, clicking the icon triggers `chrome.action.onClicked` in the background service worker, which sends the `TOGGLE_SELECTION_MODE` message to the active tab's content script.

---

## Message Flow Diagram

### Selection Mode (Icon Click)

```
User clicks toolbar icon
        │
        ▼
chrome.action.onClicked
        │
        ▼
chrome.tabs.sendMessage(tabId, { type: "TOGGLE_SELECTION_MODE" })
        │
        ▼
content.js: toggleSelectionMode()
        │
        ├── ON:  cursor=crosshair, notification "RTL Mode ON"
        └── OFF: cursor=default, notification "RTL Mode OFF"
```

### Context Menu Toggle

```
User right-clicks element → contextmenu event
        │
        ▼
content.js: lastRightClickedElement = e.target
        │
        ▼
User clicks "Toggle RTL Direction"
        │
        ▼
chrome.contextMenus.onClicked
        │
        ▼
chrome.tabs.sendMessage(tabId, { type: "APPLY_RTL_CONTEXT_MENU" })
        │
        ▼
content.js: handleContextMenuRTL()
        │
        ├── Element has RTL:  remove, disable selector, UPDATE_BADGE
        └── Element has no RTL: apply, save selector, UPDATE_BADGE
```

### Badge Update

```
content.js: updateBadge(count)
        │
        ▼
chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count })
        │
        ▼
background.js: chrome.action.setBadgeText({ text, tabId })
               chrome.action.setBadgeBackgroundColor({ color: "#2196F3", tabId })
```
