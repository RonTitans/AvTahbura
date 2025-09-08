/**
 * /api/recommend - Main RAG search endpoint
 * Replaces the old /smart-search endpoint with enhanced hybrid retrieval
 */

const { getCache, ensureIndexPack } = require('../rag/storage/cache');
const { downloadIndexPack } = require('../rag/storage/blob');
const { hybridRetrieve } = require('../rag/core/retriever');
const { shouldSkipLLM, formatDirectResponse, prepareSnippets } = require('../rag/llm/gating');
const { synthesizeResponse, formatMatchReasons } = require('../rag/llm/synthesis');
const OpenAI = require('openai');

// Initialize OpenAI if available
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

// Metrics tracking
const metrics = {
  total: 0,
  llmCalls: 0,
  llmSkipped: 0,
  exactMatches: 0,
  heuristicMatches: 0,
  vectorMatches: 0,
  errors: 0,
  avgLatency: 0
};

/**
 * Main recommendation endpoint handler
 */
async function recommendHandler(req, res) {
  const startTime = Date.now();
  metrics.total++;
  
  try {
    // Get query from request
    const { query, inquiry_text } = req.body;
    const searchQuery = query || inquiry_text;
    
    if (!searchQuery) {
      return res.status(400).json({
        success: false,
        error: 'Missing query parameter'
      });
    }
    
    console.log(`\n🔍 RAG Search: "${searchQuery}"`);
    
    // Ensure Index Pack is loaded
    const cache = getCache();
    let indexPack = cache.get();
    
    if (!indexPack) {
      console.log('📦 Loading Index Pack...');
      const downloaded = await downloadIndexPack(cache.etag);
      
      if (!downloaded || downloaded.unchanged) {
        return res.status(503).json({
          success: false,
          error: 'Index not available',
          message: 'Please run /api/refresh to build the index'
        });
      }
      
      cache.set(downloaded, downloaded.etag);
      indexPack = downloaded;
    }
    
    // Perform hybrid retrieval
    const retrievalResult = await hybridRetrieve(
      searchQuery, 
      indexPack, 
      openai,
      { maxResults: 5 }
    );
    
    // Update metrics based on retrieval method
    if (retrievalResult.method === 'exact') metrics.exactMatches++;
    else if (retrievalResult.method === 'heuristic') metrics.heuristicMatches++;
    else if (retrievalResult.method === 'vector') metrics.vectorMatches++;
    
    // Check if we can skip LLM
    const gatingDecision = shouldSkipLLM(retrievalResult);
    
    let response;
    
    if (gatingDecision.skip) {
      // Skip LLM - return direct result
      console.log(`✅ Skipping LLM (${gatingDecision.reason})`);
      metrics.llmSkipped++;
      
      response = formatDirectResponse(
        retrievalResult.results[0], 
        gatingDecision
      );
    } else {
      // Use LLM for synthesis
      console.log('🤖 Using LLM for synthesis...');
      metrics.llmCalls++;
      
      if (!openai) {
        // No OpenAI available, use best result
        response = formatDirectResponse(
          retrievalResult.results[0],
          { confidence: 0.6, reason: 'no_openai' }
        );
        response.note = 'OpenAI not configured - showing best match';
      } else {
        response = await synthesizeResponse(
          searchQuery,
          retrievalResult,
          openai
        );
      }
    }
    
    // Add match reasons
    response.matchReasons = formatMatchReasons(
      retrievalResult.queryAnalysis,
      retrievalResult.results
    );
    
    // Add metadata
    response.success = true;
    response.inquiry = searchQuery;
    response.retrievalMethod = retrievalResult.method;
    response.timing = Date.now() - startTime;
    
    // Update average latency
    metrics.avgLatency = (metrics.avgLatency * (metrics.total - 1) + response.timing) / metrics.total;
    
    console.log(`✅ Response generated in ${response.timing}ms (${response.method})`);
    
    // Format response to match existing API structure
    const formattedResponse = {
      success: true,
      inquiry: searchQuery,
      answer: response.answer,
      confidence: response.confidence,
      sources: response.sources || [],
      source_rows: response.sources?.map(s => s.rowNumber) || [],
      method: response.method || 'hybrid_rag',
      candidates_evaluated: retrievalResult.results.length,
      search_info: {
        retrieval_method: retrievalResult.method,
        llm_used: !gatingDecision.skip,
        skip_reason: gatingDecision.reason,
        timing_ms: response.timing,
        match_reasons: response.matchReasons
      }
    };
    
    // Add semantic completion badge flag
    if (retrievalResult.method === 'vector' || response.method === 'llm_synthesis') {
      formattedResponse.semantic_completion = true;
    }
    
    res.json(formattedResponse);
    
  } catch (error) {
    console.error('❌ Error in /api/recommend:', error);
    metrics.errors++;
    
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error.message,
      fallback_suggestion: 'Please try a simpler query'
    });
  }
}

/**
 * Get current metrics
 */
function getMetrics() {
  return {
    ...metrics,
    llmSkipRate: metrics.total > 0 ? (metrics.llmSkipped / metrics.total) : 0,
    errorRate: metrics.total > 0 ? (metrics.errors / metrics.total) : 0
  };
}

module.exports = {
  recommendHandler,
  getMetrics
};