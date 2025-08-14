# Vercel Configuration Fix Guide

## The Problem
The search functionality isn't working on Vercel because the Google Sheets data isn't loading. This is due to missing or incorrectly configured environment variables.

## Quick Fix Steps

### 1. Check Current Status
Visit: https://municipal-inquiry-system.vercel.app/debug-data

This will show you:
- How many records are loaded
- If Google Sheets is connected
- Sample data

### 2. Set Environment Variables in Vercel

Go to your Vercel Dashboard:
1. Navigate to your project: https://vercel.com/dashboard
2. Click on "municipal-inquiry-system" project
3. Go to "Settings" tab
4. Click on "Environment Variables"
5. Add these variables:

#### Required Variables:

**OPENAI_API_KEY**
- Your OpenAI API key
- Get it from: https://platform.openai.com/api-keys

**SPREADSHEET_ID**
- The ID from your Google Sheet URL
- Example: If your sheet URL is `https://docs.google.com/spreadsheets/d/1ABC123XYZ/edit`
- Then the ID is: `1ABC123XYZ`

**GOOGLE_CREDENTIALS_JSON**
- This is the most complex one. You need your service account credentials as a single-line JSON string
- If you have the `google-credentials.json` file locally:
  1. Open it in a text editor
  2. Remove all line breaks to make it one line
  3. Or use this PowerShell command:
  ```powershell
  Get-Content google-credentials.json | ConvertFrom-Json | ConvertTo-Json -Compress
  ```

**SESSION_SECRET**
- Any random string (e.g., `my-secret-key-123456`)

**ADMIN_PASSWORD**
- Your chosen password for admin access

### 3. Verify Google Sheets Access

Make sure your Google Sheet is shared with the service account email:
1. Find the email in your credentials JSON (look for `client_email`)
2. Go to your Google Sheet
3. Click "Share"
4. Add the service account email with "Viewer" permission

### 4. Redeploy

After setting the environment variables:
1. Go to the "Deployments" tab in Vercel
2. Click on the three dots next to the latest deployment
3. Click "Redeploy"

### 5. Test

After redeployment:
1. Check: https://municipal-inquiry-system.vercel.app/debug-data
2. You should see your data loaded
3. Test the search functionality

## If You Don't Have Google Credentials

If you don't have the Google service account credentials:

1. Go to: https://console.cloud.google.com
2. Create a new project or select existing
3. Enable Google Sheets API
4. Create a service account
5. Download the JSON key file
6. Share your Google Sheet with the service account email

## Alternative: Use Test Data

If you want to test without Google Sheets, we can modify the code to always use test data on Vercel.

## Debugging

Check the Vercel logs:
1. Go to your Vercel dashboard
2. Click on "Functions" tab
3. Check the logs for any errors

The local version works because it falls back to test data when credentials are missing.