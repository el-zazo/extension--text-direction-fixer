// =============================================
// Text Direction Fixer - Background Service Worker
// =============================================

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "toggle-rtl",
        title: "Toggle RTL Direction",
        contexts: ["all"]
    });
});

// Context menu click → tell content script to toggle RTL on last right-clicked element
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "toggle-rtl" && tab) {
        chrome.tabs.sendMessage(tab.id, { type: "APPLY_RTL_CONTEXT_MENU" }).catch(() => {
            // Content script not ready (e.g. chrome:// pages)
        });
    }
});

// Extension icon click → toggle selection mode in content script
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SELECTION_MODE" }).catch(() => {
        // Content script not ready
    });
});

// Badge update from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "UPDATE_BADGE") {
        const count = message.count || 0;
        const text = count > 0 ? count.toString() : "";

        chrome.action.setBadgeText({
            text: text,
            tabId: sender.tab.id
        });

        chrome.action.setBadgeBackgroundColor({
            color: "#2196F3",
            tabId: sender.tab.id
        });
    }
});
