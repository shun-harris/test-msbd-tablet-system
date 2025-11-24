# Deployment Guide

## Repository Structure

**Single Repo:** `msbd-tablet-system`

### Branches
- **`main`** → Test environment (`test.tablet.msbdance.com`)
- **`prod-release`** → Production environment (`tablet.msbdance.com`)

### Hosting
- **Backend (API):** Railway
- **Frontend (HTML/JS):** Vercel

## Workflow

### 1. Deploy to Test
```powershell
# On main branch
.\scripts\deploy.ps1 test -Notes "Your changes here"
```

This will:
- Auto-bump version
- Auto-fix CNAME to `test.tablet.msbdance.com`
- Commit, tag, and push to test remote
- Railway deploys automatically

### 2. Test & Verify
- Visit `test.tablet.msbdance.com`
- Verify changes work correctly
- Test all functionality

### 3. Promote to Production
```powershell
.\scripts\promote-to-prod.ps1
```

This will:
- Checkout `prod-release` branch at test's HEAD
- Auto-fix CNAME to `tablet.msbdance.com`
- Force-push to prod remote (safe because of `--force-with-lease`)
- Railway deploys automatically

## Railway Setup (Backend API)

Configure Railway services for the Node.js backend:
- **Test API Service:** Watches `msbd-tablet-system` repo, `main` branch
- **Prod API Service:** Watches `msbd-tablet-system` repo, `prod-release` branch

## Vercel Setup (Frontend)

### Initial Setup
1. Install Vercel CLI: `npm i -g vercel`
2. In project directory: `vercel login`
3. Link project: `vercel link` (create new project, link to `msbd-tablet-system` repo)

### Configure Domains
In Vercel dashboard:
- Go to project → Settings → Domains
- **Production branch:** Set `prod-release` branch → `tablet.msbdance.com`
- **Preview branch:** Set `main` branch → `test.tablet.msbdance.com`

### DNS Configuration
Add these records in your DNS provider:
```
# Production
A     tablet         76.76.21.21
CNAME www.tablet     cname.vercel-dns.com

# Test
A     test.tablet    76.76.21.21
CNAME www.test       cname.vercel-dns.com
```

Vercel will auto-deploy on every push to either branch.

## Remote Configuration

```bash
# Test remote
git remote add test git@github.com:shun-harris/msbd-tablet-system.git

# Production remote  
git remote add prod git@github.com:shun-harris/msbd-tablet-system.git
```

(Both can point to the same repo since branches differentiate environments)

## Emergency: Direct Production Deploy

Only use in emergencies (bypasses test soak period):

```powershell
.\scripts\deploy.ps1 prod -ForceLegacyProd
```

⚠️ **Not recommended!** Always test changes first.
