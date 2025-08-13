# PowerShell script to set Vercel environment variables

$token = "8AVjv9ssPQFbdtihtafTmac7"
$projectPath = "F:\ClaudeCode\projects\municipal-inquiry-system"

# Read the JSON file
$jsonContent = Get-Content -Path "$projectPath\clauderon-bd2065b087b3.json" -Raw

# Remove existing variable
Write-Host "Removing old GOOGLE_CREDENTIALS_JSON..."
& vercel --token $token env rm GOOGLE_CREDENTIALS_JSON production --yes 2>$null

# Add new variable
Write-Host "Adding GOOGLE_CREDENTIALS_JSON from file..."
$jsonContent | & vercel --token $token env add GOOGLE_CREDENTIALS_JSON production

Write-Host "Environment variable updated. Triggering redeployment..."

# Trigger a new deployment
& vercel --token $token --prod --force

Write-Host "Deployment triggered! Check https://municipal-inquiry-system.vercel.app in a few minutes."