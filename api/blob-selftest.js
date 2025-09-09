/**
 * /api/blob-selftest - Diagnostic endpoint for Vercel Blob Storage
 * Tests PUT/GET operations and returns diagnostic information
 * Admin-only endpoint for debugging storage issues
 */

import { put, head, del } from '@vercel/blob';

/**
 * Main handler for blob self-test
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

  // Check for admin authentication (basic protection)
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

  const testPrefix = process.env.INDEX_PACK_PREFIX || 'rag-packs/';
  const testFileName = 'selftest.txt';
  const testPath = `${testPrefix}${testFileName}`;
  const testContent = `Blob storage test at ${new Date().toISOString()}`;
  
  const results = {
    ok: false,
    httpStatusPut: null,
    httpStatusGet: null,
    httpStatusHead: null,
    url: null,
    content: null,
    errors: []
  };

  try {
    // Step 1: PUT test content
    console.log(`📤 Attempting PUT to ${testPath}...`);
    let putResult;
    
    try {
      putResult = await put(testPath, testContent, {
        access: 'public',
        contentType: 'text/plain',
        addRandomSuffix: false
      });
      
      results.httpStatusPut = 200;
      results.url = putResult.url;
      console.log(`✅ PUT successful: ${putResult.url}`);
    } catch (putError) {
      results.httpStatusPut = putError.status || 500;
      results.errors.push(`PUT failed: ${putError.message}`);
      
      // Provide specific hints based on error
      if (putError.status === 401 || putError.status === 403) {
        return res.status(500).json({
          ...results,
          hint: 'Invalid or missing BLOB_READ_WRITE_TOKEN. Check your Vercel dashboard.'
        });
      } else if (putError.status === 413) {
        return res.status(500).json({
          ...results,
          hint: 'Content too large. Vercel Blob has size limits.'
        });
      }
      
      throw putError;
    }

    // Step 2: HEAD to verify file exists
    console.log(`🔍 Attempting HEAD for ${testPath}...`);
    try {
      const headResult = await head(testPath);
      results.httpStatusHead = headResult ? 200 : 404;
      console.log(`✅ HEAD successful: File exists`);
    } catch (headError) {
      results.httpStatusHead = headError.status || 500;
      results.errors.push(`HEAD failed: ${headError.message}`);
    }

    // Step 3: GET to retrieve content
    console.log(`📥 Attempting GET from ${results.url}...`);
    try {
      const getResponse = await fetch(results.url);
      results.httpStatusGet = getResponse.status;
      
      if (getResponse.ok) {
        const retrievedContent = await getResponse.text();
        results.content = retrievedContent;
        
        // Verify content matches
        if (retrievedContent === testContent) {
          results.ok = true;
          console.log(`✅ GET successful: Content matches`);
        } else {
          results.errors.push('Content mismatch after retrieval');
          console.log(`⚠️ Content mismatch`);
        }
      } else {
        results.errors.push(`GET failed with status ${getResponse.status}`);
      }
    } catch (getError) {
      results.httpStatusGet = 500;
      results.errors.push(`GET failed: ${getError.message}`);
    }

    // Step 4: Cleanup - delete test file
    console.log(`🗑️ Cleaning up test file...`);
    try {
      await del(testPath);
      console.log(`✅ Test file deleted`);
    } catch (delError) {
      console.warn(`⚠️ Could not delete test file: ${delError.message}`);
    }

    // Return results
    const statusCode = results.ok ? 200 : 500;
    return res.status(statusCode).json({
      ...results,
      testPath,
      timestamp: new Date().toISOString(),
      environment: {
        hasToken: !!process.env.BLOB_READ_WRITE_TOKEN,
        prefix: testPrefix
      }
    });

  } catch (error) {
    console.error('❌ Blob self-test failed:', error);
    
    return res.status(500).json({
      ok: false,
      error: error.message,
      hint: error.status === 401 ? 'Check BLOB_READ_WRITE_TOKEN' :
            error.status === 403 ? 'Token lacks required permissions' :
            error.status === 413 ? 'Content size limit exceeded' :
            'Unknown error - check Vercel logs',
      results
    });
  }
}

// Export config for Vercel
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    }
  }
};