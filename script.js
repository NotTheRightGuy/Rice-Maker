// Load stored styles when page loads
async function loadStoredStyles() {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: applyStoredStyles,
    });
}

// Call loadStoredStyles when extension popup opens
document.addEventListener("DOMContentLoaded", loadStoredStyles);

async function sendMessageWithRetry(tabId, message, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await chrome.tabs.sendMessage(tabId, message);
        } catch (err) {
            if (attempt === maxAttempts) throw err;
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
    }
}

document.getElementById("selectElement").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });

    try {
        await sendMessageWithRetry(tab.id, { action: "startSelection" });
    } catch (err) {
        console.error("Failed to send message after retries:", err);
        alert("Please refresh the page and try again.");
    }
});

// Show/hide remove button along with element info
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "elementSelected") {
        const details = document.getElementById("elementDetails");
        const info = document.getElementById("selectedInfo");
        const imageControl = document.getElementById("imageControl");
        const removeButton = document.getElementById("removeElement");

        details.textContent = `${message.tagName.toLowerCase()}${
            message.id ? "#" + message.id : ""
        }${message.className ? "." + message.className : ""}`;
        info.style.display = "block";
        removeButton.style.display = "inline-block";

        // Show image control only for img elements
        imageControl.style.display =
            message.tagName === "IMG" ? "block" : "none";

        window.lastSelectedElement = {
            tagName: message.tagName,
            id: message.id,
            className: message.className,
        };
    }
});

// Add remove element handler
document.getElementById("removeElement").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: removeSelectedElement,
        });

        // Reset UI after removal
        document.getElementById("selectedInfo").style.display = "none";
        document.getElementById("removeElement").style.display = "none";
        document.getElementById("imageControl").style.display = "none";
    } catch (err) {
        console.error("Failed to remove element:", err);
    }
});

function removeSelectedElement() {
    if (window.selectedElement) {
        const selector = generateSelector(window.selectedElement);

        // Remove element from DOM
        window.selectedElement.remove();

        // Remove stored styles for the element
        chrome.storage.local.get(["elementStyles"], (result) => {
            let storedStyles = result.elementStyles || {};
            delete storedStyles[selector];
            chrome.storage.local.set({ elementStyles: storedStyles });
        });
    }
}

function enableElementSelection() {
    document.body.style.cursor = "crosshair";
    let prevElement = null;

    function handleMouseOver(e) {
        if (prevElement) {
            prevElement.style.outline = "";
        }
        e.target.style.outline = "2px solid #ff0000";
        e.target.style.outlineOffset = "-2px";
        prevElement = e.target;
    }

    function handleMouseOut(e) {
        e.target.style.outline = "";
    }

    function handleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        document.body.style.cursor = "default";
        window.selectedElement = e.target;

        // Remove hover effects and event listeners
        if (prevElement) {
            prevElement.style.outline = "";
        }
        document.removeEventListener("mouseover", handleMouseOver, true);
        document.removeEventListener("mouseout", handleMouseOut, true);
        document.removeEventListener("click", handleClick, true);
    }

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("click", handleClick, true);
}

function applyStoredStyles() {
    chrome.storage.local.get(["elementStyles"], (result) => {
        const storedStyles = result.elementStyles || {};

        for (const [selector, styles] of Object.entries(storedStyles)) {
            const elements = document.querySelectorAll(selector);
            elements.forEach((element) => {
                if (element.tagName === "IMG" && styles.src) {
                    element.src = styles.src;
                }
                Object.assign(element.style, styles);
            });
        }
    });
}

// Style controls event listeners
["textColor", "bgColor", "fontSize", "fontFamily"].forEach((control) => {
    document.getElementById(control).addEventListener("change", async (e) => {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: injectAndUpdateStyle,
            args: [control, e.target.value],
        });
    });
});

// Add image update handler
document.getElementById("updateImage").addEventListener("click", async () => {
    const imageUrl = document.getElementById("imageUrl").value;
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: updateImageSource,
        args: [imageUrl],
    });
});

// Add background image update handler
document.getElementById("updateBgImage").addEventListener("click", async () => {
    const imageUrl = document.getElementById("bgImageUrl").value;
    const bgSize = document.getElementById("bgSize").value;
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: updateBackgroundImage,
        args: [imageUrl, bgSize],
    });
});

// New combined function to inject into the page context
function injectAndUpdateStyle(property, value) {
    function generateSelector(element) {
        if (element.id) return `#${element.id}`;
        if (element.className) return `.${element.className.split(" ")[0]}`;

        let selector = element.tagName.toLowerCase();
        let parent = element.parentElement;
        let nthChild = Array.from(parent.children).indexOf(element) + 1;

        return `${parent.tagName.toLowerCase()} > ${selector}:nth-child(${nthChild})`;
    }

    if (!window.selectedElement) return;

    const selector = generateSelector(window.selectedElement);

    chrome.storage.local.get(["elementStyles"], (result) => {
        let storedStyles = result.elementStyles || {};
        if (!storedStyles[selector]) {
            storedStyles[selector] = {};
        }

        switch (property) {
            case "textColor":
                window.selectedElement.style.color = value;
                storedStyles[selector].color = value;
                break;
            case "bgColor":
                window.selectedElement.style.backgroundColor = value;
                storedStyles[selector].backgroundColor = value;
                break;
            case "fontSize":
                window.selectedElement.style.fontSize = `${value}px`;
                storedStyles[selector].fontSize = `${value}px`;
                break;
            case "fontFamily":
                window.selectedElement.style.fontFamily = value;
                storedStyles[selector].fontFamily = value;
                break;
        }

        window.selectedElement.style.outline = "2px solid #00ff00";
        chrome.storage.local.set({ elementStyles: storedStyles });
    });
}

// Update updateImageSource similarly
function updateImageSource(url) {
    if (!window.selectedElement || window.selectedElement.tagName !== "IMG")
        return;

    const selector = generateSelector(window.selectedElement);

    chrome.storage.local.get(["elementStyles"], (result) => {
        let storedStyles = result.elementStyles || {};
        if (!storedStyles[selector]) {
            storedStyles[selector] = {};
        }

        window.selectedElement.src = url;
        storedStyles[selector].src = url;
        window.selectedElement.style.outline = "2px solid #00ff00";

        chrome.storage.local.set({ elementStyles: storedStyles });
    });
}

function updateBackgroundImage(url, size) {
    if (!window.selectedElement) return;

    const selector = generateSelector(window.selectedElement);

    chrome.storage.local.get(["elementStyles"], (result) => {
        let storedStyles = result.elementStyles || {};
        if (!storedStyles[selector]) {
            storedStyles[selector] = {};
        }

        window.selectedElement.style.backgroundImage = `url('${url}')`;
        window.selectedElement.style.backgroundSize = size;
        window.selectedElement.style.backgroundRepeat = "no-repeat";
        window.selectedElement.style.backgroundPosition = "center";

        storedStyles[selector].backgroundImage = `url('${url}')`;
        storedStyles[selector].backgroundSize = size;
        storedStyles[selector].backgroundRepeat = "no-repeat";
        storedStyles[selector].backgroundPosition = "center";

        window.selectedElement.style.outline = "2px solid #00ff00";
        chrome.storage.local.set({ elementStyles: storedStyles });
    });
}
