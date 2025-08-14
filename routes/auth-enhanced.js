// Enhanced authentication with Supabase support
const express = require('express');
const authManager = require('../auth/auth-manager');

const router = express.Router();

// Simple in-memory session store (existing logic)
const sessions = new Map();
const SESSION_DURATION = 4 * 60 * 60 * 1000;

// Clean expired sessions
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.createdAt > SESSION_DURATION) {
            sessions.delete(sessionId);
        }
    }
}, 30 * 60 * 1000);

// Generate session ID
function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15) +
           Date.now().toString(36);
}

// Check auth mode
router.get('/mode', (req, res) => {
    res.json({
        useSupabase: process.env.USE_SUPABASE_AUTH === 'true',
        require2FA: process.env.REQUIRE_2FA === 'true'
    });
});

// Enhanced login
router.post('/login', async (req, res) => {
    const { email, password, useSupabase } = req.body;
    
    console.log('Enhanced login attempt:', { email, useSupabase });
    
    try {
        let result;
        
        if (useSupabase || process.env.USE_SUPABASE_AUTH === 'true') {
            // Use Supabase auth
            result = await authManager.signIn(email, password);
        } else {
            // Use simple auth (existing logic)
            result = authManager.simpleAuth(email || 'admin', password);
        }
        
        if (result.success) {
            if (result.requires2FA) {
                // Return 2FA required response
                res.json({
                    success: true,
                    requires2FA: true,
                    sessionToken: result.sessionToken,
                    user: result.user
                });
            } else {
                // Create local session
                const sessionId = generateSessionId();
                const session = {
                    userId: result.user?.id || 'admin',
                    email: result.user?.email || email,
                    createdAt: Date.now(),
                    lastAccessed: Date.now(),
                    isSupabase: !result.isSimpleAuth
                };
                
                sessions.set(sessionId, session);
                
                // Set cookie
                res.cookie('sessionId', sessionId, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: SESSION_DURATION,
                    sameSite: 'strict'
                });
                
                res.json({
                    success: true,
                    message: 'התחברת בהצלחה',
                    session: result.session || { sessionId },
                    user: result.user
                });
            }
        } else {
            res.status(401).json({
                success: false,
                error: result.error || 'שם משתמש או סיסמה שגויים'
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'שגיאה בשרת'
        });
    }
});

// Sign up
router.post('/signup', async (req, res) => {
    const { fullName, email, password } = req.body;
    
    if (process.env.USE_SUPABASE_AUTH !== 'true') {
        return res.status(400).json({
            success: false,
            error: 'הרשמה אינה זמינה במצב פיתוח'
        });
    }
    
    try {
        const result = await authManager.signUp(email, password, fullName);
        
        if (result.success) {
            res.json({
                success: true,
                user: result.user,
                requires2FASetup: result.requires2FASetup,
                qrCode: result.qrCode
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            error: 'שגיאה ביצירת חשבון'
        });
    }
});

// Verify 2FA
router.post('/verify-2fa', async (req, res) => {
    const { userId, token, sessionToken } = req.body;
    
    try {
        const result = await authManager.verify2FA(userId, token, sessionToken);
        
        if (result.success) {
            // Create local session after 2FA
            const sessionId = generateSessionId();
            const session = {
                userId: userId,
                createdAt: Date.now(),
                lastAccessed: Date.now(),
                verified2FA: true
            };
            
            sessions.set(sessionId, session);
            
            res.cookie('sessionId', sessionId, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: SESSION_DURATION,
                sameSite: 'strict'
            });
            
            res.json({
                success: true,
                message: 'אימות דו-שלבי הצליח',
                session: result.session
            });
        } else {
            res.status(401).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('2FA verification error:', error);
        res.status(500).json({
            success: false,
            error: 'שגיאה באימות'
        });
    }
});

// Logout
router.post('/logout', async (req, res) => {
    const sessionId = req.cookies.sessionId;
    
    if (sessionId) {
        sessions.delete(sessionId);
    }
    
    // Also logout from Supabase if using it
    if (process.env.USE_SUPABASE_AUTH === 'true') {
        await authManager.signOut();
    }
    
    res.clearCookie('sessionId');
    res.json({ success: true, message: 'התנתקת בהצלחה' });
});

// Session info
router.get('/session', (req, res) => {
    const sessionId = req.cookies.sessionId;
    
    if (!sessionId || !sessions.has(sessionId)) {
        return res.status(401).json({ 
            authenticated: false 
        });
    }
    
    const session = sessions.get(sessionId);
    session.lastAccessed = Date.now();
    
    res.json({
        authenticated: true,
        user: {
            id: session.userId,
            email: session.email
        }
    });
});

// Middleware to check authentication
router.checkAuth = (req, res, next) => {
    const sessionId = req.cookies.sessionId;
    
    if (!sessionId || !sessions.has(sessionId)) {
        return res.status(401).json({ 
            error: 'Authentication required' 
        });
    }
    
    const session = sessions.get(sessionId);
    session.lastAccessed = Date.now();
    req.user = { id: session.userId, email: session.email };
    
    next();
};

module.exports = router;