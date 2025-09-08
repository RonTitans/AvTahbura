/**
 * LLM Response Synthesis
 * Generates comprehensive answers from retrieved snippets
 */

/**
 * Create synthesis prompt for GPT-4
 * @param {string} query - User query
 * @param {array} snippets - Prepared snippets
 * @param {object} queryAnalysis - Query analysis results
 * @returns {string} Formatted prompt
 */
function createSynthesisPrompt(query, snippets, queryAnalysis) {
  // Build entity context
  const entityContext = [];
  if (queryAnalysis.entities.busLines.length > 0) {
    entityContext.push(`קווים: ${queryAnalysis.entities.busLines.join(', ')}`);
  }
  if (queryAnalysis.entities.locations.length > 0) {
    entityContext.push(`מיקומים: ${queryAnalysis.entities.locations.join(', ')}`);
  }
  if (queryAnalysis.entities.topic) {
    entityContext.push(`נושא: ${queryAnalysis.entities.topic}`);
  }
  
  const prompt = `אתה מערכת מומחה לתחבורה ציבורית בירושלים. ענה על השאלה בהתבסס על המידע שסופק בלבד.

שאלת המשתמש: "${query}"

${entityContext.length > 0 ? `זוהו: ${entityContext.join(' | ')}` : ''}

מקורות מידע זמינים:
${snippets.map(s => `
[${s.id}] מזהה: ${s.caseId} (שורה ${s.rowNumber})
נושא: ${s.topic || 'כללי'}
תמצית: ${s.summary}
${s.response ? `תשובה: ${s.response}` : ''}
רלוונטיות: ${(s.score * 100).toFixed(0)}%
---`).join('\n')}

הנחיות:
1. בסס את תשובתך רק על המקורות שסופקו
2. אם המידע רלוונטי חלקית - ציין זאת
3. צטט מספרי שורות כמקור: [שורה X]
4. אם המידע חסר או לא ברור - בקש הבהרה ספציפית
5. כתוב תשובה תמציתית בעברית

החזר תשובה בפורמט JSON:
{
  "answer": "התשובה המלאה כאן...",
  "sources": [מספרי שורות],
  "confidence": 0.0-1.0,
  "needs_clarification": false,
  "clarification_request": "אם צריך הבהרה - מה לשאול"
}`;

  return prompt;
}

/**
 * Synthesize response using LLM
 * @param {string} query - User query
 * @param {object} retrievalResult - Retrieval results
 * @param {object} openai - OpenAI client
 * @param {object} options - Synthesis options
 * @returns {object} Synthesized response
 */
async function synthesizeResponse(query, retrievalResult, openai, options = {}) {
  const {
    maxSnippets = 5,
    model = process.env.SYNTHESIS_MODEL || 'gpt-4-turbo-preview',
    temperature = 0.3,
    maxTokens = 800,
    timeout = 15000
  } = options;
  
  const { prepareSnippets } = require('./gating');
  const snippets = prepareSnippets(retrievalResult.results, maxSnippets);
  const prompt = createSynthesisPrompt(query, snippets, retrievalResult.queryAnalysis);
  
  try {
    // Create promise race for timeout
    const synthesisPromise = openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'אתה עוזר מומחה בתחבורה ציבורית בירושלים. תן תשובות מדויקות ומבוססות על המידע שניתן לך. החזר תמיד תשובה בפורמט JSON תקין.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' }
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('LLM timeout')), timeout)
    );
    
    const response = await Promise.race([synthesisPromise, timeoutPromise]);
    const result = JSON.parse(response.choices[0].message.content);
    
    // Format sources
    const sources = (result.sources || []).map(rowNum => {
      const snippet = snippets.find(s => s.rowNumber === rowNum);
      return snippet ? {
        caseId: snippet.caseId,
        rowNumber: snippet.rowNumber,
        relevance: Math.round((snippet.score || 0.5) * 10)
      } : null;
    }).filter(s => s !== null);
    
    return {
      answer: result.answer,
      confidence: result.confidence || 0.8,
      sources: sources,
      method: 'llm_synthesis',
      llmUsed: true,
      needsClarification: result.needs_clarification || false,
      clarificationRequest: result.clarification_request || null,
      snippetsUsed: snippets.length,
      model: model
    };
    
  } catch (error) {
    console.error('❌ LLM synthesis error:', error.message);
    
    // Fallback to best snippet
    const topSnippet = snippets[0];
    if (topSnippet) {
      return {
        answer: topSnippet.response || topSnippet.summary || 'לא נמצאה תשובה מתאימה',
        confidence: 0.6,
        sources: [{
          caseId: topSnippet.caseId,
          rowNumber: topSnippet.rowNumber,
          relevance: Math.round(topSnippet.score * 10)
        }],
        method: 'fallback',
        llmUsed: false,
        error: error.message === 'LLM timeout' ? 'timeout' : 'error',
        errorMessage: error.message === 'LLM timeout' ? 
          'החיפוש החכם נקטע - מציג תוצאה מקורית' : 
          'שגיאה בעיבוד - מציג תוצאה מקורית'
      };
    }
    
    throw error;
  }
}

/**
 * Format match reasons for display
 * @param {object} queryAnalysis - Query analysis
 * @param {array} results - Retrieval results
 * @returns {object} Formatted match reasons
 */
function formatMatchReasons(queryAnalysis, results) {
  const reasons = {
    lines: [],
    locations: [],
    topics: [],
    keywords: []
  };
  
  // Collect matched entities from top results
  const topResults = results.slice(0, 3);
  
  topResults.forEach(result => {
    const doc = result.document;
    
    // Bus lines
    queryAnalysis.entities.busLines.forEach(line => {
      if (doc.entities.busLines.includes(line) && !reasons.lines.includes(line)) {
        reasons.lines.push(line);
      }
    });
    
    // Locations
    queryAnalysis.entities.locations.forEach(loc => {
      if (doc.entities.locations.includes(loc) && !reasons.locations.includes(loc)) {
        reasons.locations.push(loc);
      }
    });
    
    // Topic
    if (doc.entities.topic === queryAnalysis.entities.topic && !reasons.topics.includes(doc.entities.topic)) {
      reasons.topics.push(doc.entities.topic);
    }
  });
  
  // Add top keywords
  reasons.keywords = queryAnalysis.keywords.slice(0, 3);
  
  return reasons;
}

module.exports = {
  createSynthesisPrompt,
  synthesizeResponse,
  formatMatchReasons
};