# GPT Integration Documentation - Municipal Inquiry System

## Current Implementation Overview

### What Data is Sent to GPT?

The system sends the following data to GPT (specifically GPT-3.5-turbo):

1. **System Prompt** (Hebrew) - Defines GPT's role as a Jerusalem municipal transportation department representative
2. **User's Original Message** - The citizen's inquiry exactly as typed
3. **Historical Response** (when available) - A cleaned version of the most similar past response from the database

### Data Flow

```
User Query → Text/Semantic Search → Find Best Match → Send to GPT → Enhanced Response
```

## Detailed Implementation

### 1. When GPT is Called

GPT is called in the `generateFinalResponse` function in two scenarios:

- **With Historical Data**: When a similar past response is found (similarity > 0.78)
  ```javascript
  response.enhanced_response = await generateFinalResponse(
    inquiry_text,
    bestMatch.response_text
  );
  ```

- **Without Historical Data**: When no similar responses are found
  ```javascript
  response.enhanced_response = await generateFinalResponse(inquiry_text);
  ```

### 2. What GPT Receives

#### System Prompt (Role Definition)
```
אתה נציג מחלקת תחבורה ציבורית בעיריית ירושלים. עליך לענות תמיד בעברית בצורה מקצועית, אדיבה וברורה.

כללים חשובים:
1. קרא ונתח את כל התשובות הקודמות שסופקו.
2. זהה איזו תשובה (אם בכלל) רלוונטית.
3. **אל תעתיק או תשתמש בתשובה קיימת כמו שהיא** - תמיד צור תשובה חדשה.
4. כתוב תשובה חדשה בעברית - ברורה, מנומסת ומקצועית - כאילו נכתבה על ידי נציג אנושי.
5. אם אתה משתמש בתובנות מתשובות קודמות, נסח מחדש במילים שלך עם מבנה וטון מתאימים.
6. **רק אם אין תשובה רלוונטית והתשובה נוצרת 100% מאפס**, הוסף בסוף התשובה:

בברכה,
מחלקת תחבורה ציבורית
עיריית ירושלים

7. **לעולם אל תוסיף חתימה זו כאשר התוכן נגזר מתשובות עירוניות קודמות** - גם אם ניסחת מחדש.
```

#### User Prompt Format

**With Historical Response:**
```
פנייה מאזרח: [User's original inquiry]

תשובה דומה מהמערכת (לא לשימוש ישיר - רק להתייחסות):
[Cleaned historical response]
```

**Without Historical Response:**
```
פנייה מאזרח: [User's original inquiry]
```

### 3. GPT Configuration

- **Model**: gpt-3.5-turbo
- **Temperature**: 0.7 (balanced creativity/consistency)
- **Max Tokens**: 500 (sufficient for detailed responses)

### 4. Response Processing

The GPT response is:
1. Trimmed of whitespace
2. Returned as the `enhanced_response` field
3. Displayed in the UI under "תשובה מעודכנת ומותאמת"

## Current Issues & Limitations

### 1. Limited Context
- Only sends the single best matching response, not multiple similar ones
- No conversation history or follow-up context
- No department-specific knowledge base integration

### 2. Prompt Engineering
- The prompt focuses heavily on not copying, which might lead to overly creative responses
- No examples provided to guide response style
- Signature logic is complex and might confuse the model

### 3. Error Handling
- Falls back to generic response on GPT errors
- No retry mechanism
- No logging of GPT failures for analysis

## Recommended Improvements

### 1. Enhanced Context Provision

```javascript
// Send top 3 similar responses instead of just one
const topMatches = matches.slice(0, 3);
let contextResponses = topMatches.map((match, idx) => 
  `דוגמה ${idx + 1} (רלוונטיות: ${match.similarity.toFixed(2)}):\n${match.response_text}`
).join('\n\n');
```

### 2. Improved Prompt Structure

```javascript
const improvedSystemPrompt = `
אתה נציג מחלקת תחבורה ציבורית בעיריית ירושלים.

הנחיות תגובה:
- ענה בעברית תקנית, מקצועית ואדיבה
- התבסס על מידע מתשובות קודמות אך נסח באופן טבעי וחדש
- כלול פרטים ספציפיים (מספרי קווים, מיקומים, זמנים) כשרלוונטי
- שמור על טון עקבי ומועיל

מבנה תשובה מומלץ:
1. פתיחה מנומסת
2. התייחסות ישירה לבעיה שהועלתה
3. מידע או פתרון קונקרטי
4. סיום מתאים (עם/בלי חתימה לפי ההנחיות)
`;
```

### 3. Better Historical Data Integration

```javascript
// Include inquiry-response pairs for better context
const historicalContext = topMatches.map(match => ({
  inquiry: match.inquiry_text,
  response: match.response_text,
  relevance: match.similarity
}));
```

### 4. Response Validation

```javascript
// Validate GPT response before returning
function validateGPTResponse(response) {
  // Check minimum length
  if (response.length < 50) return false;
  
  // Check for Hebrew content
  if (!/[\u0590-\u05FF]/.test(response)) return false;
  
  // Check for hallucinations (bus lines that don't exist)
  const mentionedLines = response.match(/קו \d+/g);
  if (mentionedLines && !validateBusLines(mentionedLines)) return false;
  
  return true;
}
```

### 5. Implement Response Caching

```javascript
// Cache GPT responses for similar queries
const responseCache = new Map();

function getCachedOrGenerate(inquiry, historicalResponse) {
  const cacheKey = generateCacheKey(inquiry);
  
  if (responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey);
  }
  
  const response = await generateFinalResponse(inquiry, historicalResponse);
  responseCache.set(cacheKey, response);
  
  return response;
}
```

### 6. Add Conversation Memory

```javascript
// Store conversation context per session
class ConversationContext {
  constructor() {
    this.history = [];
    this.userId = generateSessionId();
  }
  
  addInteraction(inquiry, response) {
    this.history.push({ inquiry, response, timestamp: Date.now() });
    // Keep only last 5 interactions
    if (this.history.length > 5) this.history.shift();
  }
  
  getContext() {
    return this.history.map(h => 
      `שאלה קודמת: ${h.inquiry}\nתשובה: ${h.response}`
    ).join('\n\n');
  }
}
```

### 7. Implement A/B Testing

```javascript
// Test different prompt strategies
const promptVariants = {
  conservative: "דבק קרוב למידע הקיים...",
  creative: "השתמש במידע כהשראה...",
  balanced: "שלב בין דיוק לבין נימה אישית..."
};

function selectPromptVariant() {
  // Randomly select or based on user preference
  return promptVariants[Math.random() > 0.5 ? 'conservative' : 'creative'];
}
```

## Monitoring & Analytics Recommendations

### 1. Log GPT Interactions
```javascript
const gptLogger = {
  logRequest: (inquiry, historicalResponse, gptResponse) => {
    const log = {
      timestamp: new Date().toISOString(),
      inquiry,
      hadHistoricalContext: !!historicalResponse,
      responseLength: gptResponse.length,
      responseTime: Date.now() - startTime
    };
    // Save to database or file
  }
};
```

### 2. Track Response Quality
- User satisfaction ratings
- Response accuracy metrics
- Signature compliance rate
- Error/fallback frequency

### 3. Cost Optimization
- Monitor token usage per request
- Implement response length optimization
- Consider GPT-3.5 vs GPT-4 based on query complexity

## Security Considerations

1. **Input Sanitization**: Clean user input before sending to GPT
2. **Output Validation**: Ensure GPT doesn't generate inappropriate content
3. **Rate Limiting**: Implement per-user request limits
4. **API Key Management**: Rotate keys regularly, use environment variables

## Conclusion

The current implementation provides a functional integration with GPT for enhancing municipal responses. However, there's significant room for improvement in context provision, prompt engineering, and response quality monitoring. The recommended improvements would create a more robust, efficient, and user-friendly system.