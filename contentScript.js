// Check if script is already injected
if (window.riceCookerInitialized) {
    throw new Error("Rice Cooker already initialized");
}

// Initialize content script
window.riceCookerInitialized = true;

// Notify that content script is ready
chrome.runtime.sendMessage({ action: "contentScriptReady" });

let highlightedElement = null;

window.selectedElement = null; // Use window scope for sharing between scripts

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startSelection") {
        enableElementSelection();
    } else if (message.action === "loadStyles") {
        applyStoredStyles();
    } else if (message.action === "ping") {
        sendResponse({ status: "ok" });
        return true;
    }
    // Add a return true if using sendResponse asynchronously
    return true;
});

function enableElementSelection() {
    document.body.style.cursor = "crosshair";

    function handleMouseOver(e) {
        if (highlightedElement) {
            highlightedElement.style.outline = "";
        }
        e.target.style.outline = "2px solid #ff0000";
        e.target.style.outlineOffset = "-2px";
        highlightedElement = e.target;
    }

    function handleMouseOut(e) {
        e.target.style.outline = "";
    }

    function handleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        document.body.style.cursor = "default";
        window.selectedElement = e.target;

        // Keep highlight on selected element
        if (highlightedElement) {
            highlightedElement.style.outline = "2px solid #00ff00";
        }

        // Send element info back to popup
        chrome.runtime.sendMessage({
            action: "elementSelected",
            tagName: e.target.tagName,
            className: e.target.className,
            id: e.target.id,
        });

        document.removeEventListener("mouseover", handleMouseOver, true);
        document.removeEventListener("mouseout", handleMouseOut, true);
        document.removeEventListener("click", handleClick, true);
    }

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("click", handleClick, true);
}

// Add DOM observer to handle dynamic content and reloads
const observer = new MutationObserver((mutations) => {
    applyStoredStyles();
});

// Start observing after initialization
observer.observe(document.body, {
    childList: true,
    subtree: true,
});

// Move applyStoredStyles from script.js to here
function applyStoredStyles() {
    chrome.storage.local.get(["elementStyles"], (result) => {
        const storedStyles = result.elementStyles || {};

        for (const [selector, styles] of Object.entries(storedStyles)) {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach((element) => {
                    // Ensure element exists and is visible
                    if (element && element.offsetParent !== null) {
                        if (element.tagName === "IMG" && styles.src) {
                            element.src = styles.src;
                        }
                        // Apply background image properties
                        if (styles.backgroundImage) {
                            element.style.backgroundImage =
                                styles.backgroundImage;
                            element.style.backgroundSize =
                                styles.backgroundSize || "cover";
                            element.style.backgroundRepeat =
                                styles.backgroundRepeat || "no-repeat";
                            element.style.backgroundPosition =
                                styles.backgroundPosition || "center";
                        }
                        // Apply remaining styles
                        Object.assign(element.style, styles);
                    }
                });
            } catch (err) {
                console.error(
                    `Failed to apply styles for selector ${selector}:`,
                    err
                );
            }
        }
    });
}

// Disconnect observer when page unloads
window.addEventListener("unload", () => {
    observer.disconnect();
});

// Function to store styles (used by the popup)
function storeStyles(selector, styles) {
    chrome.storage.local.get(["elementStyles"], (result) => {
        const storedStyles = result.elementStyles || {};
        storedStyles[selector] = styles;
        chrome.storage.local.set({ elementStyles: storedStyles });
    });
}
