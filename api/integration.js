/**
 * Integration file to connect RAG endpoints with existing server
 * Add these routes to your server.js
 */

const { recommendHandler } = require('./recommend');
const { refreshHandler, forceRefreshHandler } = require('./refresh');
const { statusHandler, healthHandler } = require('./status');

/**
 * Register RAG endpoints with Express app
 * @param {object} app - Express application instance
 */
function registerRAGEndpoints(app) {
  console.log('🔌 Registering RAG endpoints...');
  
  // Main search endpoint (replaces /smart-search)
  app.post('/api/recommend', recommendHandler);
  
  // Backward compatibility - redirect old endpoint
  app.post('/smart-search', (req, res) => {
    console.log('🔄 Redirecting /smart-search to /api/recommend');
    recommendHandler(req, res);
  });
  
  // Refresh endpoints
  app.post('/api/refresh', refreshHandler);
  app.post('/api/refresh/force', forceRefreshHandler);
  
  // Status endpoints
  app.get('/api/status', statusHandler);
  app.get('/api/health', healthHandler);
  
  // Backward compatibility for existing /refresh
  app.post('/refresh', async (req, res) => {
    console.log('🔄 Using new RAG refresh handler');
    refreshHandler(req, res);
  });
  
  console.log('✅ RAG endpoints registered');
}

/**
 * Middleware to add RAG capabilities to existing routes
 */
function ragMiddleware(req, res, next) {
  // Add RAG context to request
  req.ragEnabled = true;
  req.ragVersion = '2.0.0';
  next();
}

module.exports = {
  registerRAGEndpoints,
  ragMiddleware
};