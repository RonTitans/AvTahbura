/**
 * /api/recommend - Main RAG search endpoint
 * Implements hybrid retrieval with cold start loading and LLM gating
 */

import { getCache } from '../rag/storage/cache.js';
import { downloadIndexPack } from '../rag/storage/blob.js';
import { hybridRetrieve } from '../rag/core/retriever.js';
import { shouldSkipLLM, formatDirectResponse, prepareSnippets } from '../rag/llm/gating.js';
import { synthesizeResponse, formatMatchReasons } from '../rag/llm/synthesis.js';
import OpenAI from 'openai';

// Initialize OpenAI if available
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

// Metrics tracking (module-level for persistence across invocations)
const metrics = {
  total: 0,
  llmCalls: 0,
  llmSkipped: 0,
  exactMatches: 0,
  heuristicMatches: 0,
  vectorMatches: 0,
  errors: 0,
  avgLatency: 0,
  lastReset: new Date().toISOString()
};

/**
 * Main handler for recommend endpoint
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Use POST.' 
    });
  }

  const startTime = Date.now();
  metrics.total++;
  
  try {
    // Get query from request
    const { query, inquiry_text } = req.body;
    const searchQuery = query || inquiry_text;
    
    if (!searchQuery) {
      return res.status(400).json({
        success: false,
        error: 'Missing query parameter',
        hint: 'Provide either "query" or "inquiry_text" in request body'
      });
    }
    
    console.log(`\n🔍 RAG Search: "${searchQuery}"`);
    
    // Cold start: Ensure Index Pack is loaded
    const cache = getCache(parseInt(process.env.INDEX_PACK_TTL || '300'));
    let indexPack = cache.get();
    
    if (!indexPack) {
      console.log('📦 Cold start - loading Index Pack from Blob...');
      
      // Check for required blob token
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(503).json({
          success: false,
          error: 'System not configured',
          message: 'BLOB_READ_WRITE_TOKEN missing. Contact administrator.',
          fallback_suggestion: 'Please try again later'
        });
      }
      
      try {
        const downloaded = await downloadIndexPack(cache.etag);
        
        if (!downloaded || downloaded.unchanged) {
          return res.status(503).json({
            success: false,
            error: 'Index not available',
            message: 'Please run /api/refresh to build the index first',
            fallback_suggestion: 'System is being initialized. Please try again in a few minutes.'
          });
        }
        
        cache.set(downloaded, downloaded.etag);
        indexPack = downloaded;
        console.log(`✅ Index Pack loaded (${indexPack.documents?.length || 0} documents)`);
      } catch (loadError) {
        console.error('❌ Failed to load Index Pack:', loadError);
        return res.status(503).json({
          success: false,
          error: 'Failed to load search index',
          message: loadError.message,
          fallback_suggestion: 'Service temporarily unavailable. Please try again.'
        });
      }
    }
    
    // Perform hybrid retrieval
    const retrievalResult = await hybridRetrieve(
      searchQuery, 
      indexPack, 
      openai,
      { 
        maxResults: 5,
        heuristicThreshold: parseFloat(process.env.HEURISTIC_STRONG_T || '0.75')
      }
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
        response.note = 'מציג תוצאה ללא עיבוד נוסף';
      } else {
        try {
          response = await synthesizeResponse(
            searchQuery,
            retrievalResult,
            openai
          );
        } catch (llmError) {
          console.error('❌ LLM synthesis failed:', llmError);
          // Fallback to best heuristic result
          response = formatDirectResponse(
            retrievalResult.results[0],
            { confidence: 0.7, reason: 'llm_error' }
          );
          response.note = 'מציג תוצאה מבוססת חיפוש';
        }
      }
    }
    
    // Add match reasons in Hebrew
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
    
    console.log(`✅ Response generated in ${response.timing}ms (${response.method || retrievalResult.method})`);
    
    // Format response to match expected API structure
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
    
    // Add semantic completion badge flag if vector/LLM was primary
    if (retrievalResult.method === 'vector' || response.method === 'llm_synthesis') {
      formattedResponse.semantic_completion = true;
    }
    
    // Add note if present
    if (response.note) {
      formattedResponse.note = response.note;
    }
    
    res.json(formattedResponse);
    
  } catch (error) {
    console.error('❌ Error in /api/recommend:', error);
    metrics.errors++;
    
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error.message,
      fallback_suggestion: 'אנא נסו שאילתה פשוטה יותר',
      debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Get current metrics (exported for status endpoint)
 */
export function getMetrics() {
  return {
    ...metrics,
    llmSkipRate: metrics.total > 0 ? (metrics.llmSkipped / metrics.total) : 0,
    errorRate: metrics.total > 0 ? (metrics.errors / metrics.total) : 0,
    cacheStats: getCache().getStats()
  };
}

// Vercel configuration
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    },
    responseLimit: '4mb'
  },
  maxDuration: 30 // 30 seconds for search with LLM
};