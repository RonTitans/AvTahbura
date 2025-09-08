export default function handler(req, res) {
  res.status(200).json({
    message: 'Simple test endpoint working',
    env: {
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasSpreadsheet: !!process.env.SPREADSHEET_ID,
      spreadsheetId: process.env.SPREADSHEET_ID?.substring(0, 20),
      hasGoogleCreds: !!process.env.GOOGLE_CREDENTIALS_JSON,
      googleCredsLength: process.env.GOOGLE_CREDENTIALS_JSON?.length,
      nodeVersion: process.version
    }
  });
}