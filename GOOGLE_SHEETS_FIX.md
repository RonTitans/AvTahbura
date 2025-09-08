# Google Sheets Connection Fix Guide

## Current Status
- **Service Account Email:** sheets-accessor@clauderon.iam.gserviceaccount.com
- **Spreadsheet ID:** 1m59UUY2ZvDg4xQjRbReF-npJy_k63wxd2pUt8HBIOn8
- **Problem:** Only 3 fallback records loading instead of 6000+

## Steps to Fix

### 1. Grant Access to Service Account (MOST LIKELY ISSUE)
The service account needs to be given access to your Google Sheets spreadsheet:

1. Open your Google Sheets spreadsheet: https://docs.google.com/spreadsheets/d/1m59UUY2ZvDg4xQjRbReF-npJy_k63wxd2pUt8HBIOn8
2. Click the **Share** button (top right)
3. Add email: `sheets-accessor@clauderon.iam.gserviceaccount.com`
4. Give it **Viewer** permissions (or Editor if you want to append data)
5. **UNCHECK** "Notify people" (service accounts can't receive emails)
6. Click **Share**

### 2. Check Live Debugging Endpoint
After granting access, visit: https://municipal-inquiry-system.vercel.app/api/test-env

This will show:
- If credentials are loaded
- Service account email being used
- Exact error message if connection fails
- Spreadsheet title if connection succeeds

### 3. Verify Vercel Environment Variables
Check that these are set in Vercel dashboard:

1. Go to: https://vercel.com/titans4/municipal-inquiry-system/settings/environment-variables
2. Ensure these exist:
   - `GOOGLE_CREDENTIALS_JSON` - Should contain the FULL JSON from clauderon-bd2065b087b3.json as a single string
   - `SPREADSHEET_ID` - Should be: 1m59UUY2ZvDg4xQjRbReF-npJy_k63wxd2pUt8HBIOn8
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `ADMIN_PASSWORD` - admin123
   - `SESSION_SECRET` - Any random string

### 4. Redeploy After Changes
After fixing access or environment variables:
1. Go to Vercel dashboard
2. Click "Redeploy" 
3. Wait for deployment to complete
4. Check https://municipal-inquiry-system.vercel.app/api/test-env

## OpenAI Fix

### Check API Key Status
1. Visit: https://platform.openai.com/api-keys
2. Verify your key is active
3. Check usage/credits: https://platform.openai.com/usage

### Update API Key if Needed
If the key is invalid or out of credits:
1. Generate a new key at https://platform.openai.com/api-keys
2. Update in Vercel: https://vercel.com/titans4/municipal-inquiry-system/settings/environment-variables
3. Set `OPENAI_API_KEY` to the new key
4. Redeploy

## Quick Test Commands (Local)

Test the connection locally to verify credentials work:
```bash
cd F:\ClaudeCode\projects\municipal-inquiry-system
node -e "console.log(JSON.parse(require('fs').readFileSync('clauderon-bd2065b087b3.json', 'utf8')).client_email)"
```

This should output: sheets-accessor@clauderon.iam.gserviceaccount.com

## Expected Results After Fix

When everything works, `/api/test-env` should show:
```json
{
  "googleSheetsStatus": "connected to: [Your Spreadsheet Name]",
  "dataLoaded": 6000+,
  "openaiStatus": "working"
}
```

## Common Issues

1. **"Request had insufficient authentication scopes"**
   - The service account doesn't have access to the spreadsheet
   - Solution: Share the spreadsheet with the service account email

2. **"Invalid API key provided"**
   - OpenAI key is wrong or expired
   - Solution: Generate new key and update in Vercel

3. **"Unexpected token < in JSON"**
   - GOOGLE_CREDENTIALS_JSON is not properly formatted
   - Solution: Copy entire content of clauderon-bd2065b087b3.json as-is into Vercel env variable

## Need More Help?

1. Check Vercel function logs: https://vercel.com/titans4/municipal-inquiry-system/functions
2. Look for error messages in the loadDataFromSheets function
3. The enhanced /api/test-env endpoint will show specific error details