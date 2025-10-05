# Operational Root Cause Analyses

This document captures post‑incident summaries so future maintenance is faster and knowledge is preserved.

---
## 1. Test Stripe Card Appearing in (What Looked Like) Production
**Date first observed:** 2025-10-03  
**Resolved:** 2025-10-04  

### Symptom
A previously used Stripe test card appeared as a saved payment option when viewing the tablet interface believed to be in production (live) mode.

### Impact
Potential for operator confusion and risk of accidentally charging (or thinking you are charging) live customers with test data. No actual live charges occurred; issue was *presentation* and environment confusion.

### Root Cause (Single Statement)
The front-end was still pointing to the test backend / test Stripe keys because API base & mode selection logic was static and always using the test server; environment separation had not yet been enforced and domains were not split.

### Contributing Factors
- API_BASE was hard-coded to the test Railway deployment.
- No explicit visual indicator of which backend/keys were active.
- Customer lookup logic originally relied on phone-only fallbacks that made the same test customer appear repeatedly.
- Lack of a promotion workflow encouraged treating main as both test and prod.

### Fixes Implemented
- Added dynamic hostname-based API base selection (prod vs test vs local).
- Introduced separate production Railway backend and prod-release branch promotion workflow.
- Added Stripe mode toggle (test vs live) locked down on production.
- Added verbose environment & health banners and a debug overlay option.
- Enforced email-first customer search to reduce accidental re-use of fallback identities.

### Validation
1. Navigated to test domain with test mode: saw only test customer data.
2. Promoted to prod-release and hit production domain: no test card references displayed; points at live Stripe key family.
3. Health/environment endpoints return correct environment labels.

### Preventative Actions
- Keep environment detection centralized in `server.js` and options page.
- Only promote (fast-forward) tested commits into prod-release; no direct prod deploys.
- Maintain visual banner / toggle for clarity in non-prod contexts.

### Related Commits / Files
- `options.html` dynamic API/Stripe key selection logic.
- `server.js` environment detection.
- `promote-to-prod.ps1`, `deploy.ps1` gating and branch separation.

---
## 2. Incorrect Production Railway URL (Live Backend Banner Unreachable)
**Date observed:** 2025-10-04  
**Resolved:** 2025-10-04 (commit `9c0e52f`)

### Symptom
On the test tablet while forcing live mode, a banner reported the live backend was unreachable. Visiting the configured production URL returned Railway's "Not Found / train has not arrived" placeholder.

### Impact
Live mode testing from the test domain was impossible (health probe failed). Could cause confusion about whether production backend was actually down.

### Root Cause (Single Statement)
The production backend constant `REMOTE_PROD_URL` used a domain missing the required `prod-` prefix, pointing to a non-existent service.

### Contributing Factors
- Assumed final production host naming pattern (`msbd-tablet-system-production...`) but actual Railway project prefixed with `prod-`.
- Regex for detecting production Railway domains did not allow the optional `prod-` prefix.
- Health probe showed only a generic message (no raw URL echo of the attempted target before fix).

### Fixes Implemented
- Updated `REMOTE_PROD_URL` to `https://prod-msbd-tablet-system-production.up.railway.app`.
- Broadened production detection regex to `/(prod-)?msbd-tablet-system.*\.up\.railway\.app$/`.
- Verified banner disappearance after redeploy.

### Validation
1. Forced live mode on test tablet (`localStorage.setItem('stripeMode','live')`).
2. Health probe succeeded (no unreachable banner) after deployment.
3. Direct GET to new production `/health` returns JSON with environment=production.

### Preventative Actions
- Document actual domain patterns inside `server.js` comment block.
- Favor a single `DOMAIN_MAP` constant/dictionary (future enhancement) rather than scattering strings.
- Consider automatic fallback (optional) if live unreachable for > N seconds.

### Related Commits / Files
- Commit `9c0e52f` (URL and regex fix).
- `options.html` (REMOTE_PROD_URL change).
- `server.js` (regex update and comments).

---
## General Template (For Future Incidents)
Copy & fill:
```
### <Short Incident Title>
Date observed: YYYY-MM-DD
Resolved: YYYY-MM-DD (commit <hash>)

Symptom:
<What was seen>

Impact:
<Who/what affected>

Root Cause:
<Single clear statement>

Contributing Factors:
- ...

Fixes Implemented:
- ...

Validation:
1. ...

Preventative Actions:
- ...

Related Commits / Files:
- ...
```

---
_Last updated: 2025-10-04_
