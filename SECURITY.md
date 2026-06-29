# Security & Data Governance Policy

This document outlines the security, data privacy, and regulatory compliance posture for the ClaimAi Chrome Extension.

## 1. Compliance Architecture (HIPAA & POPIA)

ClaimAi is designed to be fully compliant with the South African **Protection of Personal Information Act (POPIA)** and the US **Health Insurance Portability and Accountability Act (HIPAA)**. 

### Data Minimization
- **No Patient Data Stored**: The extension does not capture, store, or log any patient-identifiable information (PII) or protected health information (PHI) such as patient names, ID numbers, or medical records.
- **No Network Transmission**: ClaimAi operates entirely on the client side. No billing data, clinical notes, or parsed codes are ever sent to any external server. 

## 2. Permissions & Host Control

To protect user privacy and limit the extension's attack surface, ClaimAi enforces a strict permission model:

- **Restricted Default Access**: By default, the extension content scripts are only enabled on explicit medical billing domains (e.g. `*.claimai.co.za` and `*.medicalbilling.co.za`).
- **User-Controlled Opt-In**: The extension requests host permissions dynamically. If you want to use the extension on a different medical portal or EHR system, you can grant permission on a per-site basis via the "Enable ClaimAi" banner in the sidepanel. You can revoke these permissions at any time via Chrome's extension manager.
- **ActiveTab Permission**: Allows temporary, safe access to the active page when you explicitly interact with the extension popup or sidepanel.

## 3. Data Storage & Local Processing

- **No Remote Databases**: The ICD-10-CM index and clinical rules are stored locally inside the extension bundle and loaded into an isolated client-side IndexedDB database.
- **Public Reference Data Only**: The IndexedDB database contains only public clinical classification codes (ICD-10-CM, PMB linkages, and clinical coding rules). It contains zero user or patient data.
- **Inspectable and Open**: Since the database is local to your browser profile, it is protected by the host operating system's file permissions and browser-profile sandboxing.

## 4. Input Sanitization & XSS Mitigation

- **Context-Aware Sanitization**: The extension utilizes HTML escaping (`escapeHTML`) when interpolating clinical descriptions, validation results, and diagnostic details into the sidepanel's DOM elements. This eliminates the risk of Cross-Site Scripting (XSS) if the source database or the active page's input elements contain malicious markup.
- **Strict Content Security Policy (CSP)**: The extension adheres to Manifest V3's default strict CSP, which prevents the execution of remote scripts, inline scripts, and dynamic code evaluation (`eval`).
