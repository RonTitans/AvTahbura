import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

// Export the authenticate function for use in routes
export async function authenticateGoogleSheets(readOnly = true) {
  try {
    const scopes = readOnly 
      ? ['https://www.googleapis.com/auth/spreadsheets.readonly']
      : ['https://www.googleapis.com/auth/spreadsheets'];
      
    const auth = new GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: scopes
    });
    
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    return sheets;
  } catch (error) {
    console.error('Error authenticating with Google Sheets:', error);
    throw error;
  }
}