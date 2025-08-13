@echo off
echo 🚀 Running Vercel Environment Variable Debug Tests...
echo.

echo 📋 Step 1: Testing local environment variable formats...
node test-vercel-env-format.js
echo.

echo 📋 Step 2: Running comprehensive debug tests...
node debug-vercel-env.js
echo.

echo ✅ Debug tests completed!
echo.
echo 🎯 Next steps:
echo 1. Review the output above for any issues
echo 2. Deploy to Vercel with the updated debug tools
echo 3. Access /api/debug-vercel endpoint on your deployed app
echo 4. Follow the recommendations in VERCEL_ENV_DEBUG_GUIDE.md
echo.
pause