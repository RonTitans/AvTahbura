/**
 * /api/status - System health and metrics endpoint
 * Shows Index Pack info, cache status, and performance metrics
 */

const { getCache, estimateMemoryUsage } = require('../rag/storage/cache');
const { checkIndexPack } = require('../rag/storage/blob');
const { getMetrics } = require('./recommend');

/**
 * Main status handler
 */
async function statusHandler(req, res) {
  try {
    // Get cache status
    const cache = getCache();
    const cacheStats = cache.getStats();
    const indexPack = cache.get();
    
    // Get blob status
    const blobStatus = await checkIndexPack();
    
    // Get search metrics
    const searchMetrics = getMetrics();
    
    // Calculate memory usage if pack is loaded
    let memoryUsage = null;
    if (indexPack) {
      memoryUsage = estimateMemoryUsage(indexPack);
    }
    
    // Build status response
    const status = {
      success: true,
      timestamp: new Date().toISOString(),
      
      // System status
      system: {
        environment: process.env.NODE_ENV || 'production',
        node_version: process.version,
        uptime: process.uptime(),
        memory_usage: {
          rss: (process.memoryUsage().rss / 1024 / 1024).toFixed(2) + ' MB',
          heap_used: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB',
          heap_total: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2) + ' MB'
        }
      },
      
      // Index Pack status
      index_pack: {
        exists: blobStatus.exists,
        loaded_in_cache: !!indexPack,
        version: indexPack?.version || blobStatus.metadata?.version || null,
        created_at: indexPack?.timestamp || blobStatus.metadata?.createdAt || null,
        row_count: indexPack?.rowCount || blobStatus.metadata?.rowCount || 0,
        document_count: indexPack?.documents?.length || 0,
        embeddings_count: indexPack?.vectors?.filter(v => v !== null).length || 0,
        etag: cacheStats.etag || blobStatus.etag || null,
        memory_usage: memoryUsage
      },
      
      // Cache status
      cache: {
        is_valid: cacheStats.isValid,
        age_ms: cacheStats.age,
        ttl_ms: cacheStats.ttl,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        refreshes: cacheStats.refreshes,
        hit_rate: cacheStats.hits + cacheStats.misses > 0 ? 
          (cacheStats.hits / (cacheStats.hits + cacheStats.misses)) : 0
      },
      
      // Search metrics
      search_metrics: {
        total_searches: searchMetrics.total,
        llm_calls: searchMetrics.llmCalls,
        llm_skipped: searchMetrics.llmSkipped,
        llm_skip_rate: searchMetrics.llmSkipRate,
        exact_matches: searchMetrics.exactMatches,
        heuristic_matches: searchMetrics.heuristicMatches,
        vector_matches: searchMetrics.vectorMatches,
        errors: searchMetrics.errors,
        error_rate: searchMetrics.errorRate,
        avg_latency_ms: Math.round(searchMetrics.avgLatency)
      },
      
      // Feature flags
      features: {
        openai_configured: !!process.env.OPENAI_API_KEY,
        embeddings_enabled: !!process.env.OPENAI_API_KEY,
        llm_gating_enabled: process.env.ENABLE_LLM_GATING !== 'false',
        exact_match_threshold: parseFloat(process.env.EXACT_MATCH_THRESHOLD || '0.85'),
        embed_model: process.env.EMBED_MODEL || 'text-embedding-3-small',
        synthesis_model: process.env.SYNTHESIS_MODEL || 'gpt-4-turbo-preview'
      },
      
      // Data source
      data_source: {
        type: process.env.DATA_SOURCE || 'GOOGLE_SHEET',
        spreadsheet_id: process.env.SPREADSHEET_ID || '1m59UUY2ZvDg4xQjRbReF-npJy_k63wxd2pUt8HBIOn8',
        credentials_configured: !!process.env.GOOGLE_APPLICATION_CREDENTIALS
      }
    };
    
    // Add index details if loaded
    if (indexPack && indexPack.stats) {
      status.index_pack.stats = {
        build_time_ms: indexPack.stats.buildTime,
        changed_rows: indexPack.stats.changedRows,
        with_bus_lines: indexPack.stats.withBusLines,
        with_locations: indexPack.stats.withLocations,
        with_operators: indexPack.stats.withOperators,
        index_sizes: indexPack.stats.indexSizes
      };
    }
    
    res.json(status);
    
  } catch (error) {
    console.error('❌ Error in /api/status:', error);
    
    res.status(500).json({
      success: false,
      error: 'Status check failed',
      message: error.message
    });
  }
}

/**
 * Health check endpoint (minimal)
 */
function healthHandler(req, res) {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  statusHandler,
  healthHandler
};