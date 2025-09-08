# Deployment Guide for Municipal Inquiry System

## 🚀 Deploying to Vercel

### Step 1: Prepare Environment Variables

You'll need to set these environment variables in Vercel Dashboard:

```
OPENAI_API_KEY=your_openai_api_key_here
SPREADSHEET_ID=your_google_sheet_id_here
GOOGLE_CREDENTIALS_JSON=your_google_credentials_as_json_string
SESSION_SECRET=your_random_session_secret_here
ADMIN_PASSWORD=your_admin_password_here
PORT=3000
```

### Step 2: Handle Google Credentials

Since Vercel doesn't support JSON files directly, you need to:

1. Convert your `google-credentials.json` to a single-line JSON string:
   ```bash
   # In your terminal, run:
   node -e "console.log(JSON.stringify(require('./google-credentials.json')))"
   ```

2. Copy the output and set it as `GOOGLE_CREDENTIALS_JSON` in Vercel

3. Update `server.js` to handle this (already done in our code)

### Step 3: Push to GitHub

```bash
# Initialize git repo
git init

# Add remote
git remote add origin https://github.com/RonTitans/AvTahbura.git

# Add all files (sensitive files are already in .gitignore)
git add .

# Commit
git commit -m "Initial commit - Municipal Inquiry System"

# Push to GitHub
git push -u origin main
```

### Step 4: Deploy to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import from GitHub repository: `RonTitans/AvTahbura`
4. Configure environment variables:
   - Click "Environment Variables"
   - Add all variables from Step 1
5. Click "Deploy"

### Step 5: Post-Deployment Setup

After deployment, you'll need to:

1. Update your Google Sheets API access to include your Vercel domain
2. Test all three search modes
3. Update CORS settings if needed

## 🔐 Security Considerations

### Using Supabase for Authentication (Optional)

If you want to replace the simple password system with Supabase:

1. Create a Supabase project at https://supabase.com
2. Add these environment variables:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
3. We can update the authentication to use Supabase Auth

### Current Simple Authentication

The system currently uses a simple password stored in environment variables. This is fine for internal use but consider upgrading to Supabase or Auth0 for production.

## 📝 Environment Variables Explained

- **OPENAI_API_KEY**: Your OpenAI API key for generating official responses
- **SPREADSHEET_ID**: The ID from your Google Sheet URL (the long string between /d/ and /edit)
- **GOOGLE_CREDENTIALS_JSON**: Your service account credentials as a JSON string
- **SESSION_SECRET**: Random string for session encryption (generate with: `openssl rand -base64 32`)
- **ADMIN_PASSWORD**: Password for accessing the system
- **PORT**: Port number (Vercel handles this automatically)

## 🔄 Updating Credentials

To update credentials after deployment:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Update the variable value
3. Redeploy the project (Vercel does this automatically)

## ⚠️ Important Notes

1. **Never commit `.env` or `google-credentials.json` to GitHub**
2. **Always use environment variables for sensitive data**
3. **Test locally with `.env` file before deploying**
4. **Keep a backup of your credentials in a secure password manager**

## 🐛 Troubleshooting

### Google Sheets API not working
- Check that service account email has access to your Google Sheet
- Verify GOOGLE_CREDENTIALS_JSON is properly formatted

### OpenAI API errors
- Check API key is valid and has credits
- Verify rate limits haven't been exceeded

### Authentication issues
- Clear browser cookies
- Check SESSION_SECRET is set correctly
- Verify ADMIN_PASSWORD matches what you're entering

## 📧 Support

For issues, create an issue on GitHub: https://github.com/RonTitans/AvTahbura/issues