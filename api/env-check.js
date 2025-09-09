/**
 * Environment validation endpoint
 * Checks all required environment variables
 */

export default function handler(req, res) {
  const required = {
    // Core requirements
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN ? '✅ Configured' : '❌ Missing',
    SPREADSHEET_ID: process.env.SPREADSHEET_ID ? '✅ Configured' : '❌ Missing',
    
    // Google Sheets auth (one of these)
    GOOGLE_CREDENTIALS_JSON: process.env.GOOGLE_CREDENTIALS_JSON ? '✅ Configured' : '⚠️ Missing (alternative: GOOGLE_APPLICATION_CREDENTIALS)',
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ? '✅ Configured' : '⚠️ Missing (alternative: GOOGLE_CREDENTIALS_JSON)',
    
    // OpenAI (optional but recommended)
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '✅ Configured' : '⚠️ Optional - needed for LLM synthesis',
    
    // Model settings
    EMBED_MODEL: process.env.EMBED_MODEL || 'text-embedding-3-small (default)',
    SYNTHESIS_MODEL: process.env.SYNTHESIS_MODEL || 'gpt-4-turbo-preview (default)',
    
    // Feature flags
    ENABLE_LLM_GATING: process.env.ENABLE_LLM_GATING || 'true (default)',
    EXACT_MATCH_THRESHOLD: process.env.EXACT_MATCH_THRESHOLD || '0.85 (default)',
    HEURISTIC_STRONG_T: process.env.HEURISTIC_STRONG_T || '0.75 (default)',
    
    // Storage settings
    INDEX_PACK_PREFIX: process.env.INDEX_PACK_PREFIX || 'rag-packs/ (default)',
    INDEX_PACK_TTL: process.env.INDEX_PACK_TTL || '300 (default)',
    
    // Admin token
    ADMIN_TOKEN: process.env.ADMIN_TOKEN ? '✅ Configured' : '⚠️ Using default'
  };
  
  // Check critical requirements
  const hasGoogleAuth = !!(process.env.GOOGLE_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const hasBlobStorage = !!process.env.BLOB_READ_WRITE_TOKEN;
  const hasSpreadsheet = !!process.env.SPREADSHEET_ID;
  
  const systemReady = hasGoogleAuth && hasBlobStorage && hasSpreadsheet;
  
  res.json({
    status: systemReady ? 'ready' : 'not_ready',
    environment: process.env.NODE_ENV || 'development',
    vercel: !!process.env.VERCEL,
    configuration: required,
    system_checks: {
      google_auth: hasGoogleAuth ? '✅ Ready' : '❌ Need GOOGLE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS',
      blob_storage: hasBlobStorage ? '✅ Ready' : '❌ Need BLOB_READ_WRITE_TOKEN',
      spreadsheet: hasSpreadsheet ? '✅ Ready' : '❌ Need SPREADSHEET_ID',
      openai: process.env.OPENAI_API_KEY ? '✅ Ready (optional)' : '⚠️ Not configured (will work without LLM)'
    },
    next_steps: systemReady ? 
      ['POST /api/rag-refresh to build index', 'POST /api/rag-recommend to test search'] :
      'Configure missing environment variables in Vercel dashboard'
  });
}