# PowerShell script to prepare Google credentials for Vercel deployment

Write-Host "=== Preparing AvTahbura for Vercel Deployment ===" -ForegroundColor Cyan
Write-Host ""

# Check if google-credentials.json exists
if (!(Test-Path "google-credentials.json")) {
    Write-Host "ERROR: google-credentials.json not found!" -ForegroundColor Red
    Write-Host "Please ensure you're running this from the AvTahbura directory" -ForegroundColor Yellow
    exit 1
}

Write-Host "Step 1: Converting Google credentials to single-line format..." -ForegroundColor Green
$json = Get-Content google-credentials.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress
$json | Set-Clipboard

Write-Host "✅ Google credentials copied to clipboard!" -ForegroundColor Green
Write-Host ""

Write-Host "Step 2: Open Vercel Dashboard" -ForegroundColor Green
Write-Host "Go to: https://vercel.com/dashboard" -ForegroundColor Yellow
Write-Host ""

Write-Host "Step 3: Add Environment Variables" -ForegroundColor Green
Write-Host "1. Click on your project: 'municipal-inquiry-system'" -ForegroundColor White
Write-Host "2. Go to 'Settings' tab" -ForegroundColor White
Write-Host "3. Click on 'Environment Variables'" -ForegroundColor White
Write-Host "4. Add these variables (one by one):" -ForegroundColor White
Write-Host ""

Write-Host "VARIABLE 1: GOOGLE_CREDENTIALS_JSON" -ForegroundColor Cyan
Write-Host "Value: [PASTE from clipboard - Ctrl+V]" -ForegroundColor Yellow
Write-Host "Environments: ✓ Production ✓ Preview ✓ Development" -ForegroundColor Gray
Write-Host ""

Write-Host "VARIABLE 2: OPENAI_API_KEY" -ForegroundColor Cyan
Write-Host "Value: Copy this (it's already in your .env):" -ForegroundColor Yellow
$envContent = Get-Content .env | Select-String "OPENAI_API_KEY"
$apiKey = $envContent -replace "OPENAI_API_KEY=", ""
Write-Host $apiKey -ForegroundColor Green
Write-Host "Environments: ✓ Production ✓ Preview ✓ Development" -ForegroundColor Gray
Write-Host ""

Write-Host "VARIABLE 3: SPREADSHEET_ID" -ForegroundColor Cyan
Write-Host "Value: 1m59UUY2ZvDg4xQjRbReF-npJy_k63wxd2pUt8HBIOn8" -ForegroundColor Green
Write-Host "Environments: ✓ Production ✓ Preview ✓ Development" -ForegroundColor Gray
Write-Host ""

Write-Host "VARIABLE 4: SESSION_SECRET" -ForegroundColor Cyan
Write-Host "Value: your-secret-key-for-sessions-123456789" -ForegroundColor Green
Write-Host "Environments: ✓ Production ✓ Preview ✓ Development" -ForegroundColor Gray
Write-Host ""

Write-Host "VARIABLE 5: ADMIN_PASSWORD" -ForegroundColor Cyan
Write-Host "Value: Choose a strong password (or use 'test123' for testing)" -ForegroundColor Green
Write-Host "Environments: ✓ Production ✓ Preview ✓ Development" -ForegroundColor Gray
Write-Host ""

Write-Host "Step 4: Redeploy" -ForegroundColor Green
Write-Host "1. After adding all variables, go to 'Deployments' tab" -ForegroundColor White
Write-Host "2. Click the three dots (...) next to latest deployment" -ForegroundColor White
Write-Host "3. Click 'Redeploy'" -ForegroundColor White
Write-Host "4. Choose 'Use existing Build Cache' and click 'Redeploy'" -ForegroundColor White
Write-Host ""

Write-Host "Step 5: Verify (after deployment completes ~2 min)" -ForegroundColor Green
Write-Host "1. Check data: https://municipal-inquiry-system.vercel.app/debug-data" -ForegroundColor White
Write-Host "   Should show: 6446 records" -ForegroundColor Gray
Write-Host "2. Check health: https://municipal-inquiry-system.vercel.app/health" -ForegroundColor White
Write-Host "3. Test search: Login with your ADMIN_PASSWORD and try searching" -ForegroundColor White
Write-Host ""

Write-Host "Press Enter when you're ready to open Vercel Dashboard..." -ForegroundColor Cyan
Read-Host

Start-Process "https://vercel.com/dashboard"