# Release & Promotion Flow (prod-release branch)

This documents the simple protection layer for production using a dedicated `prod-release` branch.

## Branch Purpose
- `main`: Active development + test auto-deploys
- `prod-release`: Only fast-forward merges from `main` once a build has soaked on test and is approved
- Production service tracks `prod-release` (NOT `main`)

## Why This Helps (Ultra Short)
Nothing reaches production unless you deliberately move it there. A mistaken or half-done commit on `main` will auto-deploy to test, but production stays calm.

## One-Time Setup
1. Create branch (done already): `git checkout -b prod-release main && git push prod prod-release`
2. Ensure remotes: `test` (staging repo) and `prod` (production repo) exist.
3. Point the Railway production service to track `prod-release` instead of `main`.
4. (Optional) Protect branch in GitHub (skip force protection if you want easy rollback).

## Normal Development Cycle
1. Work on `main`; push freely → test auto-deploy sees it.
2. Verify on test:
   - Health endpoint OK
   - Live/test Stripe flows as appropriate
   - Saved cards appear
   - No console errors / debug overlay off
3. When ready to promote:
   - Run promotion script (below) OR do it manually:
     ```bash
     # Manual fast-forward
   git fetch --all --prune
     git checkout prod-release
   git merge --ff-only main
   git push prod prod-release
     ```
4. Production auto-builds from fresh `prod-release` commit.
5. (Optional) Tag the release: `git tag vX.Y.Z && git push prod vX.Y.Z` (your existing bump process already creates tags on test deploy; you may reuse same version).

## Provided Promotion Script
`promote-to-prod.ps1` performs a safe fast-forward and basic checks (defaults: source=main, promote=prod-release, prod remote=prod).

Usage:
```powershell
./promote-to-prod.ps1 [-SkipChecks] [-SourceBranch main] [-PromoteBranch prod-release] [-ProdRemote prod]
```

It will:
- Ensure working tree clean
- Ensure you are up to date locally with the source branch
- Confirm `prod-release` is strictly behind source (unless overridden)
- Fast-forward merge & push to `prod`

## Rollback
If a prod issue appears:
```bash
git checkout prod-release
git log --oneline -n 5   # find previous good commit
git reset --hard <GOOD_SHA>
git push prod prod-release --force-with-lease
```
(Force-with-lease prevents clobbering new work accidentally.)

## Versioning Interaction
- Your version bump currently happens on test deployment (via `deploy.ps1 test`).
- Promoting does NOT change version; prod inherits the tested version.
- If you want a unique prod tag, create an annotated tag after promotion.

## Optional Enhancements
- GitHub Action to run `promote-to-prod.ps1` on a workflow_dispatch event
- Create a `PROMOTION_CHECKLIST.md` for recurring manual validations
- Add automated smoke test endpoint diffing test vs prod

## Quick Checklist Before Promote
- [ ] Test site stable for at least N minutes
- [ ] Stripe live (if enabled) succeeds end-to-end with real or minimal $ test charge
- [ ] No unexpected console errors
- [ ] Saved card retrieval list correct
- [ ] Environment banner (if any) looks correct

That's it. Simple, deliberate, no surprises.
