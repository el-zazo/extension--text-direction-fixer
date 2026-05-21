// ============================================
// Text Direction Fixer - Content Script v2.0
// ============================================

// ===== STATE =====
let isSelectionModeActive = false;
let currentlyHoveredElement = null;
let lastRightClickedElement = null;

// ===== UTILITIES =====

function getCurrentUrl() {
  return window.location.origin + window.location.pathname;
}

function generateSelectorPath(element) {
  if (!element || element === document.body || element === document.documentElement) {
    return "body";
  }

  const parts = [];
  let current = element;

  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector += "#" + CSS.escape(current.id);
      parts.unshift(selector);
      break; // ID is unique — stop traversing up
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += ":nth-of-type(" + index + ")";
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

// ===== STORAGE =====

async function loadAllData() {
  const result = await chrome.storage.local.get("rtl_data");
  return result.rtl_data || [];
}

async function saveAllData(data) {
  await chrome.storage.local.set({ rtl_data: data });
}

async function getPageData(url) {
  const data = await loadAllData();
  return data.find((p) => p.url === url) || null;
}

async function savePageData(pageData) {
  const data = await loadAllData();
  const index = data.findIndex((p) => p.url === pageData.url);
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
    chrome.runtime.sendMessage({
      type: "UPDATE_BADGE",
      count: count
    });
  } catch (e) {
    // Extension context may be invalidated after page reload
  }
}

async function updateBadgeFromStorage() {
  const url = getCurrentUrl();
  const pageData = await getPageData(url);
  const count = pageData
    ? pageData.selectors.filter((s) => s.enabled).length
    : 0;
  updateBadge(count);
}

// ===== RTL APPLICATION =====

function applyRTLToElement(element) {
  element.style.setProperty("direction", "rtl", "important");
  element.style.setProperty("text-align", "right", "important");
  element.setAttribute("data-rtl-applied", "true");
}

function removeRTLFromElement(element) {
  element.style.removeProperty("direction");
  element.style.removeProperty("text-align");
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
      const elements = document.querySelectorAll(selector.path);
      elements.forEach((el) => {
        if (!el.hasAttribute("data-rtl-applied")) {
          applyRTLToElement(el);
          applied++;
        }
      });
    } catch (e) {
      // Invalid CSS selector — skip gracefully
    }
  }
  return applied;
}

// ===== MUTATION OBSERVER =====

let observer = null;

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(async (mutations) => {
    let hasNewNodes = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }
    if (hasNewNodes) {
      await applyAllEnabledSelectors();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// ===== STATS NOTIFICATION =====

async function showPageLoadStats() {
  const url = getCurrentUrl();
  const pageData = await getPageData(url);

  if (!pageData || pageData.selectors.length === 0) return;

  const total = pageData.selectors.length;
  const enabled = pageData.selectors.filter((s) => s.enabled).length;
  const disabled = total - enabled;

  let inDom = 0;
  for (const selector of pageData.selectors) {
    try {
      if (document.querySelectorAll(selector.path).length > 0) {
        inDom++;
      }
    } catch (e) {
      // Invalid selector — skip
    }
  }

  showNotification(
    "RTL Stats: " +
    total +
    " saved | " +
    enabled +
    " active | " +
    disabled +
    " disabled | " +
    inDom +
    " found in DOM"
  );
}

// ===== NOTIFICATION =====

function showNotification(message) {
  const existing = document.getElementById("rtl-notification");
  if (existing) existing.remove();

  const notification = document.createElement("div");
  notification.id = "rtl-notification";
  notification.className = "rtl-notification";
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add("show"), 10);
  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ===== SELECTION MODE =====

function toggleSelectionMode() {
  isSelectionModeActive = !isSelectionModeActive;

  if (isSelectionModeActive) {
    document.body.style.cursor = "crosshair";
    showNotification("✅ RTL Mode ON — Click elements (ESC to exit)");
  } else {
    document.body.style.cursor = "";
    // Clear stuck hover outline when exiting
    if (
      currentlyHoveredElement &&
      !currentlyHoveredElement.hasAttribute("data-rtl-applied")
    ) {
      currentlyHoveredElement.style.removeProperty("outline");
      currentlyHoveredElement.style.removeProperty("outline-offset");
    }
    currentlyHoveredElement = null;
    showNotification("❌ RTL Mode OFF");
  }
}

// ===== SOFT DELETE ALL =====

async function softDeleteAllForCurrentPage() {
  const url = getCurrentUrl();
  const pageData = await getPageData(url);

  if (!pageData || pageData.selectors.length === 0) {
    showNotification("ℹ️ No RTL selectors to reset");
    return;
  }

  // Soft delete: set all selectors to enabled=false
  pageData.selectors.forEach((s) => {
    s.enabled = false;
  });
  await savePageData(pageData);

  // Remove RTL visually from all applied elements
  document.querySelectorAll("[data-rtl-applied]").forEach((el) => {
    removeRTLFromElement(el);
    el.style.removeProperty("outline");
    el.style.removeProperty("outline-offset");
  });

  updateBadgeFromStorage();
  showNotification("🔄 All RTL reset (soft deleted)");
}

// ===== CONTEXT MENU HANDLER =====

async function handleContextMenuRTL() {
  const element = lastRightClickedElement;
  if (!element) return;

  const url = getCurrentUrl();

  if (element.hasAttribute("data-rtl-applied")) {
    // Find matching selector and soft delete it
    let pageData = await getPageData(url);
    if (pageData) {
      const matchingSelector = pageData.selectors.find((s) => {
        try {
          return element.matches(s.path);
        } catch {
          return false;
        }
      });
      if (matchingSelector) {
        matchingSelector.enabled = false;
        await savePageData(pageData);
        // Remove RTL from all elements matching this selector
        try {
          document.querySelectorAll(matchingSelector.path).forEach((el) => {
            removeRTLFromElement(el);
          });
        } catch (e) { }
      }
    }
    updateBadgeFromStorage();
    showNotification("⬅️ RTL removed via context menu");
  } else {
    // Apply RTL and save selector
    const selectorPath = generateSelectorPath(element);
    let pageData = await getPageData(url);

    if (!pageData) {
      pageData = {
        url: url,
        pageEnabled: true,
        createdAt: new Date().toISOString(),
        selectors: []
      };
    }

    let selector = pageData.selectors.find((s) => s.path === selectorPath);
    if (selector) {
      selector.enabled = true; // Re-enable if previously soft-deleted
    } else {
      selector = {
        id: crypto.randomUUID(),
        path: selectorPath,
        enabled: true,
        createdAt: new Date().toISOString()
      };
      pageData.selectors.push(selector);
    }

    await savePageData(pageData);
    applyRTLToElement(element);
    updateBadgeFromStorage();
    showNotification("➡️ RTL applied via context menu");
  }
}

// ===== EVENT LISTENERS =====

// Ctrl + Double Click → toggle selection mode
document.addEventListener("dblclick", (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    toggleSelectionMode();
  }
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // ESC → exit selection mode
  if (e.key === "Escape" && isSelectionModeActive) {
    e.preventDefault();
    isSelectionModeActive = false;
    document.body.style.cursor = "";

    // Fix: Clear hover outline stuck on currently hovered element
    if (
      currentlyHoveredElement &&
      !currentlyHoveredElement.hasAttribute("data-rtl-applied")
    ) {
      currentlyHoveredElement.style.removeProperty("outline");
      currentlyHoveredElement.style.removeProperty("outline-offset");
    }
    currentlyHoveredElement = null;

    showNotification("❌ RTL Mode OFF (ESC pressed)");
  }

  // Ctrl + Shift + R → soft delete all RTL for current page
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "r") {
    e.preventDefault();
    softDeleteAllForCurrentPage();
  }
});

// Track right-clicked element for context menu
document.addEventListener("contextmenu", (e) => {
  lastRightClickedElement = e.target;
});

// Element click handler (selection mode)
document.addEventListener(
  "click",
  async (e) => {
    if (!isSelectionModeActive) return;

    e.preventDefault();
    e.stopPropagation();

    const element = e.target;
    const url = getCurrentUrl();

    if (element.hasAttribute("data-rtl-applied")) {
      // === SOFT DELETE: find matching selector and disable it ===
      let pageData = await getPageData(url);
      if (pageData) {
        const matchingSelector = pageData.selectors.find((s) => {
          try {
            return element.matches(s.path);
          } catch {
            return false;
          }
        });
        if (matchingSelector) {
          matchingSelector.enabled = false;
          await savePageData(pageData);
          // Remove RTL from all elements matching this selector
          try {
            document.querySelectorAll(matchingSelector.path).forEach((el) => {
              removeRTLFromElement(el);
            });
          } catch (err) { }
        }
      }

      element.style.removeProperty("outline");
      element.style.removeProperty("outline-offset");

      updateBadgeFromStorage();
      showNotification("⬅️ RTL removed (disabled in storage)");
    } else {
      // === APPLY RTL & SAVE SELECTOR ===
      const selectorPath = generateSelectorPath(element);
      let pageData = await getPageData(url);

      if (!pageData) {
        pageData = {
          url: url,
          pageEnabled: true,
          createdAt: new Date().toISOString(),
          selectors: []
        };
      }

      let selector = pageData.selectors.find((s) => s.path === selectorPath);
      if (selector) {
        selector.enabled = true; // Re-enable if previously soft-deleted
      } else {
        selector = {
          id: crypto.randomUUID(),
          path: selectorPath,
          enabled: true,
          createdAt: new Date().toISOString()
        };
        pageData.selectors.push(selector);
      }

      await savePageData(pageData);

      applyRTLToElement(element);
      element.style.setProperty("outline", "2px solid #2196F3", "important");
      element.style.setProperty("outline-offset", "2px", "important");

      updateBadgeFromStorage();
      showNotification("➡️ RTL applied & saved");
    }
  },
  true
);

// Mouse hover handlers
document.addEventListener(
  "mouseover",
  (e) => {
    currentlyHoveredElement = e.target;
    if (!isSelectionModeActive) return;
    if (!e.target.hasAttribute("data-rtl-applied")) {
      e.target.style.setProperty("outline", "2px dashed red", "important");
      e.target.style.setProperty("outline-offset", "2px", "important");
    }
  },
  true
);

document.addEventListener(
  "mouseout",
  (e) => {
    if (e.target === currentlyHoveredElement) {
      currentlyHoveredElement = null;
    }
    if (!isSelectionModeActive) return;
    if (!e.target.hasAttribute("data-rtl-applied")) {
      e.target.style.removeProperty("outline");
      e.target.style.removeProperty("outline-offset");
    }
  },
  true
);

// Messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TOGGLE_SELECTION_MODE") {
    toggleSelectionMode();
  }
  if (message.type === "APPLY_RTL_CONTEXT_MENU") {
    handleContextMenuRTL();
  }
});

// ===== INITIALIZATION =====

async function init() {
  await applyAllEnabledSelectors();
  await showPageLoadStats();
  await updateBadgeFromStorage();
  startObserver();
}

init();
