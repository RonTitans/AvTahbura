import express from 'express';
import { createClient } from '@supabase/supabase-js';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import { sessions, generateSessionId, SESSION_DURATION } from '../middleware/sessionStore.js';

// Load environment variables
dotenv.config();

const router = express.Router();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

console.log('🔧 Initializing Supabase:', { 
    hasUrl: !!supabaseUrl, 
    hasKey: !!supabaseAnonKey,
    url: supabaseUrl?.substring(0, 30) + '...'
});

const supabase = supabaseUrl && supabaseAnonKey 
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

console.log('✅ Supabase client created:', !!supabase);

// Check auth mode
router.get('/mode', (req, res) => {
    res.json({
        useSupabase: process.env.USE_SUPABASE_AUTH === 'true',
        require2FA: process.env.REQUIRE_2FA === 'true'
    });
});

// Debug endpoint to check environment variables
router.get('/debug-env', (req, res) => {
    const keyPreview = process.env.SUPABASE_ANON_KEY ? 
        `${process.env.SUPABASE_ANON_KEY.substring(0, 50)}...${process.env.SUPABASE_ANON_KEY.slice(-20)}` : 
        'NOT SET';
    
    res.json({
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY,
        keyPreview: keyPreview,
        keyLength: process.env.SUPABASE_ANON_KEY?.length,
        useSupabaseAuth: process.env.USE_SUPABASE_AUTH,
        require2FA: process.env.REQUIRE_2FA,
        supabaseClientCreated: !!supabase,
        supabaseUrlPrefix: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 30) : 'NOT SET',
        nodeEnv: process.env.NODE_ENV
    });
});

// Test Supabase connection
router.get('/test-connection', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({
            success: false,
            error: 'Supabase client not initialized'
        });
    }
    
    try {
        // Try to get the current session (should be null if not logged in)
        const { data: { session }, error } = await supabase.auth.getSession();
        
        res.json({
            success: true,
            connectionOk: !error,
            hasSession: !!session,
            error: error?.message,
            supabaseUrl: process.env.SUPABASE_URL?.substring(0, 30) + '...',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
            stack: err.stack
        });
    }
});

// Check user status (GET endpoint for easy testing)
router.get('/check-user', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({
            success: false,
            error: 'Supabase client not initialized'
        });
    }
    
    res.json({
        success: true,
        message: 'To test login, use the browser console with:',
        instructions: `
fetch('/api/auth/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    email: 'ron@titans.global',
    password: 'SecurePass123!@#',
    useSupabase: true
  })
}).then(r => r.json()).then(console.log)`,
        supabaseConnected: true,
        authMode: {
            useSupabase: process.env.USE_SUPABASE_AUTH === 'true',
            require2FA: process.env.REQUIRE_2FA === 'true'
        }
    });
});

// Test login with specific user
router.post('/test-login', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({
            success: false,
            error: 'Supabase client not initialized'
        });
    }
    
    try {
        // Try to sign in with the test user
        const { data, error } = await supabase.auth.signInWithPassword({
            email: 'ron@titans.global',
            password: 'SecurePass123!@#'
        });
        
        if (error) {
            // If user doesn't exist, try to create it
            if (error.message.includes('Invalid login credentials')) {
                console.log('User not found, attempting to create...');
                
                const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                    email: 'ron@titans.global',
                    password: 'SecurePass123!@#',
                    options: {
                        data: {
                            full_name: 'Ron Geller',
                            role: 'admin'
                        }
                    }
                });
                
                if (signUpError) {
                    return res.json({
                        success: false,
                        action: 'signup_failed',
                        error: signUpError.message,
                        details: signUpError
                    });
                }
                
                return res.json({
                    success: true,
                    action: 'user_created',
                    message: 'User created successfully. Please check your email for confirmation.',
                    userId: signUpData.user?.id,
                    needsEmailConfirmation: !signUpData.user?.confirmed_at
                });
            }
            
            return res.json({
                success: false,
                action: 'login_failed',
                error: error.message,
                code: error.code,
                status: error.status
            });
        }
        
        res.json({
            success: true,
            action: 'login_success',
            userId: data.user?.id,
            email: data.user?.email,
            emailConfirmed: !!data.user?.confirmed_at,
            has2FA: !!data.user?.user_metadata?.twofa_secret
        });
        
        // Sign out after test
        await supabase.auth.signOut();
        
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
            stack: err.stack
        });
    }
});

// Enhanced login
router.post('/login', async (req, res) => {
    const { email, password, useSupabase } = req.body;
    
    console.log('🔐 Auth login attempt:', { email, useSupabase, envSupabase: process.env.USE_SUPABASE_AUTH });
    
    try {
        // Check if Supabase is not initialized properly
        if ((useSupabase || process.env.USE_SUPABASE_AUTH === 'true') && !supabase) {
            console.error('❌ Supabase client not initialized');
            return res.status(500).json({
                success: false,
                error: 'Authentication service not configured. Please check environment variables.',
                debug: {
                    hasUrl: !!process.env.SUPABASE_URL,
                    hasKey: !!process.env.SUPABASE_ANON_KEY
                }
            });
        }
        
        // Check if we should use Supabase
        if ((useSupabase || process.env.USE_SUPABASE_AUTH === 'true') && supabase) {
            console.log('🔑 Using Supabase authentication');
            
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) {
                console.error('❌ Supabase login error:', {
                    message: error.message,
                    status: error.status,
                    code: error.code,
                    details: error.details,
                    hint: error.hint,
                    email: email
                });
                
                // More specific error messages
                let errorMessage = error.message;
                if (error.message.includes('Invalid API key')) {
                    errorMessage = 'Authentication service configuration error. Please contact support.';
                } else if (error.message.includes('Invalid login credentials')) {
                    errorMessage = 'Invalid email or password';
                } else if (error.message.includes('Email not confirmed')) {
                    errorMessage = 'Please confirm your email address first';
                }
                
                return res.status(401).json({
                    success: false,
                    error: errorMessage,
                    errorCode: error.code
                });
            }
            
            const user = data.user;
            const require2FA = process.env.REQUIRE_2FA === 'true';
            const has2FA = user?.user_metadata?.twofa_enabled;
            const has2FASecret = user?.user_metadata?.twofa_secret;
            
            console.log('✅ Supabase login successful:', { 
                userId: user.id, 
                require2FA, 
                has2FA,
                has2FASecret: !!has2FASecret 
            });
            
            // If 2FA is required but not set up yet, trigger setup
            if (require2FA && !has2FASecret) {
                // Generate 2FA secret for first-time setup
                const secret = speakeasy.generateSecret({
                    name: `AvTahbura (${user.email})`,
                    issuer: 'Jerusalem Municipality'
                });
                
                // Store secret in user metadata
                await supabase.auth.updateUser({
                    data: {
                        twofa_secret: secret.base32,
                        twofa_enabled: false
                    }
                });
                
                // Generate QR code
                const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
                
                return res.json({
                    success: true,
                    requires2FASetup: true,
                    qrCode: qrCodeUrl,
                    sessionToken: data.session?.access_token,
                    user: { id: user.id, email: user.email }
                });
            }
            
            // If 2FA is set up and enabled, require verification
            if (require2FA && has2FA) {
                return res.json({
                    success: true,
                    requires2FA: true,
                    sessionToken: data.session?.access_token,
                    user: { id: user.id, email: user.email }
                });
            }
            
            // Create local session
            const sessionId = generateSessionId();
            sessions.set(sessionId, {
                userId: user.id,
                email: user.email,
                createdAt: Date.now(),
                supabaseSession: data.session
            });
            
            res.cookie('sessionId', sessionId, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: SESSION_DURATION,
                sameSite: 'strict',
                path: '/'  // Ensure cookie is available site-wide
            });
            
            return res.json({
                success: true,
                message: 'התחברת בהצלחה',
                session: { sessionId },
                user: { id: user.id, email: user.email }
            });
            
        } else {
            // Fallback to simple auth
            console.log('📝 Using simple authentication');
            const adminPassword = process.env.ADMIN_PASSWORD || 'test123';
            
            if (password === adminPassword) {
                const sessionId = generateSessionId();
                sessions.set(sessionId, {
                    userId: 'admin',
                    email: email || 'admin@local',
                    createdAt: Date.now()
                });
                
                res.cookie('sessionId', sessionId, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: SESSION_DURATION,
                    sameSite: 'strict'
                });
                
                return res.json({
                    success: true,
                    message: 'התחברת בהצלחה',
                    session: { sessionId }
                });
            } else {
                return res.status(401).json({
                    success: false,
                    error: 'סיסמה שגויה'
                });
            }
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
    
    console.log('📝 Signup attempt:', { email, fullName });
    
    if (!supabase || process.env.USE_SUPABASE_AUTH !== 'true') {
        return res.status(400).json({
            success: false,
            error: 'הרשמה זמינה רק במצב Supabase'
        });
    }
    
    try {
        // Create user in Supabase
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    role: 'user'
                }
            }
        });
        
        if (error) {
            console.error('❌ Signup error:', error);
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        
        console.log('✅ User created:', data.user?.id);
        
        // Generate 2FA secret if required
        if (process.env.REQUIRE_2FA === 'true' && data.user) {
            const secret = speakeasy.generateSecret({
                name: `AvTahbura (${email})`,
                issuer: 'Jerusalem Municipality'
            });
            
            // Store secret in user metadata (using update user, not admin)
            const { error: updateError } = await supabase.auth.updateUser({
                data: {
                    twofa_secret: secret.base32,
                    twofa_enabled: false
                }
            });
            
            if (updateError) {
                console.error('❌ Error setting 2FA:', updateError);
            }
            
            // Generate QR code
            const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
            
            return res.json({
                success: true,
                user: data.user,
                requires2FASetup: true,
                qrCode: qrCodeUrl,
                secret: secret.base32
            });
        }
        
        res.json({
            success: true,
            user: data.user,
            message: 'החשבון נוצר בהצלחה'
        });
        
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
    
    console.log('🔐 2FA verification attempt:', { userId });
    
    if (!supabase) {
        return res.status(400).json({
            success: false,
            error: '2FA not configured'
        });
    }
    
    try {
        // Get user session
        const { data: { user }, error } = await supabase.auth.getUser(sessionToken);
        
        if (error || !user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid session'
            });
        }
        
        const secret = user.user_metadata?.twofa_secret;
        if (!secret) {
            return res.status(400).json({
                success: false,
                error: '2FA not set up'
            });
        }
        
        // Verify token
        const verified = speakeasy.totp.verify({
            secret: secret,
            encoding: 'base32',
            token: token,
            window: 2
        });
        
        if (verified) {
            console.log('✅ 2FA verified successfully');
            
            // Update user metadata if first time
            if (!user.user_metadata?.twofa_enabled) {
                await supabase.auth.updateUser({
                    data: { twofa_enabled: true }
                });
            }
            
            // Create session
            const sessionId = generateSessionId();
            sessions.set(sessionId, {
                userId: user.id,
                email: user.email,
                createdAt: Date.now(),
                verified2FA: true
            });
            
            res.cookie('sessionId', sessionId, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: SESSION_DURATION,
                sameSite: 'strict',
                path: '/'  // Ensure cookie is available site-wide
            });
            
            return res.json({
                success: true,
                message: 'אימות דו-שלבי הצליח',
                session: { sessionId }
            });
        } else {
            return res.status(401).json({
                success: false,
                error: 'קוד שגוי'
            });
        }
    } catch (error) {
        console.error('2FA error:', error);
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
        const session = sessions.get(sessionId);
        if (session?.supabaseSession && supabase) {
            await supabase.auth.signOut();
        }
        sessions.delete(sessionId);
    }
    
    res.clearCookie('sessionId');
    res.json({ success: true });
});

export default router;