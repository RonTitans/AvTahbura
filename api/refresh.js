/**
 * /api/refresh - Rebuild and upload Index Pack
 * Reads from Google Sheets and creates searchable index with embeddings
 */

const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const { buildIndexPack } = require('../rag/core/indexer');
const { uploadIndexPack, downloadIndexPack } = require('../rag/storage/blob');
const { getCache } = require('../rag/storage/cache');
const OpenAI = require('openai');
const fs = require('fs').promises;

// Initialize OpenAI if available
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

/**
 * Authenticate with Google Sheets
 */
async function authenticateGoogleSheets() {
  try {
    const auth = new GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    return sheets;
  } catch (error) {
    console.error('❌ Google Sheets authentication failed:', error);
    throw error;
  }
}

/**
 * Load data from Google Sheets
 */
async function loadDataFromSheets() {
  const sheets = await authenticateGoogleSheets();
  const spreadsheetId = process.env.SPREADSHEET_ID || '1m59UUY2ZvDg4xQjRbReF-npJy_k63wxd2pUt8HBIOn8';
  
  try {
    // Get spreadsheet metadata
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId
    });
    
    console.log(`📊 Loading from: ${spreadsheet.data.properties.title}`);
    
    // Find the correct sheet
    const targetSheetName = 'Cleaned_Answers_Data';
    const sheet = spreadsheet.data.sheets.find(
      s => s.properties.title === targetSheetName
    );
    
    if (!sheet) {
      throw new Error(`Sheet "${targetSheetName}" not found`);
    }
    
    // Load data from sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `${targetSheetName}!A:Z` // Get all columns
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      throw new Error('No data found in sheet');
    }
    
    // Convert to objects using header row
    const headers = rows[0];
    const data = rows.slice(1).map((row, index) => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i] || '';
      });
      
      // Add row number for reference
      obj.row_number = index + 2; // +2 for header and 1-based indexing
      
      return obj;
    });
    
    console.log(`✅ Loaded ${data.length} rows from Google Sheets`);
    return data;
    
  } catch (error) {
    console.error('❌ Error loading from Google Sheets:', error);
    throw error;
  }
}

/**
 * Main refresh handler
 */
async function refreshHandler(req, res) {
  const startTime = Date.now();
  
  try {
    console.log('\n🔄 Starting Index Pack refresh...');
    
    // Step 1: Load data from Google Sheets
    const rawData = await loadDataFromSheets();
    
    // Step 2: Download previous pack for delta updates
    let previousPack = null;
    try {
      previousPack = await downloadIndexPack();
      if (previousPack && !previousPack.unchanged) {
        console.log('📦 Found previous Index Pack for delta updates');
      }
    } catch (err) {
      console.log('📦 No previous pack found, creating fresh index');
    }
    
    // Step 3: Build new Index Pack
    const indexPack = await buildIndexPack(rawData, openai, previousPack);
    
    // Step 4: Upload to Blob storage
    const uploadResult = await uploadIndexPack(indexPack);
    
    // Step 5: Clear cache to force reload
    const cache = getCache();
    cache.clear();
    
    const totalTime = Date.now() - startTime;
    
    // Return success with metrics
    res.json({
      success: true,
      message: 'Index Pack refreshed successfully',
      stats: {
        rows_processed: indexPack.rowCount,
        documents_indexed: indexPack.documents.length,
        changed_rows: indexPack.stats.changedRows,
        embeddings_generated: indexPack.vectors ? indexPack.vectors.filter(v => v !== null).length : 0,
        index_sizes: indexPack.stats.indexSizes,
        build_time_ms: totalTime,
        pack_version: indexPack.version,
        pack_etag: uploadResult.packETag
      },
      blob_urls: uploadResult.urls,
      timestamp: uploadResult.timestamp
    });
    
  } catch (error) {
    console.error('❌ Error in /api/refresh:', error);
    
    res.status(500).json({
      success: false,
      error: 'Refresh failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Force refresh (ignore cache)
 */
async function forceRefreshHandler(req, res) {
  // Clear cache first
  const cache = getCache();
  cache.clear();
  
  // Run normal refresh
  return refreshHandler(req, res);
}

module.exports = {
  refreshHandler,
  forceRefreshHandler,
  loadDataFromSheets
};