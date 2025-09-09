/**
 * /api/pack-selftest - Diagnostic endpoint for Index Pack operations
 * Tests building and uploading a minimal index pack to Blob storage
 * Admin-only endpoint for debugging pack generation
 */

import { put, head, del } from '@vercel/blob';
import crypto from 'crypto';

/**
 * Generate a minimal test index pack
 */
function generateTestPack() {
  const timestamp = new Date().toISOString();
  
  // Create minimal test documents
  const documents = [
    {
      id: 0,
      caseId: 'TEST-001',
      text: 'קו 18 לרמות נוסע כל 10 דקות',
      normalized: 'קו 18 לרמות נוסע כל 10 דקות',
      busLines: ['18'],
      locations: ['רמות']
    },
    {
      id: 1,
      caseId: 'TEST-002',
      text: 'קו 34א עובר בגילה',
      normalized: 'קו 34א עובר בגילה',
      busLines: ['34א'],
      locations: ['גילה']
    }
  ];

  // Create minimal vectors (fake embeddings for testing)
  const vectors = [
    new Array(1536).fill(0.1), // Fake embedding for doc 0
    new Array(1536).fill(0.2)  // Fake embedding for doc 1
  ];

  // Create metadata
  const metadata = {
    version: 'test-1.0.0',
    timestamp: timestamp,
    rowCount: documents.length,
    embeddingModel: 'test-model',
    embeddingDimensions: 1536,
    createdAt: timestamp,
    stats: {
      documents: documents.length,
      vectors: vectors.length
    }
  };

  // Create indices
  const indices = {
    busLines: {
      '18': [0],
      '34א': [1]
    },
    locations: {
      'רמות': [0],
      'גילה': [1]
    },
    caseIds: {
      'TEST-001': 0,
      'TEST-002': 1
    }
  };

  return {
    metadata,
    documents,
    vectors,
    indices
  };
}

/**
 * Main handler for pack self-test
 * @param {Request} req - Incoming request
 * @param {Response} res - Outgoing response
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      ok: false, 
      error: 'Method not allowed. Use POST.' 
    });
  }

  // Check for admin authentication
  const adminToken = req.headers['x-admin-token'] || req.query.admin_token;
  const expectedToken = process.env.ADMIN_TOKEN || 'test-admin-token';
  
  if (adminToken !== expectedToken) {
    return res.status(401).json({ 
      ok: false, 
      error: 'Unauthorized. Admin token required.' 
    });
  }

  // Check if BLOB_READ_WRITE_TOKEN is configured
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: 'BLOB_READ_WRITE_TOKEN not configured',
      hint: 'Add BLOB_READ_WRITE_TOKEN to your Vercel environment variables'
    });
  }

  const testPrefix = (process.env.INDEX_PACK_PREFIX || 'rag-packs/') + 'selftest/';
  const results = {
    ok: false,
    pack: null,
    uploads: {
      metadata: { status: null, size: 0, etag: null, url: null },
      vectors: { status: null, size: 0, etag: null, url: null },
      indices: { status: null, size: 0, etag: null, url: null }
    },
    verifications: {
      metadata: false,
      vectors: false,
      indices: false
    },
    errors: []
  };

  try {
    // Step 1: Generate test pack
    console.log('📦 Generating test index pack...');
    const testPack = generateTestPack();
    results.pack = {
      documentsCount: testPack.documents.length,
      vectorsCount: testPack.vectors.length,
      version: testPack.metadata.version
    };

    // Step 2: Upload metadata
    console.log(`📤 Uploading metadata to ${testPrefix}meta.json...`);
    try {
      const metadataContent = JSON.stringify(testPack.metadata, null, 2);
      const metadataResult = await put(
        `${testPrefix}meta.json`,
        metadataContent,
        {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false
        }
      );
      
      const metadataHash = crypto.createHash('md5')
        .update(metadataContent)
        .digest('hex');
      
      results.uploads.metadata = {
        status: 200,
        size: metadataContent.length,
        etag: metadataHash,
        url: metadataResult.url
      };
      console.log(`✅ Metadata uploaded (${metadataContent.length} bytes)`);
    } catch (error) {
      results.uploads.metadata.status = error.status || 500;
      results.errors.push(`Metadata upload failed: ${error.message}`);
      throw error;
    }

    // Step 3: Upload vectors as binary
    console.log(`📤 Uploading vectors to ${testPrefix}vectors.bin...`);
    try {
      // Convert vectors to Float32Array buffer
      const flatVectors = testPack.vectors.flat();
      const vectorBuffer = Buffer.from(new Float32Array(flatVectors).buffer);
      
      const vectorsResult = await put(
        `${testPrefix}vectors.bin`,
        vectorBuffer,
        {
          access: 'public',
          contentType: 'application/octet-stream',
          addRandomSuffix: false
        }
      );
      
      const vectorsHash = crypto.createHash('md5')
        .update(vectorBuffer)
        .digest('hex');
      
      results.uploads.vectors = {
        status: 200,
        size: vectorBuffer.length,
        etag: vectorsHash,
        url: vectorsResult.url
      };
      console.log(`✅ Vectors uploaded (${vectorBuffer.length} bytes)`);
    } catch (error) {
      results.uploads.vectors.status = error.status || 500;
      results.errors.push(`Vectors upload failed: ${error.message}`);
      throw error;
    }

    // Step 4: Upload indices
    console.log(`📤 Uploading indices to ${testPrefix}indices.json...`);
    try {
      const indicesContent = JSON.stringify(testPack.indices);
      const indicesResult = await put(
        `${testPrefix}indices.json`,
        indicesContent,
        {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false
        }
      );
      
      const indicesHash = crypto.createHash('md5')
        .update(indicesContent)
        .digest('hex');
      
      results.uploads.indices = {
        status: 200,
        size: indicesContent.length,
        etag: indicesHash,
        url: indicesResult.url
      };
      console.log(`✅ Indices uploaded (${indicesContent.length} bytes)`);
    } catch (error) {
      results.uploads.indices.status = error.status || 500;
      results.errors.push(`Indices upload failed: ${error.message}`);
      throw error;
    }

    // Step 5: Verify uploads with HEAD requests
    console.log('🔍 Verifying uploaded files...');
    
    try {
      const metaHead = await head(`${testPrefix}meta.json`);
      results.verifications.metadata = !!metaHead;
    } catch (error) {
      results.errors.push(`Metadata verification failed: ${error.message}`);
    }

    try {
      const vectorsHead = await head(`${testPrefix}vectors.bin`);
      results.verifications.vectors = !!vectorsHead;
    } catch (error) {
      results.errors.push(`Vectors verification failed: ${error.message}`);
    }

    try {
      const indicesHead = await head(`${testPrefix}indices.json`);
      results.verifications.indices = !!indicesHead;
    } catch (error) {
      results.errors.push(`Indices verification failed: ${error.message}`);
    }

    // Check if all verifications passed
    results.ok = results.verifications.metadata && 
                 results.verifications.vectors && 
                 results.verifications.indices;

    // Step 6: Cleanup test files
    console.log('🗑️ Cleaning up test files...');
    const filesToDelete = [
      `${testPrefix}meta.json`,
      `${testPrefix}vectors.bin`,
      `${testPrefix}indices.json`
    ];
    
    for (const file of filesToDelete) {
      try {
        await del(file);
      } catch (error) {
        console.warn(`Could not delete ${file}: ${error.message}`);
      }
    }

    // Return results
    const statusCode = results.ok ? 200 : 500;
    return res.status(statusCode).json({
      ...results,
      testPrefix,
      timestamp: new Date().toISOString(),
      summary: {
        totalSize: results.uploads.metadata.size + 
                   results.uploads.vectors.size + 
                   results.uploads.indices.size,
        allUploaded: results.uploads.metadata.status === 200 &&
                     results.uploads.vectors.status === 200 &&
                     results.uploads.indices.status === 200,
        allVerified: results.ok
      }
    });

  } catch (error) {
    console.error('❌ Pack self-test failed:', error);
    
    return res.status(500).json({
      ok: false,
      error: error.message,
      hint: error.status === 401 ? 'Check BLOB_READ_WRITE_TOKEN' :
            error.status === 403 ? 'Token lacks required permissions' :
            error.status === 413 ? 'Pack size exceeds limits' :
            'Check Vercel logs for details',
      results
    });
  }
}

// Export config for Vercel
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};