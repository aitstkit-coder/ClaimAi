// tests/utils.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// 1. Test utilities module (ClaimAiUtils)
const utilsPath = path.join(__dirname, '../lib/utils.js');
const utilsCode = fs.readFileSync(utilsPath, 'utf8');

const mockGlobalUtils = {};
new Function('self', utilsCode)(mockGlobalUtils);
const { normalizeCode, buildLookupVariants } = mockGlobalUtils.ClaimAiUtils;

test('normalizeCode basic normalization', () => {
  assert.strictEqual(normalizeCode('  e11.9  '), 'E11.9');
  assert.strictEqual(normalizeCode('011.9'), 'O11.9');
  assert.strictEqual(normalizeCode('  011.51  '), 'O11.51');
  assert.strictEqual(normalizeCode(''), '');
  assert.strictEqual(normalizeCode(null), '');
});

test('buildLookupVariants generated variants', () => {
  const variants = buildLookupVariants('E11.5');
  assert.ok(variants.includes('E11.5'), 'Includes exact dotted');
  assert.ok(variants.includes('E115'), 'Includes undotted variant');
  assert.ok(variants.includes('E11.50'), 'Includes decimal prefix expansions (0)');
  assert.ok(variants.includes('E11.59'), 'Includes decimal prefix expansions (9)');
});

test('buildLookupVariants handles undotted base', () => {
  const variants = buildLookupVariants('E115');
  assert.ok(variants.includes('E115'), 'Includes exact undotted');
  assert.ok(variants.includes('E11.5'), 'Includes dotted reconstruction');
  assert.ok(variants.includes('E11.50'), 'Includes expanded dotted (0)');
  assert.ok(variants.includes('E11.59'), 'Includes expanded dotted (9)');
});

// 2. Test telemetry module (ClaimAiTelemetry)
// Setup chrome storage mock
const localStorageMock = {};
global.chrome = {
  storage: {
    local: {
      get: (keys, callback) => {
        const result = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(k => {
          result[k] = localStorageMock[k];
        });
        callback(result);
      },
      set: (items, callback) => {
        Object.assign(localStorageMock, items);
        if (callback) callback();
      }
    }
  }
};

const telemetryPath = path.join(__dirname, '../lib/telemetry.js');
const telemetryCode = fs.readFileSync(telemetryPath, 'utf8');

const mockGlobalTelemetry = {};
new Function('self', telemetryCode)(mockGlobalTelemetry);
const {
  initializeTelemetry,
  setConsent,
  trackFeatureUse,
  trackActiveTime,
  trackDomain,
  getTelemetryPayload,
  resetTelemetry
} = mockGlobalTelemetry.ClaimAiTelemetry;

test('Telemetry: initialization creates random ID and defaults', async () => {
  const payload = await initializeTelemetry();
  assert.ok(payload.installationId, 'Generates anonymous installation ID');
  assert.strictEqual(payload.consentGranted, false, 'Opt-in consent defaults to false');
  assert.strictEqual(payload.validations, 0);
  assert.strictEqual(payload.lookups, 0);
});

test('Telemetry: setConsent and trackFeatureUse', async () => {
  await setConsent(true);
  const payload = await getTelemetryPayload();
  assert.strictEqual(payload.consentGranted, true, 'Saves opt-in consent status');

  // Track some validations and lookups
  trackFeatureUse('validation');
  trackFeatureUse('lookup');
  trackFeatureUse('lookup');
  trackFeatureUse('error');

  const updatedPayload = await getTelemetryPayload();
  assert.strictEqual(updatedPayload.validations, 1, 'Increments validations');
  assert.strictEqual(updatedPayload.lookups, 2, 'Increments lookups');
  assert.strictEqual(updatedPayload.errors, 1, 'Increments errors');
});

test('Telemetry: trackActiveTime and trackDomain', async () => {
  trackActiveTime(5000);
  trackDomain('https://app.medicalbilling.co.za/patients/123/edit?tab=billing');
  trackDomain('https://app.medicalbilling.co.za/dashboard'); // Duplicate domain host
  trackDomain('https://invalid-host'); // Valid host format

  const payload = await getTelemetryPayload();
  assert.strictEqual(payload.activeTimeMs, 5000, 'Aggregates active ms');
  
  assert.ok(payload.domains.includes('app.medicalbilling.co.za'), 'Extracts hostname safely');
  assert.ok(payload.domains.includes('invalid-host'), 'Extracts hostname');
  assert.strictEqual(payload.domains.length, 2, 'Excludes duplicate hosts');
});

test('Telemetry: resetTelemetry clears statistics', async () => {
  await resetTelemetry();
  const payload = await getTelemetryPayload();
  assert.strictEqual(payload.validations, 0, 'Resets validations');
  assert.strictEqual(payload.lookups, 0, 'Resets lookups');
  assert.strictEqual(payload.activeTimeMs, 0, 'Resets active time');
  assert.strictEqual(payload.domains.length, 0, 'Resets domains list');
  assert.strictEqual(payload.consentGranted, true, 'Consent choice is preserved');
});
