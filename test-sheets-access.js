import { google } from 'googleapis';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function testSheetsAccess() {
  console.log('Testing Google Sheets access...\n');
  
  const spreadsheetId = '1m59UUY2ZvDg4xQjRbReF-npJy_k63wxd2pUt8HBIOn8';
  console.log('Spreadsheet ID:', spreadsheetId);
  
  try {
    // Load credentials
    const credentials = JSON.parse(fs.readFileSync('clauderon-bd2065b087b3.json', 'utf8'));
    console.log('Service Account Email:', credentials.client_email);
    
    // Create auth
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    console.log('\nAttempting to access spreadsheet...');
    
    // Try to get spreadsheet properties
    const response = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId
    });
    
    console.log('✅ SUCCESS! Spreadsheet found:');
    console.log('Title:', response.data.properties.title);
    console.log('Sheets:', response.data.sheets.map(s => s.properties.title).join(', '));
    
    // Try to read data
    const dataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Cleaned_Answers_Data!A1:Z10'
    });
    
    console.log('\n✅ Can read data! Found', dataResponse.data.values?.length || 0, 'rows');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    
    if (error.message.includes('not found')) {
      console.log('\nPossible causes:');
      console.log('1. The spreadsheet ID is incorrect');
      console.log('2. The spreadsheet was deleted or moved');
      console.log('3. The service account doesn\'t have access');
      console.log('\nTo fix:');
      console.log('1. Verify the spreadsheet exists at:');
      console.log('   https://docs.google.com/spreadsheets/d/' + spreadsheetId);
      console.log('2. Share the spreadsheet with:');
      console.log('   sheets-accessor@clauderon.iam.gserviceaccount.com');
    }
  }
}

testSheetsAccess();