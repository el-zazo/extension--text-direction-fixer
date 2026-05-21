// Background Service Worker - Handles badge updates from content scripts

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
