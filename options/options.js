// ============================================
// Text Direction Fixer — Options Dashboard JS
// ============================================

// ===== DOM REFS =====
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");

const pageSearch = document.getElementById("pageSearch");
const pageSearchClear = document.getElementById("pageSearchClear");
const pageSortSelect = document.getElementById("pageSortSelect");
const pagesList = document.getElementById("pagesList");
const pagesEmpty = document.getElementById("pagesEmpty");
const statTotalPages = document.getElementById("statTotalPages");
const statEnabledPages = document.getElementById("statEnabledPages");
const statDisabledPages = document.getElementById("statDisabledPages");
const statTotalSelectors = document.getElementById("statTotalSelectors");

const viewPages = document.getElementById("viewPages");
const viewSelectors = document.getElementById("viewSelectors");
const backBtn = document.getElementById("backBtn");
const selectorViewTitle = document.getElementById("selectorViewTitle");
const selectorViewUrl = document.getElementById("selectorViewUrl");
const pageToggleMain = document.getElementById("pageToggleMain");
const openPageBtn = document.getElementById("openPageBtn");
const deletePageBtn = document.getElementById("deletePageBtn");
const selectorSearch = document.getElementById("selectorSearch");
const selectorSearchClear = document.getElementById("selectorSearchClear");
const selectorSortSelect = document.getElementById("selectorSortSelect");
const selectorsTbody = document.getElementById("selectorsTbody");
const selectorsEmpty = document.getElementById("selectorsEmpty");
const selectorsTableWrap = document.getElementById("selectorsTableWrap");
const statSelectorTotal = document.getElementById("statSelectorTotal");
const statSelectorEnabled = document.getElementById("statSelectorEnabled");
const statSelectorDisabled = document.getElementById("statSelectorDisabled");

const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const clearAllBtn = document.getElementById("clearAllBtn");

const modalOverlay = document.getElementById("modalOverlay");
const toastContainer = document.getElementById("toastContainer");

// ===== STATE =====
let currentPageUrl = null;
let pageFilter = "all";
let selectorFilter = "all";

// ===== HELPERS =====
const _escEl = document.createElement("div");
function escapeHtml(str) {
    _escEl.textContent = str;
    return _escEl.innerHTML;
}

function formatDateTime(iso) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleString(undefined, {
            month: "short", day: "numeric", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    } catch { return iso; }
}

// ===== THEME =====
const MOON_SVG = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
const SUN_SVG = `
  <circle cx="12" cy="12" r="5"/>
  <line x1="12" y1="1"  x2="12" y2="3"/>  <line x1="12" y1="21" x2="12" y2="23"/>
  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
  <line x1="1" y1="12" x2="3" y2="12"/>   <line x1="21" y1="12" x2="23" y2="12"/>
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
themeToggle.addEventListener("click", async () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    await chrome.storage.local.set({ rtl_theme: next });
});

// ===== STORAGE =====
async function loadAllData() {
    const { rtl_data } = await chrome.storage.local.get("rtl_data");
    if (!rtl_data) return [];
    if (Array.isArray(rtl_data)) return rtl_data;
    if (typeof rtl_data === "object") {
        const migrated = Object.values(rtl_data);
        await chrome.storage.local.set({ rtl_data: migrated });
        console.info("[RTL] Storage migrated from object to array");
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
    <span class="toast-icon">${icons[type] ?? "ℹ"}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("show")));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

// ===== MODAL =====
/*
 * The modal is rebuilt from scratch each time it opens so we have
 * full control over the header / body / footer split needed to make
 * the scrollable-body pattern work correctly.
 *
 * Structure rendered into #modalOverlay:
 *
 *   .modal
 *     .modal-header   ← fixed, never scrolls  (icon + title)
 *     .modal-body     ← scrollable if content overflows
 *       .modal-message  (or arbitrary bodyHtml)
 *       .modal-input-wrap  (optional)
 *     .modal-footer   ← fixed, never scrolls  (action buttons)
 *       .modal-actions
 */

let _modalResolve = null;

function _buildModal({ icon = "", title = "", message = "", bodyHtml,
    buttons = [], inputValue } = {}) {
    // Remove any previous modal box
    const old = modalOverlay.querySelector(".modal");
    if (old) old.remove();

    const modal = document.createElement("div");
    modal.className = "modal";

    // ── Header ──
    const header = document.createElement("div");
    header.className = "modal-header";
    if (icon) {
        const iconEl = document.createElement("div");
        iconEl.className = "modal-icon";
        iconEl.textContent = icon;
        header.appendChild(iconEl);
    }
    const titleEl = document.createElement("h2");
    titleEl.className = "modal-title";
    titleEl.textContent = title;
    header.appendChild(titleEl);
    modal.appendChild(header);

    // ── Body (scrollable) ──
    const body = document.createElement("div");
    body.className = "modal-body";

    const msgEl = document.createElement("p");
    msgEl.className = "modal-message";
    if (bodyHtml !== undefined) {
        msgEl.innerHTML = bodyHtml;
    } else if (message) {
        msgEl.textContent = message;
    }
    body.appendChild(msgEl);

    // Optional text input
    const hasInput = inputValue !== undefined;
    let inputEl = null;
    if (hasInput) {
        const wrap = document.createElement("div");
        wrap.className = "modal-input-wrap";
        inputEl = document.createElement("input");
        inputEl.type = "text";
        inputEl.className = "modal-input";
        inputEl.value = inputValue;
        wrap.appendChild(inputEl);
        body.appendChild(wrap);

        inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                footer.querySelector("[data-is-input]")?.click();
            }
        });
    }

    modal.appendChild(body);

    // ── Footer (action buttons) ──
    const footer = document.createElement("div");
    footer.className = "modal-footer";
    const actions = document.createElement("div");
    actions.className = "modal-actions";

    for (const btn of buttons) {
        const el = document.createElement("button");
        el.className = `btn ${btn.style || "btn-ghost"}`;
        el.textContent = btn.label;
        if (btn.isInput) el.dataset.isInput = "true";
        el.addEventListener("click", () =>
            closeModal(btn.value === "__INPUT__" ? (inputEl?.value.trim() ?? "") : btn.value)
        );
        actions.appendChild(el);
    }

    footer.appendChild(actions);
    modal.appendChild(footer);
    modalOverlay.appendChild(modal);

    return { modal, inputEl, footer };
}

function showModal(opts = {}) {
    return new Promise((resolve) => {
        _modalResolve = resolve;
        const { inputEl, footer } = _buildModal(opts);
        modalOverlay.classList.add("open");

        // Scroll overlay back to top so the modal header is always visible first
        modalOverlay.scrollTop = 0;

        setTimeout(() => {
            if (inputEl) { inputEl.focus(); inputEl.select(); }
            else footer.querySelector(".btn")?.focus();
        }, 120);
    });
}

function closeModal(value = null) {
    modalOverlay.classList.remove("open");
    if (_modalResolve) { _modalResolve(value); _modalResolve = null; }
}

// Close on overlay background click
modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal(null);
});

// Close on Escape
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalOverlay.classList.contains("open")) closeModal(null);
});

// ── Confirm helper ──
async function confirmModal({
    icon = "", title = "", message = "",
    confirmLabel = "Confirm", confirmStyle = "btn-danger"
} = {}) {
    const result = await showModal({
        icon, title, message,
        buttons: [
            { label: "Cancel", style: "btn-ghost", value: "cancel" },
            { label: confirmLabel, style: confirmStyle, value: "confirm" },
        ]
    });
    return result === "confirm";
}

// ===== URL HELPERS =====
function parseUrl(rawUrl) {
    try {
        const u = new URL(rawUrl);
        return { domain: u.hostname, path: u.pathname === "/" ? "" : u.pathname };
    } catch { return { domain: rawUrl, path: "" }; }
}
function getFaviconUrl(rawUrl) {
    try { return `https://www.google.com/s2/favicons?domain=${new URL(rawUrl).hostname}&sz=32`; }
    catch { return null; }
}

// ===== PAGES VIEW =====

function getFilteredPages(allData) {
    const search = pageSearch.value.toLowerCase().trim();
    const sort = pageSortSelect.value;

    let pages = allData.filter(p => p.selectors.length > 0);
    if (search) pages = pages.filter(p => p.url.toLowerCase().includes(search));
    if (pageFilter === "enabled") pages = pages.filter(p => p.pageEnabled);
    if (pageFilter === "disabled") pages = pages.filter(p => !p.pageEnabled);

    if (sort === "az") pages.sort((a, b) => a.url.localeCompare(b.url));
    if (sort === "most-selectors") pages.sort((a, b) => b.selectors.length - a.selectors.length);
    if (sort === "newest") pages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (sort === "oldest") pages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    return pages;
}

function renderPages(allData) {
    const pages = getFilteredPages(allData);
    const total = allData.length;
    const enabled = allData.filter(p => p.pageEnabled).length;
    const totSel = allData.reduce((n, p) => n + p.selectors.length, 0);

    statTotalPages.textContent = total;
    statEnabledPages.textContent = enabled;
    statDisabledPages.textContent = total - enabled;
    statTotalSelectors.textContent = totSel;

    if (pages.length === 0) {
        pagesList.innerHTML = ""; pagesEmpty.style.display = ""; return;
    }
    pagesEmpty.style.display = "none";

    pagesList.innerHTML = pages.map(page => {
        const { domain, path } = parseUrl(page.url);
        const faviconUrl = getFaviconUrl(page.url);
        const tot = page.selectors.length;
        const on = page.selectors.filter(s => s.enabled).length;
        const off = tot - on;

        return `
      <div class="page-card ${page.pageEnabled ? "" : "page-inactive"}">
        <div class="page-card-link"
             data-url="${escapeHtml(page.url)}"
             role="button" tabindex="0"
             title="View selectors for ${escapeHtml(page.url)}">
          <div class="page-favicon">
            ${faviconUrl
                ? `<img src="${escapeHtml(faviconUrl)}" alt=""
                      onerror="this.parentElement.textContent='🌐'">`
                : "🌐"}
          </div>
          <div class="page-info">
            <div class="page-domain">${escapeHtml(domain)}</div>
            ${path ? `<div class="page-path">${escapeHtml(path)}</div>` : ""}
            <div class="page-created">Added ${escapeHtml(formatDateTime(page.createdAt))}</div>
          </div>
          <span class="page-arrow">→</span>
        </div>
        <div class="page-card-bottom">
          <div class="page-selector-counts">
            <span class="count-item">
              <span class="count-dot total"></span>
              <span class="count-num">${tot}</span>&thinsp;total
            </span>
            <span class="count-item">
              <span class="count-dot enabled"></span>
              <span class="count-num">${on}</span>&thinsp;on
            </span>
            <span class="count-item">
              <span class="count-dot disabled"></span>
              <span class="count-num">${off}</span>&thinsp;off
            </span>
          </div>
          <div class="page-card-actions">
            <button class="action-btn page-open-btn"
                    data-url="${escapeHtml(page.url)}"
                    title="Open page in new tab">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </button>
            <button class="action-btn danger page-delete-btn"
                    data-url="${escapeHtml(page.url)}"
                    title="Delete this page">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
            </button>
            <label class="toggle-wrap sm" title="Enable / disable page">
              <input type="checkbox"
                     class="toggle-input page-toggle-cb"
                     data-url="${escapeHtml(page.url)}"
                     ${page.pageEnabled ? "checked" : ""}>
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
          </div>
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
    if (search) sels = sels.filter(s => s.path.toLowerCase().includes(search));
    if (selectorFilter === "enabled") sels = sels.filter(s => s.enabled);
    if (selectorFilter === "disabled") sels = sels.filter(s => !s.enabled);
    if (sort === "newest") sels.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (sort === "oldest") sels.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (sort === "az") sels.sort((a, b) => a.path.localeCompare(b.path));
    return sels;
}

function renderSelectors(page) {
    const sels = getFilteredSelectors(page);
    const total = page.selectors.length;
    const enabled = page.selectors.filter(s => s.enabled).length;

    statSelectorTotal.textContent = total;
    statSelectorEnabled.textContent = enabled;
    statSelectorDisabled.textContent = total - enabled;

    if (sels.length === 0) {
        selectorsTableWrap.style.display = "none";
        selectorsEmpty.style.display = "";
        return;
    }
    selectorsEmpty.style.display = "none";
    selectorsTableWrap.style.display = "";

    selectorsTbody.innerHTML = sels.map(sel => `
    <tr data-id="${sel.id}">
      <td>
        <div class="td-status">
          <label class="toggle-wrap sm" title="Toggle on/off">
            <input type="checkbox" class="toggle-input sel-toggle-cb"
                   data-id="${sel.id}" ${sel.enabled ? "checked" : ""}>
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
          </label>
        </div>
      </td>
      <td class="td-path">
        <textarea class="td-path-editable" rows="1"
                  data-id="${sel.id}" spellcheck="false"
                  title="Click to edit">${escapeHtml(sel.path)}</textarea>
      </td>
      <td class="td-date">${escapeHtml(formatDateTime(sel.createdAt))}</td>
      <td>
        <div class="td-actions">
          <button class="action-btn sel-edit-btn" data-id="${sel.id}" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn danger sel-delete-btn" data-id="${sel.id}" title="Delete">
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

    selectorsTbody.querySelectorAll(".td-path-editable").forEach(autoResizeTextarea);
}

function autoResizeTextarea(ta) {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
}

// ===== NAVIGATION =====

async function openSelectorsView(url) {
    currentPageUrl = url;
    const allData = await loadAllData();
    const page = allData.find(p => p.url === url);
    if (!page) return;

    selectorViewTitle.textContent = parseUrl(url).domain;
    selectorViewUrl.textContent = url;
    pageToggleMain.checked = page.pageEnabled;
    openPageBtn.dataset.url = url;

    selectorSearch.value = "";
    selectorSearchClear.style.display = "none";
    selectorFilter = "all";
    document.querySelectorAll('[data-target="selector"]').forEach(el =>
        el.classList.toggle("active", el.dataset.filter === "all")
    );

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

openPageBtn.addEventListener("click", () => {
    const url = openPageBtn.dataset.url;
    if (url) chrome.tabs.create({ url, active: true });
});

// ===== PAGES GRID EVENTS =====

pagesList.addEventListener("click", async (e) => {
    const openBtn = e.target.closest(".page-open-btn");
    if (openBtn) { chrome.tabs.create({ url: openBtn.dataset.url, active: true }); return; }

    const delBtn = e.target.closest(".page-delete-btn");
    if (delBtn) {
        const url = delBtn.dataset.url;
        const confirmed = await confirmModal({
            icon: "🗑️", title: "Delete Page",
            message: `Delete all RTL data for:\n${url}\n\nThis cannot be undone.`,
            confirmLabel: "Delete Page"
        });
        if (!confirmed) return;
        const allData = await loadAllData();
        await saveAllData(allData.filter(p => p.url !== url));
        await loadAndRenderPages();
        showToast("Page deleted", "success");
        return;
    }

    const link = e.target.closest(".page-card-link");
    if (link?.dataset.url) await openSelectorsView(link.dataset.url);
});

pagesList.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const link = e.target.closest(".page-card-link");
    if (link?.dataset.url) { e.preventDefault(); await openSelectorsView(link.dataset.url); }
});

pagesList.addEventListener("change", async (e) => {
    const cb = e.target.closest(".page-toggle-cb");
    if (!cb) return;
    const allData = await loadAllData();
    const page = allData.find(p => p.url === cb.dataset.url);
    if (!page) return;
    page.pageEnabled = cb.checked;
    await saveAllData(allData);
    await loadAndRenderPages();
    showToast(cb.checked ? "Page enabled" : "Page disabled", "info");
});

// ===== SELECTORS TABLE EVENTS =====

selectorsTbody.addEventListener("change", async (e) => {
    const cb = e.target.closest(".sel-toggle-cb");
    if (!cb || !currentPageUrl) return;
    const allData = await loadAllData();
    const page = allData.find(p => p.url === currentPageUrl);
    if (!page) return;
    const sel = page.selectors.find(s => s.id === cb.dataset.id);
    if (!sel) return;
    sel.enabled = cb.checked;
    await saveAllData(allData);
    const on = page.selectors.filter(s => s.enabled).length;
    statSelectorEnabled.textContent = on;
    statSelectorDisabled.textContent = page.selectors.length - on;
    showToast(cb.checked ? "Selector enabled" : "Selector disabled", "info");
});

selectorsTbody.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".sel-edit-btn");
    if (editBtn) {
        const ta = editBtn.closest("tr")?.querySelector(".td-path-editable");
        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
        return;
    }
    const delBtn = e.target.closest(".sel-delete-btn");
    if (delBtn && currentPageUrl) {
        const id = delBtn.dataset.id;
        const allData = await loadAllData();
        const page = allData.find(p => p.url === currentPageUrl);
        const sel = page?.selectors.find(s => s.id === id);
        if (!sel) return;
        const confirmed = await confirmModal({
            icon: "🗑️", title: "Delete Selector",
            message: `Delete this selector permanently?\n\n${sel.path}`,
            confirmLabel: "Delete"
        });
        if (!confirmed) return;
        page.selectors = page.selectors.filter(s => s.id !== id);
        if (page.selectors.length === 0) {
            allData.splice(allData.indexOf(page), 1);
            await saveAllData(allData);
            viewSelectors.classList.remove("active");
            viewPages.classList.add("active");
            currentPageUrl = null;
            await loadAndRenderPages();
            showToast("Selector deleted (page removed — no selectors left)", "warning");
        } else {
            await saveAllData(allData);
            renderSelectors(page);
            showToast("Selector deleted", "success");
        }
    }
});

selectorsTbody.addEventListener("focusin", (e) => {
    const ta = e.target.closest(".td-path-editable");
    if (ta) autoResizeTextarea(ta);
});
selectorsTbody.addEventListener("input", (e) => {
    const ta = e.target.closest(".td-path-editable");
    if (ta) autoResizeTextarea(ta);
});
selectorsTbody.addEventListener("keydown", (e) => {
    const ta = e.target.closest(".td-path-editable");
    if (!ta) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ta.blur(); }
    if (e.key === "Escape") { e.preventDefault(); ta.dataset.cancelled = "true"; ta.blur(); }
});
selectorsTbody.addEventListener("focusout", async (e) => {
    const ta = e.target.closest(".td-path-editable");
    if (!ta || !currentPageUrl) return;
    const allData = await loadAllData();
    const page = allData.find(p => p.url === currentPageUrl);
    if (!page) return;
    const sel = page.selectors.find(s => s.id === ta.dataset.id);
    if (!sel) return;
    if (ta.dataset.cancelled === "true") {
        delete ta.dataset.cancelled; ta.value = sel.path; autoResizeTextarea(ta); return;
    }
    const newPath = ta.value.trim();
    if (!newPath || newPath === sel.path) { ta.value = sel.path; autoResizeTextarea(ta); return; }
    sel.path = newPath;
    await saveAllData(allData);
    showToast("Selector updated", "success");
    autoResizeTextarea(ta);
});

// ===== SELECTORS VIEW HEADER =====

pageToggleMain.addEventListener("change", async () => {
    if (!currentPageUrl) return;
    const allData = await loadAllData();
    const page = allData.find(p => p.url === currentPageUrl);
    if (!page) return;
    page.pageEnabled = pageToggleMain.checked;
    await saveAllData(allData);
    showToast(page.pageEnabled ? "Page enabled" : "Page disabled", "info");
});

deletePageBtn.addEventListener("click", async () => {
    if (!currentPageUrl) return;
    const confirmed = await confirmModal({
        icon: "🗑️", title: "Delete Page",
        message: `Delete all RTL data for:\n${currentPageUrl}\n\nThis cannot be undone.`,
        confirmLabel: "Delete Page"
    });
    if (!confirmed) return;
    const allData = await loadAllData();
    await saveAllData(allData.filter(p => p.url !== currentPageUrl));
    viewSelectors.classList.remove("active");
    viewPages.classList.add("active");
    currentPageUrl = null;
    await loadAndRenderPages();
    showToast("Page deleted", "success");
});

// ===== FILTER CHIPS =====
document.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        const target = chip.dataset.target, filter = chip.dataset.filter;
        document.querySelectorAll(`.filter-chip[data-target="${target}"]`).forEach(c =>
            c.classList.toggle("active", c === chip)
        );
        if (target === "page") { pageFilter = filter; loadAndRenderPages(); }
        else { selectorFilter = filter; refreshSelectorsView(); }
    });
});

// ===== SEARCH =====
pageSearch.addEventListener("input", () => {
    pageSearchClear.style.display = pageSearch.value ? "" : "none"; loadAndRenderPages();
});
pageSearchClear.addEventListener("click", () => {
    pageSearch.value = ""; pageSearchClear.style.display = "none"; loadAndRenderPages();
});
selectorSearch.addEventListener("input", () => {
    selectorSearchClear.style.display = selectorSearch.value ? "" : "none"; refreshSelectorsView();
});
selectorSearchClear.addEventListener("click", () => {
    selectorSearch.value = ""; selectorSearchClear.style.display = "none"; refreshSelectorsView();
});

// ===== SORT =====
pageSortSelect.addEventListener("change", () => loadAndRenderPages());
selectorSortSelect.addEventListener("change", () => refreshSelectorsView());

// ===== EXPORT =====
exportBtn.addEventListener("click", async () => {
    const allData = await loadAllData();
    const blob = new Blob([JSON.stringify({ rtl_data: allData }, null, 2)],
        { type: "application/json" });
    const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: `rtl-backup-${new Date().toISOString().slice(0, 10)}.json`
    });
    a.click(); URL.revokeObjectURL(a.href);
    showToast("Data exported successfully", "success");
});

// ===== IMPORT — VALIDATION =====

function validateSelector(sel, index) {
    const e = [], ctx = `Selector #${index + 1}`;
    if (typeof sel !== "object" || sel === null || Array.isArray(sel))
        return [`${ctx}: must be an object`];
    if (typeof sel.id !== "string" || !sel.id.trim())
        e.push(`${ctx}: "id" must be a non-empty string`);
    if (typeof sel.path !== "string" || !sel.path.trim())
        e.push(`${ctx}: "path" must be a non-empty string`);
    if (typeof sel.enabled !== "boolean")
        e.push(`${ctx}: "enabled" must be true or false`);
    if (sel.createdAt !== undefined && isNaN(new Date(sel.createdAt).getTime()))
        e.push(`${ctx}: "createdAt" is not a valid date`);
    return e;
}

function validatePage(page, index) {
    const e = [], ctx = `Page #${index + 1}`;
    if (typeof page !== "object" || page === null || Array.isArray(page))
        return [`${ctx}: must be an object`];
    if (typeof page.url !== "string" || !page.url.trim())
        e.push(`${ctx}: "url" must be a non-empty string`);
    else { try { new URL(page.url); } catch { e.push(`${ctx}: invalid URL ("${page.url}")`); } }
    if (typeof page.pageEnabled !== "boolean")
        e.push(`${ctx}: "pageEnabled" must be true or false`);
    if (page.createdAt !== undefined && isNaN(new Date(page.createdAt).getTime()))
        e.push(`${ctx}: "createdAt" is not a valid date`);
    if (!Array.isArray(page.selectors))
        e.push(`${ctx}: "selectors" must be an array`);
    else page.selectors.forEach((s, i) => { const se = validateSelector(s, i); if (se.length) e.push(se[0]); });
    return e;
}

function validateImportPayload(parsed) {
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        return { ok: false, errors: ["File must contain a JSON object at the top level"] };
    if (!Object.prototype.hasOwnProperty.call(parsed, "rtl_data"))
        return { ok: false, errors: ['Missing top-level key "rtl_data"'] };
    if (!Array.isArray(parsed.rtl_data))
        return { ok: false, errors: ['"rtl_data" must be an array'] };
    if (parsed.rtl_data.length === 0)
        return { ok: true, warnings: ["The file contains no pages (empty array)"] };

    const errors = [];
    for (let i = 0; i < parsed.rtl_data.length; i++) {
        errors.push(...validatePage(parsed.rtl_data[i], i));
        if (errors.length >= 10) { errors.push("… and more errors (first 10 shown)"); break; }
    }
    return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ===== IMPORT — MERGE STRATEGIES =====

function applyMergeStrategy(existing, incoming, strategy) {
    if (strategy === "replace") return incoming;

    if (strategy === "skip") {
        const existingUrls = new Set(existing.map(p => p.url));
        return [...existing, ...incoming.filter(p => !existingUrls.has(p.url))];
    }

    const result = existing.map(p => ({ ...p, selectors: [...p.selectors] }));
    const urlIndex = new Map(result.map((p, i) => [p.url, i]));

    for (const incomingPage of incoming) {
        if (!urlIndex.has(incomingPage.url)) {
            urlIndex.set(incomingPage.url, result.length);
            result.push({ ...incomingPage, selectors: [...incomingPage.selectors] });
            continue;
        }

        const idx = urlIndex.get(incomingPage.url);
        const oldPage = result[idx];

        const oldByPath = new Map(oldPage.selectors.map(s => [s.path, s]));
        const newByPath = new Map(incomingPage.selectors.map(s => [s.path, s]));
        const allPaths = new Set([...oldByPath.keys(), ...newByPath.keys()]);

        const mergedSelectors = [];
        for (const path of allPaths) {
            const oldSel = oldByPath.get(path);
            const newSel = newByPath.get(path);
            if (oldSel && newSel) {
                // Both sides have this path — pick winner based on strategy
                mergedSelectors.push(strategy === "merge-keep" ? oldSel : newSel);
            } else {
                mergedSelectors.push(oldSel ?? newSel);
            }
        }

        result[idx] = strategy === "merge-keep"
            ? { ...oldPage, selectors: mergedSelectors }
            : {
                ...oldPage, pageEnabled: incomingPage.pageEnabled,
                createdAt: incomingPage.createdAt ?? oldPage.createdAt,
                selectors: mergedSelectors
            };
    }
    return result;
}

// ===== IMPORT — STRATEGY PICKER MODAL =====

function showStrategyModal(stats) {
    return new Promise((resolve) => {
        _modalResolve = resolve;

        // Rebuild modal with header / body / footer
        const old = modalOverlay.querySelector(".modal");
        if (old) old.remove();

        const modal = document.createElement("div");
        modal.className = "modal";

        // Header (fixed)
        modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-icon">📥</div>
        <h2 class="modal-title">Choose Import Strategy</h2>
      </div>
    `;

        // Body (scrollable) — all content including strategy buttons goes here
        const body = document.createElement("div");
        body.className = "modal-body";
        body.innerHTML = `
      <div class="import-stats">
        <span class="import-stat">
          <strong>${stats.incomingPages}</strong>
          page${stats.incomingPages !== 1 ? "s" : ""}
        </span>
        <span class="import-stat-sep">·</span>
        <span class="import-stat">
          <strong>${stats.incomingSelectors}</strong>
          selector${stats.incomingSelectors !== 1 ? "s" : ""}
        </span>
        <span class="import-stat-sep">·</span>
        <span class="import-stat">
          <strong>${stats.duplicateUrls}</strong>
          duplicate URL${stats.duplicateUrls !== 1 ? "s" : ""}
        </span>
      </div>
      <p class="import-desc">How should the imported data be combined with your existing data?</p>
      <div class="strategy-list">
        <button class="strategy-btn strategy-danger" data-strategy="replace">
          <span class="strategy-icon">🔄</span>
          <span class="strategy-text">
            <span class="strategy-label">Replace All</span>
            <span class="strategy-sublabel">Discard current data entirely, use imported data only</span>
          </span>
        </button>
        <button class="strategy-btn" data-strategy="merge-keep">
          <span class="strategy-icon">🔀</span>
          <span class="strategy-text">
            <span class="strategy-label">Merge — Keep existing info</span>
            <span class="strategy-sublabel">Combine selectors. Conflicts: keep current selector &amp; page settings</span>
          </span>
        </button>
        <button class="strategy-btn" data-strategy="merge-update">
          <span class="strategy-icon">🔁</span>
          <span class="strategy-text">
            <span class="strategy-label">Merge — Use imported info</span>
            <span class="strategy-sublabel">Combine selectors. Conflicts: use imported selector &amp; page settings</span>
          </span>
        </button>
        <button class="strategy-btn" data-strategy="skip">
          <span class="strategy-icon">⏭️</span>
          <span class="strategy-text">
            <span class="strategy-label">Skip Duplicates</span>
            <span class="strategy-sublabel">Only add pages whose URL does not already exist</span>
          </span>
        </button>
        <button class="btn btn-ghost strategy-cancel">Cancel</button>
      </div>
    `;
        modal.appendChild(body);

        // No separate footer needed — Cancel is the last item in the scrollable list
        modalOverlay.appendChild(modal);

        // Wire up buttons
        body.querySelectorAll("[data-strategy]").forEach(btn =>
            btn.addEventListener("click", () => closeModal(btn.dataset.strategy))
        );
        body.querySelector(".strategy-cancel").addEventListener("click", () => closeModal(null));

        modalOverlay.classList.add("open");
        modalOverlay.scrollTop = 0;
        setTimeout(() => body.querySelector(".strategy-btn")?.focus(), 120);
    });
}

// ===== IMPORT — MAIN HANDLER =====

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importFile.value = "";

    let parsed;
    try {
        parsed = JSON.parse(await file.text());
    } catch (err) {
        await showModal({
            icon: "❌", title: "Invalid JSON",
            message: `The file could not be parsed as JSON.\n\n${err.message}`,
            buttons: [{ label: "OK", style: "btn-primary", value: "ok" }]
        });
        return;
    }

    const { ok, errors, warnings } = validateImportPayload(parsed);
    if (!ok) {
        await showModal({
            icon: "⚠️", title: "Validation Failed",
            message: `The file contains ${errors.length} error${errors.length !== 1 ? "s" : ""}:\n\n`
                + errors.map(e => `• ${e}`).join("\n"),
            buttons: [{ label: "OK", style: "btn-primary", value: "ok" }]
        });
        return;
    }

    if (warnings?.length) {
        const cont = await confirmModal({
            icon: "ℹ️", title: "Import Warning",
            message: warnings.join("\n") + "\n\nContinue anyway?",
            confirmLabel: "Continue", confirmStyle: "btn-primary"
        });
        if (!cont) return;
    }

    const existing = await loadAllData();
    const existingUrls = new Set(existing.map(p => p.url));
    const incomingPages = parsed.rtl_data.length;
    const incomingSelectors = parsed.rtl_data.reduce((n, p) => n + p.selectors.length, 0);
    const duplicateUrls = parsed.rtl_data.filter(p => existingUrls.has(p.url)).length;

    const strategy = await showStrategyModal({ incomingPages, incomingSelectors, duplicateUrls });
    if (!strategy) return;

    await saveAllData(applyMergeStrategy(existing, parsed.rtl_data, strategy));
    await loadAndRenderPages();

    const labels = {
        "replace": "Replaced all data with imported file",
        "merge-keep": "Merged — existing info kept for conflicts",
        "merge-update": "Merged — imported info used for conflicts",
        "skip": "New pages imported, duplicates skipped",
    };
    showToast(labels[strategy], "success", 3500);
});

// ===== CLEAR ALL =====
clearAllBtn.addEventListener("click", async () => {
    const ok = await confirmModal({
        icon: "⚠️", title: "Clear All Data",
        message: "Delete ALL saved RTL data?\n\nThis cannot be undone.",
        confirmLabel: "Clear All"
    });
    if (!ok) return;
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
async function loadAndRenderPages() { renderPages(await loadAllData()); }
async function refreshSelectorsView() {
    if (!currentPageUrl) return;
    const allData = await loadAllData();
    const page = allData.find(p => p.url === currentPageUrl);
    if (page) renderSelectors(page);
}

// ===== INIT =====
loadTheme().then(() => loadAndRenderPages());