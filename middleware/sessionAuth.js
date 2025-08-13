import bcrypt from 'bcrypt';

// Simple in-memory session store (in production, use Redis or database)
const sessions = new Map();

// Session duration: 4 hours
const SESSION_DURATION = 4 * 60 * 60 * 1000;

// Clean expired sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_DURATION) {
      sessions.delete(sessionId);
    }
  }
}, 30 * 60 * 1000);

// Generate secure session ID
function generateSessionId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15) +
         Date.now().toString(36);
}

// Login endpoint
export async function loginHandler(req, res) {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'שם משתמש וסיסמה נדרשים' 
    });
  }
  
  const adminUser = process.env.ADMIN_USER;
  const adminPassHash = process.env.ADMIN_PASS_HASH;
  
  if (!adminUser || !adminPassHash) {
    console.error('Admin credentials not configured');
    return res.status(500).json({ 
      success: false, 
      error: 'שגיאת תצורה בשרת' 
    });
  }
  
  // Verify username
  if (username !== adminUser) {
    return res.status(401).json({ 
      success: false, 
      error: 'שם משתמש או סיסמה שגויים' 
    });
  }
  
  // Verify password
  try {
    const isValidPassword = await bcrypt.compare(password, adminPassHash);
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'שם משתמש או סיסמה שגויים' 
      });
    }
    
    // Create session
    const sessionId = generateSessionId();
    const session = {
      userId: username,
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
  // For API requests, return JSON
  if (req.path.startsWith('/api/') || req.path.startsWith('/integrations/')) {
    return res.status(401).json({ 
      success: false, 
      error: 'נדרשת התחברות',
      redirect: '/login.html'
    });
  }
  
  // For page requests, redirect to login
  res.redirect('/login.html');
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