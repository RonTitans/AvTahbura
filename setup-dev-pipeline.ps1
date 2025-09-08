# PowerShell Script to Set Up Development Pipeline

Write-Host "=== Setting Up Professional Dev Pipeline ===" -ForegroundColor Cyan
Write-Host ""

# Check current branch
$currentBranch = git branch --show-current
Write-Host "Current branch: $currentBranch" -ForegroundColor Yellow

# 1. Save current work
Write-Host ""
Write-Host "Step 1: Saving current fixes to dev branch..." -ForegroundColor Green
git add public/index.html
git commit -m "fix: make button functions globally accessible for onclick handlers"
Write-Host "✅ Changes committed to dev branch" -ForegroundColor Green

# 2. Push dev branch to GitHub
Write-Host ""
Write-Host "Step 2: Creating staging environment..." -ForegroundColor Green
git push -u origin dev
Write-Host "✅ Dev branch pushed to GitHub" -ForegroundColor Green

Write-Host ""
Write-Host "=== NEXT STEPS IN VERCEL DASHBOARD ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Vercel will automatically create a preview deployment for 'dev' branch" -ForegroundColor White
Write-Host "   URL will be: https://municipal-inquiry-system-git-dev-[your-username].vercel.app" -ForegroundColor Yellow
Write-Host ""

Write-Host "2. Set up Environment Variables per branch:" -ForegroundColor White
Write-Host "   - Go to Settings → Environment Variables" -ForegroundColor Gray
Write-Host "   - Click on each variable" -ForegroundColor Gray
Write-Host "   - Set different values for Production vs Preview" -ForegroundColor Gray
Write-Host ""

Write-Host "3. Your Pipeline:" -ForegroundColor White
Write-Host "   LOCAL (dev branch) → Test locally" -ForegroundColor Gray
Write-Host "   ↓" -ForegroundColor DarkGray
Write-Host "   STAGING (dev branch on Vercel) → Test online" -ForegroundColor Gray
Write-Host "   ↓" -ForegroundColor DarkGray
Write-Host "   PRODUCTION (main branch) → Live site" -ForegroundColor Gray
Write-Host ""

Write-Host "=== HOW TO DEPLOY TO PRODUCTION ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "After testing on staging URL, run these commands:" -ForegroundColor White
Write-Host ""
Write-Host "git checkout main" -ForegroundColor Yellow
Write-Host "git merge dev" -ForegroundColor Yellow
Write-Host "git push origin main" -ForegroundColor Yellow
Write-Host ""

Write-Host "=== QUICK REFERENCE ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Work on new feature:" -ForegroundColor White
Write-Host "  git checkout dev" -ForegroundColor Gray
Write-Host "  # make changes" -ForegroundColor DarkGray
Write-Host "  git add ." -ForegroundColor Gray
Write-Host "  git commit -m 'description'" -ForegroundColor Gray
Write-Host "  git push origin dev" -ForegroundColor Gray
Write-Host ""
Write-Host "Deploy to production:" -ForegroundColor White
Write-Host "  git checkout main" -ForegroundColor Gray
Write-Host "  git merge dev" -ForegroundColor Gray
Write-Host "  git push origin main" -ForegroundColor Gray
Write-Host ""

Write-Host "Press Enter to continue..." -ForegroundColor Cyan
Read-Host