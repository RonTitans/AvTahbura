@echo off
echo Setting environment variables in Vercel...

REM Set GOOGLE_CREDENTIALS_JSON from file
type clauderon-bd2065b087b3.json | vercel --token 8AVjv9ssPQFbdtihtafTmac7 env add GOOGLE_CREDENTIALS_JSON production

echo Environment variable set. Now redeploying...
vercel --token 8AVjv9ssPQFbdtihtafTmac7 --prod --force

echo Deployment complete!