# Operational Root Cause Analyses

This document captures post‑incident summaries so future maintenance is faster and knowledge is preserved.

---
## 0. Cash Payment Redirect Not Working
**Date first observed:** 2025-10-08  
**Resolved:** 2025-10-08 (v2.9.1)

### Symptom
When completing a cash payment on the options page:
1. User selects product → "Pay with Cash" → Clicks "OK"
2. Page does not redirect back to home page
3. User is stuck on the cash instructions modal
4. Expected: Should redirect to index.html

### Impact
- Users unable to complete cash payment flow
- Tablet requires manual refresh or navigation
- Poor user experience
- Incomplete transaction flow

### Root Cause (Single Statement)
The old legacy `showCashModal()` function was still being called instead of the new persistent modal system's `showCashInstructions()`, and the legacy modal's redirect logic was broken by modal close animations.

### Technical Flow of the Bug
1. User clicks "Pay with Cash" button
2. Line 1081: `$("#payCash").onclick=showCashModal;` (OLD FUNCTION)
3. Old function shows legacy `#cashOverlay` modal (line 828-836)
4. Old OK button handler (line 680): `location.href=SETTINGS.HOME_URL;`
5. Handler tries to redirect but modal close animation interferes
6. Redirect never completes

### Contributing Factors
- Two separate cash modal implementations coexisting in codebase
- Old modal system (lines 676-681, 828-836) not removed when new persistent modal system added
- Payment flow was updated to use new modals but button handler still called old function
- No cleanup/deprecation of legacy modal code

### Fixes Implemented
**File:** `options.html`

**1. Updated button handler (line 1081):**
```javascript
// BEFORE (Broken):
if($("#payCash")) $("#payCash").onclick=showCashModal;

// AFTER (Fixed):
if($("#payCash")) $("#payCash").onclick=showCashInstructions;
```

**2. Removed legacy function (lines 676-681):**
```javascript
// DELETED:
function showCashModal(){
  const el=$("#cashOverlay");
  el.style.display="flex";
  try{confetti({particleCount:40,spread:50,origin:{y:.6}});}catch(_){}
  $("#cashOk").onclick=()=>{location.href=SETTINGS.HOME_URL;};
}
```

**3. Removed legacy modal HTML (lines 828-836):**
```html
<!-- DELETED:
<div id="cashOverlay" class="modalOverlay">
  <div class="modalBox">
    <h3>Pay with cash</h3>
    <p>Please head to registration to finish your purchase.</p>
    <button id="cashOk" class="btn btn-gold">OK</button>
  </div>
</div>
-->
```

**4. Fixed new modal redirect (lines 1967-1969):**
```javascript
// BEFORE: Had setTimeout and closeModal interference
closeModal();
setTimeout(() => { window.location.href = homeUrl; }, 300);

// AFTER: Immediate redirect
window.location.href = homeUrl;
```

### Validation
1. Tested class purchase → Pay with Cash → OK
   - ✅ Redirects to home immediately
2. Tested merchandise → Pay with Cash → OK
   - ✅ Redirects to home immediately
3. Tested membership → Pay with Cash → OK
   - ✅ Redirects to home immediately
4. Tested "Pay with Card Instead" flow still works
   - ✅ Transitions to Stripe form correctly

### Preventative Actions
- **Code Cleanup:** Remove legacy code immediately when replacing with new implementation
- **Function Naming:** Use clear deprecation comments when phasing out old functions
- **Testing Protocol:** Test all user paths after modal system changes
- **Documentation:** Track modal system architecture changes in ARCHITECTURE.md

### Related Changes
- Added GHL purchase webhook that fires on cash OK button click
- Webhook sends before redirect to ensure tracking even if redirect is fast

---
## 1. Merchandise Context Lost in Cash→Card Payment Flow
**Date first observed:** 2025-10-08  
**Resolved:** 2025-10-08 (v2.9.0)

### Symptom
When purchasing merchandise (T-shirt $25 or Beanie $15):
1. User selects merchandise item → "Pay with Cash" → "Pay with Card Instead"
2. Stripe form incorrectly shows "Purchase Single Classes" with $20 pricing
3. Expected: Should show "Purchase 👕 T-Shirt ($25)" or "Purchase 🧢 Beanie ($15)"

### Impact
- Incorrect pricing displayed to customer
- Potential for wrong amount to be charged
- Confusing user experience
- Loss of merchandise sale tracking

### Root Cause (Single Statement)
The "Pay with Cash" button in the merchandise payment modal (`showMerchPaymentMethod`) didn't set context variables before calling `showCashInstructions()`, so when "Pay with Card Instead" was clicked, the context defaulted to empty and `showStripeCardForm()` treated it as a single class purchase.

### Technical Flow of the Bug
1. User selects T-shirt ($25) → Calls `showMerchPaymentMethod('tshirt', 25)`
2. **Bug:** Cash button onclick: `cashBtn.onclick = () => showCashInstructions();` (no context set)
3. Context variables remain unset: `ctx.kind`, `ctx.merchPrice`, `ctx.merchItem`
4. Cash instructions modal shows
5. User clicks "Pay with Card Instead" → Calls `showStripeCardForm()`
6. `showStripeCardForm()` checks `ctx.kind`:
   - Not 'membership' ✗
   - Not 'merchandise' ✗ (because it was never set)
   - Falls through to default: "Purchase Single Classes"
7. Displays wrong pricing and product type

### Contributing Factors
- Card button properly set context: `ctx.kind = 'merchandise'; ctx.merchPrice = price; ctx.merchItem = item;`
- Cash button had no context setting logic (assumed context would persist)
- No validation or defensive checks in `showStripeCardForm()` for missing context

### Fixes Implemented
**File:** `options.html` lines ~1430-1440

**Before (Broken):**
```javascript
cashBtn.onclick = () => showCashInstructions();  // ❌ No context set
```

**After (Fixed):**
```javascript
cashBtn.onclick = () => {
  // Set merchandise context before showing cash instructions
  ctx.kind = 'merchandise';
  ctx.merchPrice = price;
  ctx.merchItem = item;
  showCashInstructions();
};
```

### Validation
1. Tested T-shirt → Pay with Cash → Pay with Card Instead
   - ✅ Shows "Purchase 👕 T-Shirt ($25)"
2. Tested Beanie → Pay with Cash → Pay with Card Instead
   - ✅ Shows "Purchase 🧢 Beanie ($15)"
3. Tested class purchase flow still works correctly
   - ✅ Shows "Purchase Single Classes" with quantity selector

### Preventative Actions
- **Code Review Pattern:** Always set context variables before transitioning between modals that rely on that context
- **Defensive Coding:** Consider adding context validation in `showStripeCardForm()` with fallback behavior
- **Testing Protocol:** Test all payment paths (card direct, cash→card) for each product type

### Related Functions
- `showMerchPaymentMethod(item, price)` - Merchandise payment modal
- `showCashInstructions()` - Cash instructions modal (context-agnostic)
- `showStripeCardForm()` - Stripe form (context-dependent)

---
## 1. Payment Method "Already Attached" Error & Duplicate Customer Creation
**Date first observed:** 2025-10-07  
**Resolved:** 2025-10-07 (v2.8.1)

### Symptom
When adding a new payment card (without entering PIN, in the "top section" of payment modal):
1. User enters card details and clicks "Confirm Purchase"
2. Error appears: "The payment method you provided has already been attached to a customer"
3. Additionally, multiple duplicate customer records were created in Stripe for the same phone number
4. Different test cards (4242..., 5555...) appeared to "overwrite" each other instead of being saved separately

### Impact
- Payment flow completely broken for new card additions
- Unable to save multiple cards to the same customer
- Duplicate customer records polluting Stripe database
- Confusing user experience where saved cards don't persist correctly

### Root Cause (Single Statement)
The `/create-setup-intent` endpoint was **always creating a new customer** instead of looking up existing customers, causing the SetupIntent to attach the payment method to a duplicate customer, which then failed when `/create-payment-intent` tried to attach it to the original customer.

### Technical Flow of the Bug
1. Frontend calls `/create-setup-intent` with phone `6019551203`
2. **Bug:** Server creates NEW customer (e.g., `cus_ABC123`) - no lookup performed
3. SetupIntent attaches card `pm_xyz` to `cus_ABC123`
4. Frontend calls `/create-payment-intent` with `new_payment_method: pm_xyz`
5. Server finds **ORIGINAL customer** `cus_XYZ789` (by email/phone lookup)
6. Server tries to attach `pm_xyz` to `cus_XYZ789`
7. ❌ Stripe error: `pm_xyz` already attached to `cus_ABC123`

### Contributing Factors
- `/create-setup-intent` endpoint (lines 784-814) used `stripe.customers.create()` without any lookup logic
- `/create-payment-intent` endpoint had proper customer lookup (email → phone metadata → phone field)
- These two endpoints had divergent customer handling strategies
- No retry logic or duplicate customer detection

### Fixes Implemented
1. **Customer Lookup in SetupIntent** (server.js lines 784-873):
   - Added identical customer lookup logic from `/create-payment-intent`
   - Search order: email first → phone in metadata → phone in direct field
   - Only creates new customer if none found
   - Updates existing customer metadata when found

2. **Payment Method Attach Check** (server.js lines 406-432):
   - Before attaching, retrieve payment method to check current attachment status
   - Only attach if not already attached to this customer
   - Handle error case where attached to different customer
   - Graceful handling of `resource_already_exists` error

### Code Changes
**Before (Broken):**
```javascript
// create-setup-intent endpoint
const customer = await stripe.customers.create({  // ❌ Always creates new
    phone: phone,
    name: name,
    email: email || `${phone}@tablet.msbdance.com`,
    metadata: { source: 'tablet_system' }
});
```

**After (Fixed):**
```javascript
// Search for existing customer by email, then phone
let customer;
if (email && !email.includes('@tablet.msbdance.com')) {
    let existingCustomers = await stripe.customers.search({
        query: `email:'${email}'`,
        limit: 1
    });
    if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
        // ... update phone if different
    }
}
// ... fallback to phone lookup, then create if not found
```

### Validation
1. Tested with phone `6019551203` and card `4242 4242 4242 4242`
2. Added second card `5555 5555 5555 4444` with same phone
3. Both cards attached to **single customer record** in Stripe
4. No "already attached" errors
5. Both cards appear in saved cards list (after PIN entry)
6. Payment processing successful for both new and saved cards

### Preventative Actions
- **Code Review Checklist:** Ensure all Stripe customer operations use consistent lookup logic
- **Testing Protocol:** Test payment flows with multiple cards on same phone number
- **Documentation:** Added to ARCHITECTURE.md payment flow section
- **Monitoring:** Watch for duplicate customer creation patterns in Stripe dashboard

### Related Commits / Files
- `server.js` lines 784-873 (create-setup-intent endpoint)
- `server.js` lines 280-450 (create-payment-intent endpoint)
- `options.html` lines 1863-1920 (frontend SetupIntent flow)
- `CHANGELOG.md` v2.8.1 entry

### Lessons Learned
- Always reuse customer lookup logic across endpoints - avoid code duplication
- SetupIntents and PaymentIntents must share customer handling strategy
- Test with multiple payment methods per customer during development
- Stripe's error messages about "already attached" indicate architectural issues, not user errors

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
## 11. options.html File Corruption & UTF-8 Encoding Crisis
**Date observed:** 2025-10-07  
**Resolved:** 2025-10-07  

### Symptom
During cleanup of perceived duplicate code (lines ~573-742), multi-line string replacements corrupted `options.html`:
- File displayed black screen in browser (critical JavaScript errors)
- HTML fragments appeared outside template literal contexts
- Duplicate `getInitials()` function definitions caused naming conflicts
- Subsequent attempts to fix via string replacement failed with encoding errors
- Special characters (emojis, checkmarks, em dashes) showed as garbled multi-byte sequences

### Impact
Complete application failure - payment modal rendered blank gray box with no functionality; card input field empty; PIN gate missing; all buttons non-responsive. Development blocked for extended debugging session requiring full file replacement from working branch.

### Root Cause (Single Statement)
Aggressive multi-line string replacements in large file with special characters caused misalignment between search patterns and actual file content, compounded by UTF-8 encoding corruption when attempting recovery via git operations and PowerShell copy commands.

### Contributing Factors
- Large file size (2500+ lines) made visual inspection of replacement boundaries difficult
- Search patterns included emoji characters that were encoded differently in corrupted sections
- Multiple failed replacement attempts created cascading corruption
- `stripeOverlay` element declared at wrong position (line 625 vs correct line 989) broke initialization order
- Git operations (`git show`, `Copy-Item`) mangled UTF-8 special characters into Windows-1252 equivalents
- No file backup created before initiating risky multi-replace operation

### Debugging Journey
1. **Initial cleanup attempt**: Multi-replace targeting lines 573-742 to remove perceived duplicate code
2. **Black screen discovered**: Browser console showed JavaScript errors, HTML outside template strings
3. **First recovery attempt**: String replacements to remove corrupted sections failed due to emoji encoding mismatches
4. **PowerShell extraction**: Used `Get-Content` with line ranges to extract clean sections (1-613, 720+), bypassing encoding issues
5. **Removed ~170 lines**: Successfully eliminated corrupted code block
6. **Payment modal broken**: After cleanup, card input showed empty, PIN gate missing, buttons dead
7. **Comparison with working version**: Fetched `test/main` branch code, identified `stripeOverlay` initialization order difference
8. **Full file replacement**: Copied entire working version from `test/main`, restored functionality
9. **Encoding issues discovered**: User reported "weird characters" throughout UI after replacement
10. **Systematic encoding fixes**: 20+ replacements to restore proper UTF-8 characters

### Corrupted Characters Inventory
After git copy operations, following UTF-8 characters were mangled:
- `—` (em dash, U+2014) → `ΓÇö` (appeared 6 times)
- `✓` (checkmark, U+2713) → `Γ£ô` (appeared 4 times)  
- `•` (bullet, U+2022) → `ΓÇó` (appeared 8 times in card masking)
- `'` (apostrophe, U+2019) → `ΓÇÖ` (appeared 1 time)
- `😉` (wink, U+1F609) → `≡ƒÿë` (appeared 1 time)
- `💵` (money, U+1F4B5) → `≡ƒÆ╡` (appeared 1 time)
- `🔍` (magnifying glass, U+1F50D) → `≡ƒöì` (appeared 1 time)
- `⚙️` (gear, U+2699) → `ΓÜÖ∩╕Å` (appeared 1 time)
- `…` (ellipsis, U+2026) → `ΓÇª` (appeared 1 time)

**Total encoding issues:** 24+ corrupted character sequences

### Fixes Implemented
1. **Emergency recovery**: Full file replacement from working `test/main` branch
2. **Backup creation**: Created `options.html.backup-before-test-main-copy` before replacement
3. **Systematic encoding restoration**: Used `multi_replace_string_in_file` to fix all 24+ character corruptions
4. **Key fixes applied**:
   - Welcome message: "You're all set — pick an option below."
   - Button text: "I'm Done" (apostrophe)
   - Quantity controls: Minus button "−"
   - Success messages: "Checked in ✓"
   - Card masking: "VISA •••• 4242"
   - Payment titles: "Single Class — choose a payment method"
   - Membership agreement: "I won't complain... 😉"
   - Cash payment: "💵" money emoji
   - Debug console: "🔍 Debug Console"
   - Admin button: "⚙️" settings gear
   - PIN verification: "PIN verified ✓ Loading saved cards…"

### Validation
1. Browser no longer shows black screen or JavaScript errors
2. Payment modal displays correctly with all elements functional
3. Card input field renders and accepts typing
4. PIN gate appears with proper checkmark and ellipsis
5. Saved cards show with proper bullet masking (••••)
6. Admin settings gear icon displays correctly
7. All special characters render properly throughout UI
8. No syntax errors reported by VS Code

### Preventative Actions
- **Always create backup** before multi-line replacements in large files
- **Avoid searching for emoji characters** in string replacement patterns - use surrounding context instead
- **Use semantic_search** to understand code structure before attempting large refactors
- **Test incrementally** - make one change, verify, then proceed
- **Prefer git operations** for file recovery over text manipulation when corruption occurs
- **Document character encoding** requirements in development setup (UTF-8 with BOM handling)
- **Use multi_replace_string_in_file** for related changes to minimize risk
- **Verify critical flows** (payment modal, card input) after any options.html modifications

### Related Files
- `options.html` - Main payment flow file (2500 lines)
- `options.html.backup-before-test-main-copy` - Backup of corrupted version
- `test-main-options.html` - Clean working reference from test/main branch
- Lines affected: 380, 403-404, 414, 449, 505, 522, 581-584, 776, 829, 929, 1468, 1519, 1597, 2092, 2278, 2368

### Lessons Learned
1. **File size matters**: 2500+ line files are risky for automated text replacements
2. **Encoding is fragile**: UTF-8 special characters can corrupt during copy operations between git branches
3. **Recovery strategy**: When text manipulation fails, full file replacement from known-good source is often fastest solution
4. **Initialization order**: JavaScript execution order matters - `stripeOverlay` declaration must occur after DOM elements defined
5. **Progressive corruption**: Failed fix attempts can create cascading damage - know when to reset from working version
6. **Visual validation essential**: Automated fixes may succeed technically but fail visually (encoding issues)

### Time Impact
Approximately 3-4 hours of debugging and recovery work due to:
- Multiple failed string replacement attempts
- Character encoding troubleshooting
- Investigation of modal initialization order
- Systematic restoration of 24+ special characters

---
## 12. Deploy Script Branch Confusion (prod-release → main switching)
**Date observed:** 2025-10-07  
**Resolved:** 2025-10-07  

### Symptom
User attempted to run "Deploy to Test" task while on `prod-release` branch. Script failed silently or showed unclear error messages about branch mismatch, causing confusion about correct workflow.

### Impact
Deployment workflow interruption; user uncertainty about proper branch management; potential for deploying from wrong branch without realizing it.

### Root Cause (Single Statement)
Deploy script's branch validation and auto-switching logic lacked clear visual feedback, making it difficult for users to understand when/why branch switches were happening or failing.

### Contributing Factors
- Script used `Out-Null` to suppress git checkout output, hiding what was happening
- Error messages didn't clearly explain the branch switching logic
- No visual confirmation when already on correct branch
- Exit code checking was minimal, allowing silent failures

### Fixes Implemented
- Added explicit "Current branch: {name}" display at start of test deploy
- Enhanced branch switching messages with emoji indicators:
  - ✅ for successful operations
  - 🔄 for in-progress switching
  - ❌ for failures
- Improved error messages with actionable instructions
- Added explicit success confirmation when already on `main`
- Added LASTEXITCODE checking after git checkout
- Made all status messages use color coding (Cyan/Green/Red/Yellow)

### Validation
1. Running from `prod-release` with clean tree → shows clear switching message and switches to `main`
2. Running from `prod-release` with dirty tree → shows clear error with instructions to commit/stash
3. Running from `main` → shows confirmation that no switching needed
4. All branch operations now visible and understandable to user

### Preventative Actions
- Always provide visual feedback for automated actions (especially git operations)
- Use emoji indicators consistently across deployment scripts
- Test deployment scripts from different branch states
- Document expected branch workflows in script comments

### Related Files
- `deploy.ps1` (lines 14-34): Enhanced branch validation and switching logic

---
_Last updated: 2025-10-07_
