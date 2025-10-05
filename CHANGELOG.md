﻿# Changelog

All notable changes to this project are documented here. This file supersedes the old `PATCH_NOTES.md` file (now deprecated). Version entries follow a simplified Keep a Changelog style with grouped categories.

## [2.4.8] - 2025-10-04
### Added
- Auto-switch test

## [2.4.7] - 2025-10-04
### Added
- Test deployment

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
