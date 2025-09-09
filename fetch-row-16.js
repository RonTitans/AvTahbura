/**
 * Fetch row 16 from Google Sheets to see what's actually there
 */

import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';

async function fetchRow16() {
  try {
    // Initialize Google Auth
    const auth = new GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID || '1b0_wMgPyBx9fpYSkKG84YFQaP5hKYKq_uLUIrZolQSQ';
    
    // Fetch row 16 (considering header is row 1, so actual row 16 is A16)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'פניות!A16:Z16' // Get row 16 with many columns
    });
    
    // Also fetch header row to know column names
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'פניות!A1:Z1'
    });
    
    const headers = headerResponse.data.values?.[0] || [];
    const rowData = response.data.values?.[0] || [];
    
    console.log('📄 Row 16 from Google Sheets:');
    console.log('═'.repeat(60));
    
    headers.forEach((header, idx) => {
      if (rowData[idx]) {
        console.log(`${header}: ${rowData[idx]}`);
      }
    });
    
    console.log('\n🔍 Searching for "409" in the row:');
    const contains409 = rowData.some(cell => cell && cell.toString().includes('409'));
    console.log(`Contains "409": ${contains409 ? 'YES' : 'NO'}`);
    
    if (contains409) {
      rowData.forEach((cell, idx) => {
        if (cell && cell.toString().includes('409')) {
          console.log(`  Found in column "${headers[idx]}": ${cell}`);
        }
      });
    }
    
    // Test bus line extraction on this row
    console.log('\n🚌 Testing bus line extraction:');
    const fullText = rowData.join(' ');
    
    // Import extraction function
    const { extractBusLines } = await import('./rag/core/normalizer.js');
    const extractedLines = extractBusLines(fullText);
    console.log(`Extracted bus lines: [${extractedLines.join(', ')}]`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fetchRow16();