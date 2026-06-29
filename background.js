// background.js
// Load the database engine as a classic script so we can avoid module bundling
importScripts('./lib/utils.js', './lib/telemetry.js', './lib/db.js');

if (typeof chrome !== 'undefined' && chrome.runtime) {
  console.log('%cClaimAi Background Service Worker Loaded ✅', 'color: #10b981; font-weight: bold');

  const db = new ClaimAiDB();

  // In-memory PMB lookup — keyed by both dotted and undotted forms
  let pmbMap = null;

  /**
   * Loads PMB linkages into pmbMap once and caches it.
   * Keys are normalised to both dotted ("E11.5") and undotted ("E115") forms.
   */
  async function ensurePmbMap() {
    if (pmbMap) return pmbMap;
    try {
      const resp = await fetch(chrome.runtime.getURL('rules/pmb-linkages.json'));
      if (!resp.ok) throw new Error(`PMB fetch failed: ${resp.status}`);
      const raw = await resp.json();
      pmbMap = {};
      for (const rawKey of Object.keys(raw)) {
        // Strip dagger/asterisk paired suffixes like "+H36.0*"
        const baseKey = rawKey.split('+')[0].trim().toUpperCase();
        if (!baseKey || baseKey.includes(' ')) continue; // skip header rows
        const undotted = baseKey.replace(/\./g, '');
        const dotted = baseKey;
        const entry = raw[rawKey];
        if (!pmbMap[dotted]) pmbMap[dotted] = entry;
        if (!pmbMap[undotted]) pmbMap[undotted] = entry;
      }
      console.log(`ClaimAi: PMB map loaded (${Object.keys(pmbMap).length} entries)`);
    } catch (e) {
      console.warn('ClaimAi: PMB map load failed, PMB eligibility will be unavailable.', e);
      pmbMap = {};
    }
    return pmbMap;
  }

  // Ensure context menu exists at service worker startup (covers reloads/upgrades)
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'claimai-lookup',
        title: 'Lookup in ClaimAi',
        contexts: ['selection']
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn('ClaimAi: contextMenus.create error on startup', chrome.runtime.lastError.message);
        } else {
          console.log('ClaimAi: Context menu ensured at startup');
        }
      });
    });
  } catch (e) {
    console.warn('ClaimAi: Failed to ensure context menu at startup', e);
  }

  /**
   * Attempts to delete legacy DB V1 in a fire-and-forget manner so it cannot block startup.
   */
  function safeDeleteLegacyDatabase(dbName) {
    try {
      const deleteRequest = indexedDB.deleteDatabase(dbName);

      deleteRequest.onsuccess = () => {
        console.log(`ClaimAi: Legacy database '${dbName}' removed successfully.`);
      };

      deleteRequest.onblocked = () => {
        console.warn(`ClaimAi: Legacy database deletion blocked. Active connections exist.`);
      };

      deleteRequest.onerror = (e) => {
        console.warn(`ClaimAi: Non-critical error deleting legacy database:`, e);
      };
    } catch (e) {
      console.warn('ClaimAi: Safe database deletion wrapper error:', e);
    }
  }

  let initPromise = null;

  /**
   * Initializes IndexedDB and performs high-speed seeding with robust retry logic.
   * Caches and verifies completion state in both IndexedDB count and chrome.storage.local.
   */
  async function ensureDbInitializedAndSeeded() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      let attempt = 0;
      let delay = 500;
      const maxAttempts = 3;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          console.log(`ClaimAi: Database init/seed attempt ${attempt} of ${maxAttempts}...`);
          await db.init();

          const isSeeded = await db.isFullySeeded(50000);
          const storageResult = await new Promise(resolve => {
            chrome.storage.local.get(['dbSeeded'], (res) => resolve(res && res.dbSeeded));
          });

          if (isSeeded && storageResult) {
            console.log('ClaimAi: Database is fully seeded and verified.');
            return true;
          }

          console.log('ClaimAi: Database is unseeded or incomplete. Starting seeding process...');
          
          // Clear cache flag before starting to prevent race conditions
          await new Promise(resolve => chrome.storage.local.remove(['dbSeeded'], resolve));

          const response = await fetch(chrome.runtime.getURL('lib/icd10-index.json'));
          if (!response.ok) {
            throw new Error(`Failed to load lib/icd10-index.json: Status ${response.status}`);
          }

          const rawData = await response.json();
          const icdArray = Object.keys(rawData)
            .filter(key => key && rawData[key])
            .map(key => ({
              code: key.trim().toUpperCase(),
              displayCode: rawData[key].code || key,
              description: rawData[key].description || 'No description provided.',
              pmbCode: rawData[key].pmbCode || null
            }));

          console.log(`ClaimAi: Seeding ${icdArray.length} records...`);
          const startTime = performance.now();
          await db.bulkInsertAll(icdArray);
          const endTime = performance.now();
          console.log(`ClaimAi: Seeding complete in ${((endTime - startTime) / 1000).toFixed(2)}s.`);

          // Double check database to verify seeding completed properly
          const verified = await db.isFullySeeded(50000);
          if (!verified) {
            throw new Error('Database verification failed: count did not meet the required threshold.');
          }

          await new Promise(resolve => {
            chrome.storage.local.set({ dbSeeded: true }, resolve);
          });
          console.log('ClaimAi: Database seeding successfully completed and verified.');
          return true;
        } catch (err) {
          console.error(`ClaimAi: Database initialization/seeding failed on attempt ${attempt}:`, err);
          if (attempt >= maxAttempts) {
            throw err;
          }
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        }
      }
    })();

    // Clear initPromise on rejection so next request can retry
    initPromise.catch(() => {
      initPromise = null;
    });

    return initPromise;
  }

  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('ClaimAi: Initialization sequence started.');
    // Fire-and-forget cleanup of legacy V1 DB (do not await)
    safeDeleteLegacyDatabase('ClaimAiDatabase');

    try {
      await ensureDbInitializedAndSeeded();
      await self.ClaimAiTelemetry.initializeTelemetry();

      // Ensure context menu is created for text selection lookups
      try {
        chrome.contextMenus.removeAll(() => {
          chrome.contextMenus.create({
            id: 'claimai-lookup',
            title: 'Lookup in ClaimAi',
            contexts: ['selection']
          });
          console.log('ClaimAi: Context menu created');
        });
      } catch (cmErr) {
        console.warn('ClaimAi: Failed to create context menu', cmErr);
      }
    } catch (err) {
      console.error('ClaimAi: Non-blocking error during onInstalled initialization:', err);
    }
  });

  // Handle right-click menu click
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "claimai-lookup" && info.selectionText) {
      const selectedText = info.selectionText.trim();
      console.log('ClaimAi context lookup clicked:', selectedText);

      chrome.sidePanel.open({ tabId: tab.id });

      // Give side panel time to open
      setTimeout(() => {
        console.log('ClaimAi sending lookup message to side panel:', selectedText);
        chrome.runtime.sendMessage({
          action: "lookup",
          code: selectedText
        }, () => {
          if (chrome.runtime.lastError) {
            console.warn('ClaimAi lookup message failed:', chrome.runtime.lastError.message);
          } else {
            console.log('ClaimAi lookup message delivered');
          }
        });
      }, 400);
    }
  });

  // Live-mode setting: default to true
  let liveModeEnabled = true;
  chrome.storage.local.get(['liveModeEnabled'], (result) => {
    if (result.liveModeEnabled !== undefined) {
      liveModeEnabled = !!result.liveModeEnabled;
    }
  });

  // Listen for storage changes to keep in sync
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.liveModeEnabled) {
      liveModeEnabled = !!changes.liveModeEnabled.newValue;
      console.log(`ClaimAi: Live mode state updated to ${liveModeEnabled}`);
    }
  });

  // Listen for messages from side panel or content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getICDData") {
      // Optional: send data directly if needed
    }

    // Allow sidepanel to set live mode
    if (message.action === 'SET_LIVE_MODE') {
      liveModeEnabled = !!message.enabled;
      chrome.storage.local.set({ liveModeEnabled });
      console.log(`ClaimAi: Live mode set to ${liveModeEnabled}`);
      sendResponse({ ok: true });
      return true;
    }

    // Centralized query proxy for UI (popup/sidepanel)
    if (message.action === 'VALIDATE_CODES') {
      const senderInfo = sender || {};
      validateCodesArray(message.codes, senderInfo)
        .then(results => sendResponse({ results }))
        .catch(err => {
          console.error('Batch validation error:', err);
          sendResponse({ results: [] });
        });
      return true;
    }

    if (message.action === 'QUERY_CODE' || message.action === 'QUICK_LOOKUP') {
      const code = (message.code || '').toString();
      queryIcd10Index(code)
        .then(data => sendResponse({ data }))
        .catch(error => {
          console.error('Query error:', error);
          sendResponse({ data: null, error: error.message });
        });
      return true; // indicates async sendResponse
    }
  });

  /**
   * Returns candidate lookup keys for a raw user-typed code.
   * The ICD-10-CM dataset uses 5-7 character codes (e.g. E11.51, E11.3211).
   * When a user types a shorter form like "E11.5", we also try prefix matching
   * against the next expected sub-code (e.g. E11.50, E11.51 … E11.59).
   */
  const buildLookupVariants = self.ClaimAiUtils.buildLookupVariants;

  /**
    * Validates a list of extracted codes against the internal database.
    * Includes robust prefix-based fallback and correct PMB eligibility check.
    */
  async function validateCodesArray(codes, senderInfo = {}) {
    const results = [];
    try {
      await ensureDbInitializedAndSeeded();
    } catch (e) {
      console.error('ClaimAi: Failed to ensure DB was initialized/seeded before validation:', e);
    }
    const dbInstance = db;
    const pmb = await ensurePmbMap();

    for (const rawCode of codes) {
      try {
        const variants = buildLookupVariants(rawCode);
        let record = null;
        let matchedKey = null;

        for (const variant of variants) {
          record = await dbInstance.getCode(variant);
          if (record) { matchedKey = variant; break; }
        }

        // Determine the best display code: prefer dotted form from matched key
        const displayRaw = (() => {
          if (!matchedKey) return rawCode;
          // If matched key is dotted use it; otherwise reconstruct dotted form
          if (matchedKey.includes('.')) return matchedKey;
          const u = matchedKey;
          return u.length > 3 ? `${u.slice(0, 3)}.${u.slice(3)}` : u;
        })();

        // PMB check: look up all variants in the PMB map
        const pmbEntry = variants.reduce((found, v) => found || pmb[v] || null, null);
        const pmbEligible = !!pmbEntry;

        if (record) {
          results.push({
            raw: displayRaw,
            normalized: matchedKey,
            isValid: true,
            description: record.description || record.d || record.icdDescription || '',
            pmbEligible,
            pmbCode: pmbEntry && pmbEntry.pmbCode ? pmbEntry.pmbCode : null
          });
        } else {
          results.push({ raw: rawCode, normalized: rawCode.toUpperCase().replace(/\./g,''), isValid: false, pmbEligible: false });
        }
      } catch (e) {
        console.error('Validation lookup error for', rawCode, e);
        results.push({ raw: rawCode, normalized: rawCode.toUpperCase().replace(/\./g,''), isValid: false, pmbEligible: false });
      }
    }

    // If live mode enabled, forward a lightweight update to UI (sidepanel)
    try {
      if (liveModeEnabled) {
        const first = results && results.length ? results[0] : null;
        const codeToSend = first ? (first.normalized || first.raw) : (codes && codes.length ? codes[0] : null);
        chrome.runtime.sendMessage({ action: 'liveUpdate', code: codeToSend, results }, () => {
          if (chrome.runtime.lastError) {
            // non-critical
          }
        });
      }
    } catch (e) {
      // swallow
    }

    return results;
  }

  /**
    * Query ICD-10 via IndexedDB if available, fallback to JSON fetch
    */
  async function queryIcd10Index(targetCode) {
    try {
      try {
        await ensureDbInitializedAndSeeded();
      } catch (e) {
        console.error('ClaimAi: Failed to ensure DB was initialized/seeded before query:', e);
      }
      const variants = buildLookupVariants(targetCode);
      for (const variant of variants) {
        const rec = await db.getCode(variant);
        if (rec) return rec;
      }
      // fallback: fetch JSON and try all variants
      const response = await fetch(chrome.runtime.getURL('lib/icd10-index.json'));
      if (!response.ok) throw new Error('Failed to load ICD-10 index');
      const index = await response.json();
      for (const variant of variants) {
        if (index[variant]) return index[variant];
      }
      return null;
    } catch (err) {
      throw err;
    }
  }
} else {
  console.warn('ClaimAi: Chrome extension runtime environment not detected.');
}

