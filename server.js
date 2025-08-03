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

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8009;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Global data store
let municipalData = [];
let lastRefreshTime = null;
let dataLoadedSuccessfully = false;
let embeddingsReady = false;

// Initialize OpenAI with fallback
let openai = null;
let openaiAvailable = false;

try {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    openaiAvailable = true;
    console.log('✅ OpenAI API key configured');
  } else {
    console.log('⚠️ OpenAI API key not found or invalid - falling back to text similarity');
  }
} catch (error) {
  console.log('⚠️ OpenAI initialization failed - falling back to text similarity');
  openaiAvailable = false;
}

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

// Load data from Google Sheets
async function loadDataFromSheets() {
  try {
    console.log('🔄 Loading data from Google Sheets...');
    dataLoadedSuccessfully = false;
    
    const sheets = await authenticateGoogleSheets();
    
    // Read all data from the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
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
      
      // Only include entries that have both inquiry and response with official keywords
      if (inquiryText.trim() && responseText.trim() && containsOfficialKeywords(responseText)) {
        // Clean the response text of internal references before storing
        const cleanedResponse = cleanHistoricalResponse(responseText.trim());
        entry.inquiry_text = inquiryText.trim();
        entry.response_text = cleanedResponse;
        entry.row_number = i; // Add row number from spreadsheet
        entry.created_date = entry['נוצר ב:'] || ''; // Add creation date
        municipalData.push(entry);
        responsesFound++;
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
    
    // Load fallback test data
    console.log('🔄 Loading fallback test data...');
    municipalData = [
      {
        case_id: 'CAS-BEIT-SHEMESH-1',
        inquiry_text: 'הוספת קו חדש בית שמש - בית שמש הוספת קו חדש הערות הפונה: אני גרה ברמת אברהם בבית שמש ועובדת ברמה ג\'2 בבית שמש ונאלצת לסע ב2 אוטובוסים לעבודה',
        response_text: 'שלום רב, מסלולי הקווים באזור זה מאזנים בין הצרכים השונים, במטרה לאפשר שירות תחבורה ציבורית יעיל ומיטבי. אנו בוחנים את הבקשה לקו ישיר. בברכה'
      },
      {
        case_id: 'CAS-LINE-408-1',
        inquiry_text: 'קו 408 שינוי מסלול בית שמש',
        response_text: 'שלום רב, פנייתך בנושא שינוי מסלול קו 408 לבית שמש התקבלה. אנו בוחנים את הבקשה וננקטו הפעולות הנדרשות. בברכה'
      },
      {
        case_id: 'CAS-FREQUENCY-1',
        inquiry_text: 'הוספת תדירות בנסיעת קו 426',
        response_text: 'שלום רב, פנייתך בנושא הוספת תדירות קו 426 התקבלה. אנו בוחנים את הבקשה ונעדכן בהמשך. בברכה'
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
      let systemPrompt = `אתה נציג מחלקת תחבורה ציבורית בעיריית ירושלים. 
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
עיריית ירושלים`;
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
    
    // Find semantic matches with strict threshold
    const matches = await findSemanticMatches(inquiry_text, 0.78, max_recommendations);
    
    response.debug.matches_found = matches.length;
    response.debug.top_similarity_score = matches.length > 0 ? matches[0].similarity : 0;
    response.debug.search_method = embeddingsReady ? 'semantic_embeddings' : 'text_similarity';
    response.debug.threshold_used = embeddingsReady ? 0.78 : 0.2;
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
      
      // Always provide related matches
      response.related_matches = matches.map(match => ({
        case_id: match.case_id,
        description: match.inquiry_text,
        original_response: match.response_text,
        relevance_score: match.similarity,
        row_number: match.row_number,
        created_date: match.created_date
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
    const systemPrompt = `אתה נציג מחלקת תחבורה ציבורית בעיריית ירושלים. 
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