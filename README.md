# MSBD Tablet System

A fullstack check-in and payment system for MSBD Dance Studio, handling member attendance tracking and drop-in customer purchases with Stripe integration.

[![Version](https://img.shields.io/badge/version-2.8.0-gold)](CHANGELOG.md)
[![Environment](https://img.shields.io/badge/test-test.tablet.msbdance.com-blue)](https://test.tablet.msbdance.com)
[![Environment](https://img.shields.io/badge/prod-tablet.msbdance.com-green)](https://tablet.msbdance.com)

---

## Quick Start

### Local Development

```powershell
# Install dependencies
npm install

# Start development server
npm run dev

# Server runs at http://localhost:3000
```

**Test Stripe cards**: Use [Stripe test cards](https://stripe.com/docs/testing#cards) like `4242 4242 4242 4242`

---

## Architecture

The system consists of two HTML pages with distinct user flows:

- **`index.html`**: Member check-ins (fast, on-page, no navigation)
- **`options.html`**: Drop-in purchases (payment flow with Stripe integration)

**Backend**: Express.js (`server.js`) with Stripe SDK for payment processing, customer management, and PIN-gated saved cards.

**Key Features**:
- Phone-based customer lookup with email fallback
- PIN-protected saved card system (SQLite storage)
- Dual-mode Stripe integration (test/live toggle on test environment)
- Automatic version bumping with semantic commit detection

📚 **For technical deep-dives, see [Architecture Documentation](docs/ARCHITECTURE.md)**

---

## Deployment

### Deploy to TEST

```powershell
# Deploys from main branch to test.tablet.msbdance.com
.\deploy.ps1 test
```

**Process**:
1. Enforces `main` branch (auto-switches if working tree clean)
2. Bumps version automatically (feat→minor, BREAKING→major, else patch)
3. Updates CNAME and pushes to Railway test service

### Promote to PRODUCTION

```powershell
# Fast-forwards prod-release branch and deploys to tablet.msbdance.com
.\promote-to-prod.ps1
```

**Safety**: Fast-forward only (no new commits), ensures prod gets exactly what was tested on TEST.

---

## Features

### Member Check-In Flow
- ⚡ Lightning-fast phone entry with custom numpad
- 📋 Multi-class selection with visual chips
- 🎯 Apps Script logging + GHL webhook automation
- 🎉 Success animation with auto-return to idle

**Critical**: No page navigation, no payment processing. Optimized for high-frequency use.

### Drop-In Purchase Flow
- 💳 Stripe Elements card input
- 🔐 PIN-gated saved cards with $20 test charge verification
- 🎟️ Single class or membership purchase options
- 💰 Free 6:30 Salsa Basics check-in option

### Gold-Themed UI (v2.8.0)
- ✨ Premium gold gradient buttons with cream text
- 👤 Profile circles with user initials
- 🎨 Cohesive color system across all interactions
- 📱 Tablet-optimized touch targets (44×44px minimum)

---

## Documentation

| Document | Description |
|----------|-------------|
| [**ARCHITECTURE.md**](docs/ARCHITECTURE.md) | Technical deep-dives: Payment modal architecture, Stripe customer strategy, UI design system, security model, character encoding requirements |
| [**ROOT_CAUSE.md**](docs/ROOT_CAUSE.md) | Incident reports and lessons learned (12 documented incidents) |
| [**CHANGELOG.md**](CHANGELOG.md) | Version history with detailed change tracking |
| [**PRODUCTION_DEPLOY.md**](docs/PRODUCTION_DEPLOY.md) | Production deployment checklist and rollback procedures |
| [**FUTURE_IDEAS.md**](docs/FUTURE_IDEAS.md) | Feature backlog and enhancement proposals |

---

## Contributing

### Branch Strategy

```
main            → TEST environment (auto-deploy)
prod-release    → PROD environment (promote only)
```

**Workflow**:
1. Make changes on `main` branch
2. Deploy to TEST with `.\deploy.ps1 test`
3. Verify on test.tablet.msbdance.com
4. Promote to PROD with `.\promote-to-prod.ps1`

### Commit Convention

Use conventional commits for automatic version bumping:

```
feat: Add new feature          → Minor bump (1.0.0 → 1.1.0)
fix: Fix bug                   → Patch bump (1.0.0 → 1.0.1)
BREAKING CHANGE: Breaking API  → Major bump (1.0.0 → 2.0.0)
```

---

## Environment Variables

### Backend (Railway)

```bash
# Stripe keys
STRIPE_SECRET_KEY=sk_test_xxx     # Test environment
STRIPE_SECRET_KEY=sk_live_xxx     # Production environment

# Optional overrides
APP_ENV=test                       # Force environment detection
```

### Frontend (localStorage)

```javascript
// Stripe mode (test environment only)
localStorage.setItem('stripeMode', 'test');  // or 'live'

// Debug mode
localStorage.setItem('stripeDebug', '1');     // Enable debug overlay
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Payment modal blank** | Check `stripeOverlay` initialization order (must be after DOM insertion) |
| **Saved cards not loading** | Verify phone normalization and PIN verification success |
| **Character encoding corruption** | Ensure file saved as UTF-8, use batch fix tools |
| **Branch confusion during deploy** | Deploy script now shows clear emoji indicators (✅🔄❌) and auto-switches |

📖 **See [ARCHITECTURE.md](docs/ARCHITECTURE.md#troubleshooting-common-issues) for detailed debugging steps**

---

## Project Structure

```
.
├── index.html                  # Member check-in page
├── options.html                # Drop-in payment page
├── server.js                   # Express backend with Stripe integration
├── version.json                # Current version number
├── CHANGELOG.md                # Version history
├── deploy.ps1                  # TEST deployment script
├── promote-to-prod.ps1         # PROD promotion script
├── bump-version.ps1            # Semantic version management
└── docs/
    ├── ARCHITECTURE.md         # Technical documentation
    ├── ROOT_CAUSE.md           # Incident reports
    ├── PRODUCTION_DEPLOY.md    # Deployment procedures
    └── FUTURE_IDEAS.md         # Feature backlog
```

---

## Tech Stack

- **Frontend**: Pure HTML/JavaScript (no frameworks)
- **Backend**: Node.js + Express
- **Payments**: Stripe Elements + Stripe API
- **Database**: SQLite (PIN storage)
- **Hosting**: Railway (separate test/prod services)
- **Version Control**: Git + GitHub
- **Deployment**: PowerShell automation scripts

---

## License

Proprietary - MSBD Dance Studio

---

## Support

For issues, questions, or feature requests, see [FUTURE_IDEAS.md](docs/FUTURE_IDEAS.md) or contact the development team.

**Current Version**: 2.8.0 (Unreleased - on TEST)

---

Built with 💛 for MSBD Dance Studio
