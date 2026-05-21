let isSelectionModeActive = false;
let currentlyHoveredElement = null;

// --- Badge Counter Helpers ---

function getRTLCount() {
  return document.querySelectorAll("[data-rtl-applied]").length;
}

function updateBadge() {
  try {
    chrome.runtime.sendMessage({
      type: "UPDATE_BADGE",
      count: getRTLCount()
    });
  } catch (e) {
    // Extension context may be invalidated (e.g., after reload); silently ignore
  }
}

// --- Mode Toggle ---

// Listen for Ctrl + Double Click to toggle mode
document.addEventListener("dblclick", (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    toggleSelectionMode();
  }
});

// Listen for ESC key to exit selection mode
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isSelectionModeActive) {
    e.preventDefault();
    isSelectionModeActive = false;
    document.body.style.cursor = "";

    // Fix: Clear hover outline that may be stuck on the currently hovered element
    if (currentlyHoveredElement && !currentlyHoveredElement.hasAttribute("data-rtl-applied")) {
      currentlyHoveredElement.style.removeProperty("outline");
      currentlyHoveredElement.style.removeProperty("outline-offset");
    }
    currentlyHoveredElement = null;

    showNotification("❌ RTL Mode OFF (ESC pressed)");
  }
});

// Listen for Ctrl + Shift + R to reset all RTL
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "r") {
    e.preventDefault();
    resetAllRTL();
  }
});

function toggleSelectionMode() {
  isSelectionModeActive = !isSelectionModeActive;

  if (isSelectionModeActive) {
    document.body.style.cursor = "crosshair";
    showNotification("✅ RTL Mode ON - Click elements (ESC to exit)");
  } else {
    document.body.style.cursor = "";

    // Clear hover outline when exiting selection mode via toggle
    if (currentlyHoveredElement && !currentlyHoveredElement.hasAttribute("data-rtl-applied")) {
      currentlyHoveredElement.style.removeProperty("outline");
      currentlyHoveredElement.style.removeProperty("outline-offset");
    }
    currentlyHoveredElement = null;

    showNotification("❌ RTL Mode OFF");
  }
}

// --- Reset All RTL ---

function resetAllRTL() {
  const elements = document.querySelectorAll("[data-rtl-applied]");

  if (elements.length === 0) {
    showNotification("ℹ️ No RTL elements to reset");
    return;
  }

  elements.forEach((el) => {
    el.style.removeProperty("direction");
    el.style.removeProperty("text-align");
    el.style.removeProperty("outline");
    el.style.removeProperty("outline-offset");
    el.removeAttribute("data-rtl-applied");
  });

  updateBadge();
  showNotification("🔄 All RTL reset");
}

// --- Element Interaction ---

document.addEventListener("click", handleElementClick, true);
document.addEventListener("mouseover", handleMouseOver, true);
document.addEventListener("mouseout", handleMouseOut, true);

function handleElementClick(e) {
  if (!isSelectionModeActive) return;

  e.preventDefault();
  e.stopPropagation();

  const element = e.target;

  if (element.hasAttribute("data-rtl-applied")) {
    // Remove RTL
    element.style.removeProperty("direction");
    element.style.removeProperty("text-align");
    element.style.removeProperty("outline");
    element.style.removeProperty("outline-offset");
    element.removeAttribute("data-rtl-applied");
    updateBadge();
    showNotification("⬅️ RTL removed");
  } else {
    // Apply RTL
    element.style.setProperty("direction", "rtl", "important");
    element.style.setProperty("text-align", "right", "important");
    element.setAttribute("data-rtl-applied", "true");
    element.style.setProperty("outline", "2px solid #2196F3", "important");
    element.style.setProperty("outline-offset", "2px", "important");
    updateBadge();
    showNotification("➡️ RTL applied");
  }
}

function handleMouseOver(e) {
  currentlyHoveredElement = e.target;
  if (!isSelectionModeActive) return;
  if (!e.target.hasAttribute("data-rtl-applied")) {
    e.target.style.setProperty("outline", "2px dashed red", "important");
    e.target.style.setProperty("outline-offset", "2px", "important");
  }
}

function handleMouseOut(e) {
  if (e.target === currentlyHoveredElement) {
    currentlyHoveredElement = null;
  }
  if (!isSelectionModeActive) return;
  if (!e.target.hasAttribute("data-rtl-applied")) {
    e.target.style.removeProperty("outline");
    e.target.style.removeProperty("outline-offset");
  }
}

// --- Notification ---

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
  }, 2000);
}

// Initialize badge on page load
updateBadge();
