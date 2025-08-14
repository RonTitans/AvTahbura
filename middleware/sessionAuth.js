import bcrypt from 'bcrypt';
import { sessions, generateSessionId, SESSION_DURATION } from './sessionStore.js';

// Login endpoint
export async function loginHandler(req, res) {
  const { username, password } = req.body;
  
  console.log('Login attempt received:', { username, passwordLength: password?.length });
  
  // For simplified login, we only check password
  if (!password) {
    return res.status(400).json({ 
      success: false, 
      error: 'סיסמה נדרשת' 
    });
  }
  
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  console.log('Admin password configured:', !!adminPassword);
  
  if (!adminPassword) {
    console.error('Admin password not configured');
    return res.status(500).json({ 
      success: false, 
      error: 'שגיאת תצורה בשרת' 
    });
  }
  
  // Verify password directly (simplified for deployment)
  try {
    const isValidPassword = password === adminPassword;
    console.log('Password validation result:', isValidPassword);
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'שם משתמש או סיסמה שגויים' 
      });
    }
    
    // Create session
    const sessionId = generateSessionId();
    const session = {
      userId: 'admin',
      createdAt: Date.now(),
      lastAccessed: Date.now()
    };
    
    sessions.set(sessionId, session);
    
    // Set session cookie
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DURATION,
      sameSite: 'strict'
    });
    
    res.json({ 
      success: true, 
      message: 'התחברת בהצלחה',
      sessionId // For client-side session management
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'שגיאה בשרת' 
    });
  }
}

// Logout endpoint
export function logoutHandler(req, res) {
  const sessionId = req.cookies.sessionId;
  
  if (sessionId) {
    sessions.delete(sessionId);
  }
  
  res.clearCookie('sessionId');
  res.json({ success: true, message: 'התנתקת בהצלחה' });
}

// Session validation middleware
export function requireAuth(req, res, next) {
  const sessionId = req.cookies.sessionId;
  
  if (!sessionId) {
    return redirectToLogin(req, res);
  }
  
  const session = sessions.get(sessionId);
  
  if (!session) {
    res.clearCookie('sessionId');
    return redirectToLogin(req, res);
  }
  
  // Check if session expired
  const now = Date.now();
  if (now - session.createdAt > SESSION_DURATION) {
    sessions.delete(sessionId);
    res.clearCookie('sessionId');
    return redirectToLogin(req, res);
  }
  
  // Update last accessed time
  session.lastAccessed = now;
  
  // Add user info to request
  req.user = { userId: session.userId };
  
  next();
}

// Redirect to login helper
function redirectToLogin(req, res) {
  // Determine which login page to use based on auth mode
  const useSupabase = process.env.USE_SUPABASE_AUTH === 'true';
  const loginPage = useSupabase ? '/login-new.html' : '/login.html';
  
  // For API requests, return JSON
  if (req.path.startsWith('/api/') || req.path.startsWith('/integrations/')) {
    return res.status(401).json({ 
      success: false, 
      error: 'נדרשת התחברות',
      redirect: loginPage
    });
  }
  
  // For page requests, redirect to appropriate login page
  res.redirect(loginPage);
}

// Get session info
export function getSessionInfo(req, res) {
  const sessionId = req.cookies.sessionId;
  
  if (!sessionId) {
    return res.json({ loggedIn: false });
  }
  
  const session = sessions.get(sessionId);
  
  if (!session) {
    res.clearCookie('sessionId');
    return res.json({ loggedIn: false });
  }
  
  // Check if session expired
  const now = Date.now();
  if (now - session.createdAt > SESSION_DURATION) {
    sessions.delete(sessionId);
    res.clearCookie('sessionId');
    return res.json({ loggedIn: false });
  }
  
  res.json({ 
    loggedIn: true,
    userId: session.userId,
    sessionDuration: SESSION_DURATION,
    timeRemaining: SESSION_DURATION - (now - session.createdAt)
  });
}

// Get session stats (for debugging)
export function getSessionStats() {
  return {
    activeSessions: sessions.size,
    sessions: Array.from(sessions.entries()).map(([id, session]) => ({
      id: id.substring(0, 8) + '...',
      userId: session.userId,
      createdAt: new Date(session.createdAt).toISOString(),
      lastAccessed: new Date(session.lastAccessed).toISOString()
    }))
  };
}