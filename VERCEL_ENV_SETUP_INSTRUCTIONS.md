# 📋 Vercel Environment Variables Setup Instructions

## 🔑 THE 9 ENVIRONMENT VARIABLES YOU NEED

**Note:** Authentication is now handled by Supabase with your ron@titans.global account and 2FA. 
No ADMIN_PASSWORD variable is needed anymore!

Copy these exactly as shown:

### 1. SESSION_SECRET
```
test_secret_key_123456789
```

### 2. NODE_ENV
```
production
```

### 3. OPENAI_API_KEY
```
[Your OpenAI API key - get from your .env file]
```

### 4. SPREADSHEET_ID
```
1m59UUY2ZvDg4xQjRbReF-npJy_k63wxd2pUt8HBIOn8
```

### 5. GOOGLE_CREDENTIALS_JSON
```
[Your Google credentials JSON - run: node -e "console.log(JSON.stringify(require('./google-credentials.json')))"]
```

### 6. SUPABASE_URL
```
https://lygevylmocsxioahzuej.supabase.co
```

### 7. SUPABASE_ANON_KEY
```
[Your Supabase anon key - get from your .env file]
```

### 8. USE_SUPABASE_AUTH
```
true
```

### 9. REQUIRE_2FA
```
true
```

---

## 📱 HOW TO ADD THESE TO VERCEL (Step-by-Step)

### Step 1: Open Vercel Dashboard
1. Go to: https://vercel.com
2. Sign in with your account
3. You should see your projects list

### Step 2: Navigate to Environment Variables
1. Click on your **"avtahbura"** project (or create it if not exists)
2. Click the **"Settings"** tab at the top
3. In the left sidebar, click **"Environment Variables"**

### Step 3: Add Each Variable (Repeat 9 times)
For EACH variable above:

1. Click the **"Add New"** button
2. In the **"Key"** field: Type the variable name (e.g., `ADMIN_PASSWORD`)
3. In the **"Value"** field: 
   - Copy the value from above
   - Paste it WITHOUT any quotes
   - Make sure there are NO extra spaces
4. In **"Environments"** section:
   - ✅ Check **Production**
   - ✅ Check **Preview** 
   - ✅ Check **Development**
   - (Select all three!)
5. Click **"Save"** button

### Step 4: Special Attention for GOOGLE_CREDENTIALS_JSON
⚠️ **MOST IMPORTANT VARIABLE:**
- This MUST be on a single line
- Copy the ENTIRE long string above
- Do NOT add any line breaks
- Do NOT add quotes around it
- Paste it exactly as shown

### Step 5: Verify All Variables
After adding all 9, you should see:
- SESSION_SECRET ✅
- NODE_ENV ✅
- OPENAI_API_KEY ✅
- SPREADSHEET_ID ✅
- GOOGLE_CREDENTIALS_JSON ✅
- SUPABASE_URL ✅
- SUPABASE_ANON_KEY ✅
- USE_SUPABASE_AUTH ✅
- REQUIRE_2FA ✅

---

## 🚀 AFTER ADDING ALL VARIABLES

### Option 1: Connect GitHub (If Not Connected)
1. In Vercel Dashboard → Settings → Git
2. Click "Connect GitHub Account"
3. Authorize Vercel
4. Select your repository
5. Configure:
   - Production Branch: `main`
   - Development Branch: `dev`

### Option 2: If Already Connected
Just wait for the next git push!

---

## ⚠️ COMMON MISTAKES TO AVOID

❌ **DON'T** wrap values in quotes
❌ **DON'T** add spaces before/after values
❌ **DON'T** break GOOGLE_CREDENTIALS_JSON into multiple lines
❌ **DON'T** forget to select all 3 environments
❌ **DON'T** change the variable names

✅ **DO** copy exactly as shown
✅ **DO** save after each variable
✅ **DO** double-check GOOGLE_CREDENTIALS_JSON is one line

---

## 📝 CHECKLIST BEFORE WE PUSH TO GIT

- [ ] All 9 variables added to Vercel
- [ ] GOOGLE_CREDENTIALS_JSON is single line
- [ ] All variables enabled for Production, Preview, Development
- [ ] GitHub connected to Vercel
- [ ] Dev branch set as development branch

Once you confirm all above, we'll push to Git and it will deploy automatically!