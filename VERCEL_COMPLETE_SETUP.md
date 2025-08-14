# Complete Vercel Setup Guide

## Your Environment Variables

You need to add these exact values to Vercel:

### 1. OPENAI_API_KEY
```
[Your OpenAI API key - get it from https://platform.openai.com/api-keys]
```
**Note:** Use the API key you provided earlier, starting with `sk-proj-...`

### 2. SPREADSHEET_ID
```
1m59UUY2ZvDg4xQjRbReF-npJy_k63wxd2pUt8HBIOn8
```

### 3. GOOGLE_CREDENTIALS_JSON
You need to convert your `google-credentials.json` to a single line. Here's how:

1. Open PowerShell
2. Navigate to the AvTahbura folder
3. Run this command:
```powershell
$json = Get-Content google-credentials.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress
$json | Set-Clipboard
```
4. Now it's in your clipboard - paste it into Vercel

### 4. SESSION_SECRET
```
your-secret-key-for-sessions-123456789
```

### 5. ADMIN_PASSWORD
Choose a strong password for production. For testing you can use:
```
test123
```

## Steps to Add to Vercel

1. Go to: https://vercel.com/dashboard
2. Click on your project: "municipal-inquiry-system"
3. Go to "Settings" tab
4. Click on "Environment Variables"
5. Add each variable above with these settings:
   - Environment: Production, Preview, Development (all checked)
   - Add each one

## After Adding Variables

1. Go to "Deployments" tab
2. Click the three dots next to latest deployment
3. Click "Redeploy"
4. Choose "Use existing Build Cache" and click "Redeploy"

## Verify It's Working

After deployment completes (about 2 minutes):

1. Visit: https://municipal-inquiry-system.vercel.app/debug-data
   - Should show your data count (6446 records)

2. Visit: https://municipal-inquiry-system.vercel.app/health
   - Should show system status

3. Login and test search:
   - Password: whatever you set as ADMIN_PASSWORD
   - Try searching for "קו 408"

## Important Notes

1. **Google Sheets Access**: Your sheet is already shared with `sheets-accessor@clauderon.iam.gserviceaccount.com`

2. **Sensitive Data**: Never commit these values to GitHub

3. **OpenAI Usage**: Your API key will be used for generating responses, monitor usage at: https://platform.openai.com/usage

## Troubleshooting

### If searches return no results:
- Check /debug-data to see if data is loaded
- Verify GOOGLE_CREDENTIALS_JSON is properly formatted (single line)

### If AI responses don't work:
- Verify OPENAI_API_KEY is correct
- Check OpenAI API usage/limits

### If login doesn't work:
- Make sure ADMIN_PASSWORD is set
- Clear browser cookies and try again

## Current Status

✅ **Local**: Everything working
- Google Sheets: Connected
- OpenAI: Working
- Search: All modes functional
- Save to Sheet: Working

🔴 **Vercel**: Needs environment variables
- Once you add the variables above, everything should work!