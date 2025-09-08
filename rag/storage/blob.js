/**
 * Vercel Blob Storage Integration for Index Pack Management
 * Handles upload, download, and versioning of RAG index packs
 */

const { put, head, list, del } = require('@vercel/blob');
const crypto = require('crypto');

const INDEX_PACK_PREFIX = 'rag-packs/';
const METADATA_FILE = 'meta.json';
const VECTORS_FILE = 'vectors.bin';
const INDICES_FILE = 'indices.json';

/**
 * Generate ETag for content versioning
 * @param {Buffer|string} content - Content to hash
 * @returns {string} ETag hash
 */
function generateETag(content) {
  const hash = crypto.createHash('md5');
  if (Buffer.isBuffer(content)) {
    hash.update(content);
  } else {
    hash.update(JSON.stringify(content));
  }
  return hash.digest('hex');
}

/**
 * Upload Index Pack to Vercel Blob
 * @param {object} indexPack - The index pack to upload
 * @returns {object} Upload result with URLs and ETags
 */
async function uploadIndexPack(indexPack) {
  const timestamp = new Date().toISOString();
  const results = {};
  
  try {
    // Prepare metadata
    const metadata = {
      version: indexPack.version || '1.0.0',
      timestamp: timestamp,
      rowCount: indexPack.rowCount || 0,
      embeddingModel: indexPack.embeddingModel || 'text-embedding-3-small',
      embeddingDimensions: indexPack.embeddingDimensions || 1536,
      createdAt: timestamp,
      stats: indexPack.stats || {}
    };
    
    // Upload metadata
    const metaBlob = await put(
      `${INDEX_PACK_PREFIX}${METADATA_FILE}`,
      JSON.stringify(metadata, null, 2),
      {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false
      }
    );
    results.metadata = {
      url: metaBlob.url,
      etag: generateETag(metadata)
    };
    
    // Upload vectors as binary if they exist
    if (indexPack.vectors) {
      let vectorBuffer;
      if (Buffer.isBuffer(indexPack.vectors)) {
        vectorBuffer = indexPack.vectors;
      } else {
        // Convert array of vectors to binary buffer
        const floatArray = new Float32Array(indexPack.vectors.flat());
        vectorBuffer = Buffer.from(floatArray.buffer);
      }
      
      const vectorBlob = await put(
        `${INDEX_PACK_PREFIX}${VECTORS_FILE}`,
        vectorBuffer,
        {
          access: 'public',
          contentType: 'application/octet-stream',
          addRandomSuffix: false
        }
      );
      results.vectors = {
        url: vectorBlob.url,
        etag: generateETag(vectorBuffer),
        size: vectorBuffer.length
      };
    }
    
    // Upload indices (inverted maps)
    if (indexPack.indices) {
      const indicesBlob = await put(
        `${INDEX_PACK_PREFIX}${INDICES_FILE}`,
        JSON.stringify(indexPack.indices),
        {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false
        }
      );
      results.indices = {
        url: indicesBlob.url,
        etag: generateETag(indexPack.indices)
      };
    }
    
    // Upload raw documents if provided
    if (indexPack.documents) {
      const docsBlob = await put(
        `${INDEX_PACK_PREFIX}documents.json`,
        JSON.stringify(indexPack.documents),
        {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false
        }
      );
      results.documents = {
        url: docsBlob.url,
        etag: generateETag(indexPack.documents)
      };
    }
    
    console.log(`✅ Index Pack uploaded successfully to Vercel Blob`);
    return {
      success: true,
      timestamp: timestamp,
      urls: results,
      packETag: generateETag(JSON.stringify(results))
    };
    
  } catch (error) {
    console.error('❌ Error uploading Index Pack:', error);
    throw new Error(`Failed to upload Index Pack: ${error.message}`);
  }
}

/**
 * Download Index Pack from Vercel Blob
 * @param {string} etag - Optional ETag to check for changes
 * @returns {object} Downloaded index pack or null if unchanged
 */
async function downloadIndexPack(etag = null) {
  try {
    // Check metadata first
    const metaResponse = await fetch(`${process.env.BLOB_URL || ''}/${INDEX_PACK_PREFIX}${METADATA_FILE}`);
    if (!metaResponse.ok) {
      console.log('⚠️ No Index Pack found in Blob storage');
      return null;
    }
    
    const metadata = await metaResponse.json();
    const currentETag = generateETag(metadata);
    
    // Check if pack has changed
    if (etag && etag === currentETag) {
      console.log('✅ Index Pack unchanged (ETag match)');
      return { unchanged: true, etag: currentETag };
    }
    
    const indexPack = { metadata, etag: currentETag };
    
    // Download vectors
    try {
      const vectorResponse = await fetch(`${process.env.BLOB_URL || ''}/${INDEX_PACK_PREFIX}${VECTORS_FILE}`);
      if (vectorResponse.ok) {
        const vectorBuffer = await vectorResponse.arrayBuffer();
        const floatArray = new Float32Array(vectorBuffer);
        
        // Reshape vectors based on dimensions
        const dimensions = metadata.embeddingDimensions || 1536;
        const numVectors = floatArray.length / dimensions;
        indexPack.vectors = [];
        
        for (let i = 0; i < numVectors; i++) {
          const start = i * dimensions;
          const end = start + dimensions;
          indexPack.vectors.push(Array.from(floatArray.slice(start, end)));
        }
        
        console.log(`✅ Loaded ${numVectors} vectors from Blob`);
      }
    } catch (err) {
      console.warn('⚠️ Vectors not found or error loading:', err.message);
    }
    
    // Download indices
    try {
      const indicesResponse = await fetch(`${process.env.BLOB_URL || ''}/${INDEX_PACK_PREFIX}${INDICES_FILE}`);
      if (indicesResponse.ok) {
        indexPack.indices = await indicesResponse.json();
        console.log('✅ Loaded indices from Blob');
      }
    } catch (err) {
      console.warn('⚠️ Indices not found or error loading:', err.message);
    }
    
    // Download documents
    try {
      const docsResponse = await fetch(`${process.env.BLOB_URL || ''}/${INDEX_PACK_PREFIX}documents.json`);
      if (docsResponse.ok) {
        indexPack.documents = await docsResponse.json();
        console.log(`✅ Loaded ${indexPack.documents.length} documents from Blob`);
      }
    } catch (err) {
      console.warn('⚠️ Documents not found or error loading:', err.message);
    }
    
    return indexPack;
    
  } catch (error) {
    console.error('❌ Error downloading Index Pack:', error);
    throw new Error(`Failed to download Index Pack: ${error.message}`);
  }
}

/**
 * Check if Index Pack exists and get metadata
 * @returns {object} Pack metadata or null
 */
async function checkIndexPack() {
  try {
    const response = await head(`${INDEX_PACK_PREFIX}${METADATA_FILE}`);
    if (response) {
      // Try to get metadata
      const metaResponse = await fetch(response.url);
      if (metaResponse.ok) {
        const metadata = await metaResponse.json();
        return {
          exists: true,
          metadata: metadata,
          etag: generateETag(metadata),
          url: response.url
        };
      }
    }
    return { exists: false };
  } catch (error) {
    console.log('⚠️ Index Pack not found in Blob storage');
    return { exists: false };
  }
}

/**
 * Delete Index Pack from Blob storage
 * @returns {boolean} Success status
 */
async function deleteIndexPack() {
  try {
    const files = [
      `${INDEX_PACK_PREFIX}${METADATA_FILE}`,
      `${INDEX_PACK_PREFIX}${VECTORS_FILE}`,
      `${INDEX_PACK_PREFIX}${INDICES_FILE}`,
      `${INDEX_PACK_PREFIX}documents.json`
    ];
    
    const deletePromises = files.map(file => 
      del(file).catch(err => console.warn(`Could not delete ${file}:`, err.message))
    );
    
    await Promise.all(deletePromises);
    console.log('✅ Index Pack deleted from Blob storage');
    return true;
  } catch (error) {
    console.error('❌ Error deleting Index Pack:', error);
    return false;
  }
}

/**
 * List all Index Packs in storage
 * @returns {array} List of pack metadata
 */
async function listIndexPacks() {
  try {
    const { blobs } = await list({ prefix: INDEX_PACK_PREFIX });
    const packs = [];
    
    for (const blob of blobs) {
      if (blob.pathname.endsWith(METADATA_FILE)) {
        try {
          const response = await fetch(blob.url);
          if (response.ok) {
            const metadata = await response.json();
            packs.push({
              ...metadata,
              url: blob.url,
              size: blob.size,
              uploadedAt: blob.uploadedAt
            });
          }
        } catch (err) {
          console.warn(`Could not read pack metadata from ${blob.url}:`, err.message);
        }
      }
    }
    
    return packs.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
  } catch (error) {
    console.error('❌ Error listing Index Packs:', error);
    return [];
  }
}

module.exports = {
  uploadIndexPack,
  downloadIndexPack,
  checkIndexPack,
  deleteIndexPack,
  listIndexPacks,
  generateETag
};