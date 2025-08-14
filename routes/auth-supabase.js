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

// Enhanced login
router.post('/login', async (req, res) => {
    const { email, password, useSupabase } = req.body;
    
    console.log('🔐 Auth login attempt:', { email, useSupabase, envSupabase: process.env.USE_SUPABASE_AUTH });
    
    try {
        // Check if we should use Supabase
        if ((useSupabase || process.env.USE_SUPABASE_AUTH === 'true') && supabase) {
            console.log('🔑 Using Supabase authentication');
            
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) {
                console.error('❌ Supabase login error:', error);
                return res.status(401).json({
                    success: false,
                    error: error.message
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