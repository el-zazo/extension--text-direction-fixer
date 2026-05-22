// ============================================
// Text Direction Fixer - Content Script
// ============================================

// ===== STATE =====
let isSelectionModeActive = false;
let currentlyHoveredElement = null;
let lastRightClickedElement = null;
let observerDebounceTimer = null;

// ===== UTILITIES =====

function getCurrentUrl() {
  return window.location.origin + window.location.pathname;
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR GENERATION
//
// Goal: produce the SHORTEST selector that matches EXACTLY ONE element in the
//       current document — the element the user clicked.
//
// Strategy cascade (each candidate verified with matchesOnly before use):
//   1. Own id — if genuinely unique in the document
//   2. Path anchored at a unique ancestor id + positional segments below it
//   3. Full positional path from body using :nth-child (always unique)
// ─────────────────────────────────────────────────────────────────────────────

function matchesOnly(selector, element) {
  try {
    const hits = document.querySelectorAll(selector);
    return hits.length === 1 && hits[0] === element;
  } catch {
    return false;
  }
}

function nthChildIndex(el) {
  let index = 1;
  let sib = el.previousElementSibling;
  while (sib) { index++; sib = sib.previousElementSibling; }
  return index;
}

function segment(el) {
  return `${el.tagName.toLowerCase()}:nth-child(${nthChildIndex(el)})`;
}

function buildPositionalPath(element) {
  const parts = [];
  let current = element;
  while (current && current !== document.body && current !== document.documentElement) {
    parts.unshift(segment(current));
    current = current.parentElement;
  }
  return parts.length === 0 ? "body" : "body > " + parts.join(" > ");
}

function buildAnchoredPath(element) {
  const descendantParts = [];
  let current = element;

  while (current && current !== document.body && current !== document.documentElement) {
    if (current.id) {
      const anchorSel = "#" + CSS.escape(current.id);
      try {
        const anchorHits = document.querySelectorAll(anchorSel);
        if (anchorHits.length === 1 && anchorHits[0] === current) {
          const candidate = descendantParts.length === 0
            ? anchorSel
            : anchorSel + " > " + descendantParts.join(" > ");
          if (matchesOnly(candidate, element)) return candidate;
          return null; // anchor unique but full path isn't — positional fallback
        }
        // duplicate id — keep walking up
      } catch { /* skip */ }
    }
    descendantParts.unshift(segment(current));
    current = current.parentElement;
  }
  return null;
}

function generateSelectorPath(element) {
  if (!element || element === document.body || element === document.documentElement) {
    return "body";
  }

  if (element.id) {
    const sel = "#" + CSS.escape(element.id);
    if (matchesOnly(sel, element)) return sel;
  }

  const anchored = buildAnchoredPath(element);
  if (anchored) return anchored;

  return buildPositionalPath(element);
}

function getCurrentTimestamp() {
  return new Date().toISOString();
}

// ===== STORAGE =====

async function loadAllData() {
  try {
    const { rtl_data } = await chrome.storage.local.get("rtl_data");
    if (!rtl_data) return [];
    if (Array.isArray(rtl_data)) return rtl_data;
    if (typeof rtl_data === "object") {
      const migrated = Object.values(rtl_data);
      await chrome.storage.local.set({ rtl_data: migrated });
      console.info("[RTL] Storage migrated from object to array format");
      return migrated;
    }
    return [];
  } catch (e) {
    console.error("[RTL] Error loading data:", e);
    return [];
  }
}

async function saveAllData(data) {
  await chrome.storage.local.set({ rtl_data: data });
}

async function getPageData(url) {
  const data = await loadAllData();
  return data.find(p => p.url === url) || null;
}

async function savePageData(pageData) {
  const data = await loadAllData();
  const index = data.findIndex(p => p.url === pageData.url);
  if (index >= 0) data[index] = pageData;
  else data.push(pageData);
  await saveAllData(data);
}

// ===== BADGE =====

function updateBadge(count) {
  try { chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count }); }
  catch (e) { /* context invalidated after page reload */ }
}

async function updateBadgeFromStorage() {
  const url = getCurrentUrl();
  const pageData = await getPageData(url);
  updateBadge(pageData ? pageData.selectors.filter(s => s.enabled).length : 0);
}

// ===== RTL APPLICATION =====

function applyRTLToElement(element) {
  element.style.setProperty("direction", "rtl", "important");
  element.style.setProperty("text-align", "right", "important");
  element.style.setProperty("outline", "2px solid #6366f1", "important");
  element.style.setProperty("outline-offset", "2px", "important");
  element.setAttribute("data-rtl-applied", "true");
}

function removeRTLFromElement(element) {
  element.style.removeProperty("direction");
  element.style.removeProperty("text-align");
  element.style.removeProperty("outline");
  element.style.removeProperty("outline-offset");
  element.removeAttribute("data-rtl-applied");
}

/**
 * Apply all enabled selectors for the current page.
 * Returns the number of elements actually styled this call.
 */
async function applyAllEnabledSelectors() {
  const url = getCurrentUrl();
  const pageData = await getPageData(url);
  if (!pageData || !pageData.pageEnabled) return 0;

  let applied = 0;
  for (const selector of pageData.selectors) {
    if (!selector.enabled) continue;
    try {
      document.querySelectorAll(selector.path).forEach(el => {
        if (!el.hasAttribute("data-rtl-applied")) {
          applyRTLToElement(el);
          applied++;
        }
      });
    } catch (e) { /* invalid selector — skip */ }
  }
  return applied;
}

/**
 * Count how many saved enabled selectors currently have at least one
 * matching element in the DOM.
 */
async function countSelectorsInDom() {
  const url = getCurrentUrl();
  const pageData = await getPageData(url);
  if (!pageData) return 0;

  let found = 0;
  for (const sel of pageData.selectors) {
    try { if (document.querySelectorAll(sel.path).length > 0) found++; }
    catch (e) { /* skip */ }
  }
  return found;
}

// ===== MUTATION OBSERVER (debounced) =====

let observer = null;

function startObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    clearTimeout(observerDebounceTimer);
    observerDebounceTimer = setTimeout(() => applyAllEnabledSelectors(), 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  if (observer) { observer.disconnect(); observer = null; }
  clearTimeout(observerDebounceTimer);
}

// ===== GUARD: skip our own UI elements =====

function isExtensionElement(el) {
  return !!el?.closest?.("#rtl-notification");
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE LOAD STATS NOTIFICATION
//
// Problem: on pages with dynamic content the DOM is empty at document_end.
// Running querySelectorAll immediately gives 0 hits even for valid selectors,
// producing a false "selectors may be outdated" warning.
//
// Solution:
//   1. Show the stats notification immediately WITHOUT any "outdated" warning.
//   2. In parallel, poll for up to MAX_WAIT_MS to see whether the enabled
//      selectors eventually find elements in the DOM.
//   3. Only after MAX_WAIT_MS, if STILL nothing is found, update the existing
//      notification to show the "outdated" warning.
//   4. If elements ARE found before the timeout, update the notification with
//      the correct inDom count and no warning.
//
// The MutationObserver already handles applying RTL to late-appearing elements,
// so the stats display is purely informational and safe to update lazily.
// ─────────────────────────────────────────────────────────────────────────────

const STATS_POLL_INTERVAL_MS = 300;  // how often to recheck during the wait
const STATS_MAX_WAIT_MS = 8000; // give up after 8 s (covers slow SPAs)

async function showPageLoadStats() {
  const url = getCurrentUrl();
  const pageData = await getPageData(url);
  if (!pageData || pageData.selectors.length === 0) return;

  const total = pageData.selectors.length;
  const enabled = pageData.selectors.filter(s => s.enabled).length;
  const disabled = total - enabled;

  // ── Page disabled: show warning immediately, no polling needed ──
  if (!pageData.pageEnabled) {
    showPersistentNotification(
      `PAGE DISABLED — ${total} saved | ${enabled} enabled | ${disabled} disabled`,
      "No selectors applied. Re-enable this page from the Options dashboard.",
      true
    );
    return;
  }

  // ── Page enabled: show initial stats without an "outdated" warning ──
  // We use a placeholder inDom count from a quick synchronous check first.
  const initialInDom = await countSelectorsInDom();

  showPersistentNotification(
    buildStatsTitle(total, enabled, disabled, initialInDom),
    null,   // no warning yet — we don't know if content is still loading
    false
  );

  // If content is already in the DOM, nothing more to do.
  if (initialInDom > 0 || enabled === 0) return;

  // ── Dynamic page: poll until elements appear or timeout expires ──
  const started = Date.now();

  const poll = setInterval(async () => {
    const inDom = await countSelectorsInDom();

    if (inDom > 0) {
      // Elements found — update notification with correct count, no warning
      clearInterval(poll);
      updateStatsNotification(
        buildStatsTitle(total, enabled, disabled, inDom),
        null,
        false
      );
      return;
    }

    if (Date.now() - started >= STATS_MAX_WAIT_MS) {
      // Timeout reached and still nothing — NOW show the outdated warning
      clearInterval(poll);
      updateStatsNotification(
        buildStatsTitle(total, enabled, disabled, 0),
        "⚠️ No matching elements found — selectors may be outdated. Edit them in Options.",
        true
      );
    }
    // else: keep polling silently
  }, STATS_POLL_INTERVAL_MS);
}

function buildStatsTitle(total, enabled, disabled, inDom) {
  return `RTL Stats: ${total} saved | ${enabled} active | ${disabled} disabled | ${inDom} found in DOM`;
}

/**
 * Update the text of an already-visible persistent notification in-place,
 * so there is no flicker from removing and re-adding it.
 */
function updateStatsNotification(title, subtitle, isWarning) {
  const n = document.getElementById("rtl-notification");
  if (!n) {
    // Notification was closed by the user — do not re-open it
    return;
  }

  // Update warning colour class
  n.classList.toggle("rtl-warning", isWarning);

  // Update title text
  const titleEl = n.querySelector(".rtl-notification-title");
  if (titleEl) titleEl.textContent = title;

  // Add, update, or remove the subtitle line
  let subEl = n.querySelector(".rtl-notification-subtitle");
  if (subtitle) {
    if (!subEl) {
      subEl = document.createElement("div");
      subEl.className = "rtl-notification-subtitle";
      n.appendChild(subEl);
    }
    subEl.textContent = subtitle;
  } else if (subEl) {
    subEl.remove();
  }
}

// ===== NOTIFICATIONS =====

function showNotification(message) {
  const existing = document.getElementById("rtl-notification");
  if (existing && !existing.classList.contains("rtl-persistent")) existing.remove();

  const n = document.createElement("div");
  n.id = "rtl-notification";
  n.className = "rtl-notification";
  n.textContent = message;
  document.body.appendChild(n);

  requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add("show")));
  setTimeout(() => {
    n.classList.remove("show");
    setTimeout(() => n.remove(), 300);
  }, 2000);
}

function showPersistentNotification(title, subtitle, isWarning) {
  const existing = document.getElementById("rtl-notification");
  if (existing) existing.remove();

  const n = document.createElement("div");
  n.id = "rtl-notification";
  n.className = "rtl-notification rtl-persistent" + (isWarning ? " rtl-warning" : "");

  const closeBtn = document.createElement("span");
  closeBtn.className = "rtl-close-btn";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => {
    n.classList.remove("show");
    setTimeout(() => n.remove(), 300);
  });

  const titleEl = document.createElement("div");
  titleEl.className = "rtl-notification-title";
  titleEl.textContent = title;

  n.appendChild(closeBtn);
  n.appendChild(titleEl);

  if (subtitle) {
    const subEl = document.createElement("div");
    subEl.className = "rtl-notification-subtitle";
    subEl.textContent = subtitle;
    n.appendChild(subEl);
  }

  document.body.appendChild(n);
  requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add("show")));
}

// ===== SELECTION MODE =====

function toggleSelectionMode() {
  isSelectionModeActive = !isSelectionModeActive;
  if (isSelectionModeActive) {
    document.body.style.cursor = "crosshair";
    showNotification("✅ RTL Mode ON — Click elements (ESC to exit)");
  } else {
    document.body.style.cursor = "";
    if (currentlyHoveredElement && !currentlyHoveredElement.hasAttribute("data-rtl-applied")) {
      currentlyHoveredElement.style.removeProperty("outline");
      currentlyHoveredElement.style.removeProperty("outline-offset");
    }
    currentlyHoveredElement = null;
    showNotification("❌ RTL Mode OFF");
  }
}

// ===== DISABLE ALL FOR PAGE =====

async function disableAllForCurrentPage() {
  const url = getCurrentUrl();
  const pageData = await getPageData(url);
  if (!pageData || pageData.selectors.length === 0) {
    showNotification("ℹ️ No RTL selectors to disable");
    return;
  }
  pageData.selectors.forEach(s => { s.enabled = false; });
  await savePageData(pageData);
  document.querySelectorAll("[data-rtl-applied]").forEach(el => removeRTLFromElement(el));
  await updateBadgeFromStorage();
  showNotification("🔄 All RTL selectors disabled for this page");
}

// ===== TOGGLE RTL ON A SINGLE ELEMENT =====

async function toggleRTLOnElement(element) {
  if (!element || isExtensionElement(element)) return null;

  const url = getCurrentUrl();

  if (element.hasAttribute("data-rtl-applied")) {
    // ── Remove ──
    let pageData = await getPageData(url);
    if (pageData) {
      const matching = pageData.selectors.find(s => {
        try { return element.matches(s.path); } catch { return false; }
      });
      if (matching) {
        matching.enabled = false;
        await savePageData(pageData);
        try {
          document.querySelectorAll(matching.path).forEach(el => removeRTLFromElement(el));
        } catch (e) { /* skip */ }
      }
    }
    element.style.removeProperty("outline");
    element.style.removeProperty("outline-offset");
    await updateBadgeFromStorage();
    return "removed";

  } else {
    // ── Apply ──
    const selectorPath = generateSelectorPath(element);
    let pageData = await getPageData(url);

    if (!pageData) {
      pageData = {
        url,
        pageEnabled: true,
        createdAt: getCurrentTimestamp(),
        selectors: []
      };
    }

    let selector = pageData.selectors.find(s => s.path === selectorPath);
    if (selector) {
      selector.enabled = true;
    } else {
      selector = {
        id: crypto.randomUUID(),
        path: selectorPath,
        enabled: true,
        createdAt: getCurrentTimestamp()
      };
      pageData.selectors.push(selector);
    }

    await savePageData(pageData);
    applyRTLToElement(element);
    await updateBadgeFromStorage();
    return "applied";
  }
}

// ===== CONTEXT MENU HANDLER =====

async function handleContextMenuRTL() {
  const element = lastRightClickedElement;
  if (!element || isExtensionElement(element)) return;
  const result = await toggleRTLOnElement(element);
  if (result === "removed") showNotification("⬅️ RTL removed via context menu");
  if (result === "applied") showNotification("➡️ RTL applied via context menu");
}

// ===== EVENT LISTENERS =====

document.addEventListener("dblclick", (e) => {
  if (e.ctrlKey) { e.preventDefault(); toggleSelectionMode(); }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isSelectionModeActive) {
    e.preventDefault();
    isSelectionModeActive = false;
    document.body.style.cursor = "";
    if (currentlyHoveredElement && !currentlyHoveredElement.hasAttribute("data-rtl-applied")) {
      currentlyHoveredElement.style.removeProperty("outline");
      currentlyHoveredElement.style.removeProperty("outline-offset");
    }
    currentlyHoveredElement = null;
    showNotification("❌ RTL Mode OFF (ESC)");
  }
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "r") {
    e.preventDefault();
    disableAllForCurrentPage();
  }
});

document.addEventListener("contextmenu", (e) => {
  lastRightClickedElement = e.target;
});

document.addEventListener("click", async (e) => {
  if (!isSelectionModeActive) return;
  if (isExtensionElement(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  const result = await toggleRTLOnElement(e.target);
  if (result === "removed") showNotification("⬅️ RTL removed");
  if (result === "applied") showNotification("➡️ RTL applied & saved");
}, true);

document.addEventListener("mouseover", (e) => {
  if (isExtensionElement(e.target)) return;
  currentlyHoveredElement = e.target;
  if (!isSelectionModeActive) return;
  if (!e.target.hasAttribute("data-rtl-applied")) {
    e.target.style.setProperty("outline", "2px dashed #ef4444", "important");
    e.target.style.setProperty("outline-offset", "2px", "important");
  }
}, true);

document.addEventListener("mouseout", (e) => {
  if (isExtensionElement(e.target)) return;
  if (e.target === currentlyHoveredElement) currentlyHoveredElement = null;
  if (!isSelectionModeActive) return;
  if (!e.target.hasAttribute("data-rtl-applied")) {
    e.target.style.removeProperty("outline");
    e.target.style.removeProperty("outline-offset");
  }
}, true);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TOGGLE_SELECTION_MODE") toggleSelectionMode();
  if (message.type === "APPLY_RTL_CONTEXT_MENU") handleContextMenuRTL();
});

// ===== INIT =====

async function init() {
  try { await applyAllEnabledSelectors(); } catch (e) { console.error("[RTL] applyAllEnabledSelectors:", e); }
  try { await showPageLoadStats(); } catch (e) { console.error("[RTL] showPageLoadStats:", e); }
  try { await updateBadgeFromStorage(); } catch (e) { console.error("[RTL] updateBadgeFromStorage:", e); }
  try { startObserver(); } catch (e) { console.error("[RTL] startObserver:", e); }
}

init();