/**
 * /api/status - System health and metrics endpoint
 * Shows Index Pack info, cache status, and performance metrics
 */

import { getCache, estimateMemoryUsage } from '../rag/storage/cache.js';
import { checkIndexPack } from '../rag/storage/blob.js';
import { getMetrics } from './rag-recommend.js';

/**
 * Main status handler
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed. Use GET.' 
    });
  }

  try {
    // Get cache statistics
    const cache = getCache();
    const cacheStats = cache.getStats();
    const indexPack = cache.get();
    
    // Get performance metrics from recommend endpoint
    const metrics = getMetrics();
    
    // Check Blob storage status
    let blobStatus = { exists: false };
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        blobStatus = await checkIndexPack();
      } catch (error) {
        blobStatus = { 
          exists: false, 
          error: error.message 
        };
      }
    } else {
      blobStatus = { 
        exists: false, 
        error: 'BLOB_READ_WRITE_TOKEN not configured' 
      };
    }
    
    // Calculate pack info if loaded
    let packInfo = null;
    if (indexPack) {
      packInfo = {
        version: indexPack.version || 'unknown',
        timestamp: indexPack.timestamp || null,
        rowCount: indexPack.rowCount || 0,
        documentCount: indexPack.documents?.length || 0,
        hasVectors: !!indexPack.vectors && indexPack.vectors.length > 0,
        vectorCount: indexPack.vectors?.filter(v => v !== null).length || 0,
        embeddingModel: indexPack.embeddingModel || 'unknown',
        indexSizes: indexPack.stats?.indexSizes || {},
        memoryUsage: estimateMemoryUsage(indexPack)
      };
    }
    
    // Build status response
    const status = {
      status: 'operational',
      timestamp: new Date().toISOString(),
      
      // Index Pack status
      indexPack: {
        loaded: !!indexPack,
        ...packInfo,
        refreshedAt: indexPack?.timestamp || null,
        packEtag: cacheStats.etag || null,
        cacheAge: cacheStats.age,
        cacheTTL: cacheStats.ttl,
        cacheValid: cacheStats.isValid
      },
      
      // Blob storage status
      blobStorage: {
        configured: !!process.env.BLOB_READ_WRITE_TOKEN,
        ...blobStatus
      },
      
      // Performance metrics
      metrics: {
        totalSearches: metrics.total,
        llmCalls: metrics.llmCalls,
        llmSkipped: metrics.llmSkipped,
        llmSkipRate: metrics.llmSkipRate,
        errorRate: metrics.errorRate,
        avgLatency: Math.round(metrics.avgLatency),
        
        // Breakdown by retrieval method
        retrievalMethods: {
          exact: metrics.exactMatches,
          heuristic: metrics.heuristicMatches,
          vector: metrics.vectorMatches
        },
        
        // Cache performance
        cache: {
          hits: cacheStats.hits,
          misses: cacheStats.misses,
          refreshes: cacheStats.refreshes,
          hitRate: cacheStats.hits > 0 ? 
            (cacheStats.hits / (cacheStats.hits + cacheStats.misses)) : 0
        },
        
        // Metrics window
        lastReset: metrics.lastReset
      },
      
      // Environment configuration status
      configuration: {
        openai: {
          configured: !!process.env.OPENAI_API_KEY,
          embedModel: process.env.EMBED_MODEL || 'text-embedding-3-small',
          synthesisModel: process.env.SYNTHESIS_MODEL || 'gpt-4-turbo-preview'
        },
        googleSheets: {
          configured: !!(process.env.GOOGLE_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS),
          spreadsheetId: process.env.SPREADSHEET_ID ? 'configured' : 'missing'
        },
        blob: {
          configured: !!process.env.BLOB_READ_WRITE_TOKEN,
          prefix: process.env.INDEX_PACK_PREFIX || 'rag-packs/'
        },
        thresholds: {
          heuristicStrong: parseFloat(process.env.HEURISTIC_STRONG_T || '0.75'),
          exactMatch: parseFloat(process.env.EXACT_MATCH_THRESHOLD || '0.85')
        },
        cache: {
          ttl: parseInt(process.env.INDEX_PACK_TTL || '300')
        }
      },
      
      // Calculated health indicators
      health: {
        indexReady: !!indexPack && indexPack.documents?.length > 0,
        searchAvailable: !!indexPack || blobStatus.exists,
        llmAvailable: !!process.env.OPENAI_API_KEY,
        refreshAvailable: !!(process.env.GOOGLE_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS),
        
        // Performance indicators
        performanceGood: metrics.avgLatency < 5000 && metrics.errorRate < 0.1,
        llmOptimized: metrics.llmSkipRate > 0.5
      }
    };
    
    // Determine overall status
    if (!status.health.indexReady && !status.health.searchAvailable) {
      status.status = 'degraded';
      status.message = 'Search index not available. Run /api/refresh to initialize.';
    } else if (metrics.errorRate > 0.5) {
      status.status = 'degraded';
      status.message = 'High error rate detected.';
    } else if (!status.health.llmAvailable) {
      status.status = 'partial';
      status.message = 'Running without LLM synthesis.';
    }
    
    // Add recommendations if needed
    const recommendations = [];
    
    if (!indexPack && !blobStatus.exists) {
      recommendations.push('Run POST /api/refresh to build the search index');
    }
    
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      recommendations.push('Configure BLOB_READ_WRITE_TOKEN for persistent storage');
    }
    
    if (!process.env.OPENAI_API_KEY) {
      recommendations.push('Configure OPENAI_API_KEY for enhanced search with LLM');
    }
    
    if (metrics.llmSkipRate < 0.3 && metrics.total > 10) {
      recommendations.push('Low LLM skip rate - consider tuning heuristic thresholds');
    }
    
    if (recommendations.length > 0) {
      status.recommendations = recommendations;
    }
    
    // Return status
    res.json(status);
    
  } catch (error) {
    console.error('❌ Error in /api/status:', error);
    
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Export configuration for Vercel
export const config = {
  api: {
    bodyParser: false
  }
};