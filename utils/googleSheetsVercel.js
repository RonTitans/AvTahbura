import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';

// Enhanced authentication function that works with both local files and Vercel env vars
export async function authenticateGoogleSheets(readOnly = true) {
  try {
    const scopes = readOnly 
      ? ['https://www.googleapis.com/auth/spreadsheets.readonly']
      : ['https://www.googleapis.com/auth/spreadsheets'];
    
    let auth;
    
    // Check if we're in Vercel environment (has JSON string in env)
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      console.log('📱 Using Google credentials from environment variable (Vercel mode)');
      
      // Parse the JSON string from environment variable
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      
      // Create auth with parsed credentials
      auth = new GoogleAuth({
        credentials: credentials,
        scopes: scopes
      });
      
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      console.log('📁 Using Google credentials from file (local mode)');
      
      // Use local file (development mode)
      auth = new GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: scopes
      });
      
    } else {
      throw new Error('No Google credentials found. Set either GOOGLE_CREDENTIALS_JSON (for Vercel) or GOOGLE_APPLICATION_CREDENTIALS (for local file)');
    }
    
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    return sheets;
  } catch (error) {
    console.error('❌ Error authenticating with Google Sheets:', error);
    throw error;
  }
}