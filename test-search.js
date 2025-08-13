import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function testSearch() {
  try {
    // Authenticate with Google Sheets
    const auth = new GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    // Fetch data
    console.log('Fetching data from Google Sheets...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Cleaned_Answers_Data!A:G'
    });
    
    const rows = response.data.values;
    console.log(`Found ${rows.length} rows`);
    
    // Skip header
    const headers = rows[0];
    const summaryIndex = headers.indexOf('תמצית');
    console.log(`תמצית column is at index ${summaryIndex}`);
    
    // Count occurrences of "408"
    let count408 = 0;
    let count630 = 0;
    const examples408 = [];
    const examples630 = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const summary = row[summaryIndex] || '';
      
      if (summary.includes('408')) {
        count408++;
        if (examples408.length < 5) {
          examples408.push({
            row: i,
            text: summary.substring(0, 100)
          });
        }
      }
      
      if (summary.includes('630')) {
        count630++;
        if (examples630.length < 5) {
          examples630.push({
            row: i,
            text: summary.substring(0, 100)
          });
        }
      }
    }
    
    console.log(`\n📊 Results:`);
    console.log(`Found "408" in ${count408} entries`);
    console.log(`Found "630" in ${count630} entries`);
    
    console.log(`\nExamples with "408":`);
    examples408.forEach(ex => {
      console.log(`  Row ${ex.row}: ${ex.text}...`);
    });
    
    console.log(`\nExamples with "630":`);
    examples630.forEach(ex => {
      console.log(`  Row ${ex.row}: ${ex.text}...`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testSearch();