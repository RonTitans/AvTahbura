# Vercel Environment Variable Debug Guide

This guide provides comprehensive tools and methods to debug environment variable issues on Vercel, specifically focusing on Google Sheets credentials and OpenAI API key formatting problems.

## 🚨 Problem Summary

The system works locally but fails on Vercel with symptoms:
- Only 3 fallback records loaded instead of 6000+ from Google Sheets
- OpenAI shows "Connection error"
- Likely caused by environment variable formatting issues in Vercel

## 🔧 Debug Tools Created

### 1. Comprehensive Environment Debug Script
**File:** `debug-vercel-env.js`
**Endpoint:** `/api/debug-vercel`

This script performs 20+ tests including:
- Environment variable presence and format validation
- Google Credentials JSON parsing with escape character detection
- OpenAI API key format validation
- Actual connection testing to both services
- Platform-specific checks for Vercel environment

### 2. Enhanced Server Logging
**File:** `server.js` (updated)

Added detailed logging to:
- Google Sheets authentication process
- OpenAI initialization
- JSON parsing with error context
- Private key format validation
- Connection testing with full error details

### 3. Local Environment Test Script
**File:** `test-vercel-env-format.js`

Validates environment variables locally before deployment:
- Reads credentials file and tests JSON formatting
- Generates exact Vercel CLI commands
- Checks for common formatting issues
- Tests line endings and character encoding

### 4. Enhanced Test Endpoint
**Endpoint:** `/api/test-env` (updated)

Now includes:
- Detailed OpenAI connection testing
- Full error reporting
- Platform detection
- Extended diagnostic information

## 🕵️ How to Debug

### Step 1: Run Local Pre-Deployment Test
```bash
cd projects/municipal-inquiry-system
node test-vercel-env-format.js
```

This will:
- Test your credentials file format
- Generate exact Vercel commands
- Identify potential issues before deployment

### Step 2: Deploy with Debug Tools
Deploy your updated code to Vercel, then access:

**Primary Debug Endpoint:**
```
https://your-vercel-app.vercel.app/api/debug-vercel
```

**Secondary Test Endpoint:**
```
https://your-vercel-app.vercel.app/api/test-env
```

### Step 3: Analyze Debug Results

The debug endpoint will return detailed results showing exactly where the failure occurs:

```json
{
  "success": true,
  "debug_results": {
    "tests": [
      {
        "test": "JSON Parsing",
        "status": "fail",
        "details": "Failed to parse GOOGLE_CREDENTIALS_JSON",
        "error": {
          "message": "Unexpected token at position 234"
        }
      }
    ]
  },
  "recommendations": [
    {
      "issue": "Google Credentials JSON parsing failed",
      "solution": "Check for escape character issues",
      "action": "Use Vercel CLI to set the variable from file"
    }
  ]
}
```

## 🔍 Common Issues and Solutions

### Issue 1: JSON Escape Character Problems
**Symptoms:** JSON parsing fails with "Unexpected token"
**Solution:** 
```bash
# Use Vercel CLI instead of dashboard
cat clauderon-bd2065b087b3.json | vercel env add GOOGLE_CREDENTIALS_JSON production
```

### Issue 2: Private Key Newline Issues
**Symptoms:** Authentication fails with "invalid_grant"
**Detection:** Debug shows "Private key contains literal \\n"
**Solution:** The debug script automatically fixes this by converting `\\n` to actual newlines

### Issue 3: OpenAI API Key Whitespace/Format Issues
**Symptoms:** "Incorrect API key provided"
**Detection:** Debug shows whitespace or invalid characters
**Solution:** Re-copy API key ensuring no extra characters

### Issue 4: Large Environment Variable
**Symptoms:** Variable not set or truncated
**Detection:** Debug shows size > 4KB
**Solution:** Minimize JSON or use alternative storage

## 🚀 Recommended Deployment Process

### Method 1: Using Vercel CLI (Recommended)
```bash
# Set Google Credentials
vercel env add GOOGLE_CREDENTIALS_JSON production
# Paste the JSON when prompted (get from debug script output)

# Set OpenAI API Key
vercel env add OPENAI_API_KEY production
# Paste your API key

# Verify settings
vercel env ls
```

### Method 2: Using File Upload
```bash
# Generate exact command from test script
node test-vercel-env-format.js
# Copy the generated command and run it
```

### Method 3: Dashboard (Last Resort)
Only use the Vercel dashboard if CLI fails. Be careful with escape characters.

## 📊 Interpreting Debug Results

### Test Status Meanings:
- ✅ **pass**: Test completed successfully
- ❌ **fail**: Critical issue that needs fixing
- ⚠️ **warning**: Potential issue, monitor closely

### Critical Tests to Watch:
1. **JSON Parsing**: Must pass for Google Sheets to work
2. **Spreadsheet Access**: Confirms permissions are correct
3. **OpenAI Connection**: Confirms API key and credits work
4. **Private Key Format**: Must have proper headers and newlines

## 🔧 Advanced Troubleshooting

### Check Server Logs
In Vercel dashboard, go to Functions tab and check the server logs for detailed error messages added by the enhanced logging.

### Test Specific Components
```javascript
// Test only Google Sheets
fetch('/api/debug-vercel').then(r => r.json()).then(data => {
  console.log(data.debug_results.tests.filter(t => t.test.includes('Google')));
});

// Test only OpenAI
fetch('/api/debug-vercel').then(r => r.json()).then(data => {
  console.log(data.debug_results.tests.filter(t => t.test.includes('OpenAI')));
});
```

### Manual Environment Variable Check
```bash
# List all environment variables
vercel env ls

# Remove problematic variable
vercel env rm GOOGLE_CREDENTIALS_JSON production

# Re-add with proper format
vercel env add GOOGLE_CREDENTIALS_JSON production
```

## 📝 Debug Checklist

- [ ] Run local test script
- [ ] Deploy with debug tools
- [ ] Check `/api/debug-vercel` endpoint
- [ ] Verify no "fail" status in critical tests
- [ ] Check Vercel function logs
- [ ] Test `/api/test-env` for actual connections
- [ ] Verify data loading with `/health` endpoint

## 🎯 Expected Working State

When everything is working correctly, you should see:
- `/api/debug-vercel`: All critical tests show "pass"
- `/health`: Shows 6000+ records loaded
- `/api/test-env`: OpenAI status shows "working"
- Server logs show successful authentication messages

## 📞 Next Steps

1. Deploy the updated code with debug tools
2. Access `/api/debug-vercel` endpoint
3. Follow the specific recommendations in the response
4. Re-test until all critical tests pass
5. Verify system functionality with actual data

The debug tools will tell you exactly what's wrong and how to fix it. No more guessing!