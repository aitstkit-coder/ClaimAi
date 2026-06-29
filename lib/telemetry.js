// lib/telemetry.js (classic script)

(function (global) {
  const TELEMETRY_KEY = 'claimai_telemetry_v1';
  
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  const defaultTelemetry = {
    installationId: '',
    consentGranted: false,
    validations: 0,
    lookups: 0,
    sidepanelOpens: 0,
    errors: 0,
    activeTimeMs: 0,
    domains: []
  };

  /**
   * Initializes telemetry state, creating an anonymous installationId if not present.
   */
  function initializeTelemetry() {
    return new Promise((resolve) => {
      chrome.storage.local.get([TELEMETRY_KEY], (res) => {
        let data = res[TELEMETRY_KEY];
        if (!data) {
          data = { ...defaultTelemetry, installationId: generateUUID() };
          chrome.storage.local.set({ [TELEMETRY_KEY]: data }, () => resolve(data));
        } else {
          if (!data.installationId) {
            data.installationId = generateUUID();
            chrome.storage.local.set({ [TELEMETRY_KEY]: data }, () => resolve(data));
          } else {
            resolve(data);
          }
        }
      });
    });
  }

  /**
   * Sets the user consent status (Opt-in / Opt-out) in storage.
   */
  function setConsent(granted) {
    return new Promise((resolve) => {
      chrome.storage.local.get([TELEMETRY_KEY], (res) => {
        const data = res[TELEMETRY_KEY] || { ...defaultTelemetry, installationId: generateUUID() };
        data.consentGranted = !!granted;
        chrome.storage.local.set({ [TELEMETRY_KEY]: data }, () => {
          console.log(`ClaimAi Telemetry: Consent updated to ${data.consentGranted}`);
          resolve(data);
        });
      });
    });
  }

  /**
   * Records a feature usage event locally.
   */
  function trackFeatureUse(featureName) {
    chrome.storage.local.get([TELEMETRY_KEY], (res) => {
      const data = res[TELEMETRY_KEY];
      if (!data) return;

      if (featureName === 'validation') data.validations++;
      if (featureName === 'lookup') data.lookups++;
      if (featureName === 'sidepanelOpen') data.sidepanelOpens++;
      if (featureName === 'error') data.errors++;

      chrome.storage.local.set({ [TELEMETRY_KEY]: data });
    });
  }

  /**
   * Records active time in milliseconds.
   */
  function trackActiveTime(ms) {
    chrome.storage.local.get([TELEMETRY_KEY], (res) => {
      const data = res[TELEMETRY_KEY];
      if (!data) return;

      data.activeTimeMs += ms;
      chrome.storage.local.set({ [TELEMETRY_KEY]: data });
    });
  }

  /**
   * Records the host domain of a validated billing portal, stripping subpaths and parameters.
   */
  function trackDomain(rawUrl) {
    if (!rawUrl || rawUrl.startsWith('chrome:') || rawUrl.startsWith('chrome-extension:') || rawUrl.startsWith('about:')) {
      return;
    }

    try {
      const urlObj = new URL(rawUrl);
      const domain = urlObj.hostname;

      chrome.storage.local.get([TELEMETRY_KEY], (res) => {
        const data = res[TELEMETRY_KEY];
        if (!data) return;

        if (!data.domains) data.domains = [];
        if (!data.domains.includes(domain)) {
          data.domains.push(domain);
          chrome.storage.local.set({ [TELEMETRY_KEY]: data });
        }
      });
    } catch (e) {
      // Ignore invalid URLs
    }
  }

  /**
   * Fetches the current raw telemetry data payload.
   */
  function getTelemetryPayload() {
    return new Promise((resolve) => {
      chrome.storage.local.get([TELEMETRY_KEY], (res) => {
        resolve(res[TELEMETRY_KEY] || null);
      });
    });
  }

  /**
   * Resets all accumulated usage statistics to 0.
   */
  function resetTelemetry() {
    return new Promise((resolve) => {
      chrome.storage.local.get([TELEMETRY_KEY], (res) => {
        const data = res[TELEMETRY_KEY] || { ...defaultTelemetry };
        data.validations = 0;
        data.lookups = 0;
        data.sidepanelOpens = 0;
        data.errors = 0;
        data.activeTimeMs = 0;
        data.domains = [];
        chrome.storage.local.set({ [TELEMETRY_KEY]: data }, () => resolve(data));
      });
    });
  }

  // Expose to appropriate context (window, self, or global)
  global.ClaimAiTelemetry = {
    initializeTelemetry,
    setConsent,
    trackFeatureUse,
    trackActiveTime,
    trackDomain,
    getTelemetryPayload,
    resetTelemetry,
    TELEMETRY_KEY
  };
})(typeof self !== 'undefined' ? self : this);
