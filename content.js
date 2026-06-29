// content.js

let lastFocusedElement = null;
const debounceTimers = new Map(); // element -> timer
const activeObservers = new Map(); // element -> MutationObserver
const activeShadowRoots = new Set(); // shadow roots we have styled and injected into

console.log('%cClaimAi Content Script Loaded ✅', 'color: #10b981; font-weight: bold');

const badgeStyles = `
  .claimai-badge-container {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 6px;
    position: relative;
  }
  .claimai-badge {
    position: relative;
    z-index: 10000;
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 700;
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    opacity: 0;
    transform: translateY(-6px);
    transition: opacity 0.18s ease, transform 0.18s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    width: fit-content;
    white-space: nowrap;
    letter-spacing: 0.01em;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .claimai-badge.show {
    opacity: 1;
    transform: translateY(0);
  }
  .claimai-badge.valid {
    background: #16a34a;
    color: #ffffff;
  }
  .claimai-badge.invalid {
    background: #dc2626;
    color: #ffffff;
  }
  .claimai-badge.valid.pmb {
    background: #0d6f8a;
    color: #d0f7ff;
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 2px 10px rgba(13, 111, 138, 0.35);
  }
`;

/**
 * Resolves a deep event target (e.g. inside Shadow DOM) to a valid, top-level input element.
 */
function getTargetInputElement(deepTarget) {
    if (!deepTarget) return null;
    
    // If it's a standard input or textarea, use it
    if (deepTarget.tagName === 'INPUT' || deepTarget.tagName === 'TEXTAREA') {
        return deepTarget;
    }
    
    // If it's contenteditable or inside one
    if (deepTarget.isContentEditable) {
        // Find the outermost element that is contentEditable
        let current = deepTarget;
        while (current.parentNode && current.parentNode.isContentEditable) {
            current = current.parentNode;
        }
        return current;
    }
    
    return null;
}

/**
 * Injects badge styles into a Shadow DOM root if they aren't already present.
 */
function ensureStylesInRoot(root) {
    if (root === document || !root) return;
    activeShadowRoots.add(root);
    if (root.querySelector && root.querySelector('#claimai-styles')) return;

    const style = document.createElement('style');
    style.id = 'claimai-styles';
    style.textContent = badgeStyles;
    root.appendChild(style);
}

// Track active element focus using deep target resolution
document.addEventListener('focusin', (e) => {
    const deepTarget = e.composedPath()[0];
    const target = getTargetInputElement(deepTarget);
    if (target) {
        lastFocusedElement = target;
    }
});

// Real-time input validation listener with per-element debounce and deep resolution
document.addEventListener('input', (event) => {
    const deepTarget = event.composedPath()[0];
    const target = getTargetInputElement(deepTarget);
    if (!target) return;

    const text = target.isContentEditable ? target.textContent : target.value;
    const icdRegex = /\b[A-Z0-9][0-9]{2}(?:\.[0-9]{1,4})?\b/gi;
    let matches = text ? text.match(icdRegex) : null;

    if (matches && matches.length > 0) {
        // Limit matches to the first 20 codes to prevent memory/performance issues
        if (matches.length > 20) {
            matches = matches.slice(0, 20);
        }

        let timer = debounceTimers.get(target);
        clearTimeout(timer);
        
        timer = setTimeout(() => {
            validateCodesOnPage(target, matches);
        }, 300);
        
        debounceTimers.set(target, timer);
    } else {
        removeBadges(target);
        validateCodesOnPage(target, []);
    }
});

/**
 * Delegates validation directly to background service worker (isolated origin)
 */
function validateCodesOnPage(element, codes) {
    if (codes.length === 0) {
        cleanupReactObserver(element);
        return;
    }

    try {
        window.ClaimAiTelemetry.trackFeatureUse('validation');
        window.ClaimAiTelemetry.trackDomain(window.location.href);
    } catch (e) {
        // Telemetry is best-effort and should fail silently
    }

    chrome.runtime.sendMessage({ action: 'VALIDATE_CODES', codes: codes }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn('ClaimAi: Validation communication pending background wake-up.', chrome.runtime.lastError);
            return;
        }
        if (response && response.results) {
            updateVisualBadges(element, response.results);
            setupReactObserver(element, response.results);
        }
    });
}

function updateVisualBadges(element, validationResults) {
    removeBadges(element, false); // Avoid double-cleaning observers during update

    if (!validationResults || validationResults.length === 0) return;

    // Handle Shadow DOM style injection if necessary
    const rootNode = element.getRootNode();
    if (rootNode && rootNode !== document) {
        ensureStylesInRoot(rootNode);
    }

    const container = document.createElement('div');
    container.className = 'claimai-badge-container';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '6px';
    container.style.marginTop = '6px';
    container.style.position = 'relative';

    validationResults.forEach(result => {
        const badge = document.createElement('span');
        const baseCls = 'claimai-badge';
        const stateCls = result.isValid ? 'valid' : 'invalid';
        badge.className = `${baseCls} ${stateCls} show` + (result.pmbEligible ? ' pmb' : '');
        
        if (result.isValid) {
            if (result.pmbEligible) {
                badge.textContent = `${result.raw} (PMB)`;
            } else {
                badge.textContent = `${result.raw} (Valid)`;
            }
            badge.title = result.description || 'Valid South African ICD-10 code.';
        } else {
            const clean = (result.raw || '').replace(/[^A-Z0-9]/gi, '');
            if (clean.length === 3) {
                badge.className = `${baseCls} invalid show`;
                badge.style.backgroundColor = '#1e40af';
                badge.style.borderColor = '#3b82f6';
                badge.textContent = `${result.raw} (Category)`;
                badge.title = 'Incomplete ICD-10 Category Code.';
            } else {
                badge.textContent = `${result.raw} (Invalid)`;
                badge.title = 'Unrecognized South African ICD-10 Code.';
            }
        }

        container.appendChild(badge);
    });

    if (element.nextSibling) {
        element.parentNode.insertBefore(container, element.nextSibling);
    } else if (element.parentNode) {
        element.parentNode.appendChild(container);
    }
}

function removeBadges(element, cleanObserver = true) {
    if (cleanObserver) {
        cleanupReactObserver(element);
    }

    const timer = debounceTimers.get(element);
    if (timer) {
        clearTimeout(timer);
        debounceTimers.delete(element);
    }

    const parent = element.parentNode;
    if (!parent) return;

    // Find the immediate sibling that is the badge container (skipping text/whitespace nodes)
    let sibling = element.nextSibling;
    while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE) {
            if (sibling.classList.contains('claimai-badge-container')) {
                sibling.remove();
            }
            break;
        }
        sibling = sibling.nextSibling;
    }
}

/**
 * Sets up a MutationObserver to detect if React/other framework rerenders remove our badge container
 */
function setupReactObserver(element, validationResults) {
    cleanupReactObserver(element);

    const parent = element.parentNode;
    if (!parent) return;

    const observer = new MutationObserver((mutations) => {
        let badgeRemoved = false;
        for (const mutation of mutations) {
            for (const removedNode of mutation.removedNodes) {
                if (removedNode.classList && removedNode.classList.contains('claimai-badge-container')) {
                    badgeRemoved = true;
                    break;
                }
            }
        }
        if (badgeRemoved) {
            console.log('ClaimAi: Badge container removed by parent page (React/VDOM render). Re-injecting...');
            observer.disconnect();
            updateVisualBadges(element, validationResults);
            observer.observe(parent, { childList: true });
        }
    });

    observer.observe(parent, { childList: true });
    activeObservers.set(element, observer);
}

function cleanupReactObserver(element) {
    const observer = activeObservers.get(element);
    if (observer) {
        observer.disconnect();
        activeObservers.delete(element);
    }
}

// Global Chrome Message Router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'INJECT_CODE') {
        const target = lastFocusedElement || document.activeElement;
        const inputElement = getTargetInputElement(target);

        if (inputElement) {
            if (inputElement.isContentEditable) {
                const currentVal = (inputElement.textContent || '').trim();
                inputElement.textContent = currentVal ? `${currentVal} / ${message.code}` : message.code;
            } else {
                const currentVal = (inputElement.value || '').trim();
                inputElement.value = currentVal ? `${currentVal} / ${message.code}` : message.code;
            }
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, reason: 'NO_ACTIVE_INPUT' });
        }
    }

    if (message.action === 'GET_PAGE_METRICS') {
        let valid = document.querySelectorAll('.claimai-badge.valid, .claimai-badge.pmb').length;
        
        // Count inside all shadow roots we have styled and injected badges into
        activeShadowRoots.forEach(root => {
            try {
                valid += root.querySelectorAll('.claimai-badge.valid, .claimai-badge.pmb').length;
            } catch (e) {
                // Ignore detached roots
            }
        });

        sendResponse({ validCount: valid });
    }
});

// Active Time Tracking (POPIA-compliant, local aggregation only)
let activeStartTime = Date.now();

function reportActiveTime() {
    const elapsed = Date.now() - activeStartTime;
    if (elapsed > 1000) { // Report if active for more than 1 second
        try {
            window.ClaimAiTelemetry.trackActiveTime(elapsed);
        } catch (e) {
            // Telemetry failure is non-blocking
        }
    }
    activeStartTime = Date.now();
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        activeStartTime = Date.now();
    } else {
        reportActiveTime();
    }
});

window.addEventListener('beforeunload', reportActiveTime);
// Periodically flush active time to ensure we save state even if tab is left open
setInterval(reportActiveTime, 30000);

