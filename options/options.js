// ============================================
// Text Direction Fixer — Options Dashboard JS
// ============================================

// ===== DOM REFERENCES =====
const searchInput = document.getElementById("searchInput");
const filterSelect = document.getElementById("filterSelect");
const sortSelect = document.getElementById("sortSelect");
const pagesList = document.getElementById("pagesList");
const emptyState = document.getElementById("emptyState");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const clearAllBtn = document.getElementById("clearAllBtn");
const themeToggle = document.getElementById("themeToggle");

// ===== THEME MANAGEMENT =====

async function loadTheme() {
    const result = await chrome.storage.local.get("rtl_theme");
    const theme = result.rtl_theme || "dark";
    applyTheme(theme);
    // Now reveal the body (was hidden to prevent flash)
    document.body.style.opacity = "1";
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    themeToggle.title = theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme";
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
    const result = await chrome.storage.local.get("rtl_data");
    return result.rtl_data || [];
}

async function saveAllData(data) {
    await chrome.storage.local.set({ rtl_data: data });
}

// ===== FILTER / SORT / SEARCH =====

function getFilteredSortedData(allData) {
    const search = searchInput.value.toLowerCase().trim();
    const filter = filterSelect.value;
    const sort = sortSelect.value;

    // --- Search ---
    let pages = allData;
    if (search) {
        pages = pages.filter((page) => {
            const urlMatch = page.url.toLowerCase().includes(search);
            const selectorMatch = page.selectors.some((s) =>
                s.path.toLowerCase().includes(search)
            );
            return urlMatch || selectorMatch;
        });
    }

    // --- Filter ---
    pages = pages.map((page) => {
        let filteredSelectors = page.selectors;

        // Si la recherche correspond à l'URL → afficher tous les selectors
        const urlMatchesSearch = search && page.url.toLowerCase().includes(search);

        if (!urlMatchesSearch && search) {
            // Filtrer uniquement les selectors qui matchent la recherche
            filteredSelectors = page.selectors.filter((s) =>
                s.path.toLowerCase().includes(search)
            );
        }

        if (filter === "enabled") {
            filteredSelectors = filteredSelectors.filter((s) => s.enabled);
        } else if (filter === "disabled") {
            filteredSelectors = filteredSelectors.filter((s) => !s.enabled);
        }

        return { ...page, selectors: filteredSelectors };
    });

    // Remove pages with zero matching selectors when filtering
    if (filter !== "all") {
        pages = pages.filter((p) => p.selectors.length > 0);
    }

    // --- Sort ---
    if (sort === "az") {
        // Sort pages A → Z by URL
        pages.sort((a, b) => a.url.localeCompare(b.url));

    } else if (sort === "most-selectors") {
        // Sort pages by total selectors count
        const originalMap = {};
        allData.forEach((p) => {
            originalMap[p.url] = p.selectors.length;
        });
        pages.sort(
            (a, b) => (originalMap[b.url] || 0) - (originalMap[a.url] || 0)
        );

    } else if (sort === "newest") {
        // Sort pages by createdAt DESC (newest page first)
        pages.sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        // Also sort selectors inside each page by createdAt DESC
        pages.forEach((page) => {
            page.selectors.sort(
                (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
            );
        });

    } else if (sort === "newest-selector") {
        // Sort pages by their MOST RECENT selector
        pages.sort((a, b) => {
            const latestA = a.selectors.reduce((max, s) =>
                new Date(s.createdAt) > new Date(max) ? s.createdAt : max,
                a.selectors[0]?.createdAt || a.createdAt
            );
            const latestB = b.selectors.reduce((max, s) =>
                new Date(s.createdAt) > new Date(max) ? s.createdAt : max,
                b.selectors[0]?.createdAt || b.createdAt
            );
            return new Date(latestB) - new Date(latestA);
        });
        // Also sort selectors inside each page by createdAt DESC
        pages.forEach((page) => {
            page.selectors.sort(
                (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
            );
        });

    } else if (sort === "oldest") {
        // Sort pages by createdAt ASC (oldest page first)
        pages.sort(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
        // Also sort selectors inside each page by createdAt ASC
        pages.forEach((page) => {
            page.selectors.sort(
                (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
            );
        });
    }

    return pages;
}

// ===== RENDERING =====

function renderPages(allData) {
    const filtered = getFilteredSortedData(allData);

    if (filtered.length === 0) {
        pagesList.innerHTML = "";
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";

    let html = "";
    for (const page of filtered) {
        const totalAll = page.selectors.length;
        const enabledCount = page.selectors.filter((s) => s.enabled).length;
        const disabledCount = totalAll - enabledCount;

        html += `
      <div class="page-card ${page.pageEnabled ? "" : "disabled-page"}">
        <div class="page-header">
          <span class="page-url" title="${escapeHtml(page.url)}">${escapeHtml(page.url)}</span>
          <div class="page-stats">
            <span class="stat"><span class="stat-dot total"></span>${totalAll} total</span>
            <span class="stat"><span class="stat-dot enabled"></span>${enabledCount} on</span>
            <span class="stat"><span class="stat-dot disabled"></span>${disabledCount} off</span>
          </div>
          <div class="page-controls">
            <label class="toggle" title="Toggle page RTL on/off">
              <input type="checkbox" ${page.pageEnabled ? "checked" : ""}
                data-action="toggle-page" data-url="${escapeAttr(page.url)}">
              <span class="toggle-slider"></span>
            </label>
            <button class="btn btn-danger btn-sm" data-action="delete-page"
              data-url="${escapeAttr(page.url)}">Delete Page</button>
          </div>
        </div>
        ${renderSelectors(page.selectors, page.url)}
      </div>
    `;
    }

    pagesList.innerHTML = html;
}

function renderSelectors(selectors, pageUrl) {
    if (selectors.length === 0) {
        return '<div class="no-selectors">No selectors for this page.</div>';
    }

    let html = '<div class="selectors-list">';
    for (const sel of selectors) {
        html += `
      <div class="selector-row">
        <span class="selector-path" data-action="edit-selector"
          data-url="${escapeAttr(pageUrl)}" data-id="${escapeAttr(sel.id)}"
          title="Click to edit selector path">${escapeHtml(sel.path)}</span>
        <span class="selector-status ${sel.enabled ? "enabled" : "disabled"}">
          ${sel.enabled ? "ON" : "OFF"}
        </span>
        <div class="selector-controls">
          <label class="toggle" title="Toggle selector on/off">
            <input type="checkbox" ${sel.enabled ? "checked" : ""}
              data-action="toggle-selector" data-url="${escapeAttr(pageUrl)}"
              data-id="${escapeAttr(sel.id)}">
            <span class="toggle-slider"></span>
          </label>
          <button class="btn-icon" data-action="delete-selector"
            data-url="${escapeAttr(pageUrl)}" data-id="${escapeAttr(sel.id)}"
            title="Delete selector">✕</button>
        </div>
      </div>
    `;
    }
    html += "</div>";
    return html;
}

// ===== ESCAPE HELPERS =====

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ===== EVENT DELEGATION =====

pagesList.addEventListener("click", async (e) => {
    const target = e.target;

    // --- Toggle page enabled ---
    if (target.matches('[data-action="toggle-page"]')) {
        const url = target.dataset.url;
        const allData = await loadAllData();
        const page = allData.find((p) => p.url === url);
        if (page) {
            page.pageEnabled = target.checked;
            await saveAllData(allData);
            renderPages(allData);
        }
    }

    // --- Delete page ---
    if (target.matches('[data-action="delete-page"]')) {
        const url = target.dataset.url;
        if (!confirm("Delete all RTL data for this page?\n\n" + url)) return;
        const allData = await loadAllData();
        const filtered = allData.filter((p) => p.url !== url);
        await saveAllData(filtered);
        renderPages(filtered);
    }

    // --- Toggle selector enabled ---
    if (target.matches('[data-action="toggle-selector"]')) {
        const url = target.dataset.url;
        const id = target.dataset.id;
        const allData = await loadAllData();
        const page = allData.find((p) => p.url === url);
        if (page) {
            const selector = page.selectors.find((s) => s.id === id);
            if (selector) {
                selector.enabled = target.checked;
                await saveAllData(allData);
                renderPages(allData);
            }
        }
    }

    // --- Delete selector ---
    if (target.matches('[data-action="delete-selector"]')) {
        const url = target.dataset.url;
        const id = target.dataset.id;
        if (!confirm("Delete this selector permanently?")) return;
        const allData = await loadAllData();
        const page = allData.find((p) => p.url === url);
        if (page) {
            page.selectors = page.selectors.filter((s) => s.id !== id);
            if (page.selectors.length === 0) {
                const idx = allData.indexOf(page);
                allData.splice(idx, 1);
            }
            await saveAllData(allData);
            renderPages(allData);
        }
    }

    // --- Edit selector path (click on path text) ---
    if (target.matches('[data-action="edit-selector"]')) {
        const url = target.dataset.url;
        const id = target.dataset.id;
        const currentPath = target.textContent;

        const input = document.createElement("input");
        input.type = "text";
        input.value = currentPath;
        input.className = "selector-path editing";
        input.style.width = "100%";

        target.replaceWith(input);
        input.focus();
        input.select();

        const save = async () => {
            const newPath = input.value.trim();
            if (!newPath || newPath === currentPath) {
                loadAndRender();
                return;
            }
            const allData = await loadAllData();
            const page = allData.find((p) => p.url === url);
            if (page) {
                const selector = page.selectors.find((s) => s.id === id);
                if (selector) {
                    selector.path = newPath;
                    await saveAllData(allData);
                }
            }
            renderPages(allData);
        };

        input.addEventListener("blur", save);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                input.blur();
            }
            if (e.key === "Escape") {
                e.preventDefault();
                loadAndRender();
            }
        });
    }
});

// Also handle toggle changes from the change event (more reliable for checkboxes)
pagesList.addEventListener("change", async (e) => {
    const target = e.target;

    if (target.matches('[data-action="toggle-page"]')) {
        const url = target.dataset.url;
        const allData = await loadAllData();
        const page = allData.find((p) => p.url === url);
        if (page) {
            page.pageEnabled = target.checked;
            await saveAllData(allData);
            renderPages(allData);
        }
    }

    if (target.matches('[data-action="toggle-selector"]')) {
        const url = target.dataset.url;
        const id = target.dataset.id;
        const allData = await loadAllData();
        const page = allData.find((p) => p.url === url);
        if (page) {
            const selector = page.selectors.find((s) => s.id === id);
            if (selector) {
                selector.enabled = target.checked;
                await saveAllData(allData);
                renderPages(allData);
            }
        }
    }
});

// ===== TOOLBAR EVENTS =====

searchInput.addEventListener("input", () => loadAndRender());
filterSelect.addEventListener("change", () => loadAndRender());
sortSelect.addEventListener("change", () => loadAndRender());

// ===== GLOBAL CONTROLS =====

// --- Export JSON ---
exportBtn.addEventListener("click", async () => {
    const allData = await loadAllData();
    const json = JSON.stringify({ rtl_data: allData }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "rtl-direction-fix-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
});

// --- Import JSON ---
importBtn.addEventListener("click", () => {
    importFile.click();
});

importFile.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!parsed.rtl_data || !Array.isArray(parsed.rtl_data)) {
            alert("Invalid file: missing 'rtl_data' array.");
            return;
        }

        for (const page of parsed.rtl_data) {
            if (!page.url || !Array.isArray(page.selectors)) {
                alert("Invalid file: each page must have 'url' and 'selectors'.");
                return;
            }
        }

        if (
            !confirm(
                "This will REPLACE all current data with the imported file. Continue?"
            )
        ) {
            return;
        }

        await saveAllData(parsed.rtl_data);
        loadAndRender();
        alert("Import successful!");
    } catch (err) {
        alert("Failed to import: " + err.message);
    }

    importFile.value = "";
});

// --- Clear All Data ---
clearAllBtn.addEventListener("click", async () => {
    if (
        !confirm(
            "Are you sure you want to delete ALL saved RTL data?\n\nThis cannot be undone."
        )
    ) {
        return;
    }
    await saveAllData([]);
    loadAndRender();
});

// ===== MAIN LOAD FUNCTION =====

async function loadAndRender() {
    const allData = await loadAllData();
    renderPages(allData);
}

// ===== INIT =====

// Load theme first (prevents flash), then render data
loadTheme().then(() => loadAndRender());
