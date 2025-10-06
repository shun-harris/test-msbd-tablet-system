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
## 3. Deploy Run From Non-Main Branch (Potential Drift)
**Date observed:** 2025-10-04  
**Resolved:** 2025-10-04  

### Symptom
Test deployment script could be invoked while HEAD was on a feature / non-main branch; version bump + tag would not represent `main` history.

### Impact
Risk of semantic versions pointing at commits not merged to `main`, complicating production promotion and rollback mapping.

### Root Cause (Single Statement)
`deploy.ps1` lacked branch validation and proceeded regardless of current branch.

### Contributing Factors
- Initial focus on velocity over guardrails.
- No cleanliness (uncommitted changes) enforcement.
- Automated bump increased consequence of misuse.

### Fixes Implemented
- Added branch check; abort if not on `main`.
- Added auto fast-checkout to `main` when safe.
- Refuse to proceed with a dirty working tree.

### Validation
1. Ran from feature branch → aborted with explicit message.
2. Ran from `main` → version bumped & deployed to test successfully.

### Preventative Actions
- Keep single canonical deploy branch for test.
- (Future) CI workflow replicating same guard.

### Related Files
- `deploy.ps1`.

---
## 4. Unsafe Direct Production Deploy Path
**Date observed:** Historical (pre 2025-10-04)  
**Resolved:** 2025-10-04  

### Symptom
Possible to push directly to production infra without prior test verification.

### Impact
Increased risk of shipping untested code to prod; reduced auditability.

### Root Cause (Single Statement)
Single deployment script multiplexed test and prod flows without gating.

### Contributing Factors
- Early mono-branch workflow.
- Lack of promotion concept.

### Fixes Implemented
- Introduced `prod-release` branch (promotion target only).
- Added `promote-to-prod.ps1` fast-forward flow.
- Gated legacy prod path behind `-ForceLegacyProd`.

### Validation
1. Legacy prod deploy without flag → aborted.
2. Promotion script advanced prod-release to tested commit hash.

### Preventative Actions
- Maintain zero mutation promotion (fast-forward only).
- Optionally enforce ancestry check in CI.

### Related Files
- `promote-to-prod.ps1`, `deploy.ps1`.

---
## 5. Stripe Card Input Interference (Focus / Typing Blocked)
**Date observed:** 2025-10-03  
**Resolved:** 2025-10-04  

### Symptom
Card number field intermittently refused focus or swallowed keystrokes.

### Impact
Slowed payment capture; user frustration; risk of abandoning on-tablet payment.

### Root Cause (Single Statement)
Over-broad overlay & event interception plus unnecessary payment surfaces (Link) interfering with Stripe Element iframe focus.

### Contributing Factors
- Generic DOM blockers.
- Allowing default additional payment method UI.
- Limited observability pre-fix.

### Fixes Implemented
- Restricted `payment_method_types` to `['card']`.
- Narrowed overlay scope.
- Added `?stripeDebug=1` instrumentation overlay.

### Validation
1. Post-change: consistent typing success across multiple attempts.
2. DOM inspection: only card Element present.

### Preventative Actions
- Keep surface minimal until additional methods required.
- Use debug overlay for future DOM / focus regressions.

### Related Files
- `options.html`, `server.js` (intent creation constraints).

---
## 6. Customer Duplication & Incomplete Saved Cards
**Date observed:** 2025-10-03 (pattern)  
**Resolved:** 2025-10-04  

### Symptom
Multiple Stripe customers per real person; saved cards occasionally absent.

### Impact
Fragmented payment history; reduced one-tap reuse reliability.

### Root Cause (Single Statement)
Phone-only lookups with inconsistent fallback email generation and missing `metadata.phone` normalization.

### Contributing Factors
- Legacy customers lacking email/phone fields.
- No canonical identifier precedence.
- No retroactive metadata backfill.

### Fixes Implemented
- Ordered lookup: email → metadata.phone → phone.
- Creation always sets `metadata.phone` & synthetic fallback email if needed.
- Reuse logic stops at first high-confidence match.

### Validation
1. Lookup returns single canonical customer for previously duplicated identity.
2. Saved cards list stable across repeated loads.

### Preventative Actions
- Consider one-time backfill adding `metadata.phone`.
- Emit debug logs for ambiguous matches.

### Related Files
- `server.js` customer resolution logic.

---
## 7. Version Drift & Inconsistent Changelog Entries
**Date observed:** 2025-10-03 (risk)  
**Resolved:** 2025-10-04  

### Symptom
Manual versioning occasionally skipped; changelog and deployed code diverged.

### Impact
Harder incident correlation; ambiguous rollback targets.

### Root Cause (Single Statement)
Human-in-the-loop semantic version management without enforced commit classification.

### Contributing Factors
- Rapid iteration cadence.
- No single authoritative version manifest.

### Fixes Implemented
- Added `version.json` authoritative source.
- `bump-version.ps1` parses commit messages (BREAKING/! → major, feat → minor, else patch).
- Injects new changelog section automatically.

### Validation
1. Test feat commit bumped minor.
2. Non-feat commit bumped patch.
3. Changelog updated at top with correct date/version.

### Preventative Actions
- Maintain conventional commits.
- (Future) CI verify version bump when server/payment code changes.

### Related Files
- `bump-version.ps1`, `deploy.ps1`, `CHANGELOG.md`, `version.json`.

---
## 8. Payment Overlay Auto-Closing After PIN Success (Dev Server Live-Reload)
**Date observed:** 2025-10-05  
**Resolved:** 2025-10-05  

### Symptom
Payment overlay (with saved cards) closed immediately after successful PIN entry, despite all DOM inspection showing `display: flex`, `computed style: flex`, and visible positioning. Issue only occurred in localhost development environment.

### Impact
Complete inability to access saved payment methods during local development; debugging cycle extended over multiple hours; required extensive instrumentation to identify root cause.

### Root Cause (Single Statement)
Live Server (VS Code extension) WebSocket connection triggered `beforeunload` event milliseconds after PIN unlock, causing page to attempt reload which closed the overlay before user could interact with saved cards.

### Contributing Factors
- Dev server live-reload behavior conflicting with overlay state management
- `beforeunload` event not initially suspected (focus was on CSS/DOM manipulation)
- Overlay close guards only checked for explicit user actions, not navigation events
- Issue was environment-specific (production/test deployments unaffected)

### Debugging Journey
Multi-phase escalating instrumentation revealed the issue:
1. Added close intent guards with reason-based authorization → no effect
2. Added event propagation stoppers on forms → no effect  
3. Added "nuclear watchdog" forcing `display: flex` every 50ms → still closed (but logs showed computed=flex)
4. Added on-screen debug console for video capture → revealed page was closing, not just overlay
5. Stack trace analysis → discovered `beforeunload` firing from `socket.onmessage` (dev server port 5500)

### Fixes Implemented
- Added 5-second `beforeunload` event blocker after PIN unlock timestamp (`window.__pinJustUnlocked`)
- Browser now shows "Reload site?" dialog when dev server tries to reload
- User clicks "Cancel" and overlay stays open
- Production environments unaffected (no dev server WebSocket)

### Validation
1. PIN unlock in localhost → overlay stays open, dev server shows confirmation dialog
2. User can interact with saved cards list without disruption
3. Production/test environments continue normal operation (no beforeunload blocker needed)
4. Removed ~150 lines of heavy watchdog/enforcement code after identifying real cause

### Preventative Actions
- Document dev server quirks in local development setup guide
- Consider adding environment detection to disable live-reload in specific views
- Keep `beforeunload` blocker as lightweight safety net (5-second window only)
- Test critical flows in production-like environment (Railway test deployment) to catch environment-specific issues

### Related Files
- `options.html` (lines ~1100-1110): `beforeunload` event listener with 5-second guard
- `options.html` (lines ~1046, ~1096): `window.__pinJustUnlocked` timestamp markers

### Related Commits / Files
- Comment in code: "Block navigation for 5 seconds after PIN unlock (prevents dev server reload from closing overlay)"

---
## 9. Phone Number Format Mismatch Causing Customer Lookup Failures
**Date observed:** 2025-10-05  
**Resolved:** 2025-10-05  

### Symptom
Existing customer with saved payment methods showed zero cards when accessing saved cards list. Server logs indicated customer not found despite card existing in Stripe.

### Impact
Returning customers unable to access their saved payment methods, forcing manual card re-entry and creating duplicate customer records.

### Root Cause (Single Statement)
Payment method endpoints (`/get-payment-methods`, `/delete-payment-method`, `/add-payment-method`) did not normalize phone numbers before Stripe customer search, while customer creation and PIN auth endpoints did normalize (strip formatting, take last 10 digits), causing lookup mismatches.

### Contributing Factors
- Inconsistent phone normalization across endpoint families
- No validation that all Stripe customer operations use same phone format
- Original customers created with normalized phone but queried with raw format
- Testing primarily with simple numeric input (no dashes/parentheses) masked the issue

### Fixes Implemented
- Added `normalizePhone()` calls to all three payment method endpoints
- Standardized phone handling across entire backend codebase
- Phone now consistently normalized before any Stripe customer search or creation

### Validation
1. Customer phone `6019551203` previously returning 0 cards now correctly finds existing customer and payment methods
2. Verified normalization removes formatting characters (dashes, spaces, parentheses) and takes last 10 digits
3. Confirmed consistent behavior across all payment-related endpoints

### Preventative Actions
- Establish phone normalization as mandatory step in code review for any endpoint touching Stripe customers
- Consider adding server-side logging of normalized vs raw phone for debugging
- Document phone format requirements in API endpoint comments

### Related Files
- `server.js` (lines ~410, ~507, ~582): Added `normalizePhone()` to `/get-payment-methods`, `/delete-payment-method`, `/add-payment-method`

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
## 10. UI/Button Design Inconsistency Across Application
**Date observed:** 2025-10-06  
**Resolved:** 2025-10-06  

### Symptom
Button styles varied significantly across different modals and pages - payment modal buttons had modern flat design, while main page buttons used heavy gradients and different shadow styles. Inconsistent visual hierarchy made it unclear which actions were primary vs secondary.

### Impact
Reduced visual polish and professional appearance; inconsistent user experience across different flows; harder to establish clear action hierarchy.

### Root Cause (Single Statement)
Button styles evolved organically over time with different design approaches for new features (modern flat modal buttons) vs legacy code (gradient-heavy primary buttons), without consolidation or design system documentation.

### Contributing Factors
- New payment/membership modals designed with modern flat aesthetic
- Original buttons designed with gradient backgrounds and complex shadows
- No centralized design system or style guide
- Font weights too heavy (800-900) for modern flat design
- Different border-radius values across components

### Fixes Implemented
- Unified all button styles with modern flat design system:
  - Primary gold buttons: Flat `#d4af37` with subtle shadow (no gradient)
  - Secondary gray buttons: Transparent with light `#e5e7eb` text and outline
  - Tertiary "Done" buttons: Dark `#1a1d1f` background with muted text
- Standardized border-radius to 10px across all interactive elements
- Reduced font-weight from 800/900 to 600 for cleaner appearance
- Unified transition timing to 0.2s for all hover/active states
- Applied consistent hover effects: 2px lift with enhanced shadow
- Numberpad keys updated to match flat design system

### Validation
1. All buttons across index.html and options.html now share consistent visual language
2. Clear visual hierarchy established: gold (primary) > gray outline (secondary) > dark (tertiary)
3. Hover and active states behave consistently across all buttons
4. Payment modal, membership modal, and main page buttons all match

### Preventative Actions
- Maintain centralized button class definitions in CSS
- Document design system guidelines in README
- Use existing button classes for new features rather than creating inline styles
- Regular design audits to catch inconsistencies early

### Related Files
- `index.html` (lines ~33-50): Button base styles and variants
- `options.html` (lines ~40-50): Button base styles and variants
- Applied to: Primary action buttons, numberpad keys, modal buttons, PIN unlock buttons

---
_Last updated: 2025-10-06_
