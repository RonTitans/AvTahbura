/**
 * Routes manifest endpoint for debugging
 * Shows all available API routes
 */

export default function handler(req, res) {
  const routes = [
    { path: '/api/rag-status', method: 'GET', description: 'System health and metrics' },
    { path: '/api/rag-refresh', method: 'POST', description: 'Rebuild search index from Google Sheets' },
    { path: '/api/rag-recommend', method: 'POST', description: 'Main RAG search endpoint' },
    { path: '/api/rag-blob-selftest', method: 'POST', description: 'Test Vercel Blob storage' },
    { path: '/api/rag-pack-selftest', method: 'POST', description: 'Test Index Pack operations' },
    { path: '/api/hello', method: 'GET', description: 'Simple test endpoint' },
    { path: '/api/test', method: 'GET', description: 'Basic test' },
    { path: '/api/simple-test', method: 'GET', description: 'Simple test' },
    { path: '/api/_routes', method: 'GET', description: 'This manifest' }
  ];

  res.json({
    framework: 'vercel-functions',
    module_type: 'ES modules',
    api_directory: '/api/',
    available_routes: routes,
    environment: {
      NODE_ENV: process.env.NODE_ENV || 'development',
      has_openai: !!process.env.OPENAI_API_KEY,
      has_blob: !!process.env.BLOB_READ_WRITE_TOKEN,
      has_sheets: !!process.env.GOOGLE_CREDENTIALS_JSON
    }
  });
}