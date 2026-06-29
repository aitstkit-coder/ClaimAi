// lib/utils.js (classic script)

(function (global) {
  /**
   * Normalises an ICD-10 code: trims, converts to uppercase, replaces leading 0 with O, and removes whitespaces.
   * @param {string} code
   * @returns {string}
   */
  function normalizeCode(code) {
    if (!code) return '';
    let clean = code.trim().toUpperCase().replace(/\s+/g, '');
    if (clean.startsWith('0')) {
      clean = 'O' + clean.slice(1);
    }
    return clean;
  }

  /**
   * Generates candidate lookup variants (dotted, undotted, and decimal expansions) for a given code.
   * @param {string} rawCode
   * @returns {string[]}
   */
  function buildLookupVariants(rawCode) {
    const clean = normalizeCode(rawCode);
    if (!clean) return [];

    const undotted = clean.replace(/\./g, '');
    const variants = new Set();

    // 1. Dotted form (as normalized)
    variants.add(clean);
    // 2. Undotted form
    variants.add(undotted);

    // 3. Decimal prefix expansions for short decimal parts (e.g. E11.5 -> E11.50...E11.59)
    const dotIdx = clean.indexOf('.');
    if (dotIdx !== -1) {
      const decPart = clean.slice(dotIdx + 1);
      if (decPart.length >= 1 && decPart.length <= 3) {
        for (let d = 0; d <= 9; d++) {
          const expanded = `${clean}${d}`;
          variants.add(expanded);
          variants.add(expanded.replace(/\./g, ''));
        }
      }
    } else {
      // 4. Undotted decimal expansion: e.g. E115 -> E11.5, E11.50...E11.59
      if (undotted.length > 3) {
        const base = `${undotted.slice(0, 3)}.${undotted.slice(3)}`;
        variants.add(base);
        if (undotted.length === 4) {
          for (let d = 0; d <= 9; d++) {
            const expanded = `${base}${d}`;
            variants.add(expanded);
            variants.add(expanded.replace(/\./g, ''));
          }
        }
      }
    }

    return Array.from(variants);
  }

  // Expose to appropriate global context (window, self, or global)
  global.ClaimAiUtils = {
    normalizeCode,
    buildLookupVariants
  };
})(typeof self !== 'undefined' ? self : this);
