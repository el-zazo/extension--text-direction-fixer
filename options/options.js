// ============================================
// Text Direction Fixer — Options Dashboard JS
// Premium Redesign v3.0
// ============================================

// ===== DOM REFS =====
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const navPageCount = document.getElementById("navPageCount");

// Pages view
const pageSearch = document.getElementById("pageSearch");
const pageSearchClear = document.getElementById("pageSearchClear");
const pageSortSelect = document.getElementById("pageSortSelect");
const pagesList = document.getElementById("pagesList");
const pagesEmpty = document.getElementById("pagesEmpty");
const statTotalPages = document.getElementById("statTotalPages");
const statEnabledPages = document.getElementById("statEnabledPages");
const statDisabledPages = document.getElementById("statDisabledPages");
const statTotalSelectors = document.getElementById("statTotalSelectors");

// Selectors view
const viewPages = document.getElementById("viewPages");
const viewSelectors = document.getElementById("viewSelectors");
const backBtn = document.getElementById("backBtn");
const selectorViewTitle = document.getElementById("selectorViewTitle");
const selectorViewUrl = document.getElementById("selectorViewUrl");
const pageToggleMain = document.getElementById("pageToggleMain");
const deletePageBtn = document.getElementById("deletePageBtn");
const selectorSearch = document.getElementById("selectorSearch");
const selectorSearchClear = document.getElementById("selectorSearchClear");
const selectorSortSelect = document.getElementById("selectorSortSelect");
const selectorsTbody = document.getElementById("selectorsTbody");
const selectorsEmpty = document.getElementById("selectorsEmpty");
const statSelectorTotal = document.getElementById("statSelectorTotal");
const statSelectorEnabled = document.getElementById("statSelectorEnabled");
const statSelectorDisabled = document.getElementById("statSelectorDisabled");

// Global controls
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const clearAllBtn = document.getElementById("clearAllBtn");

// Modal / Toast
const modalOverlay = document.getElementById("modalOverlay");
const modalIcon = document.getElementById("modalIcon");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");
const modalActions = document.getElementById("modalActions");
const modalInputWrap = document.getElementById("modalInputWrap");
const modalInput = document.getElementById("modalInput");
const toastContainer = document.getElementById("toastContainer");

// ===== STATE =====
let currentPageUrl = null;      // URL of the page currently open in selectors view
let pageFilter = "all";     // pages view filter
let selectorFilter = "all";     // selectors view filter

// ===== CACHED ESCAPE ELEMENT =====
const _escEl = document.createElement("div");
function escapeHtml(str) {
    _escEl.textContent = str;
    return _escEl.innerHTML;
}

// ===== THEME =====

const MOON_SVG = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
const SUN_SVG = `<circle cx="12" cy="12" r="5"/>
<line x1="12" y1="1" x2="12" y2="3"/>
<line x1="12" y1="21" x2="12" y2="23"/>
<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
<line x1="1" y1="12" x2="3" y2="12"/>
<line x1="21" y1="12" x2="23" y2="12"/>
<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;

async function loadTheme() {
    const { rtl_theme } = await chrome.storage.local.get("rtl_theme");
    applyTheme(rtl_theme || "dark");
    document.body.style.visibility = "visible";
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeIcon.innerHTML = theme === "dark" ? SUN_SVG : MOON_SVG;
    themeToggle.title = theme === "dark" ? "Switch to Light" : "Switch to Dark";
}

async function saveTheme(theme) {
    await chrome.storage.local.set({ rtl_theme: theme });
}

themeToggle.addEventListener("click", async () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    await saveTheme(next);
});

// ===== STORAGE =====

async function loadAllData() {
    const { rtl_data } = await chrome.storage.local.get("rtl_data");
    if (!rtl_data) return [];
    if (Array.isArray(rtl_data)) return rtl_data;
    if (typeof rtl_data === "object") {
        // Migrate old object format → array once
        const migrated = Object.values(rtl_data);
        await chrome.storage.local.set({ rtl_data: migrated });
        console.info("[RTL] Storage migrated from object to array format");
        return migrated;
    }
    return [];
}

async function saveAllData(data) {
    await chrome.storage.local.set({ rtl_data: data });
}

// ===== TOAST =====

function showToast(message, type = "info", duration = 2800) {
    const icons = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add("show"));
    });
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

// ===== MODAL =====

let _modalResolve = null;

/**
 * Show a modal dialog.
 * @param {object} opts
 * @param {string}  opts.icon
 * @param {string}  opts.title
 * @param {string}  opts.message
 * @param {Array}   opts.buttons  — [{ label, style, value }]
 * @param {string=} opts.inputValue — if set, shows an input field pre-filled with this value
 * @returns {Promise<string|null>} resolves with the button value clicked, or input value for "prompt" mode
 */
function showModal({ icon = "", title = "", message = "", buttons = [], inputValue } = {}) {
    return new Promise((resolve) => {
        _modalResolve = resolve;

        modalIcon.textContent = icon;
        modalTitle.textContent = title;
        modalMessage.textContent = message;

        // Input
        const hasInput = inputValue !== undefined;
        modalInputWrap.style.display = hasInput ? "block" : "none";
        if (hasInput) {
            modalInput.value = inputValue;
        }

        // Buttons
        modalActions.innerHTML = "";
        for (const btn of buttons) {
            const el = document.createElement("button");
            el.className = `btn ${btn.style || "btn-ghost"}`;
            el.textContent = btn.label;
            el.addEventListener("click", () => {
                closeModal(btn.value === "__INPUT__" ? modalInput.value.trim() : btn.value);
            });
            modalActions.appendChild(el);
        }

        modalOverlay.classList.add("open");

        // Focus input or first button
        if (hasInput) {
            setTimeout(() => { modalInput.focus(); modalInput.select(); }, 120);
        } else if (modalActions.firstChild) {
            setTimeout(() => modalActions.firstChild.focus(), 120);
        }
    });
}

function closeModal(value = null) {
    modalOverlay.classList.remove("open");
    if (_modalResolve) {
        _modalResolve(value);
        _modalResolve = null;
    }
}

// Close on overlay click (outside modal box)
modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal(null);
});

// Close on Escape
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalOverlay.classList.contains("open")) {
        closeModal(null);
    }
});

// Enter key submits single-input modals
modalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        const inputBtn = [...modalActions.children].find(
            (b) => b.dataset.isInput === "true"
        );
        if (inputBtn) inputBtn.click();
    }
});

// Helper: confirm dialog
async function confirmModal({ icon, title, message, confirmLabel = "Confirm", confirmStyle = "btn-danger" } = {}) {
    const result = await showModal({
        icon, title, message,
        buttons: [
            { label: "Cancel", style: "btn-ghost", value: "cancel" },
            { label: confirmLabel, style: confirmStyle, value: "confirm" },
        ]
    });
    return result === "confirm";
}

// Helper: prompt dialog
async function promptModal({ icon, title, message, value = "" } = {}) {
    // Mark the confirm button so Enter triggers it
    const confirmBtn = { label: "Save", style: "btn-primary", value: "__INPUT__" };
    confirmBtn["data-is-input"] = "true";

    // We need to mark the button after render; simpler to patch after showModal resolves
    modalActions.addEventListener("DOMNodeInserted", function patcher() {
        const btns = modalActions.querySelectorAll(".btn");
        btns.forEach(b => {
            if (b.textContent === "Save") b.dataset.isInput = "true";
        });
        modalActions.removeEventListener("DOMNodeInserted", patcher);
    });

    return showModal({
        icon, title, message,
        inputValue: value,
        buttons: [
            { label: "Cancel", style: "btn-ghost", value: null },
            { label: "Save", style: "btn-primary", value: "__INPUT__" },
        ]
    });
}

// ===== DATE FORMATTING =====
function formatDate(iso) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch { return iso; }
}

// ===== URL PARSING =====
function parseUrl(rawUrl) {
    try {
        const u = new URL(rawUrl);
        return { domain: u.hostname, path: u.pathname === "/" ? "" : u.pathname, href: rawUrl };
    } catch {
        return { domain: rawUrl, path: "", href: rawUrl };
    }
}

function getFaviconUrl(rawUrl) {
    try {
        const u = new URL(rawUrl);
        return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
    } catch { return null; }
}

// ===== PAGES VIEW =====

function getFilteredPages(allData) {
    const search = pageSearch.value.toLowerCase().trim();
    const sort = pageSortSelect.value;

    let pages = [...allData];

    // Search
    if (search) {
        pages = pages.filter(p => p.url.toLowerCase().includes(search));
    }

    // Filter
    if (pageFilter === "enabled") {
        pages = pages.filter(p => p.pageEnabled);
    } else if (pageFilter === "disabled") {
        pages = pages.filter(p => !p.pageEnabled);
    }

    // Always remove pages with 0 selectors after filtering
    pages = pages.filter(p => p.selectors.length > 0 || pageFilter === "all");

    // Sort
    if (sort === "az") {
        pages.sort((a, b) => a.url.localeCompare(b.url));
    } else if (sort === "most-selectors") {
        pages.sort((a, b) => b.selectors.length - a.selectors.length);
    } else if (sort === "newest") {
        pages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === "oldest") {
        pages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    return pages;
}

function renderPages(allData) {
    const pages = getFilteredPages(allData);

    // Stats bar
    const total = allData.length;
    const enabled = allData.filter(p => p.pageEnabled).length;
    const disabled = total - enabled;
    const totalSel = allData.reduce((n, p) => n + p.selectors.length, 0);

    statTotalPages.textContent = total;
    statEnabledPages.textContent = enabled;
    statDisabledPages.textContent = disabled;
    statTotalSelectors.textContent = totalSel;
    navPageCount.textContent = total;

    if (pages.length === 0) {
        pagesList.innerHTML = "";
        pagesEmpty.style.display = "";
        return;
    }

    pagesEmpty.style.display = "none";

    pagesList.innerHTML = pages.map(page => {
        const { domain, path } = parseUrl(page.url);
        const faviconUrl = getFaviconUrl(page.url);
        const totalSel = page.selectors.length;
        const onSel = page.selectors.filter(s => s.enabled).length;
        const offSel = totalSel - onSel;

        return `
      <div class="page-card ${page.pageEnabled ? "" : "page-inactive"}"
           data-url="${page.url}" role="button" tabindex="0"
           title="Click to view selectors for ${escapeHtml(page.url)}">
        <div class="page-card-top">
          <div class="page-favicon">
            ${faviconUrl
                ? `<img src="${escapeHtml(faviconUrl)}" alt="" onerror="this.parentElement.textContent='🌐'">`
                : "🌐"}
          </div>
          <div class="page-info">
            <div class="page-domain">${escapeHtml(domain)}</div>
            ${path ? `<div class="page-path">${escapeHtml(path)}</div>` : ""}
          </div>
          <div class="page-card-actions" role="presentation">
            <label class="toggle-wrap sm page-card-toggle" title="Toggle page active/inactive"
                   onclick="event.stopPropagation()">
              <input type="checkbox" class="toggle-input page-toggle-cb"
                     data-url="${page.url}" ${page.pageEnabled ? "checked" : ""}>
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
          </div>
        </div>
        <div class="page-card-divider"></div>
        <div class="page-card-bottom">
          <div class="page-selector-counts">
            <span class="count-item">
              <span class="count-dot total"></span>
              <span class="count-num">${totalSel}</span>&nbsp;total
            </span>
            <span class="count-item">
              <span class="count-dot enabled"></span>
              <span class="count-num">${onSel}</span>&nbsp;on
            </span>
            <span class="count-item">
              <span class="count-dot disabled"></span>
              <span class="count-num">${offSel}</span>&nbsp;off
            </span>
          </div>
          <span class="page-arrow">→</span>
        </div>
      </div>
    `;
    }).join("");
}

// ===== SELECTORS VIEW =====

function getFilteredSelectors(page) {
    const search = selectorSearch.value.toLowerCase().trim();
    const sort = selectorSortSelect.value;

    let sels = [...page.selectors];

    if (search) {
        sels = sels.filter(s => s.path.toLowerCase().includes(search));
    }

    if (selectorFilter === "enabled") {
        sels = sels.filter(s => s.enabled);
    } else if (selectorFilter === "disabled") {
        sels = sels.filter(s => !s.enabled);
    }

    if (sort === "newest") {
        sels.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === "oldest") {
        sels.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sort === "az") {
        sels.sort((a, b) => a.path.localeCompare(b.path));
    }

    return sels;
}

function renderSelectors(page) {
    const sels = getFilteredSelectors(page);

    // Stats
    const total = page.selectors.length;
    const enabled = page.selectors.filter(s => s.enabled).length;
    statSelectorTotal.textContent = total;
    statSelectorEnabled.textContent = enabled;
    statSelectorDisabled.textContent = total - enabled;

    const tableWrap = document.querySelector(".table-wrap");

    if (sels.length === 0) {
        tableWrap.style.display = "none";
        selectorsEmpty.style.display = "";
        return;
    }

    selectorsEmpty.style.display = "none";
    tableWrap.style.display = "";

    selectorsTbody.innerHTML = sels.map(sel => `
    <tr data-id="${sel.id}">
      <td>
        <div class="td-status">
          <label class="toggle-wrap sm" title="Toggle selector on/off">
            <input type="checkbox" class="toggle-input sel-toggle-cb"
                   data-id="${sel.id}" ${sel.enabled ? "checked" : ""}>
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
          </label>
        </div>
      </td>
      <td class="td-path">
        <textarea class="td-path-editable" rows="1"
                  data-id="${sel.id}"
                  title="Click to edit selector path"
                  spellcheck="false">${escapeHtml(sel.path)}</textarea>
      </td>
      <td class="td-date">${formatDate(sel.createdAt)}</td>
      <td>
        <div class="td-actions">
          <button class="action-btn sel-edit-btn" data-id="${sel.id}" title="Edit selector">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn danger sel-delete-btn" data-id="${sel.id}" title="Delete selector">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `).join("");

    // Auto-resize textareas
    selectorsTbody.querySelectorAll(".td-path-editable").forEach(autoResizeTextarea);
}

function autoResizeTextarea(ta) {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
}

// ===== NAVIGATE TO SELECTORS VIEW =====

async function openSelectorsView(url) {
    currentPageUrl = url;
    const allData = await loadAllData();
    const page = allData.find(p => p.url === url);
    if (!page) return;

    const { domain, path } = parseUrl(url);
    selectorViewTitle.textContent = domain;
    selectorViewUrl.textContent = url;
    pageToggleMain.checked = page.pageEnabled;

    // Clear search / filter when navigating
    selectorSearch.value = "";
    selectorSearchClear.style.display = "none";
    selectorFilter = "all";
    document.querySelectorAll('[data-target="selector"]').forEach(el => {
        el.classList.toggle("active", el.dataset.filter === "all");
    });

    viewPages.classList.remove("active");
    viewSelectors.classList.add("active");

    renderSelectors(page);
}

backBtn.addEventListener("click", () => {
    viewSelectors.classList.remove("active");
    viewPages.classList.add("active");
    currentPageUrl = null;
    loadAndRenderPages();
});

// ===== PAGES GRID EVENTS (delegation) =====

pagesList.addEventListener("click", async (e) => {
    // Toggle checkbox — stop propagation is already set via onclick in HTML
    const toggleCb = e.target.closest(".page-toggle-cb");
    if (toggleCb) {
        e.stopPropagation();
        return; // handled by change event
    }

    // Card click → open selectors
    const card = e.target.closest(".page-card");
    if (card) {
        const url = card.dataset.url;
        if (url) await openSelectorsView(url);
    }
});

// Keyboard navigation for cards
pagesList.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" || e.key === " ") {
        const card = e.target.closest(".page-card");
        if (card) {
            e.preventDefault();
            await openSelectorsView(card.dataset.url);
        }
    }
});

// Page toggle via change event only (avoids double-fire)
pagesList.addEventListener("change", async (e) => {
    const cb = e.target.closest(".page-toggle-cb");
    if (!cb) return;

    const url = cb.dataset.url;
    const allData = await loadAllData();
    const page = allData.find(p => p.url === url);
    if (page) {
        page.pageEnabled = cb.checked;
        await saveAllData(allData);
        await loadAndRenderPages();
        showToast(cb.checked ? "Page enabled" : "Page disabled", "info");
    }
});

// ===== SELECTORS TABLE EVENTS (delegation) =====

// Toggle selector — use only change event
document.getElementById("selectorsTbody").addEventListener("change", async (e) => {
    const cb = e.target.closest(".sel-toggle-cb");
    if (!cb || !currentPageUrl) return;

    const id = cb.dataset.id;
    const allData = await loadAllData();
    const page = allData.find(p => p.url === currentPageUrl);
    if (page) {
        const sel = page.selectors.find(s => s.id === id);
        if (sel) {
            sel.enabled = cb.checked;
            await saveAllData(allData);
            // Update stats without full re-render
            const enabled = page.selectors.filter(s => s.enabled).length;
            statSelectorEnabled.textContent = enabled;
            statSelectorDisabled.textContent = page.selectors.length - enabled;
            showToast(cb.checked ? "Selector enabled" : "Selector disabled", "info");
        }
    }
});

// Click delegation for edit / delete buttons
document.getElementById("selectorsTbody").addEventListener("click", async (e) => {
    // Edit button
    const editBtn = e.target.closest(".sel-edit-btn");
    if (editBtn && currentPageUrl) {
        const id = editBtn.dataset.id;
        const row = editBtn.closest("tr");
        const ta = row?.querySelector(".td-path-editable");
        if (ta) {
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
        }
        return;
    }

    // Delete button
    const delBtn = e.target.closest(".sel-delete-btn");
    if (delBtn && currentPageUrl) {
        const id = delBtn.dataset.id;
        const allData = await loadAllData();
        const page = allData.find(p => p.url === currentPageUrl);
        const sel = page?.selectors.find(s => s.id === id);
        if (!sel) return;

        const confirmed = await confirmModal({
            icon: "🗑️",
            title: "Delete Selector",
            message: `Delete this selector permanently?\n\n${sel.path}`,
            confirmLabel: "Delete"
        });
        if (!confirmed) return;

        page.selectors = page.selectors.filter(s => s.id !== id);
        if (page.selectors.length === 0) {
            const idx = allData.indexOf(page);
            allData.splice(idx, 1);
        }
        await saveAllData(allData);

        if (page.selectors.length === 0) {
            // Go back — page deleted
            viewSelectors.classList.remove("active");
            viewPages.classList.add("active");
            currentPageUrl = null;
            await loadAndRenderPages();
            showToast("Selector deleted (page also removed — no selectors left)", "warning");
        } else {
            renderSelectors(page);
            showToast("Selector deleted", "success");
        }
        return;
    }
});

// Inline edit via textarea (blur / Enter / Escape)
document.getElementById("selectorsTbody").addEventListener("focusin", (e) => {
    const ta = e.target.closest(".td-path-editable");
    if (ta) autoResizeTextarea(ta);
});

document.getElementById("selectorsTbody").addEventListener("input", (e) => {
    const ta = e.target.closest(".td-path-editable");
    if (ta) autoResizeTextarea(ta);
});

document.getElementById("selectorsTbody").addEventListener("keydown", (e) => {
    const ta = e.target.closest(".td-path-editable");
    if (!ta) return;

    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        ta.blur();
    }
    if (e.key === "Escape") {
        e.preventDefault();
        // Restore original value
        ta.dataset.dirty = "";  // signal to blur handler to cancel
        ta.blur();
    }
});

document.getElementById("selectorsTbody").addEventListener("focusout", async (e) => {
    const ta = e.target.closest(".td-path-editable");
    if (!ta || !currentPageUrl) return;

    const id = ta.dataset.id;
    const newPath = ta.value.trim();
    const allData = await loadAllData();
    const page = allData.find(p => p.url === currentPageUrl);
    if (!page) return;

    const sel = page.selectors.find(s => s.id === id);
    if (!sel) return;

    const originalPath = sel.path;

    // Escape pressed — restore
    if ("dirty" in ta.dataset && ta.dataset.dirty === "") {
        ta.value = originalPath;
        delete ta.dataset.dirty;
        autoResizeTextarea(ta);
        return;
    }

    if (!newPath || newPath === originalPath) {
        ta.value = originalPath;
        autoResizeTextarea(ta);
        return;
    }

    sel.path = newPath;
    await saveAllData(allData);
    showToast("Selector updated", "success");
    autoResizeTextarea(ta);
});

// ===== PAGE HEADER CONTROLS (selectors view) =====

pageToggleMain.addEventListener("change", async () => {
    if (!currentPageUrl) return;
    const allData = await loadAllData();
    const page = allData.find(p => p.url === currentPageUrl);
    if (page) {
        page.pageEnabled = pageToggleMain.checked;
        await saveAllData(allData);
        showToast(page.pageEnabled ? "Page enabled" : "Page disabled", "info");
    }
});

deletePageBtn.addEventListener("click", async () => {
    if (!currentPageUrl) return;
    const confirmed = await confirmModal({
        icon: "🗑️",
        title: "Delete Page",
        message: `Delete all RTL data for:\n${currentPageUrl}\n\nThis cannot be undone.`,
        confirmLabel: "Delete Page"
    });
    if (!confirmed) return;

    const allData = await loadAllData();
    const filtered = allData.filter(p => p.url !== currentPageUrl);
    await saveAllData(filtered);

    viewSelectors.classList.remove("active");
    viewPages.classList.add("active");
    currentPageUrl = null;
    await loadAndRenderPages();
    showToast("Page deleted", "success");
});

// ===== FILTER CHIPS =====

document.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        const target = chip.dataset.target; // "page" or "selector"
        const filter = chip.dataset.filter;

        // Update active chip in same group
        document.querySelectorAll(`.filter-chip[data-target="${target}"]`).forEach(c => {
            c.classList.toggle("active", c === chip);
        });

        if (target === "page") {
            pageFilter = filter;
            loadAndRenderPages();
        } else {
            selectorFilter = filter;
            refreshSelectorsView();
        }
    });
});

// ===== SEARCH =====

pageSearch.addEventListener("input", () => {
    pageSearchClear.style.display = pageSearch.value ? "" : "none";
    loadAndRenderPages();
});

pageSearchClear.addEventListener("click", () => {
    pageSearch.value = "";
    pageSearchClear.style.display = "none";
    loadAndRenderPages();
});

selectorSearch.addEventListener("input", () => {
    selectorSearchClear.style.display = selectorSearch.value ? "" : "none";
    refreshSelectorsView();
});

selectorSearchClear.addEventListener("click", () => {
    selectorSearch.value = "";
    selectorSearchClear.style.display = "none";
    refreshSelectorsView();
});

// ===== SORT =====
pageSortSelect.addEventListener("change", () => loadAndRenderPages());
selectorSortSelect.addEventListener("change", () => refreshSelectorsView());

// ===== GLOBAL CONTROLS =====

exportBtn.addEventListener("click", async () => {
    const allData = await loadAllData();
    const json = JSON.stringify({ rtl_data: allData }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rtl-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Data exported successfully", "success");
});

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!parsed.rtl_data || !Array.isArray(parsed.rtl_data)) {
            showToast("Invalid file: missing 'rtl_data' array", "error", 4000);
            return;
        }

        for (const page of parsed.rtl_data) {
            if (!page.url || !Array.isArray(page.selectors)) {
                showToast("Invalid file: each page must have 'url' and 'selectors'", "error", 4000);
                return;
            }
        }

        const confirmed = await confirmModal({
            icon: "📤",
            title: "Import Data",
            message: "This will REPLACE all current data with the imported file. Continue?",
            confirmLabel: "Import",
            confirmStyle: "btn-primary"
        });
        if (!confirmed) return;

        await saveAllData(parsed.rtl_data);
        await loadAndRenderPages();
        showToast("Import successful!", "success");
    } catch (err) {
        showToast("Failed to import: " + err.message, "error", 5000);
    }

    importFile.value = "";
});

clearAllBtn.addEventListener("click", async () => {
    const confirmed = await confirmModal({
        icon: "⚠️",
        title: "Clear All Data",
        message: "Delete ALL saved RTL data? This cannot be undone.",
        confirmLabel: "Clear All"
    });
    if (!confirmed) return;

    await saveAllData([]);
    if (viewSelectors.classList.contains("active")) {
        viewSelectors.classList.remove("active");
        viewPages.classList.add("active");
        currentPageUrl = null;
    }
    await loadAndRenderPages();
    showToast("All data cleared", "warning");
});

// ===== LOAD HELPERS =====

async function loadAndRenderPages() {
    const allData = await loadAllData();
    renderPages(allData);
}

async function refreshSelectorsView() {
    if (!currentPageUrl) return;
    const allData = await loadAllData();
    const page = allData.find(p => p.url === currentPageUrl);
    if (page) renderSelectors(page);
}

// ===== INIT =====
loadTheme().then(() => loadAndRenderPages());