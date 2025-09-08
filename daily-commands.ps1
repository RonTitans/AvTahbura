# Daily Development Commands

Write-Host "=== AVTAHBURA DAILY COMMANDS ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. START YOUR DAY:" -ForegroundColor Green
Write-Host "   git checkout dev" -ForegroundColor Yellow
Write-Host "   git pull origin dev" -ForegroundColor Yellow
Write-Host "   npm start" -ForegroundColor Yellow
Write-Host ""

Write-Host "2. AFTER MAKING CHANGES:" -ForegroundColor Green
Write-Host "   git add ." -ForegroundColor Yellow
Write-Host "   git commit -m 'fix: what you fixed'" -ForegroundColor Yellow
Write-Host "   git push origin dev" -ForegroundColor Yellow
Write-Host "   # Wait 2 min, test on staging URL" -ForegroundColor Gray
Write-Host ""

Write-Host "3. DEPLOY TO PRODUCTION:" -ForegroundColor Green
Write-Host "   git checkout main" -ForegroundColor Yellow
Write-Host "   git merge dev" -ForegroundColor Yellow
Write-Host "   git push origin main" -ForegroundColor Yellow
Write-Host "   # Live in 2 minutes!" -ForegroundColor Gray
Write-Host ""

Write-Host "4. CHECK DEPLOYMENT STATUS:" -ForegroundColor Green
Write-Host "   Open: https://vercel.com/dashboard" -ForegroundColor Yellow
Write-Host ""

Write-Host "CURRENT BRANCH:" -ForegroundColor Cyan
git branch --show-current

Write-Host ""
Write-Host "REMEMBER: Never work on main directly!" -ForegroundColor Red