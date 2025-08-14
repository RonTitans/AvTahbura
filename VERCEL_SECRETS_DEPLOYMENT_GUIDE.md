# 🔐 Vercel Secrets & Deployment Guide

## ⚠️ THE GOLDEN RULE
**NEVER commit secrets to Git!** The `.gitignore` file prevents `.env` files from being pushed.

## 📊 How Secrets Work: Local vs Git vs Vercel

### 1️⃣ LOCAL (Your Machine)
```
✅ .env file with all secrets
✅ google-credentials.json file
✅ Everything works
```

### 2️⃣ GIT (GitHub Repository)
```
❌ NO .env files (blocked by .gitignore)
❌ NO google-credentials.json (blocked)
✅ Only code and public files
```

### 3️⃣ VERCEL (Production)
```
✅ Environment variables from Vercel Dashboard
✅ Secrets configured in Vercel Settings
✅ Everything works WITHOUT files
```

---

## 🚀 STEP-BY-STEP DEPLOYMENT PROCESS

### Step 1: Prepare Your Secrets
Open your `.env` file and copy these values:
```env
# Core Settings
ADMIN_PASSWORD=test123
SESSION_SECRET=your-super-secret-session-key-change-this-in-production
NODE_ENV=production

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Google Sheets
SPREADSHEET_ID=1m59UUY2ZvDg4xQjRbReF-npJy_k63wxd2pUt8HBIOn8
GOOGLE_CREDENTIALS_JSON=(see special instructions below)

# Supabase
SUPABASE_URL=https://lygevylmocsxioahzuej.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
USE_SUPABASE_AUTH=true
REQUIRE_2FA=true
```

### Step 2: Convert google-credentials.json
```bash
# In your terminal, run this to get a single-line version:
node -e "console.log(JSON.stringify(require('./google-credentials.json')))"
```
Copy the output - this is your `GOOGLE_CREDENTIALS_JSON` value!

### Step 3: Add to Vercel Dashboard

1. **Go to Vercel Dashboard**
   - https://vercel.com/dashboard
   - Select your project: `avtahbura`

2. **Navigate to Settings**
   - Click "Settings" tab
   - Click "Environment Variables" (left menu)

3. **Add Each Variable**
   For EACH variable from your .env:
   - Click "Add New"
   - **Key**: Variable name (e.g., `OPENAI_API_KEY`)
   - **Value**: The actual value
   - **Environment**: Select all (Production, Preview, Development)
   - Click "Save"

4. **Special: GOOGLE_CREDENTIALS_JSON**
   - Key: `GOOGLE_CREDENTIALS_JSON`
   - Value: The single-line JSON string from Step 2
   - ⚠️ Make sure it's ONE LINE, no line breaks!

---

## 🔄 DEPLOYMENT WORKFLOW

### For Development Branch (Staging)
```bash
# 1. Commit your code (WITHOUT secrets)
git add .
git commit -m "Your changes"
git push origin dev

# 2. Vercel auto-deploys from dev branch
# 3. Uses environment variables from Vercel Dashboard
```

### For Production
```bash
# 1. Merge to main
git checkout main
git merge dev
git push origin main

# 2. Vercel auto-deploys from main branch
# 3. Uses same environment variables
```

---

## ⚠️ COMMON MISTAKES & FIXES

### ❌ Mistake 1: Forgetting to add variables to Vercel
**Symptom**: App crashes with "undefined" errors
**Fix**: Add ALL variables from .env to Vercel Dashboard

### ❌ Mistake 2: Google credentials not working
**Symptom**: "Cannot read Google Sheets"
**Fix**: Make sure GOOGLE_CREDENTIALS_JSON is:
- Single line (no line breaks)
- Valid JSON (test with JSON.parse())
- Has all required fields

### ❌ Mistake 3: Wrong environment selected
**Symptom**: Works in preview but not production
**Fix**: Enable variable for ALL environments in Vercel

### ❌ Mistake 4: Quotes in values
**Symptom**: Authentication fails
**Fix**: Don't wrap values in quotes in Vercel Dashboard

---

## 📋 VERIFICATION CHECKLIST

Before pushing to Git, verify in Vercel Dashboard:

- [ ] ADMIN_PASSWORD
- [ ] SESSION_SECRET
- [ ] NODE_ENV (set to "production")
- [ ] OPENAI_API_KEY
- [ ] SPREADSHEET_ID
- [ ] GOOGLE_CREDENTIALS_JSON (as single-line JSON)
- [ ] SUPABASE_URL
- [ ] SUPABASE_ANON_KEY
- [ ] USE_SUPABASE_AUTH
- [ ] REQUIRE_2FA

---

## 🛠️ DEBUGGING DEPLOYMENT

### Check if variables are loaded:
1. Go to Vercel Dashboard
2. Functions tab → View logs
3. Look for initialization messages

### Test specific variable:
Add this temporarily to server.js:
```javascript
console.log('Has OpenAI Key:', !!process.env.OPENAI_API_KEY);
console.log('Has Google Creds:', !!process.env.GOOGLE_CREDENTIALS_JSON);
console.log('Has Supabase URL:', !!process.env.SUPABASE_URL);
```

### If Google Sheets fails:
The app tries 3 methods:
1. GOOGLE_CREDENTIALS_JSON env variable ✅ (Vercel)
2. google-credentials.json file ❌ (not in Git)
3. Encrypted config ❌ (not set up)

Make sure method 1 works!

---

## 🎯 QUICK REFERENCE

### What goes in Git:
- ✅ All code files
- ✅ package.json
- ✅ vercel.json
- ✅ Public HTML/CSS/JS
- ❌ NO .env files
- ❌ NO credentials files
- ❌ NO secret keys

### What goes in Vercel Dashboard:
- ✅ ALL environment variables
- ✅ Google credentials as JSON string
- ✅ API keys
- ✅ Database URLs

### The Flow:
1. **Local** → Test with .env file
2. **Git Push** → Code only, no secrets
3. **Vercel Build** → Reads from Dashboard
4. **App Runs** → Uses Vercel env variables

---

## 💡 PRO TIPS

1. **Different values per environment**:
   - Set different ADMIN_PASSWORD for staging vs production
   - Use different Google Sheets for testing

2. **Backup your secrets**:
   - Keep .env file locally
   - Save in password manager
   - Document in secure location

3. **Test deployment**:
   - First deploy to dev branch
   - Verify everything works
   - Then merge to production

4. **Update secrets**:
   - Change in Vercel Dashboard
   - Redeploy (Settings → Deployments → Redeploy)
   - No code changes needed!

---

## 🚨 EMERGENCY RECOVERY

If deployment fails:
1. Check Vercel Function Logs
2. Verify ALL env variables are set
3. Check google-credentials JSON format
4. Redeploy with "Clear Build Cache"
5. Contact support with error logs

Remember: The app works locally because it has .env file. Vercel needs the SAME variables in its Dashboard!