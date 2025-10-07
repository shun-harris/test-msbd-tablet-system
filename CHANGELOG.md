# Changelog

All notable changes to this project are documented here. This file supersedes the old `PATCH_NOTES.md` file (now deprecated). Version entries follow a simplified Keep a Changelog style with grouped categories.

## [Unreleased] - 2025-10-07
### Added
- **Options Page UI Redesign**: Complete visual refresh with gold theming and improved hierarchy
  - Gold gradient "Make a Purchase" button with darker center for better text contrast
  - Cream-colored outline and matching text (`#f5f1e8`) on purchase button
  - Member-style gold profile circle with user initials (56px diameter with gradient)
  - Gold outline button styling for "Check in for FREE" option (transparent background, gold border and text)
  - Centered "What would you like to do?" headline
  - Professional user profile card with horizontal layout, name prominence, and contact icons (📞 ✉️)
  - Subtle "Not me?" link integrated within profile card (bottom-right, muted styling)

### Changed
- **Check-in Upsell Flow**: Improved user experience after free class check-in
  - Upsell "Yes, Buy Next Class" now properly opens payment method choice (Card/Cash modal)
  - Fixed flow that previously just closed modal without allowing purchase
  - Users can now seamlessly transition from free check-in to paid class purchase
- **Removed confusing elements**:
  - Eliminated "You're all set — pick an option below" subtitle
  - Removed "Done" button that confused users about workflow completion
  - Replaced prominent "Not me" button with subtle integrated link
- **Button Width Standardization**: All main action buttons constrained to 420px max-width for better visual balance
- **User Profile Positioning**: Moved to bottom center with matching 420px max-width for layout consistency

### Fixed
- **Critical**: Restored `options.html` from `test/main` branch after file corruption incident
  - File corruption occurred during multi-line string replacement operations (lines ~573-742)
  - Recovery attempts via string replacement failed due to emoji encoding mismatches
  - Full file replacement from working `test/main` branch restored all functionality
  - Payment modal now fully operational: card input renders, PIN gate appears, buttons responsive
  
- **UTF-8 Character Encoding Restoration** (30+ corruptions fixed):
  - Em dashes `—` (U+2014): Restored in welcome message, payment titles, guest/phone placeholders (was `ΓÇö`)
  - Checkmarks `✓` (U+2713): Restored in success messages, checked-in confirmations, PIN verification (was `Γ£ô`)
  - Bullet points `•` (U+2022): Restored in saved card masking "VISA •••• 4242" and debug shortcuts (was `ΓÇó`)
  - Minus signs `−` (U+2212): Restored in quantity decrease button (was `ΓêÆ`)
  - Apostrophes `'` (U+2019): Restored in "I'm Done" button (was `ΓÇÖ`)
  - Ellipsis `…` (U+2026): Restored in "Loading saved cards…", "Checking in…", "Generating QR…", "Diagnosing…", "Loading…", Stripe key truncation (was `ΓÇª`)
  - Left arrow `←` (U+2190): Restored in "Back" button (was `ΓåÉ`)
  - Wink emoji 😉 (U+1F609): Restored in membership agreement text (was `≡ƒÿë`)
  - Money emoji 💵 (U+1F4B5): Restored in cash payment modal (was `≡ƒÆ╡`)
  - Magnifying glass emoji 🔍 (U+1F50D): Restored in debug console label (was `≡ƒöì`)
  - Gear emoji ⚙️ (U+2699): Restored in admin settings button (was `ΓÜÖ∩╕Å`)

- **Modal Initialization**: Corrected `stripeOverlay` element declaration timing (line 989 vs broken line 625)
  - Element now declared after DOM insertion, preventing null reference errors
  - Card input, PIN gate, and action buttons all initialize correctly

### Technical / Internal
- Created backup `options.html.backup-before-test-main-copy` before file replacement
- Documented incident in `ROOT_CAUSE.md` (Incident #11) with full debugging journey
- Added payment modal architecture documentation to `README.md`
- Added `getInitials()` helper function for profile circle display
- Improved deploy script branch switching with better visual feedback and error handling
- Lessons learned: Avoid searching for emoji characters in string replacements, always backup before risky operations

### Verified
- ✅ Debug toggle functionality confirmed working on test server (persists across reloads, shows green/gray states)

## [2.7.0] - 2025-10-06
### Added
- Test deployment

## [2.6.0] - 2025-10-06
### Added
- Membership tier selection system with Gold ($600/16 weeks) and Silver ($196/4 weeks) options
- Membership selection modal with visual tier comparison and pricing breakdown
- Weekly billing acknowledgment checkboxes with playful but clear verbiage
- Modern button styling system across entire application (flat design, consistent shadows)

### Changed
- **Major UI Overhaul**: Redesigned all buttons with modern flat design
  - Removed gradients in favor of solid colors and subtle shadows
  - Updated gold buttons: flat `#d4af37` with shadow instead of gradient
  - Updated gray buttons: transparent with light outline and `#e5e7eb` text
  - Special "Done" button style: darker `#1a1d1f` background with muted text
  - Numberpad keys: flat `#2a2d2f` with clean shadows
- Membership pricing structure updated:
  - Gold: $600 for 16 weeks (4 months), then $49/week
  - Silver: $196 for 4 weeks, then $42/week
- Unified border-radius to 10px across all buttons for consistency
- Enhanced button interactions: lift on hover, scale on press
- Font-weight reduced from 800/900 to 600 for cleaner modern look

### Technical / Internal
- Consolidated button CSS with consistent transition timing (0.2s)
- Implemented `.btn-done` class for distinctive tertiary action buttons
- Added membership tier tracking in payment context (`ctx.membershipTier`)
- Created `showMembershipSelectionModal()` function for tier selection flow

## [2.5.0] - 2025-10-05
### Added
- Payment method management system with delete and add card functionality
- `/delete-payment-method` endpoint with PIN session requirement and minimum card validation
- `/add-payment-method` endpoint with $20 test transaction verification (immediately refunded)
- "Add Card" button in saved cards UI with modal interface
- Card deletion with minimum one-card-on-file enforcement
- Shake animation and error message when attempting to delete last card
- Loading skeleton/spinner while fetching saved cards
- Auto-focus on first "Use" button after cards load
- Staggered card entrance animations with highlight pulse effect
- Phone number normalization across all payment method endpoints
- Success/error toast notifications for card operations

### Changed
- Normalized phone number format in `/get-payment-methods`, `/delete-payment-method`, and `/add-payment-method` endpoints
- Enhanced saved cards UI with action buttons and improved visual feedback
- Improved card verification flow with immediate refund of test charges

### Fixed
- Customer lookup failures due to phone number format mismatch
- Missing phone normalization causing duplicate customer creation
- Stripe public key reference error in add card modal (`STRIPE_PK` → `STRIPE_PUBLISHABLE_KEY`)

### Technical / Internal
- Implemented card count validation before deletion (prevents removing last card)
- Added $20 authorization + immediate refund flow for card verification
- Enhanced error handling with user-friendly messages for card declined/insufficient funds
- Added comprehensive loading states and animations throughout card management flow

## [2.4.7] - 2025-10-04
### Added
- Enforced main test

## [2.4.6] - 2025-10-04
### Added
- Test deployment

## [2.4.5] - 2025-10-04
### Added
- Test deployment

## [2.4.4] - 2025-10-04
### Added
- Test deployment

## [2.4.3] - 2025-10-04
### Added
- Test deployment

## [2.4.2] - 2025-10-04
### Added
- Test deployment

## [2.4.1] - 2025-10-04
### Added
- Test deployment

## [2.4.0] - 2025-10-04
### Added
- Email-first Stripe customer lookup with phone fallback.
- Display of saved payment methods for returning drop-ins (options page).
- Dynamic API base selection (prod vs test vs local â†’ test) removing the need to run a local Node server.
- Live Stripe publishable key integration for production domain.
- Build/version metadata surfaced in both admin panels.
- `/test/environment` endpoint for quick environment & key classification verification.

### Changed
- Local environment now always points to the test Railway backend.
- Improved environment detection & logging (host + Stripe key class output).

### Fixed
- Resolved corrupted / missing braces in `server.js` environment detection logic.
- Eliminated test card visibility on production by cleanly separating live vs test keys.

### Technical / Internal
- Refactored `get-payment-methods` to perform email-first customer search, then phone fallback.
- Centralized Stripe key selection logic with domain mapping.
- Documentation migrated to standalone `CHANGELOG.md` (removed duplicated inlined README sections).

## [2.3.0] - 2025-01-04
### Added
- Railway server deployment with automatic environment detection based on domain.
- Full Stripe payment integration with customer lookup and payment processing.
- Customer lookup by phone number (multiple search methods).
- Automatic payment method saving (cards stored to customer for future use).
- Saved payment methods display for returning customers.
- Domain-based environment switching (TEST vs LIVE keys by domain).
- Version tracking system in admin panels with environment detection.
- Admin panel for `options.html` (payment system admin interface).
- Environment-specific Stripe key management (seamless mode switching).
- Customer creation & management (automatic profiles for phone-based lookup).
- Payment method attachment (new cards auto-saved to customer).
- Cross-domain payment consistency.

### Changed
- Migrated from localhost to Railway for production payment processing.
- Updated `options.html` API endpoints to use Railway deployment URL instead of localhost.
- Enhanced customer search logic (metadata + phone fields + direct lookup).
- Improved payment flow (automatic customer creation & card saving).
- Admin panel styling aligned across pages.

### Technical
- Deployed Node.js Express server to Railway with environment variables.
- Implemented domain-based environment detection via request headers.
- Added comprehensive customer lookup with fallback search methods.
- Created payment method management system with automatic card attachment.
- Added health check endpoint for monitoring & environment verification.
- Implemented CORS support for GitHub Pages â†” Railway.
- Added error handling & logging for payment processing and customer management.
- Version constants system across both frontend pages.

### Fixed
- Payment processing reliability across environments.
- Customer data persistence (phone-based lookup stability).
- Environment-specific behavior (automatic Stripe key selection).
- Admin panel consistency (version tracking in both main & payment pages).

## [2.2.2] - 2025-10-02
### Added
- Adaptive sine-based class count animation with dynamic curve strength.
- CTA bar styling with consistent spacing & layout.

### Changed
- Redesigned class count animation (single smooth curve, 6s â†’ 3s).
- Replaced `twoStageDramaticSlowdown()` with `smoothDramaticSlowdown()`.
- Repositioned selection counter above Check In button.
- Unified button widths with class pill width.

### Fixed
- Removed janky end-phase animation stalls.
- Fixed spacing & width inconsistencies (selected count + buttons).

### Technical
- Implemented sine easing `Math.sin(t * Math.PI * 0.5)` plus adaptive power curves.
- Optimized `countUpClasses()` implementation & performance.
- Added dedicated CTA bar CSS.

## [2.2.1] - 2025-10-02
### Added
- Premium frosted glass UI for class selection chips with gold selection rings.
- Check icons (14px) on selected chips.
- Member Check In button fully wired with webhook integration & loading dots.
- Success screen with countdown + confetti.
- Error handling & user feedback for failed check-ins.

### Changed
- Selection visual design (frosted + border ring instead of solid gold background).
- Improved selection feedback & hierarchy.

### Fixed
- Member Next button logic & back button issues.
- Check In flow JavaScript errors (duplicate admin panel variables removed).
- Restored loading dots helpers.

### Technical
- Added `verifyMember()` webhook integration.
- Proper button binding for member flow navigation.
- Added null-safe element checks & restored loading animation functions.

## [2.2.0] - 2025-10-02
### Added
- Enhanced member welcome UI with total class count display.
- `FUTURE_IDEAS.md` for feature ideation.
- Personalized welcome message ("Welcome back, [Name]!").
- Dynamic messaging for first class vs returning users.
- Webhook-based verification for members & drop-ins (Make.com).

### Changed
- Removed per-class count display for cleaner UI.
- Removed local member & drop-in storage (real-time webhooks instead).
- Simplified admin panel (schedule focus).
- More robust webhook response parsing.
- Restored schedule management in admin panel while removing local storage sections.

### Removed
- Local member list storage & management.
- Local drop-in storage & management.
- Members import/export functionality.
- Legacy member verification system.

### Fixed
- Member phone submission & back navigation.
- Schedule editor persistence/sync.
- Added loading indicators for verification.

### Technical
- Migrated verification logic to Make.com.
- Improved error handling for malformed webhook responses.
- Added flexible parsing for various class count field names.
- Proper Google Sheet / Apps Script schedule sync fallback handling.
- Removed legacy local management logic for reduced complexity.

---

Historical versions prior to 2.2.0 are summarized in earlier internal documentation and are not retroactively reformatted here.
