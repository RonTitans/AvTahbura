import express from 'express';
import { rateLimiter } from '../middleware/rateLimit.js';
import { 
  loginHandler, 
  logoutHandler, 
  getSessionInfo,
  getSessionStats
} from '../middleware/sessionAuth.js';

const router = express.Router();

// Apply rate limiting to auth routes
router.use(rateLimiter);

// POST /auth/login - Login endpoint
router.post('/login', loginHandler);

// POST /auth/logout - Logout endpoint  
router.post('/logout', logoutHandler);

// GET /auth/session - Get session info
router.get('/session', getSessionInfo);

// GET /auth/stats - Get session statistics (for debugging)
router.get('/stats', (req, res) => {
  res.json(getSessionStats());
});

export default router;