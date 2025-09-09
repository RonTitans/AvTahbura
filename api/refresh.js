/**
 * /api/refresh - Rebuild and upload Index Pack
 * Reads from Google Sheets and creates searchable index with embeddings
 */

import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { buildIndexPack } from '../rag/core/indexer.js';
import { uploadIndexPack, downloadIndexPack } from '../rag/storage/blob.js';
import { getCache } from '../rag/storage/cache.js';
import OpenAI from 'openai';
import { promises as fs } from 'fs';

// Initialize OpenAI if available
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

/**
 * Authenticate with Google Sheets using environment variable
 */
async function authenticateGoogleSheets() {
  try {
    let auth;
    
    // Check for JSON credentials in environment variable (Vercel)
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });
    }
    // Fallback to file-based credentials (local dev)
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Check if file exists for local development
      try {
        await fs.access(process.env.GOOGLE_APPLICATION_CREDENTIALS);
        auth = new GoogleAuth({
          keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
      } catch {
        throw new Error('Credentials file not found: ' + process.env.GOOGLE_APPLICATION_CREDENTIALS);
      }
    } else {
      throw new Error('No Google credentials configured. Set GOOGLE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS');
    }
    
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
 * Main refresh handler for Vercel
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed. Use POST.' 
    });
  }

  // Check for dry run mode
  const isDryRun = req.query.dryRun === 'true';
  
  return refreshHandler(req, res, isDryRun);
}

/**
 * Internal refresh handler
 */
async function refreshHandler(req, res, isDryRun = false) {
  const startTime = Date.now();
  
  // Validate required environment variables
  if (!process.env.SPREADSHEET_ID) {
    return res.status(500).json({
      success: false,
      error: 'SPREADSHEET_ID not configured',
      hint: 'Add SPREADSHEET_ID to environment variables'
    });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN && !isDryRun) {
    return res.status(500).json({
      success: false,
      error: 'BLOB_READ_WRITE_TOKEN not configured',
      hint: 'Add BLOB_READ_WRITE_TOKEN to environment variables for upload'
    });
  }
  
  try {
    console.log(`\n🔄 Starting Index Pack refresh${isDryRun ? ' (DRY RUN)' : ''}...`);
    
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
    
    // Check if dry run
    if (isDryRun) {
      // Estimate sizes without uploading
      const estimatedSizes = {
        metadata: JSON.stringify(indexPack.metadata || {}).length,
        documents: JSON.stringify(indexPack.documents || []).length,
        indices: JSON.stringify(indexPack.indices || {}).length,
        vectors: indexPack.vectors ? indexPack.vectors.length * 1536 * 4 : 0,
        total: 0
      };
      estimatedSizes.total = Object.values(estimatedSizes).reduce((a, b) => a + b, 0);
      
      return res.json({
        success: true,
        dryRun: true,
        message: 'Dry run completed - no data uploaded',
        stats: {
          rows_processed: indexPack.rowCount,
          documents_indexed: indexPack.documents.length,
          changed_rows: indexPack.stats.changedRows,
          embeddings_generated: indexPack.vectors ? indexPack.vectors.filter(v => v !== null).length : 0,
          index_sizes: indexPack.stats.indexSizes,
          build_time_ms: Date.now() - startTime
        },
        estimatedSizes: {
          metadata: `${(estimatedSizes.metadata / 1024).toFixed(2)} KB`,
          documents: `${(estimatedSizes.documents / 1024 / 1024).toFixed(2)} MB`,
          indices: `${(estimatedSizes.indices / 1024).toFixed(2)} KB`,
          vectors: `${(estimatedSizes.vectors / 1024 / 1024).toFixed(2)} MB`,
          total: `${(estimatedSizes.total / 1024 / 1024).toFixed(2)} MB`
        }
      });
    }
    
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

// Export helper functions for testing
export {
  authenticateGoogleSheets,
  loadDataFromSheets,
  refreshHandler
};

// Vercel configuration
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '10mb'
  },
  maxDuration: 60 // 60 seconds for building index
};