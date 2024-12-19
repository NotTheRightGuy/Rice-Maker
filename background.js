// Track initialized tabs
const initializedTabs = new Set();

// Helper function to initialize tab
function initializeTab(tabId) {
    chrome.tabs
        .sendMessage(tabId, { action: "ping" })
        .then(() => {
            initializedTabs.add(tabId);
            return chrome.tabs.sendMessage(tabId, { action: "loadStyles" });
        })
        .catch((err) => {
            console.log("Content script not ready yet:", err);
            // Retry after a short delay
            setTimeout(() => initializeTab(tabId), 1000);
        });
}

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.action === "contentScriptReady" && sender.tab) {
        initializeTab(sender.tab.id);
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
        initializeTab(tabId);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    initializedTabs.delete(tabId);
});
