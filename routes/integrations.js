import express from 'express';
import { rateLimiter } from '../middleware/rateLimit.js';
import { saveConfig, loadConfig, maskValue } from '../utils/encryption.js';
import { 
  validateSheetId, 
  validateOpenAIKey, 
  testGoogleSheetsConnection, 
  testOpenAIConnection 
} from '../utils/validators.js';
import { authenticateGoogleSheets } from '../utils/googleSheets.js';

const router = express.Router();

// Apply rate limiting to all integration routes
// Authentication is now handled at the server level
router.use(rateLimiter);

// GET /integrations/status - Return masked configuration
router.get('/status', (req, res) => {
  try {
    const config = loadConfig();
    
    // Get current values from environment if not in config
    const currentSheetId = config.googleSheets?.spreadsheetId || process.env.SPREADSHEET_ID || '';
    const currentApiKey = config.openai?.apiKey || process.env.OPENAI_API_KEY || '';
    
    res.json({
      googleSheets: {
        spreadsheetId: maskValue(currentSheetId, 6),
        configured: !!currentSheetId
      },
      openai: {
        apiKey: currentApiKey ? `sk-****${currentApiKey.slice(-4)}` : '',
        configured: !!currentApiKey
      }
    });
  } catch (error) {
    console.error('Error getting integration status:', error);
    res.status(500).json({ error: 'Failed to load configuration' });
  }
});

// POST /integrations/updateSheet - Update Google Sheets configuration
router.post('/updateSheet', async (req, res) => {
  try {
    const { sheetId } = req.body;
    
    // Validate input
    const validation = validateSheetId(sheetId);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // Test connection
    const sheets = await authenticateGoogleSheets();
    const testResult = await testGoogleSheetsConnection(sheetId, sheets);
    
    if (!testResult.success) {
      return res.status(400).json({ error: testResult.error });
    }
    
    // Save to encrypted config
    const config = loadConfig();
    config.googleSheets = {
      ...config.googleSheets,
      spreadsheetId: sheetId,
      updatedAt: new Date().toISOString()
    };
    saveConfig(config);
    
    // Update environment variable for current session
    process.env.SPREADSHEET_ID = sheetId;
    
    // Trigger async refresh of Google cache
    if (global.refreshGoogleCache) {
      global.refreshGoogleCache().catch(err => {
        console.error('Background cache refresh failed:', err);
      });
    }
    
    res.json({ 
      ok: true,
      message: 'Google Sheets configuration updated successfully',
      testResult: {
        rowCount: testResult.rowCount,
        columnCount: testResult.columnCount
      }
    });
  } catch (error) {
    console.error('Error updating Google Sheets config:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// POST /integrations/updateOpenAIKey - Update OpenAI API key
router.post('/updateOpenAIKey', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    // Validate input
    const validation = validateOpenAIKey(apiKey);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // Test connection
    const testResult = await testOpenAIConnection(apiKey);
    
    if (!testResult.success) {
      return res.status(400).json({ error: testResult.error });
    }
    
    // Save to encrypted config
    const config = loadConfig();
    config.openai = {
      ...config.openai,
      apiKey: apiKey,
      updatedAt: new Date().toISOString()
    };
    saveConfig(config);
    
    // Update environment variable and reinitialize OpenAI client
    process.env.OPENAI_API_KEY = apiKey;
    
    // Reinitialize OpenAI client if available
    if (global.reinitializeOpenAI) {
      global.reinitializeOpenAI(apiKey);
    }
    
    res.json({ 
      ok: true,
      message: 'OpenAI API key updated successfully'
    });
  } catch (error) {
    console.error('Error updating OpenAI config:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

export default router;