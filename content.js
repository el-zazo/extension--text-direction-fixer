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
// The only guarantee we can make is structural position in the DOM tree.
// IDs and classes are treated as optional shortcuts: we try them but always
// verify with querySelectorAll before accepting. If they do not uniquely
// resolve to the target we fall back to the pure positional path.
//
// The positional path (Strategy 4) is the ultimate fallback and is always
// unique because :nth-child(n) fully disambiguates siblings at every level.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return true iff `selector` resolves to exactly `element` in the document.
 */
function matchesOnly(selector, element) {
  try {
    const hits = document.querySelectorAll(selector);
    return hits.length === 1 && hits[0] === element;
  } catch {
    return false;
  }
}

/**
 * Return the 1-based :nth-child index of `el` among ALL siblings
 * (not same-tag siblings). This is more stable than :nth-of-type
 * when mixed-tag siblings are present.
 */
function nthChildIndex(el) {
  let index = 1;
  let sib = el.previousElementSibling;
  while (sib) { index++; sib = sib.previousElementSibling; }
  return index;
}

/**
 * Build one path segment for `el`.
 * Format: tag:nth-child(n)
 * We always include :nth-child so the segment is unambiguous within its parent.
 */
function segment(el) {
  return `${el.tagName.toLowerCase()}:nth-child(${nthChildIndex(el)})`;
}

/**
 * Build the guaranteed-unique full positional path from <body> to `element`.
 * Example: body > div:nth-child(3) > main:nth-child(1) > p:nth-child(2)
 *
 * This NEVER relies on id or class — it is purely structural and is always
 * unique by definition.
 */
function buildPositionalPath(element) {
  const parts = [];
  let current = element;

  while (current && current !== document.body && current !== document.documentElement) {
    parts.unshift(segment(current));
    current = current.parentElement;
  }

  return parts.length === 0 ? "body" : "body > " + parts.join(" > ");
}

/**
 * Try to build a SHORTER path by anchoring at the nearest ancestor
 * (or the element itself) whose id resolves uniquely to that ancestor.
 *
 * Then append positional segments from that anchor down to `element`.
 * Verify the complete selector is unique before returning it.
 *
 * Returns null if no unique-id anchor can be found or if the resulting
 * selector is not actually unique (duplicate ids, etc.).
 */
function buildAnchoredPath(element) {
  const descendantParts = [];
  let current = element;

  while (current && current !== document.body && current !== document.documentElement) {
    // Does this node have an id, and is that id unique for THIS node?
    if (current.id) {
      const anchorSel = "#" + CSS.escape(current.id);

      // Verify the anchor itself resolves to exactly this node
      try {
        const anchorHits = document.querySelectorAll(anchorSel);
        if (anchorHits.length === 1 && anchorHits[0] === current) {
          // Anchor is genuinely unique — build the full candidate
          const candidate = descendantParts.length === 0
            ? anchorSel
            : anchorSel + " > " + descendantParts.join(" > ");

          // Final uniqueness check for the whole selector
          if (matchesOnly(candidate, element)) return candidate;

          // Anchor is unique but the combined selector somehow isn't —
          // stop walking (nothing above will help)
          return null;
        }
        // id is duplicated — do NOT use it as an anchor, keep walking up
      } catch {
        // CSS.escape or querySelectorAll failed — skip
      }
    }

    descendantParts.unshift(segment(current));
    current = current.parentElement;
  }

  return null; // no unique-id anchor found in the entire ancestry
}

/**
 * Main entry point — returns the shortest selector that uniquely identifies
 * `element` in the current document.
 */
function generateSelectorPath(element) {
  if (!element || element === document.body || element === document.documentElement) {
    return "body";
  }

  // ── Shortcut 1: element's own id, if genuinely unique ──
  if (element.id) {
    const sel = "#" + CSS.escape(element.id);
    if (matchesOnly(sel, element)) return sel;
    // id exists but is duplicated → fall through
  }

  // ── Shortcut 2: path anchored at a unique ancestor id ──
  const anchored = buildAnchoredPath(element);
  if (anchored) return anchored;

  // ── Fallback: guaranteed-unique full positional path ──
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

// ===== PAGE LOAD STATS NOTIFICATION =====

async function showPageLoadStats() {
  const url = getCurrentUrl();
  const pageData = await getPageData(url);
  if (!pageData || pageData.selectors.length === 0) return;

  const total = pageData.selectors.length;
  const enabled = pageData.selectors.filter(s => s.enabled).length;
  const disabled = total - enabled;

  let inDom = 0;
  for (const sel of pageData.selectors) {
    try { if (document.querySelectorAll(sel.path).length > 0) inDom++; }
    catch (e) { /* skip invalid */ }
  }

  if (!pageData.pageEnabled) {
    showPersistentNotification(
      `PAGE DISABLED — ${total} saved | ${enabled} enabled | ${disabled} disabled | ${inDom} in DOM`,
      "No selectors applied. Re-enable this page from the Options dashboard.",
      true
    );
    return;
  }

  const staleWarning = (inDom === 0 && enabled > 0)
    ? "⚠️ No matching elements found — selectors may be outdated. Edit them in Options."
    : null;

  showPersistentNotification(
    `RTL Stats: ${total} saved | ${enabled} active | ${disabled} disabled | ${inDom} found in DOM`,
    staleWarning,
    !!staleWarning
  );
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
    // ── Remove RTL ──
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
    // ── Apply RTL ──
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

// Ctrl + Double-click → toggle selection mode
document.addEventListener("dblclick", (e) => {
  if (e.ctrlKey) { e.preventDefault(); toggleSelectionMode(); }
});

// Keyboard shortcuts
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

// Track right-clicked element
document.addEventListener("contextmenu", (e) => {
  lastRightClickedElement = e.target;
});

// Click — selection mode
document.addEventListener("click", async (e) => {
  if (!isSelectionModeActive) return;
  if (isExtensionElement(e.target)) return;

  e.preventDefault();
  e.stopPropagation();

  const result = await toggleRTLOnElement(e.target);
  if (result === "removed") showNotification("⬅️ RTL removed");
  if (result === "applied") showNotification("➡️ RTL applied & saved");
}, true);

// Hover highlight
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

// Messages from background
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