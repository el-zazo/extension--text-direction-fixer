# Options Dashboard Guide

The Options dashboard is a full management interface for all your saved RTL data. It consists of two main views: **Pages List** and **Selectors List**.

---

## Opening the Options Dashboard

There are two ways to open the Options page:

1. **Right-click** the Text Direction Fixer icon in the Chrome toolbar and select **Options**.
2. Go to `chrome://extensions`, find Text Direction Fixer, click **Details**, then click **Extension options**.

---

## Theme

The Options dashboard supports **Dark** and **Light** themes. The default is Dark.

- Click the moon/sun icon button in the top-right corner of the header to toggle.
- The theme preference is saved to `chrome.storage.local` under the key `rtl_theme` and persists across sessions.

---

## View 1: Pages List

This is the default view when you open the Options dashboard. It shows a card grid of all websites that have saved RTL selectors.

### Header

- **Title:** "RTL Manager" with the subtitle "All websites with saved RTL selectors"
- **Export button:** Downloads all data as a JSON backup file (see [Export](#export) below).
- **Import button:** Opens a file picker to import a JSON backup (see [Import](#import) below).
- **Clear All button:** Deletes all saved data after confirmation.
- **Theme toggle:** Switches between dark and light mode.

### Search

Type in the search box to filter pages by URL. The search is case-insensitive and matches any part of the URL string. A clear button (x) appears when there is text in the search field.

### Filter Chips

Three filter options are available:

| Chip | Behavior |
|---|---|
| **All** | Show all pages (default) |
| **Active** | Show only pages where `pageEnabled` is `true` |
| **Inactive** | Show only pages where `pageEnabled` is `false` |

### Sort

The sort dropdown provides four options:

| Option | Behavior |
|---|---|
| **A → Z** | Alphabetical by URL (default) |
| **Most Selectors** | Pages with the most selectors first |
| **Newest** | Most recently created pages first |
| **Oldest** | Oldest pages first |

### Stats Bar

A row of stat pills below the toolbar shows:

- **Total pages** (purple dot)
- **Active pages** (green dot) — pages where `pageEnabled` is `true`
- **Inactive pages** (amber dot) — pages where `pageEnabled` is `false`
- **Total selectors** (blue dot) — sum of all selectors across all pages

### Page Cards

Each page is displayed as a card with two sections:

#### Top Section (clickable link area)

- **Favicon:** Google favicon service image for the domain, with a globe fallback (🌐) on error.
- **Domain:** The hostname extracted from the page URL.
- **Path:** The pathname (shown in monospace font), if present.
- **Created date:** When the page was first saved, formatted as "Mon DD, YYYY, HH:MM".
- **Arrow (→):** Indicates the card is clickable. Hovering highlights the border in the brand color and shifts the arrow right.

Clicking the top section navigates to the **Selectors List** view for that page.

#### Bottom Section (action bar)

- **Selector counts:** Total, On (enabled), and Off (disabled) with colored dots.
- **Open page button:** Opens the page URL in a new browser tab.
- **Delete page button (red):** Deletes all RTL data for this page after a confirmation dialog.
- **Toggle switch:** Enables or disables the entire page. When a page is disabled, its card is dimmed (reduced opacity).

---

## View 2: Selectors List

This view shows all selectors for a single page. It is reached by clicking a page card in the Pages List.

### Header

- **Back button:** Returns to the Pages List view.
- **Title:** The domain of the current page.
- **Subtitle:** The full URL of the current page.
- **Page Active toggle:** Master switch for the entire page. When off, no selectors are applied.
- **Open Page button:** Opens the page in a new browser tab.
- **Delete Page button (red):** Deletes all data for this page after confirmation.

### Search

Filter selectors by path text. Case-insensitive, matches any part of the selector path string.

### Filter Chips

| Chip | Behavior |
|---|---|
| **All** | Show all selectors (default) |
| **Active** | Show only enabled selectors |
| **Inactive** | Show only disabled selectors |

### Sort

| Option | Behavior |
|---|---|
| **Newest First** | Most recently created selectors first (default) |
| **Oldest First** | Oldest selectors first |
| **A → Z** | Alphabetical by selector path |

### Stats Bar

- **Total** selectors for this page
- **Active** (enabled) selectors
- **Inactive** (disabled) selectors

### Selectors Table

| Column | Description |
|---|---|
| **Status** | A toggle switch to enable/disable the individual selector. |
| **Selector Path** | The CSS selector path. Click to edit inline (see below). Displayed in monospace font. |
| **Saved** | The creation date of the selector, formatted as a localized date string. |
| **Actions** | Edit button (focuses the path textarea) and Delete button (with confirmation). |

#### Inline Editing

Selector paths are editable directly in the table:

1. Click on the selector path text (or click the edit/pencil button). The field becomes a focused textarea.
2. Modify the path as needed. The textarea auto-resizes to fit the content.
3. Press **Enter** to save, or **Escape** to cancel and revert.
4. Clicking away (blur) also saves the change.
5. Empty paths or unchanged paths are reverted without saving.
6. A toast notification confirms the update.

---

## Export

Click the **Export** button to download a JSON file containing all your saved data. The file structure is:

```json
{
  "rtl_data": [
    {
      "url": "https://example.com/page",
      "pageEnabled": true,
      "createdAt": "2025-03-15T14:30:00.000Z",
      "selectors": [
        {
          "id": "...",
          "path": "div.content > p",
          "enabled": true,
          "createdAt": "2025-03-15T14:31:00.000Z"
        }
      ]
    }
  ]
}
```

The file is named `rtl-backup-YYYY-MM-DD.json` using the current UTC date. A success toast appears after the download starts.

---

## Import

Click the **Import** button to load a previously exported JSON backup file. The import process has multiple steps:

### Step 1: File Selection

A file picker opens, filtered to `.json` files. Select a file to begin.

### Step 2: Validation

The file is parsed and validated against the schema rules (see [docs/STORAGE.md](STORAGE.md#import-validation) for the full list). If validation fails, an error modal lists the issues (up to 10). If the file is valid but contains warnings (e.g., an empty array), a confirmation dialog asks whether to continue.

### Step 3: Merge Strategy Selection

A modal displays import statistics:
- Number of incoming pages
- Number of incoming selectors
- Number of duplicate URLs (URLs that already exist in your current data)

You then choose one of four merge strategies:

| Strategy | Icon | Label | Description |
|---|---|---|---|
| **Replace All** | 🔄 | Replace All | Discards all current data entirely. The imported data becomes the only data. **Destructive.** |
| **Merge — Keep Existing** | 🔀 | Merge — Keep existing info | Combines selectors from both datasets. For pages/selector paths that exist in both, the **current** (existing) version is kept. New pages and new selector paths from the import are added. |
| **Merge — Use Imported** | 🔁 | Merge — Use imported info | Combines selectors from both datasets. For pages/selector paths that exist in both, the **imported** version is used (overwrites current). New pages and new selector paths from the import are added. The `pageEnabled` and `createdAt` fields are also taken from the imported data. |
| **Skip Duplicates** | ⏭️ | Skip Duplicates | Only adds pages whose URL does not already exist in the current data. Existing pages are left completely untouched. |

Clicking **Cancel** aborts the import with no changes.

### Step 4: Completion

After the merge is applied, the pages list refreshes and a success toast message describes which strategy was used.

---

## Clear All

The **Clear All** button in the Pages List header deletes all saved RTL data:

1. A confirmation modal appears: "Delete ALL saved RTL data? This cannot be undone."
2. Click **Clear All** to confirm, or **Cancel** to abort.
3. On confirmation, `rtl_data` is set to an empty array `[]`, the view resets to the Pages List, and a warning toast appears.

---

## Toast Notifications

The Options dashboard uses toast notifications (bottom-right corner) for feedback:

| Type | Border Color | Example |
|---|---|---|
| Success | Green (left border) | "Page deleted", "Selector updated" |
| Error | Red (left border) | — |
| Info | Brand/indigo (left border) | "Page enabled", "Page disabled" |
| Warning | Amber (left border) | "All data cleared" |

Toasts automatically dismiss after approximately 2.8 seconds (3.5 seconds for import messages) with a slide-in/slide-out animation.

---

## Confirmation Modals

Destructive actions use a modal dialog for confirmation:

- **Delete Page:** "Delete all RTL data for: [URL]. This cannot be undone."
- **Delete Selector:** "Delete this selector permanently? [selector path]"
- **Clear All:** "Delete ALL saved RTL data? This cannot be undone."

Modals can be dismissed by:
- Clicking the **Cancel** button
- Clicking the overlay background (outside the modal)
- Pressing **Escape**

---

## Responsive Layout

The Options dashboard adapts to different screen sizes:

- **Below 640px:** Page padding is reduced, page cards switch to a single-column layout, the "Saved" date column is hidden in the selectors table.
- **Below 420px:** The filter chips (All/Active/Inactive) are hidden to save space.

---

## Empty States

When there are no pages or no selectors matching the current filter, an empty state illustration and message are shown:

- **No pages:** "No pages yet — Use the extension on any webpage to start saving RTL selectors."
- **No selectors:** "No selectors found — No selectors match your current search or filter."
