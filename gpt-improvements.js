// GPT Improvements Module - Production Version
import OpenAI from 'openai';

// Response Cache
class ResponseCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 100;
    this.hits = 0;
    this.misses = 0;
  }

  set(key, value) {
    // Implement LRU cache
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      response: value,
      timestamp: new Date().toISOString(),
      accessCount: 0
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (item) {
      item.accessCount++;
      this.hits++;
      return item.response;
    }
    this.misses++;
    return null;
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits > 0 ? (this.hits / (this.hits + this.misses)) : 0
    };
  }
}

// Analytics Tracker
class AnalyticsTracker {
  constructor() {
    this.queries = [];
    this.responses = [];
    this.errors = [];
    this.startTime = new Date();
  }

  trackQuery(query, type) {
    this.queries.push({
      query,
      type,
      timestamp: new Date().toISOString()
    });
  }

  trackResponse(response, duration) {
    this.responses.push({
      success: true,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  trackError(error) {
    this.errors.push({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }

  getReport() {
    const now = new Date();
    const uptime = (now - this.startTime) / 1000; // in seconds
    
    return {
      uptime,
      totalQueries: this.queries.length,
      totalResponses: this.responses.length,
      totalErrors: this.errors.length,
      averageResponseTime: this.responses.length > 0
        ? this.responses.reduce((sum, r) => sum + r.duration, 0) / this.responses.length
        : 0,
      recentQueries: this.queries.slice(-10),
      recentErrors: this.errors.slice(-5)
    };
  }
}

// Conversation Context
class ConversationContext {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.messages = [];
    this.metadata = {
      startTime: new Date().toISOString(),
      queryCount: 0,
      lastActivity: new Date().toISOString()
    };
  }

  addMessage(role, content) {
    this.messages.push({
      role,
      content,
      timestamp: new Date().toISOString()
    });
    this.metadata.queryCount++;
    this.metadata.lastActivity = new Date().toISOString();
  }

  getContext() {
    return this.messages.slice(-10); // Keep last 10 messages for context
  }

  clear() {
    this.messages = [];
    this.metadata.queryCount = 0;
  }
}

// Sessions Map
const sessions = new Map();

// Enhanced Response Generator
async function generateEnhancedFinalResponse(
  openai,
  originalResponse,
  userQuery,
  historicalDataFunc,
  sessionContext,
  additionalContext = {}
) {
  try {
    // If response is already good enough, return it
    if (originalResponse && originalResponse.length > 500) {
      return originalResponse;
    }

    // Get historical data for context
    const historicalData = await historicalDataFunc(userQuery);
    
    // Build enhanced prompt
    const enhancedPrompt = `
      Original Query: ${userQuery}
      
      Initial Response: ${originalResponse}
      
      Historical Context: ${historicalData ? JSON.stringify(historicalData).slice(0, 1000) : 'None available'}
      
      Please provide a comprehensive and enhanced response that:
      1. Addresses the user's query thoroughly
      2. Includes relevant historical context if available
      3. Provides actionable insights
      4. Is well-structured and professional
      
      Enhanced Response:
    `;

    // Generate enhanced response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { 
          role: 'system', 
          content: 'You are a helpful Jerusalem Municipality assistant providing detailed and accurate information.'
        },
        { 
          role: 'user', 
          content: enhancedPrompt 
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const enhancedResponse = completion.choices[0]?.message?.content || originalResponse;
    
    // Track in analytics
    if (additionalContext.analytics) {
      additionalContext.analytics.trackResponse(enhancedResponse, Date.now());
    }

    return enhancedResponse;

  } catch (error) {
    console.error('Error generating enhanced response:', error);
    // Return original response if enhancement fails
    return originalResponse;
  }
}

// Initialize function
function initializeGPTImprovements(openaiClient, historicalDataFunc) {
  console.log('✅ GPT Improvements module initialized');
  // Store references if needed
  return {
    responseCache,
    analytics,
    sessions
  };
}

// Create instances
const responseCache = new ResponseCache();
const analytics = new AnalyticsTracker();

// Export everything
export {
  generateEnhancedFinalResponse,
  responseCache,
  analytics,
  sessions,
  ConversationContext,
  initializeGPTImprovements
};