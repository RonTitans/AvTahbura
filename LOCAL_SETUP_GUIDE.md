# Local Setup Guide - Google Sheets Integration

## What You Need

1. **Your Google Sheet ID**
   - Go to your Google Sheet
   - Look at the URL: `https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_HERE/edit`
   - Copy the ID (the long string between `/d/` and `/edit`)

2. **Google Service Account Credentials**
   - You need a service account JSON file from Google Cloud Console
   - This allows the app to access your Google Sheet

## Step 1: Get Google Service Account Credentials

If you don't have credentials yet:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable Google Sheets API:
   - Go to "APIs & Services" → "Enable APIs and Services"
   - Search for "Google Sheets API"
   - Click "Enable"

4. Create Service Account:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "Service Account"
   - Fill in details and click "Create"
   - Skip optional permissions
   - Click "Done"

5. Generate Key:
   - Click on your new service account
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Choose "JSON" format
   - Download the file - this is your `google-credentials.json`

## Step 2: Share Your Google Sheet

1. Open the JSON file you downloaded
2. Find the `"client_email"` field (looks like: `something@project.iam.gserviceaccount.com`)
3. Go to your Google Sheet
4. Click "Share" button
5. Add the service account email
6. Give it "Editor" permission
7. Click "Send"

## Step 3: Configure Local Environment

### Option A: Using google-credentials.json file (Easier)

1. Copy your downloaded JSON file to the AvTahbura folder
2. Rename it to `google-credentials.json`
3. Update `.env` file:

```env
# Google Sheets Configuration
SPREADSHEET_ID=your_sheet_id_here
GOOGLE_APPLICATION_CREDENTIALS=google-credentials.json

# Optional: OpenAI for response generation
OPENAI_API_KEY=your_openai_key_here
```

### Option B: Using JSON string in .env (Like Vercel)

1. Convert your JSON to a single line:
   - Open the JSON file in notepad
   - Remove all line breaks (make it one long line)
   - Or use PowerShell:
   ```powershell
   $json = Get-Content google-credentials.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress
   $json | Set-Clipboard
   # Now paste into .env file
   ```

2. Update `.env` file:

```env
# Google Sheets Configuration
SPREADSHEET_ID=your_sheet_id_here
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"...entire JSON on one line..."}

# Optional: OpenAI
OPENAI_API_KEY=your_openai_key_here
```

## Step 4: Test the Setup

1. Restart the server:
   ```bash
   # Stop the server (Ctrl+C)
   # Start again
   node server.js
   ```

2. Check the console output. You should see:
   ```
   ✅ Successfully authenticated with Google Sheets
   📧 Service Account Email: your-service-account@project.iam.gserviceaccount.com
   ✅ Loaded XXX entries from Google Sheets
   ```

3. Test search at http://localhost:8009

## Troubleshooting

### "Permission denied" error
- Make sure you shared the Google Sheet with the service account email
- Check that you gave "Editor" permission

### "Invalid credentials" error
- Make sure the JSON is valid
- If using GOOGLE_CREDENTIALS_JSON, ensure it's on one line
- Check for any extra quotes or escape characters

### "Spreadsheet not found" error
- Double-check the SPREADSHEET_ID
- Make sure you're using the ID, not the full URL

### Still using test data?
- Check console output for error messages
- Verify both SPREADSHEET_ID and credentials are set
- Make sure the sheet name is "Cleaned_Answers_Data" (or update in code)

## Quick Test

After setup, you can test if Google Sheets is working:

1. Visit: http://localhost:8009/debug-data
2. Check if `data_loaded_successfully` is true
3. Check if `total_records` shows your actual data count

## Working Example .env

```env
# Server settings
PORT=8009

# Google Sheets (choose one method)
SPREADSHEET_ID=1ABC123XYZ456  # Your actual sheet ID
GOOGLE_APPLICATION_CREDENTIALS=google-credentials.json  # If using file

# OR use JSON string (for Vercel-like setup)
# GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}

# Session settings
SESSION_SECRET=test_secret_key_123456789
ADMIN_PASSWORD=test123

# Optional: OpenAI for GPT responses
OPENAI_API_KEY=sk-...  # Your OpenAI key

# Development mode
NODE_ENV=development
```