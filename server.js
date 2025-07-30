import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

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

// Hebrew keywords for filtering official responses
const OFFICIAL_KEYWORDS = [
  'שלום רב', 'בברכה', 'פנייתך', 'בקשתך', 'אנו', 'אנא', 'נא',
  'אנו מתנצלים', 'לצערנו', 'בהתאם ל', 'נבחן', 'נבחנה', 'הוחלט', 'אושר', 'משרדנו'
];

// Initialize Google Sheets authentication
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
      await generateAllEmbeddings();
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
  
  // If response is too short or contains only system artifacts, return a generic response
  if (cleaned.length < 20 || !/[א-ת]/.test(cleaned)) {
    return 'שלום רב, פנייתך התקבלה ותיבחן על ידי הצוות המקצועי. בברכה, מחלקת תחבורה ציבורית עיריית ירושלים';
  }
  
  // Ensure proper greeting if missing
  if (!cleaned.startsWith('שלום רב')) {
    cleaned = 'שלום רב, ' + cleaned;
  }
  
  // Ensure proper closing if missing
  if (!cleaned.includes('בברכה')) {
    cleaned = cleaned + '\n\nבברכה,\nמחלקת תחבורה ציבורית\nעיריית ירושלים';
  }
  
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
    console.log('⚠️ Embeddings not ready, generating now...');
    await generateAllEmbeddings();
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
  if (historicalResponse) {
    // Clean the historical response
    const cleanedResponse = cleanHistoricalResponse(historicalResponse);
    
    // If the cleaned response is substantial, use it directly
    if (cleanedResponse.length > 50) {
      return cleanedResponse;
    }
  }
  
  // Generate new municipal-style response
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
        relevance_score: match.similarity
      }));
      
      response.enhanced_response = await generateFinalResponse(
        inquiry_text,
        bestMatch.response_text
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
      
      response.enhanced_response = await generateFinalResponse(inquiry_text);
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
    search_type: embeddingsReady ? 'semantic_embeddings' : 'text_similarity'
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