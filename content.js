let isSelectionModeActive = false;

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
    showNotification("❌ RTL Mode OFF (ESC pressed)");
  }
});

function toggleSelectionMode() {
  isSelectionModeActive = !isSelectionModeActive;

  if (isSelectionModeActive) {
    document.body.style.cursor = "crosshair";
    showNotification("✅ RTL Mode ON - Click elements (ESC to exit)");
  } else {
    document.body.style.cursor = "";
    showNotification("❌ RTL Mode OFF");
  }
}

document.addEventListener("click", handleElementClick, true);
document.addEventListener("mouseover", handleMouseOver, true);
document.addEventListener("mouseout", handleMouseOut, true);

function handleElementClick(e) {
  if (!isSelectionModeActive) return;

  e.preventDefault();
  e.stopPropagation();

  const element = e.target;

  if (element.hasAttribute("data-rtl-applied")) {
    element.style.direction = "";
    element.style.textAlign = "";
    element.removeAttribute("data-rtl-applied");
    element.style.outline = "";
    element.style.outlineOffset = "";
    showNotification("⬅️ RTL removed");
  } else {
    element.style.direction = "rtl";
    element.style.textAlign = "right";
    element.setAttribute("data-rtl-applied", "true");
    element.style.outline = "2px solid #2196F3";
    element.style.outlineOffset = "2px";
    showNotification("➡️ RTL applied");
  }
}

function handleMouseOver(e) {
  if (!isSelectionModeActive) return;
  if (!e.target.hasAttribute("data-rtl-applied")) {
    e.target.style.outline = "2px dashed #4CAF50";
    e.target.style.outlineOffset = "2px";
  }
}

function handleMouseOut(e) {
  if (!isSelectionModeActive) return;
  if (!e.target.hasAttribute("data-rtl-applied")) {
    e.target.style.outline = "";
    e.target.style.outlineOffset = "";
  }
}

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
