# ClaimAi - Intelligent ICD-10 Coding Assistant

ClaimAi is a privacy-first, high-performance Chrome extension designed to streamline clinical coding workflows for South African medical schemes, billers, and scheme administrators.

It validates ICD-10 codes in real-time as users type, provides instant visual feedback, checks PMB eligibility, alerts on demographic mismatches, and warns against high-risk billing combinations.

---

## Key Features

1. **Real-Time Validation**: Parses and matches inputs against the complete South African ICD-10 clinical classification database.
2. **PMB (Prescribed Minimum Benefits) Identification**: Flags PMB-eligible conditions instantly to ensure correct scheme funding and billing.
3. **Demographic Rules Validation**: Evaluates patient age and gender against diagnostic constraints to prevent demographic coding mismatches.
4. **Clinical Rule Audits**: 
   - **High-Risk Billing Pairs**: Identifies conflicting codes entered on the same form.
   - **Dagger & Asterisk Manifestations**: Guides matching dual-coding standards.
   - **External Causes (S & T Codes)**: Evaluates injury diagnostics and warns of missing external cause markers.
5. **DOM Framework Compatibility**: Support for React, Shadow DOM web components, contenteditable rich editors, and iframe inputs.
6. **Privacy First**: Operates entirely client-side. No clinical details, PII, or PHI are sent over the network, ensuring compliance with **POPIA** and **HIPAA**.

---

## Installation & Setup (Developer/Beta Mode)

Since ClaimAi is currently in beta, you can load it as an unpacked extension:

1. **Download/Clone** this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the folder containing this codebase (`claimai-extension`).
6. Open the Chrome Extension panel, pin **ClaimAi**, and click it to open the side panel.

### Granting Site Access (Optional Permissions)
To respect user privacy, the extension does not run on all websites by default. 
When navigating to your medical billing portal:
1. Open the **ClaimAi** sidepanel.
2. If the site is not permitted yet, an orange **Permission Required** banner will appear.
3. Click **Enable ClaimAi** to grant access. The page will reload and live code validation will activate.

---

## Codebase Architecture

```
claimai-extension/
├── .github/workflows/
│   └── release.yml                 # Automated release packaging pipeline
├── ICD-10-CM/
│   └── diagnosis_codes.json        # Source ICD-10 reference dataset
├── lib/
│   ├── db.js                       # IndexedDB wrapper for local queries
│   └── icd10-index.json            # Compressed ICD-10 index for fast seeding
├── rules/
│   ├── age-gender-rules.json       # Clinical age/gender constraints
│   ├── dagger-asterisk-pairs.json  # Dual coding pairings index
│   ├── external-cause-rules.json   # Traumatology external cause rule definitions
│   ├── high-risk-pairs.json        # Conflicting/duplicate code pairs
│   └── pmb-linkages.json           # Prescribed Minimum Benefit linkages
├── tests/
│   └── manual_test.html            # Web sandbox testing inputs, iframes, and Shadow DOM
├── background.js                   # Service worker, manages DB init and proxy queries
├── content.js                      # Content script, parses page input and injects badges
├── inject.css                      # Styling for in-page visual badges
├── manifest.json                   # Chrome extension MV3 manifest declarations
├── popup.html / popup.js           # Lightweight action popup UI and metrics
├── sidepanel.html / sidepanel.js   # Rich coding assistant sidebar
├── sidepanel.css                   # Premium sidepanel styling and transitions
└── SECURITY.md                     # Data compliance and POPIA/HIPAA guidelines
```

---

## Release Pipeline & Updates

### Extension Updates
For store deployments, Google Chrome handles extension updates automatically using the manifest's native mechanism. Extensions loaded in developer mode must be updated manually by clicking the **Reload** (circular arrow) icon on `chrome://extensions/`.

### Packaging Releases
When pushing code changes to GitHub:
1. Update `"version"` inside `manifest.json`.
2. Commit and push a tag matching the semantic versioning format (e.g. `v1.0.1`):
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
3. The GitHub Actions release workflow will trigger automatically to bundle the extension files into a zip package (`claimai-extension.zip`) and attach it to a draft draft release on your GitHub repository.
