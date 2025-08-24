import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import OpenAI from 'openai';
import { 
  generateEnhancedFinalResponse, 
  responseCache, 
  analytics, 
  sessions,
  ConversationContext,
  initializeGPTImprovements
} from './gpt-improvements.js';
import integrationsRouter from './routes/integrations.js';
import authSupabaseRouter from './routes/auth-supabase.js';
import { loadConfig } from './utils/encryption.js';
import cookieParser from 'cookie-parser';
import { loginHandler, logoutHandler, requireAuth, getSessionInfo } from './middleware/sessionAuth.js';
// import { debugEndpointHandler } from './debug-vercel-env.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8009;

// Middleware
app.use(cors());
app.use(express.json({ type: 'application/json' }));
app.use(express.text({ type: 'text/plain' }));
app.use(cookieParser());

// Comprehensive debug endpoint for environment variables and connections
// app.get('/api/debug-vercel', debugEndpointHandler);

// Test endpoint to check environment variables and connections
app.get('/api/test-env', async (req, res) => {
  // Test OpenAI connection with detailed error reporting
  let openaiStatus = 'not tested';
  let openaiDetails = {};
  try {
    if (openai) {
      console.log('🧪 Testing OpenAI API connection...');
      const testCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "Say 'Connection test successful'" }],
        max_tokens: 10
      });
      
      if (testCompletion.choices && testCompletion.choices[0]?.message?.content) {
        openaiStatus = 'working';
        openaiDetails = {
          response: testCompletion.choices[0].message.content,
          model: testCompletion.model,
          usage: testCompletion.usage
        };
        console.log('✅ OpenAI connection test successful');
      } else {
        openaiStatus = 'no response';
        openaiDetails = { error: 'No response received from OpenAI' };
        console.log('❌ OpenAI returned no response');
      }
    } else {
      openaiStatus = 'not initialized';
      openaiDetails = { error: 'OpenAI instance not created' };
    }
  } catch (err) {
    openaiStatus = `error: ${err.message}`;
    openaiDetails = {
      error: err.message,
      code: err.code,
      status: err.status,
      type: err.type
    };
    console.error('❌ OpenAI connection test failed:', err.message);
  }

  // Test Google Sheets authentication
  let googleSheetsStatus = 'not tested';
  let serviceAccountEmail = 'unknown';
  try {
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      try {
        const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        serviceAccountEmail = creds.client_email || 'parse error';
      } catch (parseErr) {
        serviceAccountEmail = 'JSON parse error';
        googleSheetsStatus = `parse error: ${parseErr.message}`;
      }
      
      if (serviceAccountEmail !== 'JSON parse error') {
        try {
          // Try to authenticate
          const sheets = await authenticateGoogleSheets();
          
          // Try to read sheet info
          const info = await sheets.spreadsheets.get({
            spreadsheetId: process.env.SPREADSHEET_ID?.trim()
          });
          
          googleSheetsStatus = `connected to: ${info.data.properties.title}`;
        } catch (authErr) {
          googleSheetsStatus = `auth error: ${authErr.message}`;
        }
      }
    } else {
      googleSheetsStatus = 'no credentials';
    }
  } catch (err) {
    googleSheetsStatus = `error: ${err.message}`;
  }

  res.json({
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    openaiKeyLength: process.env.OPENAI_API_KEY?.length,
    hasSpreadsheet: !!process.env.SPREADSHEET_ID,
    spreadsheetId: process.env.SPREADSHEET_ID,
    spreadsheetIdLength: process.env.SPREADSHEET_ID?.length,
    hasGoogleCreds: !!process.env.GOOGLE_CREDENTIALS_JSON,
    googleCredsLength: process.env.GOOGLE_CREDENTIALS_JSON?.length,
    serviceAccountEmail: serviceAccountEmail,
    googleSheetsStatus: googleSheetsStatus,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    hasAdminPassword: !!process.env.ADMIN_PASSWORD,
    adminPasswordLength: process.env.ADMIN_PASSWORD?.length,
    nodeEnv: process.env.NODE_ENV,
    dataLoaded: municipalData.length,
    dataLoadedSuccessfully: dataLoadedSuccessfully,
    openaiStatus: openaiStatus,
    openaiDetails: openaiDetails,
    isVercel: !!process.env.VERCEL || !!process.env.NOW_REGION,
    platform: process.platform,
    nodeVersion: process.version
  });
});

// Authentication endpoints (these must be accessible without auth)
app.post('/api/login', loginHandler);
app.post('/api/logout', logoutHandler);
app.get('/api/session-info', getSessionInfo);

// Mount new Supabase auth routes
app.use('/api/auth', authSupabaseRouter);

// Apply authentication middleware with proper exclusions
app.use((req, res, next) => {
  // Skip auth for login pages, auth APIs, exact search, and static assets
  if (req.path === '/login' ||
      req.path === '/login.html' || 
      req.path === '/login-new.html' ||
      req.path.startsWith('/api/') ||
      req.path === '/health' ||
      req.path === '/data-sample' ||
      req.path === '/exact-search' ||
      req.path === '/search-by-line' ||
      req.path === '/search-by-ticket' ||
      req.path === '/generate-official-response' ||
      req.path.endsWith('.css') || 
      req.path.endsWith('.js') || 
      req.path.endsWith('.ico') ||
      req.path.endsWith('.png') ||
      req.path.endsWith('.jpg') ||
      req.path.endsWith('.svg')) {
    return next();
  }
  
  // For all other routes, require authentication
  requireAuth(req, res, next);
});

// Clean URL routes - serve HTML files without extensions
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login-new.html'));
});

app.get('/app', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/integrations', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'integrations.html'));
});

// Serve static files (CSS, JS, images, etc.)
app.use(express.static('public'));

// Root route - redirect to app
app.get('/', requireAuth, (req, res) => {
  res.redirect('/app');
});

// Mount integrations routes (now protected by session auth)
app.use('/integrations', integrationsRouter);

// Global data store
let municipalData = [];
let lastRefreshTime = null;
let dataLoadedSuccessfully = false;
let embeddingsReady = false;

// Initialize OpenAI with fallback
let openai = null;
let openaiAvailable = false;

// Load configuration from encrypted file if available
function loadAndApplyConfig() {
  try {
    const config = loadConfig();
    
    // Apply Google Sheets config
    if (config.googleSheets?.spreadsheetId) {
      process.env.SPREADSHEET_ID = config.googleSheets.spreadsheetId;
    }
    
    // Apply OpenAI config
    if (config.openai?.apiKey) {
      process.env.OPENAI_API_KEY = config.openai.apiKey;
    }
  } catch (error) {
    console.log('⚠️ Could not load encrypted config, using environment variables');
  }
}

// Initialize OpenAI
function initializeOpenAI(apiKey = null) {
  try {
    const key = apiKey || process.env.OPENAI_API_KEY;
    
    console.log('🤖 Initializing OpenAI...');
    console.log(`🔑 API Key present: ${!!key}`);
    
    if (!key) {
      console.log('❌ No OpenAI API key found in environment');
      console.log('🔍 Checked variables: OPENAI_API_KEY');
      openaiAvailable = false;
      return false;
    }
    
    console.log(`🔑 API Key length: ${key.length}`);
    console.log(`🔑 API Key prefix: ${key.substring(0, 7)}...`);
    console.log(`🔑 API Key suffix: ...${key.substring(key.length - 4)}`);
    
    // Check for whitespace issues
    if (key !== key.trim()) {
      console.warn('⚠️ API key has leading or trailing whitespace - trimming');
      key = key.trim();
    }
    
    // Validate key format
    if (!key.startsWith('sk-')) {
      console.error('❌ OpenAI API key format invalid - must start with "sk-"');
      console.error(`🔍 Actual prefix: "${key.substring(0, 10)}"`);
      openaiAvailable = false;
      return false;
    }
    
    // Check key length (typical OpenAI keys are around 48-50 characters)
    if (key.length < 40 || key.length > 60) {
      console.warn(`⚠️ Unusual API key length: ${key.length} (expected 48-50)`);
    }
    
    // Check for invalid characters
    const validCharsRegex = /^[a-zA-Z0-9\-_]+$/;
    if (!validCharsRegex.test(key)) {
      console.warn('⚠️ API key contains unexpected characters');
    }
    
    try {
      openai = new OpenAI({ apiKey: key });
      openaiAvailable = true;
      console.log('✅ OpenAI instance created successfully');
      console.log('🔍 Will test connection on first API call');
      return true;
    } catch (createError) {
      console.error('❌ Failed to create OpenAI instance:', createError.message);
      console.error('🔍 Create error details:', {
        message: createError.message,
        code: createError.code,
        type: createError.constructor.name
      });
      openaiAvailable = false;
      return false;
    }
    
  } catch (error) {
    console.error('❌ OpenAI initialization failed:', error.message);
    console.error('🔍 Initialization error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    });
    openaiAvailable = false;
    return false;
  }
}

// Load config and initialize
loadAndApplyConfig();
initializeOpenAI();

// Global functions for integrations
global.refreshGoogleCache = async function() {
  console.log('🔄 Refreshing Google Sheets cache...');
  await loadDataFromSheets();
};

global.reinitializeOpenAI = function(apiKey) {
  console.log('🔄 Reinitializing OpenAI...');
  initializeOpenAI(apiKey);
  // Reinitialize GPT improvements with new OpenAI instance
  initializeGPTImprovements(openai, cleanHistoricalResponse);
};

// GPT improvements will be initialized after function definitions

// Hebrew keywords for filtering official responses
const OFFICIAL_KEYWORDS = [
  'שלום רב', 'בברכה', 'פנייתך', 'בקשתך', 'אנו', 'אנא', 'נא',
  'אנו מתנצלים', 'לצערנו', 'בהתאם ל', 'נבחן', 'נבחנה', 'הוחלט', 'אושר', 'משרדנו'
];

// Initialize Google Sheets authentication
async function authenticateGoogleSheets(readOnly = true) {
  try {
    const scopes = readOnly 
      ? ['https://www.googleapis.com/auth/spreadsheets.readonly']
      : ['https://www.googleapis.com/auth/spreadsheets'];
    
    let auth;
    
    // Check if we're in Vercel environment (has JSON string in env)
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      console.log('📱 Using Google credentials from environment variable (Vercel mode)');
      console.log(`🔍 GOOGLE_CREDENTIALS_JSON length: ${process.env.GOOGLE_CREDENTIALS_JSON.length}`);
      console.log(`🔍 First 100 chars: ${process.env.GOOGLE_CREDENTIALS_JSON.substring(0, 100)}...`);
      
      // Detailed parsing with error catching
      let credentials;
      try {
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        console.log('✅ Successfully parsed GOOGLE_CREDENTIALS_JSON');
        console.log(`📧 Service Account Email: ${credentials.client_email}`);
        console.log(`🏷️ Project ID: ${credentials.project_id}`);
        console.log(`🔑 Has Private Key: ${!!credentials.private_key}`);
        console.log(`🔑 Private Key Length: ${credentials.private_key?.length || 0}`);
        
        // Check for common issues
        if (!credentials.private_key?.includes('-----BEGIN PRIVATE KEY-----')) {
          console.warn('⚠️ Private key may be malformed - missing header');
        }
        
        if (credentials.private_key?.includes('\\n')) {
          console.warn('⚠️ Private key contains literal \\n - may need unescaping');
          console.log('🔧 Attempting to fix newline escapes in private key...');
          credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }
        
      } catch (parseError) {
        console.error('❌ Failed to parse GOOGLE_CREDENTIALS_JSON:', parseError.message);
        console.error('🔍 Parse error position:', parseError.message.match(/position (\d+)/)?.[1]);
        
        if (parseError.message.match(/position (\d+)/)) {
          const pos = parseInt(parseError.message.match(/position (\d+)/)[1]);
          const context = process.env.GOOGLE_CREDENTIALS_JSON.substring(Math.max(0, pos - 30), pos + 30);
          console.error(`🔍 Error context: "${context}"`);
        }
        
        throw new Error(`GOOGLE_CREDENTIALS_JSON parsing failed: ${parseError.message}`);
      }
      
      // Create auth with parsed credentials
      try {
        auth = new GoogleAuth({
          credentials: credentials,
          scopes: scopes
        });
        console.log('✅ Successfully created GoogleAuth instance');
      } catch (authError) {
        console.error('❌ Failed to create GoogleAuth instance:', authError.message);
        throw new Error(`GoogleAuth creation failed: ${authError.message}`);
      }
      
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      console.log('📁 Using Google credentials from file (local mode)');
      console.log(`📁 Credentials file: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
      
      // Use local file (development mode)
      try {
        auth = new GoogleAuth({
          keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: scopes
        });
        console.log('✅ Successfully created GoogleAuth instance from file');
      } catch (authError) {
        console.error('❌ Failed to create GoogleAuth from file:', authError.message);
        throw new Error(`GoogleAuth file creation failed: ${authError.message}`);
      }
      
    } else {
      const errorMsg = 'No Google credentials found. Set either GOOGLE_CREDENTIALS_JSON (for Vercel) or GOOGLE_APPLICATION_CREDENTIALS (for local file)';
      console.error('❌', errorMsg);
      console.error('🔍 Available env vars:', {
        GOOGLE_CREDENTIALS_JSON: !!process.env.GOOGLE_CREDENTIALS_JSON,
        GOOGLE_APPLICATION_CREDENTIALS: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        FILE_EXISTS: process.env.GOOGLE_APPLICATION_CREDENTIALS ? fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS) : false
      });
      throw new Error(errorMsg);
    }
    
    // Get auth client with detailed error handling
    let authClient;
    try {
      console.log('🔐 Getting auth client...');
      authClient = await auth.getClient();
      console.log('✅ Successfully created auth client');
    } catch (clientError) {
      console.error('❌ Failed to get auth client:', clientError.message);
      console.error('🔍 Client error details:', {
        code: clientError.code,
        status: clientError.status,
        message: clientError.message
      });
      throw new Error(`Auth client creation failed: ${clientError.message}`);
    }
    
    // Create sheets API instance
    try {
      const sheets = google.sheets({ version: 'v4', auth: authClient });
      console.log('✅ Successfully created Sheets API instance');
      return sheets;
    } catch (sheetsError) {
      console.error('❌ Failed to create Sheets API instance:', sheetsError.message);
      throw new Error(`Sheets API creation failed: ${sheetsError.message}`);
    }
    
  } catch (error) {
    console.error('❌ Error authenticating with Google Sheets:', error.message);
    console.error('🔍 Full error object:', {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack?.split('\n').slice(0, 5).join('\n')
    });
    throw error;
  }
}

// Load data from Google Sheets
async function loadDataFromSheets() {
  try {
    console.log('🔄 Loading data from Google Sheets...');
    console.log('📊 Spreadsheet ID:', process.env.SPREADSHEET_ID);
    console.log('🔑 Has Google Credentials:', !!process.env.GOOGLE_CREDENTIALS_JSON);
    console.log('🔑 Credentials Length:', process.env.GOOGLE_CREDENTIALS_JSON?.length);
    
    // Check if required environment variables are missing
    const hasCredentials = process.env.GOOGLE_CREDENTIALS_JSON || 
                          (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS));
    
    if (!process.env.SPREADSHEET_ID || !hasCredentials) {
      console.warn('⚠️ Missing required environment variables for Google Sheets');
      console.warn('⚠️ SPREADSHEET_ID:', !!process.env.SPREADSHEET_ID);
      console.warn('⚠️ GOOGLE_CREDENTIALS_JSON:', !!process.env.GOOGLE_CREDENTIALS_JSON);
      console.warn('⚠️ GOOGLE_APPLICATION_CREDENTIALS:', !!process.env.GOOGLE_APPLICATION_CREDENTIALS);
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.warn('⚠️ Credentials file exists:', fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS));
      }
      console.warn('⚠️ Using fallback test data instead');
      throw new Error('Missing Google Sheets configuration');
    }
    
    // Parse and log service account email if available
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      try {
        const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        console.log('📧 Service Account Email:', creds.client_email);
      } catch (e) {
        console.error('❌ Failed to parse GOOGLE_CREDENTIALS_JSON:', e.message);
        console.error('❌ Make sure the JSON is properly formatted as a single-line string');
        throw new Error('Invalid Google credentials format');
      }
    }
    
    dataLoadedSuccessfully = false;
    
    const sheets = await authenticateGoogleSheets();
    
    // Read all data from the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID?.trim(),
      range: 'Cleaned_Answers_Data!A:Z'
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      throw new Error('No data found in spreadsheet');
    }
    
    console.log(`📊 Found ${rows.length} rows in spreadsheet`);
    
    const headers = rows[0];
    console.log('📋 Headers:', headers);
    
    municipalData = [];
    let processedCount = 0;
    let responsesFound = 0;
    
    // Process each row (skip header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = row[index] || '';
      });
      
      // Set case_id
      entry.case_id = entry['מזהה פניה'] || `CASE_${i}`;
      
      // Get the inquiry and response fields
      const inquiryText = entry['הפניה'] || entry['תמצית'] || entry['נושא'] || '';
      const responseText = entry['תיאור'] || '';
      
      // Debug first 10 entries
      if (i <= 10) {
        console.log(`📝 Row ${i}: Inquiry="${inquiryText.substring(0, 40)}...", Response="${responseText.substring(0, 40)}...", HasOfficialKeywords=${containsOfficialKeywords(responseText)}`);
      }
      
      // Include ALL entries that have some text (for precise search)
      // But mark which ones have official responses (for regular search)
      if (inquiryText.trim() || responseText.trim()) {
        const hasOfficialResponse = containsOfficialKeywords(responseText);
        
        // Clean the response text of internal references before storing
        const cleanedResponse = responseText.trim() ? cleanHistoricalResponse(responseText.trim()) : '';
        entry.inquiry_text = inquiryText.trim();
        entry.response_text = cleanedResponse;
        entry.row_number = i; // Add row number from spreadsheet
        entry.created_date = entry['נוצר ב:'] || ''; // Add creation date
        entry.has_official_response = hasOfficialResponse; // Mark if it has official keywords
        entry.inquiry = entry['הפניה'] || ''; // Keep original inquiry
        entry.response = entry['תיאור'] || ''; // Keep original response
        municipalData.push(entry);
        
        if (hasOfficialResponse) {
          responsesFound++;
        }
      }
      
      processedCount++;
    }
    
    lastRefreshTime = new Date();
    dataLoadedSuccessfully = true;
    
    console.log(`✅ Successfully loaded ${municipalData.length} entries with valid responses out of ${processedCount} total rows`);
    console.log(`📈 Response rate: ${((responsesFound/processedCount) * 100).toFixed(1)}%`);
    
    // Show sample entries
    if (municipalData.length > 0) {
      console.log('\n📋 Sample entries:');
      municipalData.slice(0, 3).forEach((entry, idx) => {
        console.log(`${idx + 1}. ${entry.case_id}`);
        console.log(`   Inquiry: ${entry.inquiry_text.substring(0, 60)}...`);
        console.log(`   Response: ${entry.response_text.substring(0, 60)}...`);
      });
    }
    
    // Generate embeddings for all loaded data if OpenAI is available
    if (municipalData.length > 0 && openaiAvailable) {
      // Temporarily skip embeddings generation to allow server to start
      console.log('⚠️ Skipping embeddings generation for faster startup - will use text-based search');
      embeddingsReady = false;
      // await generateAllEmbeddings();
    } else if (!openaiAvailable) {
      console.log('⚠️ Running without embeddings - will use fallback search if needed');
    }
    
  } catch (error) {
    console.error('❌ Error loading data from Google Sheets:', error);
    dataLoadedSuccessfully = false;
    
    // Load fallback test data with more entries for better testing
    console.log('🔄 Loading fallback test data...');
    municipalData = [
      {
        case_id: 'CAS-BEIT-SHEMESH-1',
        inquiry_text: 'הוספת קו חדש בית שמש - בית שמש הוספת קו חדש הערות הפונה: אני גרה ברמת אברהם בבית שמש ועובדת ברמה ג\'2 בבית שמש ונאלצת לסע ב2 אוטובוסים לעבודה',
        response_text: 'שלום רב, מסלולי הקווים באזור זה מאזנים בין הצרכים השונים, במטרה לאפשר שירות תחבורה ציבורית יעיל ומיטבי. אנו בוחנים את הבקשה לקו ישיר. בברכה',
        has_official_response: true
      },
      {
        case_id: 'CAS-LINE-408-1',
        inquiry_text: 'קו 408 שינוי מסלול בית שמש',
        response_text: 'שלום רב, פנייתך בנושא שינוי מסלול קו 408 לבית שמש התקבלה. אנו בוחנים את הבקשה וננקטו הפעולות הנדרשות. בברכה',
        has_official_response: true
      },
      {
        case_id: 'CAS-FREQUENCY-1',
        inquiry_text: 'הוספת תדירות בנסיעת קו 426',
        response_text: 'שלום רב, פנייתך בנושא הוספת תדירות קו 426 התקבלה. אנו בוחנים את הבקשה ונעדכן בהמשך. בברכה',
        has_official_response: true
      },
      {
        case_id: 'CAS-JERUSALEM-1',
        inquiry_text: 'בקשה להוספת תחנה בקו 74 ליד בית החולים הדסה עין כרם',
        response_text: 'שלום רב, פנייתך בנושא הוספת תחנה בקו 74 התקבלה. הנושא יועבר לבדיקת צוות התכנון. בברכה',
        has_official_response: true
      },
      {
        case_id: 'CAS-LINE-15-1',
        inquiry_text: 'קו 15 - תלונה על אי עמידה בלוחות זמנים',
        response_text: 'שלום רב, אנו מתנצלים על אי הנוחות. הנושא הועבר למפעיל הקו לטיפול. בברכה',
        has_official_response: true
      },
      {
        case_id: 'CAS-NIGHT-SERVICE-1',
        inquiry_text: 'בקשה לשירות לילה מהתחנה המרכזית לרמות',
        response_text: 'שלום רב, בקשתך לשירות לילה נבחנת במסגרת תוכנית האב לתחבורה. נעדכן בהמשך. בברכה',
        has_official_response: true
      },
      {
        case_id: 'CAS-LINE-32-1',
        inquiry_text: 'קו 32 - בקשה להגברת תדירות בשעות הבוקר',
        response_text: 'שלום רב, פנייתך בנושא תדירות קו 32 התקבלה. הנושא יבחן במסגרת עדכון מערך הקווים הרבעוני. בברכה',
        has_official_response: true
      },
      {
        case_id: 'CAS-ACCESSIBILITY-1',
        inquiry_text: 'חוסר נגישות בתחנה ברחוב יפו 23',
        response_text: 'שלום רב, תודה על הפנייה. נושא הנגישות חשוב לנו והועבר לטיפול האגף הרלוונטי. בברכה',
        has_official_response: true
      }
    ];
    
    lastRefreshTime = new Date();
    console.log(`✅ Loaded ${municipalData.length} fallback entries`);
  }
}

// Check if text contains official response keywords
function containsOfficialKeywords(text) {
  if (!text) return false;
  
  // Normalize text
  const normalizedText = text.replace(/[''""״]/g, '"').replace(/\s+/g, ' ');
  
  return OFFICIAL_KEYWORDS.some(keyword => {
    const normalizedKeyword = keyword.replace(/[''""״]/g, '"').replace(/\s+/g, ' ');
    return normalizedText.includes(normalizedKeyword);
  });
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// Generate embedding for text using OpenAI
async function generateEmbedding(text) {
  if (!openaiAvailable || !openai) {
    throw new Error('OpenAI not available');
  }
  
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text.trim()
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Extract line numbers from Hebrew and English text
function extractLineNumbers(text) {
  const lineNumbers = [];
  const patterns = [
    /קו[\s]*([0-9]+)/g,        // Hebrew: קו 123
    /line[\s]*([0-9]+)/gi,      // English: line 123
    /\b([0-9]{2,3})\b/g         // Standalone numbers (2-3 digits)
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const num = parseInt(match[1]);
      if (num >= 1 && num <= 999 && !lineNumbers.includes(num)) {
        lineNumbers.push(num);
      }
    }
  });
  
  return lineNumbers;
}

// Smart Query Analyzer - Extract components from user query
function analyzeQuery(text) {
  const analysis = {
    busLines: [],
    locations: [],
    problemType: null,
    keywords: []
  };
  
  // Extract bus lines
  analysis.busLines = extractLineNumbers(text);
  
  // Extract locations (common Jerusalem neighborhoods and areas)
  const locationPatterns = [
    'רמות', 'גילה', 'פסגת זאב', 'הר נוף', 'קרית יובל', 'תלפיות', 'בית וגן',
    'רמת שלמה', 'גאולה', 'מאה שערים', 'העיר העתיקה', 'ממילא', 'נחלאות',
    'קטמון', 'בקעה', 'ארנונה', 'רחביה', 'טלביה', 'ימין משה', 'משכנות שאננים',
    'עין כרם', 'מלחה', 'בית הכרם', 'בית שמש', 'מעלה אדומים', 'גבעת זאב',
    'הדסה', 'הר הצופים', 'גבעת רם', 'גבעת מרדכי', 'רוממה', 'סנהדריה',
    'הר חוצבים', 'רמת אשכול', 'רמת דניה', 'אבו טור', 'ארמון הנציב', 'גבעת המבתר'
  ];
  
  locationPatterns.forEach(location => {
    if (text.includes(location)) {
      analysis.locations.push(location);
    }
  });
  
  // Detect problem type based on keywords
  const problemTypes = [
    { keywords: ['שינוי מסלול', 'שנה מסלול', 'לשנות מסלול'], type: 'שינוי מסלול' },
    { keywords: ['הוספת תחנה', 'תחנה חדשה', 'להוסיף תחנה'], type: 'הוספת תחנה' },
    { keywords: ['ביטול תחנה', 'לבטל תחנה', 'הסרת תחנה'], type: 'ביטול תחנה' },
    { keywords: ['עומס', 'צפיפות', 'עמוס', 'מלא'], type: 'עומס נוסעים' },
    { keywords: ['תדירות', 'הגברת', 'תוספת נסיעות', 'יותר אוטובוסים'], type: 'תדירות' },
    { keywords: ['לוח זמנים', 'לו"ז', 'שעות פעילות', 'מתי מגיע'], type: 'לוח זמנים' },
    { keywords: ['נגישות', 'כסא גלגלים', 'מוגבלות', 'נכים'], type: 'נגישות' },
    { keywords: ['איחור', 'עיכוב', 'דילוג', 'לא הגיע'], type: 'איחורים' },
    { keywords: ['הארכת קו', 'להאריך', 'הארכת מסלול'], type: 'הארכת קו' },
    { keywords: ['קיצור קו', 'לקצר', 'קיצור מסלול'], type: 'קיצור קו' },
    { keywords: ['קו חדש', 'בקשה לקו', 'אין קו'], type: 'קו חדש' },
    { keywords: ['תלונה', 'להתלונן', 'בעיה עם'], type: 'תלונה' },
    { keywords: ['בטיחות', 'סכנה', 'מסוכן'], type: 'בטיחות' }
  ];
  
  for (const {keywords, type} of problemTypes) {
    if (keywords.some(keyword => text.includes(keyword))) {
      analysis.problemType = type;
      break;
    }
  }
  
  // Extract other important keywords (excluding common words)
  const commonWords = ['את', 'של', 'על', 'עם', 'אני', 'הוא', 'היא', 'זה', 'יש', 'אין', 'לא', 'כן'];
  const words = text.split(/\s+/);
  analysis.keywords = words.filter(word => 
    word.length > 2 && 
    !commonWords.includes(word) &&
    !analysis.busLines.includes(parseInt(word)) &&
    !analysis.locations.includes(word)
  ).slice(0, 5); // Keep top 5 keywords
  
  return analysis;
}

// Enhanced smart search function
function findSmartMatches(inquiryText, municipalData, maxResults = 10) {
  console.log(`\n🧠 Smart Search for: "${inquiryText}"`);
  
  const queryAnalysis = analyzeQuery(inquiryText);
  console.log('📊 Query Analysis:', queryAnalysis);
  
  const scoredMatches = [];
  
  municipalData.forEach((entry) => {
    let score = 0;
    let matchReasons = [];
    
    // Check both תמצית and הפניה columns
    const summary = entry['תמצית'] || '';
    const inquiry = entry['הפניה'] || entry.inquiry_text || '';
    const response = entry['תיאור'] || entry.response_text || '';
    const combinedText = `${summary} ${inquiry} ${response}`.toLowerCase();
    
    // Score for bus line matches (40% weight)
    if (queryAnalysis.busLines.length > 0) {
      const entryBusLines = extractLineNumbers(combinedText);
      const matchingLines = queryAnalysis.busLines.filter(line => entryBusLines.includes(line));
      if (matchingLines.length > 0) {
        score += 0.4 * (matchingLines.length / queryAnalysis.busLines.length);
        matchReasons.push(`קווים: ${matchingLines.join(', ')}`);
      }
    }
    
    // Score for location matches (30% weight)
    if (queryAnalysis.locations.length > 0) {
      const matchingLocations = queryAnalysis.locations.filter(loc => combinedText.includes(loc));
      if (matchingLocations.length > 0) {
        score += 0.3 * (matchingLocations.length / queryAnalysis.locations.length);
        matchReasons.push(`מיקומים: ${matchingLocations.join(', ')}`);
      }
    }
    
    // Score for problem type match (20% weight)
    if (queryAnalysis.problemType) {
      // Check if entry has same problem type
      const entryAnalysis = analyzeQuery(combinedText);
      if (entryAnalysis.problemType === queryAnalysis.problemType) {
        score += 0.2;
        matchReasons.push(`סוג: ${queryAnalysis.problemType}`);
      }
    }
    
    // Score for keyword matches (10% weight)
    if (queryAnalysis.keywords.length > 0) {
      const matchingKeywords = queryAnalysis.keywords.filter(keyword => 
        combinedText.includes(keyword.toLowerCase())
      );
      if (matchingKeywords.length > 0) {
        score += 0.1 * (matchingKeywords.length / queryAnalysis.keywords.length);
        matchReasons.push(`מילים: ${matchingKeywords.length}`);
      }
    }
    
    // Only include if score is meaningful
    if (score > 0.15) {
      scoredMatches.push({
        ...entry,
        smartScore: score,
        matchReasons: matchReasons.join(' | '),
        // Include the actual content for display
        summary: summary,
        inquiry: inquiry,
        response: response
      });
    }
  });
  
  // Sort by score and return top results
  scoredMatches.sort((a, b) => b.smartScore - a.smartScore);
  
  console.log(`✅ Found ${scoredMatches.length} smart matches`);
  return scoredMatches.slice(0, maxResults);
}

// Clean historical response of system references
function cleanHistoricalResponse(response) {
  if (!response) return '';
  
  // Remove system/internal references - comprehensive list
  let cleaned = response
    .replace(/היי ראובן/gi, '')
    .replace(/ראובן/gi, '')
    .replace(/אריאלה/gi, '')
    .replace(/אורי שלום/gi, '')
    .replace(/הי קרן/gi, '')
    .replace(/הי איל/gi, '')
    .replace(/אורי/gi, '')
    .replace(/קרן/gi, '')
    .replace(/איל/gi, '')
    .replace(/Based on existing system data[^.]*\./gi, '')
    .replace(/בהתבסס על מידע קיים במערכת[:.]\s*/gi, '')
    .replace(/במערכת[^.]*\./g, '')
    .replace(/מענה מאושר ע["']י [א-ת]+[:.]?\s*/gi, '')
    .replace(/האם ניתן להשתמש במענה הזה\?/gi, '')
    .replace(/להבנתי צריך להעביר את הפניה הזו ל/gi, '')
    .replace(/כתבתי לאחרונה תשובות על/gi, '')
    .replace(/אנא אתרו ובמידת[^.]*\./gi, '')
    .replace(/מוצעת התשובה הבאה:/gi, '')
    .replace(/\.{3,}/g, '') // Remove truncation indicators
    .replace(/\s+/g, ' ')
    .trim();
  
  // Remove any remaining internal communication patterns
  cleaned = cleaned
    .replace(/^בדומה לפניה אחרת,?\s*/gi, '')
    .replace(/^להבנתי\s*/gi, '')
    .replace(/^[הו][יא]ם?\s+[א-ת]+,?\s*/gi, '')
    .replace(/^\s*[:.-]+\s*/gi, '') // Remove leading punctuation
    .replace(/מאושר\s+ע["']י\s+[א-ת]+\s*/gi, '') // Remove approval phrases
    .replace(/תחזירו אלי להתאמות\s*/gi, '') // Remove return requests
    .replace(/^אנא\s+/gi, '') // Remove leading "please"
    .replace(/בעיה זו\s+/gi, '') // Remove "this issue"
    .trim();
  
  // If response is too short or contains only system artifacts, return empty
  if (cleaned.length < 20 || !/[א-ת]/.test(cleaned)) {
    return '';
  }
  
  // Don't add greeting or closing - return the cleaned response as-is
  // This preserves the original format from the database
  
  return cleaned;
}

// Generate embeddings for all municipal data
async function generateAllEmbeddings() {
  if (!openaiAvailable) {
    console.log('⚠️ OpenAI not available - skipping embeddings generation');
    embeddingsReady = false;
    return;
  }
  
  console.log('🧠 Generating embeddings for all municipal data...');
  embeddingsReady = false;
  
  try {
    for (let i = 0; i < municipalData.length; i++) {
      const entry = municipalData[i];
      if (!entry.embedding) {
        const combinedText = `${entry.inquiry_text} ${entry.response_text}`;
        entry.embedding = await generateEmbedding(combinedText);
        
        // Progress logging
        if ((i + 1) % 100 === 0 || i === municipalData.length - 1) {
          console.log(`📊 Embeddings progress: ${i + 1}/${municipalData.length}`);
        }
        
        // Rate limiting - wait 50ms between requests
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    embeddingsReady = true;
    console.log('✅ All embeddings generated successfully');
  } catch (error) {
    console.error('❌ Error generating embeddings:', error);
    embeddingsReady = false;
  }
}

// Fallback text similarity function
function calculateTextSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;
  
  const normalize = (text) => text.toLowerCase().replace(/[^\u0590-\u05FF\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  
  const words1 = normalize(text1);
  const words2 = normalize(text2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Calculate Jaccard similarity
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

// Fallback text-based matching
function findTextMatches(inquiryText, threshold = 0.2, maxResults = 5) {
  console.log(`\n🔍 Searching for text matches: "${inquiryText}"`);
  console.log(`📊 Available data: ${municipalData.length} entries`);
  console.log(`🎯 Threshold: ${threshold}`);
  
  if (municipalData.length === 0) {
    console.log('❌ No data available for matching');
    return [];
  }
  
  // Extract line numbers from inquiry for boosting
  const inquiryLineNumbers = extractLineNumbers(inquiryText);
  console.log(`🔢 Line numbers found in inquiry: ${inquiryLineNumbers.join(', ')}`);
  
  // Calculate similarities
  const similarities = municipalData.map(entry => {
    const inquirySim = calculateTextSimilarity(inquiryText, entry.inquiry_text);
    const responseSim = calculateTextSimilarity(inquiryText, entry.response_text);
    
    // Use the higher similarity score
    let textSimilarity = Math.max(inquirySim, responseSim);
    
    // Boost score if entry mentions same line numbers
    let finalScore = textSimilarity;
    if (inquiryLineNumbers.length > 0) {
      const entryLineNumbers = extractLineNumbers(entry.inquiry_text + ' ' + entry.response_text);
      const commonLines = inquiryLineNumbers.filter(line => entryLineNumbers.includes(line));
      if (commonLines.length > 0) {
        const boost = 0.3 * (commonLines.length / inquiryLineNumbers.length);
        finalScore = Math.min(1.0, textSimilarity + boost);
        console.log(`🚀 Boosted entry ${entry.case_id}: ${textSimilarity.toFixed(3)} + ${boost.toFixed(3)} = ${finalScore.toFixed(3)} (common lines: ${commonLines.join(', ')})`);
      }
    }
    
    return {
      ...entry,
      similarity: finalScore,
      debug: {
        text_similarity: textSimilarity,
        line_boost: finalScore - textSimilarity,
        inquiry_lines: inquiryLineNumbers,
        entry_lines: extractLineNumbers(entry.inquiry_text + ' ' + entry.response_text)
      }
    };
  });
  
  // Sort by similarity and filter by threshold
  const matches = similarities
    .filter(entry => entry.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
  
  console.log(`🎯 Found ${matches.length} matches above threshold ${threshold}`);
  
  if (matches.length > 0) {
    console.log('🏆 Top matches:');
    matches.slice(0, Math.min(3, matches.length)).forEach((match, idx) => {
      console.log(`  ${idx + 1}. Score: ${match.similarity.toFixed(3)}, ID: ${match.case_id}`);
      console.log(`     Inquiry: ${match.inquiry_text.substring(0, 50)}...`);
    });
  } else {
    console.log('❌ No matches found above threshold');
    // Show best matches anyway for debugging
    const bestMatches = similarities.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
    console.log('🔍 Best available matches (below threshold):');
    bestMatches.forEach((match, idx) => {
      console.log(`  ${idx + 1}. Score: ${match.similarity.toFixed(3)}, ID: ${match.case_id}`);
    });
  }
  
  return matches;
}

// Find semantic matches using embeddings
async function findSemanticMatches(inquiryText, threshold = 0.78, maxResults = 5) {
  console.log(`\n🔍 Searching for semantic matches: "${inquiryText}"`);
  console.log(`📊 Available data: ${municipalData.length} entries`);
  console.log(`🎯 Threshold: ${threshold}`);
  console.log(`🧠 Embeddings ready: ${embeddingsReady}`);
  
  if (municipalData.length === 0) {
    console.log('❌ No data available for matching');
    return [];
  }
  
  if (!embeddingsReady && openaiAvailable) {
    console.log('⚠️ Embeddings not ready, skipping generation for faster response');
    // Skip embedding generation to avoid timeout
    // await generateAllEmbeddings();
  }
  
  if (!embeddingsReady || !openaiAvailable) {
    console.log('⚠️ Falling back to text-based search');
    return findTextMatches(inquiryText, 0.2, maxResults);
  }
  
  try {
    // Generate embedding for the inquiry
    const inquiryEmbedding = await generateEmbedding(inquiryText);
    
    // Extract line numbers from inquiry for boosting
    const inquiryLineNumbers = extractLineNumbers(inquiryText);
    console.log(`🔢 Line numbers found in inquiry: ${inquiryLineNumbers.join(', ')}`);
    
    // Calculate similarities with all entries
    const similarities = municipalData.map(entry => {
      const semanticSimilarity = cosineSimilarity(inquiryEmbedding, entry.embedding);
      
      // Boost score if entry mentions same line numbers
      let finalScore = semanticSimilarity;
      if (inquiryLineNumbers.length > 0) {
        const entryLineNumbers = extractLineNumbers(entry.inquiry_text + ' ' + entry.response_text);
        const commonLines = inquiryLineNumbers.filter(line => entryLineNumbers.includes(line));
        if (commonLines.length > 0) {
          const boost = 0.1 * (commonLines.length / inquiryLineNumbers.length);
          finalScore = Math.min(1.0, semanticSimilarity + boost);
          console.log(`🚀 Boosted entry ${entry.case_id}: ${semanticSimilarity.toFixed(3)} + ${boost.toFixed(3)} = ${finalScore.toFixed(3)} (common lines: ${commonLines.join(', ')})`);
        }
      }
      
      return {
        ...entry,
        similarity: finalScore,
        debug: {
          semantic_similarity: semanticSimilarity,
          line_boost: finalScore - semanticSimilarity,
          inquiry_lines: inquiryLineNumbers,
          entry_lines: extractLineNumbers(entry.inquiry_text + ' ' + entry.response_text)
        }
      };
    });
    
    // Sort by similarity and filter by threshold
    const matches = similarities
      .filter(entry => entry.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);
    
    console.log(`🎯 Found ${matches.length} matches above threshold ${threshold}`);
    
    if (matches.length > 0) {
      console.log('🏆 Top matches:');
      matches.slice(0, Math.min(3, matches.length)).forEach((match, idx) => {
        console.log(`  ${idx + 1}. Score: ${match.similarity.toFixed(3)}, ID: ${match.case_id}`);
        console.log(`     Inquiry: ${match.inquiry_text.substring(0, 50)}...`);
      });
    } else {
      console.log('❌ No matches found above threshold');
      // Show best matches anyway for debugging
      const bestMatches = similarities.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
      console.log('🔍 Best available matches (below threshold):');
      bestMatches.forEach((match, idx) => {
        console.log(`  ${idx + 1}. Score: ${match.similarity.toFixed(3)}, ID: ${match.case_id}`);
      });
    }
    
    return matches;
  } catch (error) {
    console.error('❌ Error in semantic search, falling back to text search:', error);
    return findTextMatches(inquiryText, 0.2, maxResults);
  }
}


// Generate final response combining historical and AI enhancement
async function generateFinalResponse(inquiryText, historicalResponse = null) {
  // If OpenAI is available, use it to generate a fresh response
  if (openaiAvailable && openai) {
    try {
      let systemPrompt = `אתה נציג מחלקת תחבורה ציבורית בתוכנית אב לתחבורה. 
תפקידך לכתוב תשובה סופית ומלאה לאזרח - לא הסבר פנימי או סיכום.

מבנה התשובה הנדרש (חובה לכל תשובה):
1. פתיחה מנומסת: "שלום,"
2. תשובה מקצועית ומנוסחת היטב, מחולקת לפסקאות קצרות וקריאות
3. משפט סיום חם וידידותי
4. חתימה: "בברכה, תוכנית אב לתחבורה"

עקרונות כתיבה:
• כתוב בעברית תקינה וברורה
• התייחס ישירות לבעיה של האזרח
• ספק מידע מדויק ומעשי
• שמור על טון מקצועי ואמפתי
• וודא שהתשובה מלאה ולא נקטעת באמצע

התשובה שלך היא הטקסט הסופי שיישלח לאזרח - אין צורך בהסברים נוספים.`;

      let userPrompt = `פנייה מאזרח: ${inquiryText}`;
      
      if (historicalResponse) {
        const cleanedResponse = cleanHistoricalResponse(historicalResponse);
        userPrompt += `\n\nתשובה דומה מהמערכת (לא לשימוש ישיר - רק להתייחסות):\n${cleanedResponse}`;
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating GPT response:', error);
      // Fall back to cleaned historical response or generic response
    }
  }
  
  // Fallback when OpenAI is not available
  if (historicalResponse) {
    const cleanedResponse = cleanHistoricalResponse(historicalResponse);
    if (cleanedResponse.length > 50) {
      return cleanedResponse;
    }
  }
  
  // Generic fallback response
  return `שלום רב,

קיבלנו את פנייתך בנושא: ${inquiryText}

פנייתך הועברה לטיפול הצוות המקצועי שלנו ותיבחן בהתאם לנהלים.
אנו נעדכן אותך בתשובה מפורטת בהקדם האפשרי.

לבירורים נוספים ניתן לפנות למוקד העירוני בטלפון 106.

בברכה,
מחלקת תחבורה ציבורית
תוכנית אב לתחבורה`;
}

// Recommendation endpoint with comprehensive debugging
app.post('/recommend', async (req, res) => {
  try {
    const { inquiry_text, max_recommendations = 5 } = req.body;
    
    if (!inquiry_text) {
      return res.status(400).json({ error: 'inquiry_text is required' });
    }
    
    console.log(`\n📨 ==================== NEW RECOMMENDATION REQUEST ====================`);
    console.log(`📝 Query: "${inquiry_text}"`);
    console.log(`🔢 Max recommendations: ${max_recommendations}`);
    console.log(`💾 Data loaded: ${dataLoadedSuccessfully}`);
    console.log(`📊 Total records: ${municipalData.length}`);
    console.log(`🕐 Last refresh: ${lastRefreshTime}`);
    
    let response = {
      inquiry: inquiry_text,
      exact_match: null,
      related_matches: [],
      enhanced_response: '',
      debug: {
        total_records: municipalData.length,
        data_loaded: dataLoadedSuccessfully,
        search_method: 'semantic_embeddings',
        threshold_used: 0.78,
        matches_found: 0,
        top_similarity_score: 0,
        no_match_reason: null
      }
    };
    
    // Try smart search first
    let matches = findSmartMatches(inquiry_text, municipalData, max_recommendations * 2);
    
    // If smart search doesn't find enough, fall back to semantic/text search
    if (matches.length < 3) {
      console.log('📊 Smart search found few results, adding semantic search...');
      const semanticMatches = await findSemanticMatches(inquiry_text, 0.78, max_recommendations);
      
      // Merge matches, avoiding duplicates
      const existingIds = new Set(matches.map(m => m.case_id));
      semanticMatches.forEach(match => {
        if (!existingIds.has(match.case_id)) {
          matches.push({
            ...match,
            smartScore: match.similarity * 0.5, // Give semantic matches lower smart score
            matchReasons: `דמיון: ${(match.similarity * 100).toFixed(0)}%`
          });
        }
      });
      
      // Re-sort by smart score
      matches.sort((a, b) => (b.smartScore || 0) - (a.smartScore || 0));
    }
    
    // Limit to requested number
    matches = matches.slice(0, max_recommendations);
    
    response.debug.matches_found = matches.length;
    response.debug.top_similarity_score = matches.length > 0 ? (matches[0].similarity || matches[0].smartScore) : 0;
    response.debug.search_method = 'smart_hybrid';
    response.debug.threshold_used = 0.15;
    response.debug.openai_available = openaiAvailable;
    response.debug.embeddings_ready = embeddingsReady;
    
    if (matches.length > 0) {
      const bestMatch = matches[0];
      
      // All matches above 0.78 threshold are considered good matches
      console.log(`✅ Found ${matches.length} semantic matches with top similarity: ${bestMatch.similarity}`);
      
      // Set exact match for very high similarity
      if (bestMatch.similarity > 0.85) {
        response.exact_match = {
          case_id: bestMatch.case_id,
          original_response: bestMatch.response_text,
          similarity: bestMatch.similarity
        };
      }
      
      // Always provide related matches with smart search info
      response.related_matches = matches.map(match => ({
        case_id: match.case_id,
        description: match.inquiry || match.inquiry_text || match['הפניה'] || '',
        original_response: match.response || match.response_text || match['תיאור'] || '',
        relevance_score: match.smartScore || match.similarity || 0,
        match_reasons: match.matchReasons || '',
        row_number: match.row_number,
        created_date: match.created_date,
        summary: match.summary || match['תמצית'] || ''
      }));
      
      // Get or create session context
      const sessionId = req.headers['x-session-id'] || req.ip;
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, new ConversationContext(sessionId));
      }
      const sessionContext = sessions.get(sessionId);
      
      // Use enhanced GPT response generation
      response.enhanced_response = await generateEnhancedFinalResponse(
        inquiry_text,
        bestMatch.response_text,
        {
          sessionContext,
          promptVariant: req.body.prompt_variant || 'detailed',
          useCache: true,
          analytics
        }
      );
    } else {
      console.log(`❌ No matches found above threshold 0.78`);
      const searchMethod = embeddingsReady ? 'semantic' : 'text';
      const thresholdUsed = embeddingsReady ? 0.78 : 0.2;
      response.debug.no_match_reason = `No entries exceeded ${searchMethod} similarity threshold of ${thresholdUsed}`;
      
      // Check if it's because of no data
      if (municipalData.length === 0) {
        response.debug.no_match_reason = "No data loaded from Google Sheets";
      } else if (!openaiAvailable) {
        response.debug.no_match_reason = "OpenAI not available - used text similarity with threshold 0.2";
      } else if (!embeddingsReady) {
        response.debug.no_match_reason = "Embeddings not ready - used text similarity with threshold 0.2";
      }
      
      // Get or create session context
      const sessionId = req.headers['x-session-id'] || req.ip;
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, new ConversationContext(sessionId));
      }
      const sessionContext = sessions.get(sessionId);
      
      // Use enhanced GPT response generation without historical context
      response.enhanced_response = await generateEnhancedFinalResponse(
        inquiry_text,
        null,
        {
          sessionContext,
          promptVariant: req.body.prompt_variant || 'detailed',
          useCache: true,
          analytics
        }
      );
    }
    
    console.log(`📊 RESPONSE SUMMARY:`);
    console.log(`   - Exact match: ${!!response.exact_match}`);
    console.log(`   - Related matches: ${response.related_matches.length}`);
    console.log(`   - AI response generated: ${!!response.enhanced_response}`);
    console.log(`   - Top similarity: ${response.debug.top_similarity_score.toFixed(3)}`);
    console.log(`🏁 ==================== REQUEST COMPLETE ====================\n`);
    
    res.json(response);
  } catch (error) {
    console.error('❌ Error in /recommend endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      debug: { error_message: error.message }
    });
  }
});

// NEW: Exact phrase search endpoint (added for demo - does NOT change existing functionality)
app.post('/exact-search', async (req, res) => {
  try {
    // Support both searchPhrase and inquiry_text for compatibility
    const searchPhrase = req.body.searchPhrase || req.body.inquiry_text;
    
    if (!searchPhrase || searchPhrase.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Search phrase is required',
        matches: []
      });
    }

    console.log(`\n🔍 Exact phrase search for: "${searchPhrase}"`);
    
    // Search for exact phrase in all entries
    const matches = [];
    const searchLower = searchPhrase.toLowerCase();
    
    municipalData.forEach((entry) => {
      // For regular/exact search, check if entry has content
      // Temporarily disabled official response check for debugging
      // if (!entry.has_official_response) return;
      if (!entry.inquiry_text && !entry.response_text) return;
      
      // Search in both inquiry and response using correct field names
      const inquiryLower = (entry.inquiry_text || '').toLowerCase();
      const responseLower = (entry.response_text || '').toLowerCase();
      
      if (inquiryLower.includes(searchLower) || responseLower.includes(searchLower)) {
        // Count occurrences
        const inquiryCount = (inquiryLower.match(new RegExp(searchLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        const responseCount = (responseLower.match(new RegExp(searchLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        
        matches.push({
          case_id: entry.case_id,
          inquiry: entry.inquiry_text,
          response: entry.response_text,
          relevance_score: 1.0, // Exact match always gets score 1
          occurrences: {
            in_inquiry: inquiryCount,
            in_response: responseCount,
            total: inquiryCount + responseCount
          },
          found_in: inquiryCount > 0 && responseCount > 0 ? 'both' : 
                    inquiryCount > 0 ? 'inquiry' : 'response'
        });
      }
    });
    
    // Sort by total occurrences
    matches.sort((a, b) => b.occurrences.total - a.occurrences.total);
    
    console.log(`✅ Found ${matches.length} exact matches for "${searchPhrase}"`);
    
    res.json({
      success: true,
      search_phrase: searchPhrase,
      total_matches: matches.length,
      matches: matches.slice(0, 50), // Limit to top 50 results
      search_type: 'exact_phrase'
    });
    
  } catch (error) {
    console.error('❌ Error in /exact-search endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      matches: []
    });
  }
});

// NEW: Precise search by bus line endpoint
app.post('/search-by-line', async (req, res) => {
  try {
    const { busLines, originalQuery } = req.body;
    
    if (!busLines || !Array.isArray(busLines) || busLines.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Bus lines array is required',
        matches: []
      });
    }

    console.log(`\n🚌 Precise search for bus lines: ${busLines.join(', ')}`);
    
    const matches = [];
    const linesSet = new Set(busLines.map(line => line.toString()));
    let debugCount = 0;
    
    municipalData.forEach((entry, idx) => {
      // ONLY search in תמצית column as requested
      const summary = entry['תמצית'] || '';
      
      // Debug logging for line 630
      if (busLines.includes('630') && summary.includes('630')) {
        debugCount++;
        console.log(`  Found 630 in row ${idx}: ${summary.substring(0, 80)}...`);
      }
      
      let lineMatches = 0;
      let foundLines = [];
      
      // Check for exact line number matches in תמצית only
      busLines.forEach(line => {
        // Use word boundary regex to avoid partial matches
        // This will match "קו 30" or "30" but NOT "630" or "305"
        const patterns = [
          new RegExp(`\\b${line}\\b`, 'g'),  // Word boundary on both sides
          new RegExp(`קו\\s+${line}\\b`, 'g'),  // "קו 30" pattern
          new RegExp(`קווים[^0-9]*${line}\\b`, 'g'),  // "קווים" followed by the line
        ];
        
        let matched = false;
        for (const pattern of patterns) {
          if (pattern.test(summary)) {
            matched = true;
            break;
          }
        }
        
        if (matched) {
          lineMatches++;
          if (!foundLines.includes(line)) {
            foundLines.push(line);
          }
        }
      });
      
      if (lineMatches > 0) {
        matches.push({
          case_id: entry.case_id || entry['מזהה פניה'],
          summary: entry['תמצית'] || '',  // Add the תמצית field
          inquiry: entry.inquiry || entry['הפניה'] || '',  // Full question
          response: entry.response || entry['תיאור'] || '',
          line_matches: lineMatches,
          found_lines: foundLines,
          created_date: entry['נוצר ב:'] || entry.created_date || null,
          relevance_score: Math.min(1.0, lineMatches / busLines.length)
        });
      }
    });
    
    // Sort by line matches (descending) and relevance
    matches.sort((a, b) => {
      if (b.line_matches !== a.line_matches) {
        return b.line_matches - a.line_matches;
      }
      return b.relevance_score - a.relevance_score;
    });
    
    // Extract common topics from summaries
    const topicCounts = {};
    const commonTopicPatterns = [
      { pattern: /^שינוי\s+מסלול/, topic: 'שינוי מסלול' },
      { pattern: /^הוספת\s+תחנה|^תחנה\s+חדשה/, topic: 'הוספת תחנה' },
      { pattern: /^ביטול\s+תחנה/, topic: 'ביטול תחנה' },
      { pattern: /^עומס\s+נוסעים|^צפיפות|^עמוס/, topic: 'עומס נוסעים' },
      { pattern: /^תדירות|^הגברת\s+תדירות|^תוספת\s+נסיעות/, topic: 'תדירות' },
      { pattern: /^לוח\s+זמנים|^לו"ז|^שעות\s+פעילות/, topic: 'לוח זמנים' },
      { pattern: /^נגישות|^כסא\s+גלגלים|^מוגבלות/, topic: 'נגישות' },
      { pattern: /^איחור|^עיכוב|^דילוג/, topic: 'איחורים' },
      { pattern: /^הארכת\s+קו|^הארכת\s+מסלול/, topic: 'הארכת קו' },
      { pattern: /^קיצור\s+קו|^קיצור\s+מסלול/, topic: 'קיצור קו' },
      { pattern: /^בקשה\s+לקו\s+חדש|^קו\s+חדש/, topic: 'קו חדש' },
      { pattern: /^חיבור|^קישור\s+בין/, topic: 'חיבור בין אזורים' },
      { pattern: /^שעות\s+לילה|^שירות\s+לילה/, topic: 'שירות לילה' },
      { pattern: /^סופי?\s+שבוע|^שבת|^חג/, topic: 'סוף שבוע וחגים' },
      { pattern: /^בטיחות|^סכנה|^מסוכן/, topic: 'בטיחות' },
      { pattern: /^הוספת\s+קו/, topic: 'הוספת קו' },
      { pattern: /^ביטול\s+קו/, topic: 'ביטול קו' },
      { pattern: /^תלונה/, topic: 'תלונה' },
      { pattern: /^בקשה/, topic: 'בקשה כללית' },
      { pattern: /^הסרת/, topic: 'הסרת תחנה/קו' },
      { pattern: /^העברת/, topic: 'העברת תחנה/קו' }
    ];
    
    // Analyze each match to categorize by topic
    matches.forEach(match => {
      const summary = (match.summary || '').trim();
      let matchedTopic = 'אחר'; // Default topic
      
      // Check each pattern - now checking from the beginning of the string
      for (const { pattern, topic } of commonTopicPatterns) {
        if (pattern.test(summary)) {
          matchedTopic = topic;
          break; // Use first matching topic
        }
      }
      
      // If still "אחר", try more flexible matching for common words at start
      if (matchedTopic === 'אחר' && summary) {
        // Get first 50 characters to check for keywords
        const summaryStart = summary.substring(0, 50);
        
        // Check for keywords that might appear with slight variations
        if (summaryStart.includes('שינוי מסלול')) matchedTopic = 'שינוי מסלול';
        else if (summaryStart.includes('הוספת תחנ')) matchedTopic = 'הוספת תחנה';
        else if (summaryStart.includes('ביטול תחנ')) matchedTopic = 'ביטול תחנה';
        else if (summaryStart.includes('עומס')) matchedTopic = 'עומס נוסעים';
        else if (summaryStart.includes('תדירות')) matchedTopic = 'תדירות';
        else if (summaryStart.includes('לוח זמנים') || summaryStart.includes('לו"ז')) matchedTopic = 'לוח זמנים';
        else if (summaryStart.includes('נגישות')) matchedTopic = 'נגישות';
        else if (summaryStart.includes('איחור') || summaryStart.includes('עיכוב')) matchedTopic = 'איחורים';
        else if (summaryStart.includes('הארכת')) matchedTopic = 'הארכת קו';
        else if (summaryStart.includes('קיצור')) matchedTopic = 'קיצור קו';
        else if (summaryStart.includes('תלונה')) matchedTopic = 'תלונה';
        else if (summaryStart.includes('בקשה')) matchedTopic = 'בקשה כללית';
      }
      
      // Add the topic to the match object
      match.topic = matchedTopic;
      
      // Count topics for statistics
      topicCounts[matchedTopic] = (topicCounts[matchedTopic] || 0) + 1;
    });
    
    // Convert topic counts to sorted array
    const topicsList = Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
    
    if (busLines.includes('630')) {
      console.log(`📊 Debug: Found "630" in ${debugCount} תמצית entries total`);
    }
    console.log(`✅ Found ${matches.length} precise matches for bus lines: ${busLines.join(', ')}`);
    console.log(`📑 Topics distribution:`, topicsList);
    
    res.json({
      success: true,
      search_type: 'precise_bus_line',
      bus_lines: busLines,
      original_query: originalQuery,
      total_matches: matches.length,
      topics: topicsList, // Add topics list for dropdown
      matches: matches // Return all results with topic field, frontend handles display
    });
    
  } catch (error) {
    console.error('❌ Error in /search-by-line endpoint:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      matches: []
    });
  }
});

// NEW: Ticket ID timeline search endpoint
app.post('/search-by-ticket', async (req, res) => {
  try {
    const { ticketId } = req.body;
    
    if (!ticketId) {
      return res.status(400).json({ 
        success: false,
        error: 'Ticket ID is required',
        entries: []
      });
    }

    console.log(`\n🎫 Ticket timeline search for: ${ticketId}`);
    
    const entries = [];
    const ticketIdUpper = ticketId.toUpperCase();
    
    // Find all entries with matching ticket ID
    municipalData.forEach((entry) => {
      if (entry.case_id === ticketIdUpper) {
        entries.push({
          case_id: entry.case_id,
          inquiry: entry.inquiry || entry['הפניה'] || '',
          response: entry.response || entry['תיאור'] || '',
          summary: entry['תמצית'] || '',
          timestamp: entry.timestamp || entry['נוצר ב:'] || 'לא זמין',
          author: entry.author || entry['נוצר על-ידי'] || 'לא זמין',
          content: entry.response || entry.inquiry,
          type: entry.response ? 'response' : 'inquiry',
          row_number: entry.row_number || 0 // Add row number from spreadsheet
        });
      }
    });
    
    // Sort chronologically (if timestamps available)
    entries.sort((a, b) => {
      if (a.timestamp && b.timestamp && a.timestamp !== 'לא זמין' && b.timestamp !== 'לא זמין') {
        return new Date(a.timestamp) - new Date(b.timestamp);
      }
      return 0; // Keep original order if no timestamps
    });
    
    console.log(`✅ Found ${entries.length} entries for ticket: ${ticketId}`);
    
    res.json({
      success: true,
      search_type: 'ticket_timeline',
      ticket_id: ticketId,
      total_entries: entries.length,
      entries: entries
    });
    
  } catch (error) {
    console.error('❌ Error in /search-by-ticket endpoint:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      entries: []
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    data_source: 'google_sheets',
    last_refresh: lastRefreshTime,
    records_loaded: municipalData.length,
    data_loaded_successfully: dataLoadedSuccessfully,
    search_type: embeddingsReady ? 'semantic_embeddings' : 'text_similarity',
    gpt_cache_size: responseCache.cache.size,
    active_sessions: sessions.size
  });
});

// Diagnostic endpoint to check data status on Vercel
app.get('/debug-data', (req, res) => {
  const withOfficialResponse = municipalData.filter(e => e.has_official_response).length;
  const withoutOfficialResponse = municipalData.filter(e => !e.has_official_response).length;
  
  res.json({
    total_records: municipalData.length,
    data_loaded_successfully: dataLoadedSuccessfully,
    entries_with_official_response: withOfficialResponse,
    entries_without_official_response: withoutOfficialResponse,
    sample_entries: municipalData.slice(0, 3).map(entry => ({
      case_id: entry.case_id,
      has_official_response: entry.has_official_response,
      inquiry_preview: entry.inquiry_text ? entry.inquiry_text.substring(0, 30) : 'N/A',
      response_preview: entry.response_text ? entry.response_text.substring(0, 30) : 'N/A'
    })),
    official_keywords_checked: OFFICIAL_KEYWORDS
  });
});

// Debug OpenAI connection endpoint
app.get('/api/debug/openai', async (req, res) => {
  try {
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    const keyLength = process.env.OPENAI_API_KEY?.length;
    const keyPreview = process.env.OPENAI_API_KEY ? 
      `${process.env.OPENAI_API_KEY.substring(0, 20)}...${process.env.OPENAI_API_KEY.slice(-10)}` : 
      'NOT SET';
    
    let testResult = { success: false, error: null, model: null };
    
    if (openai && openaiAvailable) {
      try {
        // Try a simple API call to test the connection
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Say "OK" if you are working' }],
          max_tokens: 10
        });
        
        testResult.success = true;
        testResult.model = completion.model;
        testResult.response = completion.choices[0]?.message?.content;
      } catch (error) {
        testResult.error = error.message;
        testResult.errorCode = error.code;
        testResult.errorType = error.type;
      }
    }
    
    res.json({
      hasApiKey,
      keyLength,
      keyPreview,
      openaiAvailable,
      openaiInitialized: !!openai,
      testResult
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// Debug Google Sheets connection endpoint
app.get('/api/debug/sheets', async (req, res) => {
  try {
    const hasSpreadsheetId = !!process.env.SPREADSHEET_ID;
    const hasGoogleCreds = !!process.env.GOOGLE_CREDENTIALS_JSON;
    const googleCredsLength = process.env.GOOGLE_CREDENTIALS_JSON?.length;
    
    let authTest = { success: false, error: null, email: null };
    
    // Try to parse and validate Google credentials
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      try {
        const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        authTest.email = creds.client_email;
        authTest.hasPrivateKey = !!creds.private_key;
        authTest.projectId = creds.project_id;
        
        // Try to create auth and sheets client
        const auth = new google.auth.GoogleAuth({
          credentials: creds,
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        
        const sheets = google.sheets({ version: 'v4', auth });
        
        // Try to get spreadsheet info
        if (process.env.SPREADSHEET_ID) {
          const info = await sheets.spreadsheets.get({
            spreadsheetId: process.env.SPREADSHEET_ID
          });
          authTest.success = true;
          authTest.spreadsheetTitle = info.data.properties.title;
          authTest.sheetsCount = info.data.sheets.length;
        }
      } catch (error) {
        authTest.error = error.message;
      }
    }
    
    res.json({
      hasSpreadsheetId,
      spreadsheetId: process.env.SPREADSHEET_ID,
      hasGoogleCreds,
      googleCredsLength,
      authTest,
      dataStatus: {
        recordsLoaded: municipalData.length,
        lastRefresh: lastRefreshTime,
        dataLoadedSuccessfully
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// Data sample endpoint
app.get('/data-sample', (req, res) => {
  const sample = municipalData.slice(0, 5).map(entry => ({
    case_id: entry.case_id,
    inquiry: entry.inquiry_text ? entry.inquiry_text.substring(0, 50) + '...' : '',
    response: entry.response_text ? entry.response_text.substring(0, 50) + '...' : '',
    has_inquiry: !!entry.inquiry_text,
    has_response: !!entry.response_text
  }));
  
  res.json({
    total_records: municipalData.length,
    data_loaded_successfully: dataLoadedSuccessfully,
    embeddings_ready: embeddingsReady,
    last_refresh: lastRefreshTime,
    sample: sample
  });
});

// Refresh data endpoint
app.post('/refresh', async (req, res) => {
  await loadDataFromSheets();
  res.json({
    message: 'Data refreshed successfully',
    records_loaded: municipalData.length,
    data_loaded_successfully: dataLoadedSuccessfully,
    embeddings_ready: embeddingsReady,
    last_refresh: lastRefreshTime
  });
});

// Analytics endpoint
app.get('/analytics', (req, res) => {
  const report = analytics.getReport();
  res.json(report);
});

// Cache management endpoints
app.get('/cache/stats', (req, res) => {
  res.json(responseCache.getStats());
});

app.post('/cache/clear', (req, res) => {
  responseCache.clear();
  res.json({ message: 'Cache cleared successfully' });
});

// Generate official response endpoint
app.post('/generate-official-response', async (req, res) => {
  try {
    const { original_inquiry, selected_response, case_id } = req.body;
    
    if (!original_inquiry || !selected_response) {
      return res.status(400).json({ 
        error: 'original_inquiry and selected_response are required' 
      });
    }

    // Log the request for analytics
    console.log(`Generating official response for inquiry: ${original_inquiry.substring(0, 50)}...`);

    // If OpenAI is not available, return a formatted version of the selected response
    if (!openaiAvailable || !openai) {
      const formattedResponse = `שלום,

${selected_response}

בברכה,
תוכנית אב לתחבורה`;
      
      return res.json({ 
        official_response: formattedResponse,
        source: 'formatted_template'
      });
    }

    // Use OpenAI to generate an official response
    const systemPrompt = `אתה נציג מחלקת תחבורה ציבורית בתוכנית אב לתחבורה. 
תפקידך לכתוב תשובה רשמית לאזרח בהתבסס על תשובה דומה שנמצאה במערכת.

הנחיות חשובות:
1. התחל את התשובה ב: "שלום,"
2. כתוב תשובה מלאה ומותאמת לפנייה הספציפית
3. אם התשובה ארוכה, חלק אותה לפסקאות קצרות
4. השתמש בטון רשמי אך ידידותי ומכבד
5. היה ספציפי וענייני
6. סיים את התשובה ב:
"בברכה,
תוכנית אב לתחבורה"

אל תוסיף מידע שלא קיים בתשובה המקורית.`;

    const userPrompt = `פניית האזרח: "${original_inquiry}"

תשובה דומה מהמערכת: "${selected_response}"

אנא כתוב תשובה רשמית מעודכנת ומותאמת לפנייה הספציפית, תוך שמירה על המידע המהותי מהתשובה הדומה.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 800
      });

      const officialResponse = completion.choices[0].message.content.trim();

      // Store in cache for analytics
      responseCache.set(`official_${case_id || Date.now()}`, {
        original_inquiry,
        selected_response,
        official_response: officialResponse,
        timestamp: new Date().toISOString()
      });

      res.json({ 
        official_response: officialResponse,
        source: 'openai_generated'
      });

    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      
      // Fallback to formatted template
      const formattedResponse = `שלום,

${selected_response}

בברכה,
תוכנית אב לתחבורה`;
      
      res.json({ 
        official_response: formattedResponse,
        source: 'formatted_template_fallback'
      });
    }

  } catch (error) {
    console.error('Error generating official response:', error);
    res.status(500).json({ 
      error: 'Failed to generate official response',
      details: error.message 
    });
  }
});

// Append to Google Sheet endpoint
app.post('/append-to-sheet', async (req, res) => {
  try {
    const { inquiry, response, timestamp, source } = req.body;
    
    if (!inquiry || !response) {
      return res.status(400).json({ 
        error: 'inquiry and response are required' 
      });
    }

    console.log(`📝 Appending new response to Google Sheet...`);
    console.log(`🔑 Using credentials file: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    console.log(`📊 Target spreadsheet ID: ${process.env.SPREADSHEET_ID}`);
    
    // Read and display service account email for verification
    try {
      const credentialsContent = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
      const credentials = JSON.parse(credentialsContent);
      console.log(`👤 Service account email: ${credentials.client_email}`);
    } catch (credError) {
      console.log(`⚠️ Could not read service account email: ${credError.message}`);
    }

    try {
      console.log(`🔐 Attempting authentication with write permissions...`);
      const sheets = await authenticateGoogleSheets(false); // Request write permissions
      console.log(`✅ Authentication successful`);
      
      // First, get spreadsheet metadata to see available sheets
      console.log(`🔍 Getting spreadsheet metadata to identify correct sheet...`);
      const spreadsheetInfo = await sheets.spreadsheets.get({
        spreadsheetId: process.env.SPREADSHEET_ID
      });
      
      console.log(`📋 Available sheets:`);
      spreadsheetInfo.data.sheets.forEach(sheet => {
        console.log(`  - ${sheet.properties.title} (ID: ${sheet.properties.sheetId})`);
      });
      
      // Find the correct sheet - try common names
      const possibleSheetNames = ['Cleaned_Answers_Data', 'Sheet1', 'Dados_Respostas_Limpas'];
      let targetSheetName = possibleSheetNames[0]; // default
      
      for (const sheetName of possibleSheetNames) {
        const foundSheet = spreadsheetInfo.data.sheets.find(s => s.properties.title === sheetName);
        if (foundSheet) {
          targetSheetName = sheetName;
          console.log(`✅ Found target sheet: ${targetSheetName}`);
          break;
        }
      }
      
      // If no match found, use the first sheet
      if (!spreadsheetInfo.data.sheets.find(s => s.properties.title === targetSheetName)) {
        targetSheetName = spreadsheetInfo.data.sheets[0].properties.title;
        console.log(`⚠️ Using first available sheet: ${targetSheetName}`);
      }
      
      // Test read access
      console.log(`🔍 Testing read access on sheet "${targetSheetName}"...`);
      const testRead = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${targetSheetName}!A1:A1`
      });
      console.log(`✅ Read test successful on "${targetSheetName}", proceeding with append...`);
      
      // Prepare the row data in the same format as the original sheet
      const newRow = [
        `CAS-${Date.now()}`, // מזהה פניה (Case ID)
        'תשובה שנוצרה באמצעות המערכת', // נושא (Subject)
        inquiry.substring(0, 100), // תמצית (Summary)
        inquiry, // הפניה (Full Inquiry)
        new Date().toLocaleString('he-IL'), // נוצר ב: (Created at)
        source || 'municipal_inquiry_system', // נוצר על-ידי (Created by)
        response // תיאור (Response)
      ];

      // Append to the sheet
      console.log(`📤 Attempting to append row to sheet "${targetSheetName}"...`);
      const appendResponse = await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${targetSheetName}!A:G`, // Append to columns A through G
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [newRow]
        }
      });
      
      console.log(`✅ Append operation completed:`, appendResponse.data.updates);

      console.log(`✅ Successfully appended row to Google Sheet`);
      
      res.json({ 
        success: true,
        message: 'Response appended to Google Sheet successfully',
        updatedRange: appendResponse.data.updates.updatedRange,
        updatedRows: appendResponse.data.updates.updatedRows
      });

    } catch (sheetsError) {
      console.error('Google Sheets API error:', sheetsError);
      console.error('Full error details:', JSON.stringify(sheetsError, null, 2));
      
      // Try an alternative approach with a fresh authentication
      console.log('🔄 Trying alternative authentication approach...');
      try {
        // Create a completely fresh auth instance
        const altAuth = new GoogleAuth({
          keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        const altAuthClient = await altAuth.getClient();
        const altSheets = google.sheets({ version: 'v4', auth: altAuthClient });
        
        console.log('🔄 Retrying append with fresh authentication...');
        const retryResponse = await altSheets.spreadsheets.values.append({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: `${targetSheetName}!A:G`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: [newRow]
          }
        });
        
        console.log(`✅ Retry successful with alternative auth!`);
        res.json({ 
          success: true,
          message: 'Response appended to Google Sheet successfully (retry)',
          updatedRange: retryResponse.data.updates.updatedRange,
          updatedRows: retryResponse.data.updates.updatedRows
        });
        return;
        
      } catch (retryError) {
        console.error('Retry also failed:', retryError);
      }
      
      // If it's a permission error, provide helpful guidance
      if (sheetsError.message.includes('Insufficient Permission')) {
        res.status(500).json({ 
          error: 'Google Sheets permission error',
          details: `Authentication failed despite correct permissions. Service account may need to be re-shared with the spreadsheet. Error: ${sheetsError.message}`,
          fallback_suggestion: 'Please check that the service account email has Editor access to the specific sheet tab.',
          debug_info: {
            credentials_file: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'Present' : 'Missing',
            spreadsheet_id: process.env.SPREADSHEET_ID ? 'Present' : 'Missing',
            error_code: sheetsError.code
          }
        });
      } else {
        res.status(500).json({ 
          error: 'Failed to append to Google Sheet',
          details: sheetsError.message,
          debug_info: {
            error_code: sheetsError.code,
            error_status: sheetsError.status
          }
        });
      }
    }

  } catch (error) {
    console.error('Error in append-to-sheet endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Test Google Sheets connection endpoint
app.get('/test-sheets', async (req, res) => {
  try {
    console.log('🧪 Testing Google Sheets connection...');
    
    // Read service account info
    const credentialsContent = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
    const credentials = JSON.parse(credentialsContent);
    
    // Test authentication
    const sheets = await authenticateGoogleSheets(false);
    
    // Get spreadsheet info
    const spreadsheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SPREADSHEET_ID
    });
    
    const sheetList = spreadsheetInfo.data.sheets.map(sheet => ({
      title: sheet.properties.title,
      id: sheet.properties.sheetId,
      index: sheet.properties.index
    }));
    
    res.json({
      success: true,
      service_account: credentials.client_email,
      spreadsheet_id: process.env.SPREADSHEET_ID,
      spreadsheet_title: spreadsheetInfo.data.properties.title,
      available_sheets: sheetList,
      credentials_file: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    
  } catch (error) {
    console.error('Test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      error_code: error.code
    });
  }
});

// Session management endpoint
app.get('/sessions', (req, res) => {
  const sessionData = [];
  sessions.forEach((context, sessionId) => {
    sessionData.push({
      sessionId,
      interactionCount: context.history.length,
      frequentTopics: context.getFrequentTopics()
    });
  });
  res.json({ 
    totalSessions: sessions.size, 
    sessions: sessionData 
  });
});

// ==================== INTEGRATION MANAGEMENT ENDPOINTS ====================

// Get Google Sheets settings
app.get('/api/integrations/google-sheets', (req, res) => {
  try {
    // Read service account info
    let serviceAccountEmail = '';
    try {
      const credentialsContent = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
      const credentials = JSON.parse(credentialsContent);
      serviceAccountEmail = credentials.client_email;
    } catch (error) {
      console.warn('Could not read service account email:', error.message);
    }

    res.json({
      spreadsheet_id: process.env.SPREADSHEET_ID || '',
      sheet_name: 'Cleaned_Answers_Data', // Default sheet name
      service_account_email: serviceAccountEmail,
      connection_status: dataLoadedSuccessfully ? 'connected' : 'disconnected'
    });
  } catch (error) {
    console.error('Error getting Google Sheets settings:', error);
    res.status(500).json({ error: 'Failed to load Google Sheets settings' });
  }
});

// Get OpenAI settings
app.get('/api/integrations/openai', (req, res) => {
  try {
    res.json({
      api_key_configured: !!process.env.OPENAI_API_KEY,
      model: 'gpt-3.5-turbo', // Default model
      connection_status: openaiAvailable ? 'connected' : 'disconnected'
    });
  } catch (error) {
    console.error('Error getting OpenAI settings:', error);
    res.status(500).json({ error: 'Failed to load OpenAI settings' });
  }
});

// Test Google Sheets connection
app.post('/api/integrations/test-google-sheets', async (req, res) => {
  try {
    const { spreadsheet_id, sheet_name } = req.body;
    
    if (!spreadsheet_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'מזהה גיליון (Spreadsheet ID) נדרש' 
      });
    }

    console.log('🧪 Testing Google Sheets connection with custom settings...');
    
    // Test authentication
    const sheets = await authenticateGoogleSheets(true); // Read-only test
    
    // Test access to the specific spreadsheet
    const spreadsheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheet_id
    });
    
    // Check if the specific sheet exists
    const requestedSheet = spreadsheetInfo.data.sheets.find(
      sheet => sheet.properties.title === (sheet_name || 'Cleaned_Answers_Data')
    );
    
    if (!requestedSheet) {
      return res.status(400).json({
        success: false,
        error: `גיליון בשם "${sheet_name || 'Cleaned_Answers_Data'}" לא נמצא`
      });
    }

    // Try to read a small sample to verify permissions
    await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheet_id,
      range: `${sheet_name || 'Cleaned_Answers_Data'}!A1:C1`
    });
    
    res.json({
      success: true,
      message: 'חיבור הצליח! הגיליון נגיש ופעיל',
      spreadsheet_title: spreadsheetInfo.data.properties.title,
      sheet_found: true,
      sheet_name: requestedSheet.properties.title
    });
    
  } catch (error) {
    console.error('Google Sheets test failed:', error);
    
    let errorMessage = 'שגיאה בחיבור ל-Google Sheets';
    if (error.message.includes('not found')) {
      errorMessage = 'מזהה הגיליון לא נמצא או לא נגיש';
    } else if (error.message.includes('permission')) {
      errorMessage = 'אין הרשאות גישה לגיליון. יש לשתף את הגיליון עם חשבון השירות';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
});

// Test OpenAI connection
app.post('/api/integrations/test-openai', async (req, res) => {
  try {
    const { api_key, model } = req.body;
    
    if (!api_key) {
      return res.status(400).json({ 
        success: false, 
        error: 'מפתח API נדרש' 
      });
    }

    if (!api_key.startsWith('sk-')) {
      return res.status(400).json({ 
        success: false, 
        error: 'מפתח API לא תקין (צריך להתחיל ב-sk-)' 
      });
    }

    console.log('🧪 Testing OpenAI connection...');
    
    // Create temporary OpenAI instance for testing
    const testOpenAI = new OpenAI({
      apiKey: api_key
    });
    
    // Test with a simple completion
    const completion = await testOpenAI.chat.completions.create({
      model: model || 'gpt-3.5-turbo',
      messages: [
        { role: 'user', content: 'שלום, זהו בדיקת חיבור' }
      ],
      max_tokens: 50
    });
    
    if (completion.choices && completion.choices.length > 0) {
      res.json({
        success: true,
        message: 'חיבור ל-OpenAI הצליח!',
        model_used: completion.model,
        test_response: completion.choices[0].message.content
      });
    } else {
      throw new Error('לא התקבלה תשובה תקינה מ-OpenAI');
    }
    
  } catch (error) {
    console.error('OpenAI test failed:', error);
    
    let errorMessage = 'שגיאה בחיבור ל-OpenAI';
    if (error.message.includes('Incorrect API key')) {
      errorMessage = 'מפתח API לא תקין';
    } else if (error.message.includes('quota')) {
      errorMessage = 'חרגת מכמות השימוש המותרת';
    } else if (error.message.includes('model')) {
      errorMessage = 'המודל שנבחר לא זמין';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
});

// Save Google Sheets settings
app.post('/api/integrations/save-google-sheets', async (req, res) => {
  try {
    const { spreadsheet_id, sheet_name } = req.body;
    
    // Here you could save to a config file or database
    // For now, we'll just validate the settings
    if (spreadsheet_id) {
      // Update environment variable (note: this won't persist across restarts)
      process.env.SPREADSHEET_ID = spreadsheet_id;
      console.log(`✅ Google Sheets settings updated: ${spreadsheet_id}`);
    }
    
    res.json({
      success: true,
      message: 'הגדרות Google Sheets נשמרו בהצלחה',
      saved_settings: {
        spreadsheet_id,
        sheet_name: sheet_name || 'Cleaned_Answers_Data'
      }
    });
    
  } catch (error) {
    console.error('Error saving Google Sheets settings:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה בשמירת הגדרות Google Sheets'
    });
  }
});

// Save OpenAI settings
app.post('/api/integrations/save-openai', async (req, res) => {
  try {
    const { api_key, model } = req.body;
    
    // Update environment variable and reinitialize OpenAI (note: this won't persist across restarts)
    if (api_key && api_key.startsWith('sk-')) {
      process.env.OPENAI_API_KEY = api_key;
      
      // Reinitialize OpenAI with new key
      try {
        openai = new OpenAI({
          apiKey: api_key
        });
        openaiAvailable = true;
        console.log('✅ OpenAI settings updated and reinitialized');
      } catch (initError) {
        console.error('Failed to reinitialize OpenAI:', initError);
        openaiAvailable = false;
      }
    }
    
    res.json({
      success: true,
      message: 'הגדרות OpenAI נשמרו בהצלחה',
      saved_settings: {
        api_key_configured: !!api_key,
        model: model || 'gpt-3.5-turbo'
      }
    });
    
  } catch (error) {
    console.error('Error saving OpenAI settings:', error);
    res.status(500).json({
      success: false,
      error: 'שגיאה בשמירת הגדרות OpenAI'
    });
  }
});

// Initialize GPT improvements with dependencies
initializeGPTImprovements(openai, cleanHistoricalResponse);

// Initialize and start server
async function startServer() {
  // Initial data load
  await loadDataFromSheets();
  
  // Set up automatic refresh every 5 minutes
  setInterval(loadDataFromSheets, 5 * 60 * 1000);
  
  app.listen(PORT, () => {
    console.log(`\n🚀 Municipal Inquiry System running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔍 Data sample: http://localhost:${PORT}/data-sample`);
    console.log(`💾 Records loaded: ${municipalData.length}`);
    console.log(`✅ Data loaded successfully: ${dataLoadedSuccessfully}`);
    console.log(`🧠 Embeddings ready: ${embeddingsReady}`);
  });
}

startServer().catch(console.error);