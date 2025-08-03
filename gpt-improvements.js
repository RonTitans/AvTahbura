// GPT Response Improvements Module
// This file contains enhanced functions to improve GPT response quality

// We'll need these passed in or defined here
let openai = null;
let cleanHistoricalResponse = null;

// Initialize function to set dependencies
export function initializeGPTImprovements(openaiInstance, cleanFunction) {
  openai = openaiInstance;
  cleanHistoricalResponse = cleanFunction;
}

// 1. IMPROVED SYSTEM PROMPTS - Multiple variants for A/B testing
const systemPrompts = {
  detailed: `אתה נציג מחלקת תחבורה ציבורית בעיריית ירושלים. 
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

התשובה שלך היא הטקסט הסופי שיישלח לאזרח - אין צורך בהסברים נוספים.`,

  concise: `אתה נציג מחלקת תחבורה ציבורית בעיריית ירושלים.
כתוב תשובה סופית קצרה ומדויקת לאזרח.

מבנה חובה:
1. "שלום,"
2. תשובה קצרה וענינית (1-2 פסקאות)
3. משפט סיום חם
4. "בברכה, תוכנית אב לתחבורה"

זו התשובה הסופית שתישלח לאזרח.`,

  empathetic: `אתה נציג מחלקת תחבורה ציבורית בעיריית ירושלים.
כתוב תשובה סופית חמה ומבינה לאזרח.

מבנה חובה:
1. "שלום,"
2. הכרה בקושי של הפונה ותשובה אמפתית
3. הסבר מפורט ופתרונות מעשיים
4. הזמנה לפנייה נוספת
5. "בברכה, תוכנית אב לתחבורה"

השתמש בשפה חמה ומזמינה. זו התשובה הסופית לאזרח.`
};

// 2. RESPONSE VALIDATION FUNCTIONS
function validateGPTResponse(response, inquiry) {
  const validationResults = {
    isValid: true,
    issues: [],
    score: 100
  };

  // Check minimum length (at least 100 characters)
  if (response.length < 100) {
    validationResults.issues.push('התשובה קצרה מדי');
    validationResults.score -= 20;
  }

  // Check for Hebrew content
  const hebrewRatio = (response.match(/[\u0590-\u05FF]/g) || []).length / response.length;
  if (hebrewRatio < 0.7) {
    validationResults.issues.push('התשובה לא בעברית תקינה');
    validationResults.score -= 30;
    validationResults.isValid = false;
  }

  // Check for relevant content
  if (!checkRelevance(response, inquiry)) {
    validationResults.issues.push('התשובה לא רלוונטית לפנייה');
    validationResults.score -= 25;
  }

  // Check for hallucinations (fake bus lines)
  const hallucinations = detectHallucinations(response);
  if (hallucinations.length > 0) {
    validationResults.issues.push(`נמצאו קווים לא קיימים: ${hallucinations.join(', ')}`);
    validationResults.score -= 15 * hallucinations.length;
    validationResults.isValid = false;
  }

  // Check structure
  if (!hasProperStructure(response)) {
    validationResults.issues.push('התשובה חסרת מבנה ברור');
    validationResults.score -= 10;
  }

  validationResults.isValid = validationResults.score >= 60;
  return validationResults;
}

function checkRelevance(response, inquiry) {
  // Extract key terms from inquiry
  const inquiryTerms = extractKeyTerms(inquiry);
  
  // Check if response addresses at least 50% of key terms
  let matchedTerms = 0;
  inquiryTerms.forEach(term => {
    if (response.includes(term)) matchedTerms++;
  });
  
  return (matchedTerms / inquiryTerms.length) >= 0.5;
}

function extractKeyTerms(text) {
  // Extract bus lines, locations, and key words
  const busLines = (text.match(/קו[ות]?\s*\d+/g) || []).map(l => l.trim());
  const locations = extractLocations(text);
  const keywords = ['שינוי', 'ביטול', 'הוספה', 'תדירות', 'מסלול', 'תחנה', 'זמנים']
    .filter(word => text.includes(word));
  
  return [...busLines, ...locations, ...keywords];
}

function extractLocations(text) {
  // Common Jerusalem locations - this should be expanded
  const locations = [
    'הכותל', 'מרכז העיר', 'תחנה מרכזית', 'הר הצופים', 'גילה', 'רמות',
    'פסגת זאב', 'נווה יעקב', 'בית וגן', 'קטמון', 'תלפיות', 'ארמון הנציב',
    'מלחה', 'עין כרם', 'הדסה', 'גבעת רם', 'רמת אשכול', 'רמת שלמה'
  ];
  
  return locations.filter(loc => text.includes(loc));
}

function detectHallucinations(response) {
  // Valid Jerusalem bus lines (partial list - should be expanded)
  const validBusLines = new Set([
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '14', '15',
    '16', '17', '18', '19', '20', '21', '23', '24', '26', '27', '28', '29',
    '30', '31', '32', '34', '35', '36', '37', '38', '39', '40', '42', '43',
    '46', '47', '49', '51', '52', '54', '56', '58', '60', '62', '64', '66',
    '67', '68', '71', '72', '74', '75', '77', '78', '82', '83', '101', '102',
    '103', '104', '105', '106', '110', '111', '115', '117', '118', '119',
    '120', '121', '122', '123', '124', '125', '128', '130', '133', '134',
    '160', '161', '163', '164', '165', '166', '167', '170', '174', '175',
    '176', '177', '178', '200', '201', '202', '203', '204', '210', '215',
    '230', '231', '232', '234', '235', '236', '237', '238', '239', '240',
    '243', '246', '249', '250', '251', '252', '253', '254', '255', '256',
    '270', '271', '272', '273', '274', '275', '301', '302', '304', '315',
    '316', '320', '322', '331', '332', '334', '336', '402', '403', '404',
    '405', '406', '407', '408', '409', '410', '411', '412', '413', '414',
    '415', '416', '417', '418', '419', '420', '421', '422', '423', '424',
    '425', '426', '427', '428', '429', '430', '480', '485', '486', '487'
  ]);

  const mentionedLines = (response.match(/קו[ות]?\s*(\d+)/g) || [])
    .map(match => match.match(/\d+/)[0]);

  return mentionedLines.filter(line => !validBusLines.has(line));
}

function hasProperStructure(response) {
  // Check for required greeting
  const hasGreeting = response.trim().startsWith('שלום,');
  
  // Check for content (at least 2 sentences)
  const sentences = response.split(/[.!?]/).filter(s => s.trim().length > 10);
  const hasContent = sentences.length >= 2;
  
  // Check for required signature
  const hasSignature = response.includes('בברכה, תוכנית אב לתחבורה');
  
  return hasGreeting && hasContent && hasSignature;
}

// 3. RESPONSE CACHING
class ResponseCache {
  constructor(maxSize = 100, ttlMinutes = 60) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlMinutes * 60 * 1000;
  }

  generateKey(inquiry, historicalResponse) {
    // Create a normalized key from inquiry
    const normalizedInquiry = inquiry
      .toLowerCase()
      .replace(/[^\u0590-\u05FF\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    const hasHistory = !!historicalResponse;
    return `${normalizedInquiry}_${hasHistory}`;
  }

  get(inquiry, historicalResponse) {
    const key = this.generateKey(inquiry, historicalResponse);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.response;
  }

  set(inquiry, historicalResponse, response) {
    const key = this.generateKey(inquiry, historicalResponse);
    
    // Implement LRU eviction
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      hits: 0
    });
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    const stats = {
      size: this.cache.size,
      entries: []
    };
    
    this.cache.forEach((value, key) => {
      stats.entries.push({
        key: key.substring(0, 50) + '...',
        age: Math.floor((Date.now() - value.timestamp) / 1000 / 60) + ' minutes',
        hits: value.hits
      });
    });
    
    return stats;
  }
}

// 4. CONVERSATION CONTEXT
class ConversationContext {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.history = [];
    this.maxHistory = 5;
    this.userProfile = {
      frequentTopics: {},
      preferredResponseStyle: null
    };
  }

  addInteraction(inquiry, response, metadata = {}) {
    this.history.push({
      inquiry,
      response,
      timestamp: Date.now(),
      metadata
    });
    
    // Keep only recent history
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    // Update user profile
    this.updateUserProfile(inquiry);
  }

  updateUserProfile(inquiry) {
    // Track topics
    const topics = extractKeyTerms(inquiry);
    topics.forEach(topic => {
      this.userProfile.frequentTopics[topic] = 
        (this.userProfile.frequentTopics[topic] || 0) + 1;
    });
  }

  getContextForGPT() {
    if (this.history.length === 0) return '';
    
    const recentContext = this.history
      .slice(-3) // Last 3 interactions
      .map(h => `שאלה קודמת: ${h.inquiry}\nתשובה: ${h.response}`)
      .join('\n\n');
    
    return `\n\nהיסטוריית שיחה אחרונה:\n${recentContext}`;
  }

  getFrequentTopics() {
    return Object.entries(this.userProfile.frequentTopics)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([topic]) => topic);
  }
}

// 5. ANALYTICS AND LOGGING
class GPTAnalytics {
  constructor() {
    this.logs = [];
    this.metrics = {
      totalRequests: 0,
      successfulResponses: 0,
      failedValidations: 0,
      cacheHits: 0,
      averageResponseTime: 0,
      averageTokens: 0,
      promptVariantPerformance: {}
    };
  }

  logRequest(requestData) {
    const log = {
      timestamp: new Date().toISOString(),
      sessionId: requestData.sessionId,
      inquiry: requestData.inquiry,
      hadHistoricalContext: !!requestData.historicalResponse,
      promptVariant: requestData.promptVariant,
      startTime: Date.now()
    };
    
    return log;
  }

  logResponse(log, responseData) {
    log.endTime = Date.now();
    log.responseTime = log.endTime - log.startTime;
    log.response = responseData.response;
    log.validationResult = responseData.validationResult;
    log.wassCached = responseData.wasCached;
    log.tokens = responseData.tokens || 0;
    
    this.logs.push(log);
    this.updateMetrics(log);
    
    // Keep only last 1000 logs in memory
    if (this.logs.length > 1000) {
      this.logs.shift();
    }
  }

  updateMetrics(log) {
    this.metrics.totalRequests++;
    
    if (log.validationResult && log.validationResult.isValid) {
      this.metrics.successfulResponses++;
    } else {
      this.metrics.failedValidations++;
    }
    
    if (log.wasCached) {
      this.metrics.cacheHits++;
    }
    
    // Update average response time
    const prevAvg = this.metrics.averageResponseTime;
    const n = this.metrics.totalRequests;
    this.metrics.averageResponseTime = 
      (prevAvg * (n - 1) + log.responseTime) / n;
    
    // Track prompt variant performance
    if (log.promptVariant) {
      if (!this.metrics.promptVariantPerformance[log.promptVariant]) {
        this.metrics.promptVariantPerformance[log.promptVariant] = {
          count: 0,
          successRate: 0,
          avgResponseTime: 0
        };
      }
      
      const variant = this.metrics.promptVariantPerformance[log.promptVariant];
      variant.count++;
      if (log.validationResult && log.validationResult.isValid) {
        variant.successRate = 
          ((variant.successRate * (variant.count - 1)) + 1) / variant.count;
      }
    }
  }

  getReport() {
    return {
      summary: this.metrics,
      recentLogs: this.logs.slice(-10),
      performance: {
        cacheHitRate: (this.metrics.cacheHits / this.metrics.totalRequests * 100).toFixed(2) + '%',
        validationSuccessRate: 
          (this.metrics.successfulResponses / this.metrics.totalRequests * 100).toFixed(2) + '%',
        averageResponseTime: this.metrics.averageResponseTime.toFixed(0) + 'ms'
      }
    };
  }
}

// 6. ENHANCED GENERATE FINAL RESPONSE FUNCTION
async function generateEnhancedFinalResponse(
  inquiryText, 
  historicalResponse = null,
  options = {}
) {
  const {
    sessionContext = null,
    promptVariant = 'detailed',
    useCache = true,
    analytics = null
  } = options;
  
  // Start logging
  const log = analytics ? analytics.logRequest({
    sessionId: sessionContext?.sessionId,
    inquiry: inquiryText,
    historicalResponse,
    promptVariant
  }) : null;
  
  // Check cache first
  if (useCache && responseCache) {
    const cached = responseCache.get(inquiryText, historicalResponse);
    if (cached) {
      if (log && analytics) {
        analytics.logResponse(log, {
          response: cached,
          validationResult: { isValid: true },
          wasCached: true
        });
      }
      return cached;
    }
  }
  
  try {
    // Select system prompt
    const systemPrompt = systemPrompts[promptVariant] || systemPrompts.detailed;
    
    // Build user prompt
    let userPrompt = `פנייה מאזרח: ${inquiryText}`;
    
    if (historicalResponse) {
      const cleanedResponse = cleanHistoricalResponse(historicalResponse);
      userPrompt += `\n\nתשובה דומה מהמערכת (לא לשימוש ישיר - רק להתייחסות):\n${cleanedResponse}`;
    }
    
    // Add conversation context if available
    if (sessionContext) {
      userPrompt += sessionContext.getContextForGPT();
    }
    
    // Call GPT
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });
    
    const gptResponse = completion.choices[0].message.content.trim();
    
    // Validate response
    const validationResult = validateGPTResponse(gptResponse, inquiryText);
    
    if (!validationResult.isValid) {
      console.error('GPT response validation failed:', validationResult);
      
      // Try again with a more conservative prompt
      if (promptVariant !== 'concise') {
        return generateEnhancedFinalResponse(
          inquiryText,
          historicalResponse,
          { ...options, promptVariant: 'concise' }
        );
      }
    }
    
    // Cache the response
    if (useCache && responseCache) {
      responseCache.set(inquiryText, historicalResponse, gptResponse);
    }
    
    // Log the interaction
    if (log && analytics) {
      analytics.logResponse(log, {
        response: gptResponse,
        validationResult,
        wasCached: false,
        tokens: completion.usage?.total_tokens
      });
    }
    
    // Update conversation context
    if (sessionContext) {
      sessionContext.addInteraction(inquiryText, gptResponse, {
        validationScore: validationResult.score
      });
    }
    
    return gptResponse;
    
  } catch (error) {
    console.error('Error generating enhanced GPT response:', error);
    
    if (log && analytics) {
      analytics.logResponse(log, {
        response: null,
        validationResult: { isValid: false, error: error.message },
        wasCached: false
      });
    }
    
    // Fallback to historical response if available
    if (historicalResponse) {
      return cleanHistoricalResponse(historicalResponse);
    }
    
    // Generic fallback
    return `שלום רב,
קיבלנו את פנייתך ונטפל בה בהקדם האפשרי.
לבירורים נוספים ניתן לפנות למוקד העירוני בטלפון 106.

בברכה,
מחלקת תחבורה ציבורית
עיריית ירושלים`;
  }
}

// Initialize global instances
const responseCache = new ResponseCache();
const analytics = new GPTAnalytics();
const sessions = new Map(); // sessionId -> ConversationContext

// Export all improvements
export {
  systemPrompts,
  validateGPTResponse,
  ResponseCache,
  ConversationContext,
  GPTAnalytics,
  generateEnhancedFinalResponse,
  responseCache,
  analytics,
  sessions
};