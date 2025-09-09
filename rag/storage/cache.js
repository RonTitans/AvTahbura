/**
 * In-Memory Cache Manager for Index Pack
 * Handles TTL-based caching for serverless environment
 */

export class IndexPackCache {
  constructor(ttlSeconds = 300) { // 5 minutes default
    this.cache = null;
    this.etag = null;
    this.loadedAt = null;
    this.ttl = ttlSeconds * 1000; // Convert to milliseconds
    this.stats = {
      hits: 0,
      misses: 0,
      refreshes: 0
    };
  }
  
  /**
   * Check if cache is valid
   * @returns {boolean} Whether cache is still valid
   */
  isValid() {
    if (!this.cache || !this.loadedAt) {
      return false;
    }
    
    const now = Date.now();
    const age = now - this.loadedAt;
    return age < this.ttl;
  }
  
  /**
   * Get cached Index Pack
   * @returns {object|null} Cached pack or null if invalid
   */
  get() {
    if (this.isValid()) {
      this.stats.hits++;
      console.log(`✅ Cache hit (age: ${this.getAge()}ms)`);
      return this.cache;
    }
    
    this.stats.misses++;
    console.log('❌ Cache miss or expired');
    return null;
  }
  
  /**
   * Set cache with new Index Pack
   * @param {object} indexPack - Index pack to cache
   * @param {string} etag - ETag for version tracking
   */
  set(indexPack, etag) {
    this.cache = indexPack;
    this.etag = etag;
    this.loadedAt = Date.now();
    this.stats.refreshes++;
    console.log(`✅ Cache updated (TTL: ${this.ttl}ms)`);
  }
  
  /**
   * Clear cache
   */
  clear() {
    this.cache = null;
    this.etag = null;
    this.loadedAt = null;
    console.log('🗑️ Cache cleared');
  }
  
  /**
   * Get cache age in milliseconds
   * @returns {number} Age in milliseconds
   */
  getAge() {
    if (!this.loadedAt) return -1;
    return Date.now() - this.loadedAt;
  }
  
  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      isValid: this.isValid(),
      age: this.getAge(),
      ttl: this.ttl,
      etag: this.etag,
      size: this.cache ? JSON.stringify(this.cache).length : 0
    };
  }
  
  /**
   * Update TTL
   * @param {number} seconds - New TTL in seconds
   */
  setTTL(seconds) {
    this.ttl = seconds * 1000;
    console.log(`⚙️ Cache TTL updated to ${seconds} seconds`);
  }
}

// Global singleton instance for serverless environment
let cacheInstance = null;

/**
 * Get or create cache instance
 * @param {number} ttlSeconds - TTL in seconds
 * @returns {IndexPackCache} Cache instance
 */
export function getCache(ttlSeconds = 300) {
  if (!cacheInstance) {
    cacheInstance = new IndexPackCache(ttlSeconds);
  }
  return cacheInstance;
}

/**
 * Memory usage estimator for Index Pack
 * @param {object} indexPack - Index pack to estimate
 * @returns {object} Memory usage breakdown
 */
export function estimateMemoryUsage(indexPack) {
  const usage = {
    metadata: 0,
    vectors: 0,
    indices: 0,
    documents: 0,
    total: 0
  };
  
  if (indexPack.metadata) {
    usage.metadata = JSON.stringify(indexPack.metadata).length;
  }
  
  if (indexPack.vectors && Array.isArray(indexPack.vectors)) {
    // Each vector is array of floats (4 bytes each)
    const dimensions = indexPack.vectors[0]?.length || 1536;
    usage.vectors = indexPack.vectors.length * dimensions * 4;
  }
  
  if (indexPack.indices) {
    usage.indices = JSON.stringify(indexPack.indices).length;
  }
  
  if (indexPack.documents) {
    usage.documents = JSON.stringify(indexPack.documents).length;
  }
  
  usage.total = usage.metadata + usage.vectors + usage.indices + usage.documents;
  
  // Convert to MB for readability
  return {
    metadata: (usage.metadata / 1024 / 1024).toFixed(2) + ' MB',
    vectors: (usage.vectors / 1024 / 1024).toFixed(2) + ' MB',
    indices: (usage.indices / 1024 / 1024).toFixed(2) + ' MB',
    documents: (usage.documents / 1024 / 1024).toFixed(2) + ' MB',
    total: (usage.total / 1024 / 1024).toFixed(2) + ' MB'
  };
}

/**
 * Middleware to ensure Index Pack is loaded
 * @param {object} blobStorage - Blob storage module
 * @returns {function} Express middleware
 */
export function ensureIndexPack(blobStorage) {
  return async (req, res, next) => {
    const cache = getCache();
    let indexPack = cache.get();
    
    if (!indexPack) {
      console.log('🔄 Loading Index Pack from Blob storage...');
      try {
        const downloaded = await blobStorage.downloadIndexPack(cache.etag);
        
        if (downloaded && !downloaded.unchanged) {
          cache.set(downloaded, downloaded.etag);
          indexPack = downloaded;
          console.log('✅ Index Pack loaded and cached');
        } else if (downloaded && downloaded.unchanged && cache.cache) {
          // ETag matched, extend cache TTL
          cache.loadedAt = Date.now();
          indexPack = cache.cache;
          console.log('✅ Index Pack unchanged, cache TTL extended');
        } else {
          console.warn('⚠️ No Index Pack available');
          return res.status(503).json({
            error: 'Index Pack not available',
            message: 'Please run /api/refresh to build the index'
          });
        }
      } catch (error) {
        console.error('❌ Error loading Index Pack:', error);
        return res.status(500).json({
          error: 'Failed to load Index Pack',
          message: error.message
        });
      }
    }
    
    // Attach to request for downstream use
    req.indexPack = indexPack;
    req.cacheStats = cache.getStats();
    next();
  };
}

// Default export for convenience
export default {
  IndexPackCache,
  getCache,
  estimateMemoryUsage,
  ensureIndexPack
};