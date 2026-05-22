// ============================================
// Text Direction Fixer - Content Script v3.5
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

/**
 * Build a CSS selector path for the given element.
 * Prefers: ID > meaningful classes > nth-of-type fallback.
 */
function generateSelectorPath(element) {
  if (!element || element === document.body || element === document.documentElement) {
    return "body";
  }

  // If element itself has a unique ID, return immediately
  if (element.id) {
    return "#" + CSS.escape(element.id);
  }

  const parts = [];
  let current = element;

  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = "#" + CSS.escape(current.id);
      parts.unshift(selector);
      break;
    }

    // Up to 2 stable classes (skip utility/dynamic patterns)
    const stableClasses = Array.from(current.classList)
      .filter(c => !c.match(/^(js-|is-|has-|ng-|v-|\d)/))
      .slice(0, 2)
      .map(c => "." + CSS.escape(c))
      .join("");

    if (stableClasses) {
      selector += stableClasses;
    } else {
      // nth-of-type fallback
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          c => c.tagName === current.tagName
        );
        if (siblings.length > 1) {
          selector += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        }
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(" > ");
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
      // One-time migration from old object format
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
  if (index >= 0) {
    data[index] = pageData;
  } else {
    data.push(pageData);
  }
  await saveAllData(data);
}

// ===== BADGE =====

function updateBadge(count) {
  try {
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count });
  } catch (e) { /* extension context invalidated */ }
}

async function updateBadgeFromStorage() {
  const url = getCurrentUrl();
  const pageData = await getPageData(url);
  const count = pageData ? pageData.selectors.filter(s => s.enabled).length : 0;
  updateBadge(count);
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
    observerDebounceTimer = setTimeout(() => {
      applyAllEnabledSelectors();
    }, 150);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  if (observer) { observer.disconnect(); observer = null; }
  clearTimeout(observerDebounceTimer);
}

// ===== GUARD: is this our own UI element? =====

function isExtensionElement(el) {
  return !!el?.closest?.("#rtl-notification");
}

// ===== STATS NOTIFICATION =====

async function showPageLoadStats() {
  const url = getCurrentUrl();
  const pageData = await getPageData(url);
  if (!pageData || pageData.selectors.length === 0) return;

  const total = pageData.selectors.length;
  const enabled = pageData.selectors.filter(s => s.enabled).length;
  const disabled = total - enabled;

  let inDom = 0;
  for (const sel of pageData.selectors) {
    try {
      if (document.querySelectorAll(sel.path).length > 0) inDom++;
    } catch (e) { /* skip */ }
  }

  if (!pageData.pageEnabled) {
    showPersistentNotification(
      `PAGE DISABLED — ${total} saved | ${enabled} enabled | ${disabled} disabled | ${inDom} in DOM`,
      "No selectors applied. Re-enable this page from the Options dashboard.",
      true
    );
    return;
  }

  let subtitle = null;
  let isWarning = false;

  if (inDom === 0 && enabled > 0) {
    subtitle = "⚠️ No matching elements found — selectors may be outdated. Edit them in Options.";
    isWarning = true;
  }

  showPersistentNotification(
    `RTL Stats: ${total} saved | ${enabled} active | ${disabled} disabled | ${inDom} found in DOM`,
    subtitle,
    isWarning
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

// ===== SOFT-DISABLE ALL FOR PAGE =====

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

// ===== CONTEXT MENU =====

async function handleContextMenuRTL() {
  const element = lastRightClickedElement;
  if (!element || isExtensionElement(element)) return;

  const url = getCurrentUrl();

  if (element.hasAttribute("data-rtl-applied")) {
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
    await updateBadgeFromStorage();
    showNotification("⬅️ RTL removed via context menu");
  } else {
    const selectorPath = generateSelectorPath(element);
    let pageData = await getPageData(url);

    if (!pageData) {
      pageData = { url, pageEnabled: true, createdAt: getCurrentTimestamp(), selectors: [] };
    }

    let selector = pageData.selectors.find(s => s.path === selectorPath);
    if (selector) {
      selector.enabled = true;
    } else {
      selector = { id: crypto.randomUUID(), path: selectorPath, enabled: true, createdAt: getCurrentTimestamp() };
      pageData.selectors.push(selector);
    }

    await savePageData(pageData);
    applyRTLToElement(element);
    await updateBadgeFromStorage();
    showNotification("➡️ RTL applied via context menu");
  }
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
  if (isExtensionElement(e.target)) return; // guard our own UI

  e.preventDefault();
  e.stopPropagation();

  const element = e.target;
  const url = getCurrentUrl();

  if (element.hasAttribute("data-rtl-applied")) {
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
        } catch (err) { /* skip */ }
      }
    }
    element.style.removeProperty("outline");
    element.style.removeProperty("outline-offset");
    await updateBadgeFromStorage();
    showNotification("⬅️ RTL removed");
  } else {
    const selectorPath = generateSelectorPath(element);
    let pageData = await getPageData(url);

    if (!pageData) {
      pageData = { url, pageEnabled: true, createdAt: getCurrentTimestamp(), selectors: [] };
    }

    let selector = pageData.selectors.find(s => s.path === selectorPath);
    if (selector) {
      selector.enabled = true;
    } else {
      selector = { id: crypto.randomUUID(), path: selectorPath, enabled: true, createdAt: getCurrentTimestamp() };
      pageData.selectors.push(selector);
    }

    await savePageData(pageData);
    applyRTLToElement(element);
    await updateBadgeFromStorage();
    showNotification("➡️ RTL applied & saved");
  }
}, true);

// Hover — selection mode
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