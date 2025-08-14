const { supabase } = require('./supabase-client');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

class AuthManager {
    constructor() {
        this.useSupabase = process.env.USE_SUPABASE_AUTH === 'true';
        this.require2FA = process.env.REQUIRE_2FA === 'true';
    }

    // Sign up new user with email/password
    async signUp(email, password, fullName) {
        if (!this.useSupabase) {
            return { success: false, error: 'Supabase auth not enabled' };
        }

        try {
            // Create user in Supabase Auth
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

            if (error) throw error;

            // Generate 2FA secret if required
            if (this.require2FA && data.user) {
                const secret = speakeasy.generateSecret({
                    name: `AvTahbura (${email})`,
                    issuer: 'Jerusalem Municipality'
                });

                // Store secret in user metadata (in production, use secure storage)
                await supabase.auth.updateUser({
                    data: { 
                        twofa_secret: secret.base32,
                        twofa_enabled: false  // Will be true after verification
                    }
                });

                // Generate QR code for authenticator app
                const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

                return {
                    success: true,
                    user: data.user,
                    requires2FASetup: true,
                    qrCode: qrCodeUrl,
                    secret: secret.base32
                };
            }

            return { success: true, user: data.user };
        } catch (error) {
            console.error('Signup error:', error);
            return { success: false, error: error.message };
        }
    }

    // Sign in with email/password
    async signIn(email, password) {
        if (!this.useSupabase) {
            // Fallback to simple auth
            return this.simpleAuth(email, password);
        }

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            // Check if 2FA is enabled for this user
            const user = data.user;
            const twoFAEnabled = user?.user_metadata?.twofa_enabled;

            if (this.require2FA && twoFAEnabled) {
                // Don't complete login yet - require 2FA verification
                return {
                    success: true,
                    requires2FA: true,
                    sessionToken: data.session?.access_token,
                    user: {
                        id: user.id,
                        email: user.email
                    }
                };
            }

            // No 2FA or not enabled - complete login
            return {
                success: true,
                user: user,
                session: data.session
            };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    // Verify 2FA token
    async verify2FA(userId, token, sessionToken) {
        if (!this.useSupabase || !this.require2FA) {
            return { success: false, error: '2FA not enabled' };
        }

        try {
            // Get user to retrieve secret
            const { data: { user }, error } = await supabase.auth.getUser(sessionToken);
            
            if (error || !user) {
                throw new Error('Invalid session');
            }

            const secret = user.user_metadata?.twofa_secret;
            if (!secret) {
                throw new Error('2FA not set up for this user');
            }

            // Verify the token
            const verified = speakeasy.totp.verify({
                secret: secret,
                encoding: 'base32',
                token: token,
                window: 2  // Allow 2 time steps before/after
            });

            if (verified) {
                // Mark 2FA as verified if first time
                if (!user.user_metadata?.twofa_enabled) {
                    await supabase.auth.updateUser({
                        data: { twofa_enabled: true }
                    });
                }

                return {
                    success: true,
                    message: '2FA verification successful',
                    session: { access_token: sessionToken }
                };
            } else {
                return {
                    success: false,
                    error: 'Invalid 2FA code'
                };
            }
        } catch (error) {
            console.error('2FA verification error:', error);
            return { success: false, error: error.message };
        }
    }

    // Simple auth fallback (existing logic)
    simpleAuth(username, password) {
        const adminPassword = process.env.ADMIN_PASSWORD || 'test123';
        
        // Simple password check (existing logic)
        if (username === 'admin' && password === adminPassword) {
            return {
                success: true,
                user: { email: 'admin@local', role: 'admin' },
                isSimpleAuth: true
            };
        }
        
        return { success: false, error: 'Invalid credentials' };
    }

    // Verify session
    async verifySession(token) {
        if (!this.useSupabase) {
            // Simple session check
            return { valid: true, user: { email: 'admin@local' } };
        }

        try {
            const { data: { user }, error } = await supabase.auth.getUser(token);
            
            if (error || !user) {
                return { valid: false };
            }

            return { valid: true, user };
        } catch (error) {
            console.error('Session verification error:', error);
            return { valid: false };
        }
    }

    // Sign out
    async signOut() {
        if (!this.useSupabase) {
            return { success: true };
        }

        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Signout error:', error);
            return { success: false, error: error.message };
        }
    }

    // Generate recovery codes (backup for 2FA)
    generateRecoveryCodes() {
        const codes = [];
        for (let i = 0; i < 8; i++) {
            codes.push(speakeasy.generateSecret({ length: 8 }).base32.slice(0, 8));
        }
        return codes;
    }
}

module.exports = new AuthManager();