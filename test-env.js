// Test environment variables endpoint
export function testEnvHandler(req, res) {
  res.json({
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasSpreadsheet: !!process.env.SPREADSHEET_ID,
    hasGoogleCreds: !!process.env.GOOGLE_CREDENTIALS_JSON,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    hasAdminPassword: !!process.env.ADMIN_PASSWORD,
    adminPasswordLength: process.env.ADMIN_PASSWORD?.length,
    nodeEnv: process.env.NODE_ENV
  });
}