# System Architecture Documentation

This document contains technical deep-dives into the MSBD Tablet System architecture, design decisions, and implementation details.

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Stripe Customer Strategy](#stripe-customer-strategy)
3. [Payment Modal Architecture](#payment-modal-architecture)
4. [User Flows](#user-flows)
5. [UI Design System](#ui-design-system)
6. [Environment & Deployment](#environment--deployment)
7. [Security & Safety](#security--safety)

---

## System Overview

### Architecture Layers

| Layer | Key Points |
|-------|------------|
| **Frontend** | Pure HTML/JS in `index.html` and `options.html`. Dynamic environment/Stripe mode detection, saved card UI, health banner, admin panel. |
| **Backend** | Express + Stripe SDK in `server.js`. Environment auto-detect (override > domain > pattern > localhost). |
| **Deployment** | `main` branch auto-deploys to TEST; `prod-release` promoted (fast-forward) to PROD via `promote-to-prod.ps1`. |
| **Versioning** | `version.json` + `bump-version.ps1` with auto classification (feat→minor, BREAKING→major, else patch). |
| **Safety** | Branch enforcement for test deploys, legacy prod deploy gated behind `-ForceLegacyProd`, separate Railway services, CORS whitelist. |
| **Payments** | Card-only PaymentIntents (manual confirm) + SetupIntents; email-first customer lookup with phone/metadata fallbacks. |

### Environments

| Env | Frontend | Backend | Stripe Keys | Branch Source |
|-----|----------|---------|-------------|---------------|
| **Local** | `localhost:3000` | local Express | Test | main (local) |
| **Test** | `test.tablet.msbdance.com` | `test-msbd-tablet-system-production.up.railway.app` | Test | main (auto-deploy) |
| **Prod** | `tablet.msbdance.com` | `prod-msbd-tablet-system-production.up.railway.app` | Live | prod-release |

**Environment Detection**: Backend uses `APP_ENV` override > domain pattern > localhost fallback.

---

## Stripe Customer Strategy

### Customer Lookup Resolution Order

1. **Real email** (if available, direct lookup via Stripe API)
2. **Metadata `phone`** (normalized, stored in `metadata.phone` field)
3. **Customer `phone`** field (normalized, legacy fallback)

### Customer Creation Logic

If no customer found, create new customer with:
- **Fallback email**: `<phone>@tablet.msbdance.com` (for customers without real email)
- **Metadata phone**: Always set `metadata.phone` to normalized phone for future deterministic lookups
- **Name**: From user input or "Guest"

### Phone Normalization

**Critical**: All phone numbers are normalized (strip non-digits, take last 10) before ANY Stripe operation to ensure consistent customer lookup across:
- Payment intents
- Saved cards retrieval
- PIN authentication
- Customer search

**Normalization function** (backend):
```javascript
function normalizePhone(phone) {
  return phone.replace(/\D/g, '').slice(-10);
}
```

### Payment Method Types

- **Restricted to card only**: `payment_method_types: ['card']` to avoid Link/other wallets interfering with Stripe Elements
- **Setup future usage**: `setup_future_usage='on_session'` for new cards to enable saving
- **Explicit saved card addition**: Uses `/create-setup-intent` endpoint

### Customer Lookup Strategy (Critical)

Both `/create-setup-intent` and `/create-payment-intent` endpoints **must use identical customer lookup logic** to prevent duplicate customer creation and payment method attachment errors.

**Search Order**:
1. **Email first** (if provided and not fallback `@tablet.msbdance.com`): `stripe.customers.search({ query: "email:'user@example.com'" })`
2. **Phone in metadata** (fallback): `stripe.customers.search({ query: "metadata['phone']:'6019551203'" })`
3. **Phone in direct field** (fallback): `stripe.customers.search({ query: "phone:'6019551203'" })`
4. **Create new customer** (only if not found)

**Why This Matters**:
- Prevents "payment method already attached to customer" errors
- Ensures one customer per phone number (multiple cards per customer)
- Allows seamless upgrade from fallback email to real email via webhooks
- Maintains consistency across SetupIntent and PaymentIntent flows

**Implementation**: See `server.js` lines 288-376 (create-payment-intent) and lines 791-870 (create-setup-intent)

---

## Payment Modal Architecture

### Overview

The payment overlay is implemented as a full-screen modal (`#stripeOverlay` in `options.html`) with four main components:

### 1. Quantity Selector

**Location**: Lines ~440-455

**Features**:
- Minus/Plus buttons using proper Unicode: `−` (U+2212) / `+` (not hyphens)
- Real-time price calculation: `$20 × quantity`
- Disabled state when quantity reaches limits (min: 1, max: 10)
- Visual feedback on hover and active states

### 2. Stripe Elements Card Input

**Location**: Lines ~456-465

**Implementation**:
- Iframe-based secure card entry (managed by Stripe.js SDK)
- Autofill link text enables Stripe Link for returning customers
- Custom styling to match application dark theme
- Real-time validation (built into Stripe Elements)

### 3. PIN-Gated Saved Cards

**Location**: Lines ~471-485

**Components**:
- `#pin-gate` container - Shown until session established
- `#saved-cards-list` container - Displayed after PIN verification
- Card masking format: `VISA •••• 4242` (bullet characters `•` U+2022, not dots)

**Card Display**:
- Brand name (VISA, MASTERCARD, AMEX, etc.)
- Masked number (last 4 digits with bullet mask)
- Expiration date (MM/YY format)
- Action buttons: "Use" (green background) and "Delete" (red background)
- "+ Add Card" button for new payment method registration

### 4. Action Buttons

**Location**: Lines ~466-470

- **"Cancel"** (secondary): Closes modal without action, gray outline style
- **"Confirm Purchase"** (primary gold): Processes payment with entered/selected card

---

## Critical: Stripe Overlay Initialization Order

### ⚠️ THE PROBLEM

The `stripeOverlay` variable **MUST** be declared **AFTER** the modal HTML template is inserted into the DOM. Incorrect initialization order causes complete payment modal failure:

- ❌ Empty card input field
- ❌ Missing PIN gate
- ❌ Dead/non-responsive buttons
- ❌ No error messages (silent failure)

### ✅ CORRECT SEQUENCE

```javascript
// Line ~451: Template string starts
document.getElementById('app').innerHTML = `
  <div id="stripeOverlay" style="...">
    <!-- Modal HTML content -->
  </div>
`;
// Line ~586: Template string closes

// Line ~989: CORRECT - Overlay element declared AFTER DOM insertion
const stripeOverlay = document.getElementById('stripeOverlay');
```

### ❌ INCORRECT SEQUENCE (CAUSES FAILURE)

```javascript
// Line ~625: TOO EARLY - DOM not ready yet
const stripeOverlay = document.getElementById('stripeOverlay'); // Returns null!

// Later: Template inserted
document.getElementById('app').innerHTML = `...`;
```

**Why this fails**: 
- When `getElementById` is called before the element exists in DOM, it returns `null`
- The variable is assigned `null` and never updated
- All subsequent operations on `stripeOverlay` fail silently (trying to call methods on null)

**Detection**: 
- Look for "Cannot read property of null" errors in console
- Check that modal appears visually but has no interactive elements

---

## PIN Session Management

### Session Storage

- **Key**: `pin_session_token_v1` (localStorage)
- **Database**: SQLite (`pin_store.sqlite`) on backend
- **Scope**: Per phone number + email combination

### Verification Flow

1. User enters 4-digit PIN in gate interface
2. Frontend sends PIN + phone + email to `/auth/pin-verify` endpoint
3. Backend validates against SQLite database with:
   - Rate limiting (max attempts per time window)
   - Lockout after N failed attempts
   - Session token generation on success
4. On success:
   - Backend returns session token + customer's saved cards
   - Frontend stores token in localStorage
   - PIN gate shows: "PIN verified ✓ Loading saved cards…"
   - Gate fades out with animation
   - Cards list animates in with staggered entrance (80ms delay per card)
5. Session persists until:
   - Explicit logout
   - Backend invalidation (admin reset)
   - Token expiration (configurable)

### Security

- **All card operations require active session**: `/get-payment-methods`, `/add-payment-method`, `/delete-payment-method`
- **Token validation on every request**: Backend checks token validity before processing
- **Rate limiting**: Prevents brute force attacks
- **Admin reset**: Available via admin panel (requires admin PIN)

---

## Character Encoding Requirements

### UTF-8 Special Characters

All special characters must be properly UTF-8 encoded to avoid display corruption. Common issues and fixes:

| Character | Unicode | Correct | Corrupted (avoid) |
|-----------|---------|---------|-------------------|
| Em dash | U+2014 | — | ΓÇö |
| Checkmark | U+2713 | ✓ | Γ£ô |
| Bullet point | U+2022 | • | ΓÇó |
| Minus sign | U+2212 | − | ΓêÆ or hyphen |
| Apostrophe | U+2019 | ' | ΓÇÖ |
| Ellipsis | U+2026 | … | ΓÇª or ... |
| Left arrow | U+2190 | ← | ΓåÉ |
| Emojis | Various | 😉💵🔍⚙️ | ≡ƒÿë, etc. |

### Card Masking Format

**Correct**: `VISA •••• 4242`
- Uses bullet character `•` (U+2022)
- Four bullets + space + last 4 digits
- All caps brand name

**Incorrect** (common mistakes):
- Using asterisks: `VISA **** 4242`
- Using periods: `VISA .... 4242`
- Using corrupted bullets: `VISA ΓÇóΓÇóΓÇóΓÇó 4242`

### Common Encoding Issues

**Caused by**:
- Git operations between branches with different encodings
- Copy/paste from Windows PowerShell
- File encoding changes (UTF-8 vs Windows-1252)

**Prevention**:
- Always use UTF-8 encoding in editor
- Verify special characters display correctly after git operations
- Use `multi_replace_string_in_file` for batch fixes
- Never search for emoji characters in replacement patterns

---

## Payment Flow Paths

### Path 1: New Card Entry

1. User types card details into Stripe Elements iframe
2. Click "Confirm Purchase" button
3. Frontend validates form, shows loading state
4. Frontend calls `/create-payment-intent` with:
   - Amount (quantity × $20)
   - Customer info (phone, name, email)
   - Payment context (single class, membership, etc.)
5. Backend creates PaymentIntent with `manual confirmation`
6. Stripe.js confirms payment with entered card details
7. Backend processes success webhook
8. Success: Shows "Checked in ✓" message, confetti animation
9. Redirect to home after 3 seconds

### Path 2: Saved Card Usage

1. User enters PIN in gate → PIN verification flow
2. Backend returns saved cards list
3. Cards render with staggered animation
4. User clicks "Use" button on desired card
5. Frontend calls `/create-payment-intent` with:
   - Amount
   - Customer info
   - `payment_method_id` (selected card)
6. Backend creates PaymentIntent attached to existing payment method
7. Backend confirms payment automatically (no additional UI required)
8. Success: Same flow as Path 1

### Path 3: Add New Saved Card

1. User clicks "+ Add Card" button
2. Modal transitions to card input form
3. User enters card details
4. Frontend calls `/add-payment-method` endpoint with card token
5. Backend performs **$20 test charge** to verify:
   - Card has sufficient funds
   - Card is valid and not blocked
   - Card can be charged successfully
6. Backend **immediately refunds** the $20 test charge
7. Backend saves payment method to customer account
8. Success message: "✓ Card added and verified! $20 test charge refunded."
9. New card appears in saved cards list with highlight animation
10. Card is now available for future purchases

### Error Handling

| Error Type | UI Response | User Action |
|------------|-------------|-------------|
| Card declined | Inline Stripe error message | Try different card or payment method |
| Network failure | "Network error, please try again" | Retry button available |
| Invalid card | Real-time Stripe Elements validation | Fix card details before submit |
| PIN lockout | Admin reset option shown | Contact admin or wait for timeout |
| Delete last card | Prevented with error message | Must have at least one card on file |

---

## User Flows

### Critical Distinction: Two Independent Flows

**The system has TWO completely separate flows that branch from the main tablet page. This distinction is intentionally explicit to prevent future refactors from accidentally merging them.**

### Member Flow (On-Page, No Redirect)

**Location**: All steps remain inside `index.html`

**Flow**:
1. User clicks "Member Check-In" button
2. Phone entry via custom numpad
3. Member lookup (webhook / verification)
4. Display member name + available classes
5. Class selection (multi-select chips, local state only)
6. Check-In submission (Apps Script logging + GHL automation webhook)
7. Success state (confetti animation, countdown timer)
8. Return to idle state

**Characteristics**:
- ✅ Never navigates away from index.html
- ✅ State cleared after completion
- ✅ No payment flow
- ✅ No Stripe integration
- ✅ Fast and simple (low latency for high-frequency use)

**Purpose**: High-volume attendance tracking for existing members

### Drop-In Flow (Redirect-Based Experience)

**Location**: Begins on `index.html`, completes on `options.html`

**Flow**:
1. User clicks "Drop-In Check-In" button
2. Phone entry via numpad
3. Lookup determines existing vs new customer
4. **Redirect** to `options.html` with query params (phone, name, email)
5. Options page displays:
   - Welcome message with user info
   - Choice: Free 6:30 Salsa Basics OR Make a Purchase
6. If "Make a Purchase":
   - Choose: Group Class(es) OR Membership
   - Choose: Card OR Cash
   - PIN gate for saved cards (if applicable)
   - Stripe payment processing
7. Success: Completion UI, then optional return to start

**Characteristics**:
- ✅ Navigation required (main → options)
- ✅ Payment-capable (full Stripe integration)
- ✅ Saved card list with PIN protection
- ✅ Live/test mode toggles
- ✅ More complex flow with multiple decision points

**Purpose**: Revenue generation for drop-in customers and purchases

### Why This Matters

1. **Performance**: Member check-ins must be fast (no page loads, no payment processing delays)
2. **Analytics**: Clear separation between attendance tracking vs revenue events
3. **User Experience**: Members expect quick check-in, drop-ins expect payment options
4. **Code Maintenance**: Prevents accidentally adding payment UI to member path or breaking fast check-in flow

### Future Enhancements (Non-Breaking)

**Soft-link option**: After member check-in completes, optionally display "Want to purchase a class pack?" with deep-link to options page. This keeps core attendance flow fast while offering upsell without forcing navigation.

**Important**: If modifying either flow, update this section to maintain explicit distinction.

---

## UI Design System (v2.8.0 - Gold Themed)

### Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Gold Primary | `#d4af37` | Purchase buttons, profile circles, accents |
| Gold Dark | `#b8941f` | Gradient centers for contrast |
| Cream | `#f5f1e8` | Button text, outlines, high contrast on gold |
| Dark Background | `#1a1d1f` | Cards, containers, modals |
| Border | `rgba(255,255,255,0.25)` | Card borders, dividers |
| Text Primary | `#f3f4f6` | Main text, headings |
| Text Secondary | `#9ca3af` | Subtitles, metadata |
| Text Muted | `#6b7280` | Disabled, de-emphasized elements |

### Premium Gold Theming

**Cohesive gold accent system across options page**:

1. **Primary Purchase Button**:
   - Gold gradient: `linear-gradient(135deg, #d4af37 0%, #b8941f 50%, #d4af37 100%)`
   - Darker center (`#b8941f`) provides better text contrast
   - Cream text: `#f5f1e8` for maximum readability
   - Cream outline: 2px border matching text color
   - Subtle shadow: `rgba(212,175,55,0.3)` for depth and glow

2. **Free Option Button**:
   - Transparent background
   - Gold outline: 2px solid `#d4af37`
   - Gold text: `#d4af37`
   - Hover: Slight gold background tint

3. **Profile Circle**:
   - Gold gradient matching buttons (56px diameter)
   - Initials in dark text for contrast
   - Same shadow as buttons for visual consistency

### Visual Hierarchy

| Level | Style | Usage |
|-------|-------|-------|
| **Primary** | Gold gradient with cream text | Main purchase actions, CTA buttons |
| **Secondary** | Gold outline with transparent bg | Free options, alternative choices |
| **Tertiary** | Dark background with muted text | Exit, cancel, dismiss actions |

### Options Page Layout

**Structure**:
```
┌─────────────────────────────────────┐
│ Welcome, {name}!                     │ ← H1, centered
│ What would you like to do?           │ ← H3, centered, lighter weight
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ Check in for FREE 6:30 Salsa    │ │ ← Gold outline button
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Make a Purchase                  │ │ ← Gold gradient button
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│            (spacer)                  │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ [S] shun                         │ │ ← Gold profile circle
│ │ 📞 6019551203                    │ │
│ │ ✉️ bacshun95@gmail.com           │ │
│ │           Not me? →              │ │ ← Subtle link, bottom-right
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Key Decisions**:
- All buttons constrained to 420px max-width for visual balance
- User profile card at bottom center (also 420px max-width)
- Profile includes gold circle with user initials
- Contact info with emoji icons for visual scanning
- "Not me?" link subtle and de-emphasized (70% opacity, small font)

### Consistent Styling Specifications

| Property | Value | Scope |
|----------|-------|-------|
| Border radius | 10px | All interactive elements |
| Font weight | 600 | Buttons (reduced from 800-900 for modern look) |
| Transition timing | 0.2s | All hover/active states |
| Hover lift | 2px translateY | All buttons |
| Active scale | 98% | Tactile feedback on press |
| Shadow (buttons) | `0 4px 12px rgba(212,175,55,0.3)` | Gold buttons only |
| Shadow (cards) | `0 2px 8px rgba(0,0,0,0.2)` | Container cards |

### Accessibility

- All interactive elements have `:focus` states with visible outline
- Color contrast meets WCAG AA standards (cream on gold provides 4.5:1 ratio)
- Touch targets minimum 44×44px for tablet use
- Text remains readable at tablet distances (16-18px minimum)

---

## Environment & Deployment

### Deployment Workflow

```
┌──────────┐    push     ┌──────────┐
│  main    ├────────────>│   TEST   │
│  branch  │ (automatic) │  Railway │
└────┬─────┘             └──────────┘
     │                         
     │ promote-to-prod.ps1     
     │ (manual, after testing) 
     v                         
┌──────────┐    push     ┌──────────┐
│prod-rel  ├────────────>│   PROD   │
│  branch  │ (automatic) │  Railway │
└──────────┘             └──────────┘
```

### Scripts

#### `scripts/deploy.ps1 test`

**Purpose**: Deploy to TEST environment

**Process**:
1. Enforces running from `main` branch (auto-switches if clean)
2. Aborts if working tree is dirty (uncommitted changes)
3. Bumps version using `scripts/bump-version.ps1` (auto-detects: feat→minor, BREAKING→major, else patch)
4. Updates CNAME to `test.tablet.msbdance.com`
5. Commits with version tag
6. Pushes to `test` remote (triggers Railway deploy)

**Branch Protection**: Will not deploy from `prod-release` or feature branches

#### `scripts/promote-to-prod.ps1`

**Purpose**: Promote tested code to PRODUCTION

**Process**:
1. Verifies current commit on `main` is tested and ready
2. Fast-forwards `prod-release` branch to match `main` (no new commits)
3. Updates CNAME to `tablet.msbdance.com`
4. Pushes to `prod` remote (triggers Railway deploy)
5. **No version bump** - uses same version as TEST

**Safety**: Fast-forward only (no mutations), ensures prod gets exactly what was tested

#### `scripts/bump-version.ps1`

**Purpose**: Semantic version management

**Auto-Detection**:
- Scans recent commit messages for conventional commit patterns
- `feat:` or `feature:` → **minor** bump (new feature)
- `BREAKING` or `!:` → **major** bump (breaking change)
- Everything else → **patch** bump (bug fix)

**Actions**:
1. Updates `version.json`
2. Injects new section at top of `CHANGELOG.md`
3. Returns new version number

### Git Remote Configuration

**CRITICAL**: This repository uses custom remote names (NOT `origin`):
- `test` → `https://github.com/shun-harris/test-msbd-tablet-system.git`
- `prod` → `https://github.com/shun-harris/msbd-tablet-system.git`

**Commands**:
- Deploy to test: `git push test main` (or use `.\scripts\deploy.ps1 test`)
- Deploy to prod: Use `.\scripts\promote-to-prod.ps1` (never push directly)

### Railway Configuration

**Test Environment**:
- GitHub repo: `shun-harris/test-msbd-tablet-system`
- Branch watch: `main`
- Custom domain: `test.tablet.msbdance.com`
- Environment variables: Stripe test keys
- Git remote: `test`

**Production Environment**:
- GitHub repo: `shun-harris/msbd-tablet-system` (separate repo)
- Branch watch: `prod-release`
- Custom domain: `tablet.msbdance.com`
- Environment variables: Stripe live keys
- Git remote: `prod`

---

## Security & Safety

### Branch Enforcement

- **Test deploys**: Must run from `main` branch (enforced by `scripts/deploy.ps1`)
- **Prod deploys**: Only via promotion script (direct deploy requires `-ForceLegacyProd` flag)
- **Working tree**: Must be clean (no uncommitted changes) before deploy

### CORS Whitelist

Backend allows requests from:
- `localhost` (any port) for local development
- `test.tablet.msbdance.com` for test environment
- `tablet.msbdance.com` for production

**Purpose**: Allows test environment to call production API for live-mode validation

### Health Probes

**Endpoints**:
- `/health` - Returns environment name and Stripe key family (test vs live)
- `/test/environment` - Returns detailed environment detection rationale

**UI Banner**: When test site forces live Stripe mode, banner appears if prod backend unreachable

### Stripe Mode Protection

- Production frontend **locks** Stripe mode to `live` (toggle hidden/disabled)
- Test frontend allows toggle between `test` and `live` modes for verification
- Mode stored in localStorage: `stripeMode` key

### Admin Panel Security

- Admin panel requires PIN for access
- PIN stored separately from customer PINs
- Admin can reset customer PINs if locked out
- Debug mode toggle (localStorage: `debug` key)

### PIN Security

- Rate limiting on verification attempts
- Lockout after N failed attempts
- Session tokens expire after inactivity
- SQLite database local to backend (not shared between environments)

---

## Debug & Diagnostics

### Stripe Debug Mode

**Enable**:
- URL parameter: `?stripeDebug=1`
- Or localStorage: `localStorage.setItem('stripeDebug', '1')`

**Features**:
- Overlay panel with real-time logging
- Current Stripe mode and key displayed
- DOM inspection tools
- Element positioning helpers
- Persistent mode option (survives page reloads)

**Shortcuts**:
- `Alt+Shift+D` - Toggle debug overlay
- `Alt+Shift+L` - Toggle Link suppression

### Health Checks

```javascript
// Check current environment
fetch('/health').then(r => r.json()).then(console.log);

// Output example:
{
  "environment": "test",
  "stripeKeyFamily": "test",
  "timestamp": "2025-10-07T12:00:00Z"
}
```

### Logging

**Frontend** (when debug enabled):
- All PIN-related operations logged with `[PIN]` prefix
- Stripe operations logged with `[Stripe]` prefix
- Modal operations logged with `[Modal]` prefix

**Backend**:
- All customer lookups logged with search path taken
- Payment intents logged with amounts and customer IDs
- Errors logged with full stack traces

---

## Troubleshooting Common Issues

### Payment Modal Not Appearing

**Symptom**: Click purchase button, nothing happens

**Causes**:
1. `stripeOverlay` initialized too early (returns null)
2. JavaScript error before modal code runs
3. CSS `display: none` not being removed

**Debug**:
```javascript
console.log(document.getElementById('stripeOverlay')); // Should not be null
```

### Saved Cards Not Loading

**Symptom**: PIN verified but no cards appear

**Causes**:
1. Phone number not normalized in backend query
2. Customer exists but has no payment methods
3. Network error calling `/get-payment-methods`

**Debug**:
- Check network tab for 200 response from `/get-payment-methods`
- Verify response body contains cards array
- Check console for errors

### Character Encoding Corruption

**Symptom**: Special characters display as gibberish (ΓÇö, Γ£ô, etc.)

**Causes**:
1. File encoding changed from UTF-8 to Windows-1252
2. Git operations between branches with different encodings
3. Copy/paste from PowerShell or other tools

**Fix**:
1. Save file as UTF-8 in editor
2. Use `multi_replace_string_in_file` to batch fix corrupted characters
3. Verify in browser that characters display correctly

### PIN Gate Blank on Reopen

**Symptom**: Close modal, reopen, saved cards area is blank

**Known Issue**: Currently under investigation (see todo list)

**Workaround**: Refresh page to reset state

---

**Last Updated**: 2025-10-07  
**Current Version**: v2.8.0

_For incident reports and root cause analyses, see [`ROOT_CAUSE.md`](ROOT_CAUSE.md)_
