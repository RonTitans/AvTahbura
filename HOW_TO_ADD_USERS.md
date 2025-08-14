# 📋 How to Add Users to AvTahbura System

## Method 1: Using Supabase Dashboard (Recommended)

### Step 1: Access Supabase Dashboard
1. Go to: https://supabase.com/dashboard
2. Login with your Supabase account
3. Select your project: **lygevylmocsxioahzuej**

### Step 2: Navigate to Authentication
1. Click **Authentication** in the left sidebar
2. Click **Users** tab

### Step 3: Create New User
1. Click **Add user** → **Create new user**
2. Fill in the form:
   - **Email**: user@jerusalem.muni.il
   - **Password**: Create a strong password (12+ chars, uppercase, lowercase, numbers, symbols)
   - **Auto Confirm Email**: Toggle ON (to skip email confirmation)
   - **User Metadata**: Add custom data (optional)
     ```json
     {
       "full_name": "User Name",
       "role": "admin",
       "twofa_enabled": false
     }
     ```

### Step 4: Save User
Click **Create user** button

### Step 5: Share Credentials
Securely send the user:
- Login URL: http://localhost:8009/login-new.html
- Email address
- Password
- Instructions to set up Google Authenticator on first login

---

## Method 2: Using Script (For Developers)

### Create a Script File
Create `add-user.js` in the AvTahbura directory:

```javascript
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = 'YOUR_SERVICE_ROLE_KEY'; // Get from Supabase Settings → API

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createUser() {
    const email = 'newuser@jerusalem.muni.il';
    const password = 'SecurePass123!@#';
    
    const { data, error } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
            full_name: 'New User',
            role: 'admin'
        }
    });
    
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('User created:', data.user.email);
        console.log('User ID:', data.user.id);
    }
}

createUser();
```

### Run the Script
```bash
node add-user.js
```

---

## Method 3: Using Supabase SQL Editor

### Step 1: Access SQL Editor
1. Go to Supabase Dashboard
2. Click **SQL Editor** in left sidebar

### Step 2: Run SQL Command
```sql
-- Insert user into auth.users
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'user@jerusalem.muni.il',
    crypt('SecurePassword123!@#', gen_salt('bf')),
    now(),
    '{"full_name": "User Name", "role": "admin"}'::jsonb,
    now(),
    now()
);
```

⚠️ **Note**: This method requires knowledge of Supabase's auth schema

---

## 🔐 Important Security Notes

### Password Requirements
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (@$!%*?&)

### 2FA Setup
- On first login, users will be prompted to set up 2FA
- They need Google Authenticator or similar TOTP app
- The QR code will appear only once
- Save backup codes if provided

### User Roles
Currently supported roles in metadata:
- `admin` - Full access
- `user` - Standard access

---

## 🚨 Troubleshooting

### User Can't Login
1. Check email confirmation status in Supabase
2. Verify password meets requirements
3. Check if 2FA is properly set up

### Reset User Password
1. Go to Supabase Dashboard → Authentication → Users
2. Find the user
3. Click on the user row
4. Click **Send password recovery**

### Disable 2FA for User
1. In Supabase Dashboard, find the user
2. Edit user metadata
3. Set `twofa_enabled: false` and remove `twofa_secret`

### Delete User
1. Go to Supabase Dashboard → Authentication → Users
2. Find the user
3. Click the three dots menu
4. Select **Delete user**

---

## 📞 Support

If you need help:
1. Check Supabase logs: Dashboard → Logs → Auth
2. Check server logs: Look for authentication errors
3. Verify environment variables are set correctly

---

## Quick Reference

**Supabase Project URL**: https://supabase.com/dashboard/project/lygevylmocsxioahzuej

**Key Environment Variables**:
```env
SUPABASE_URL=https://lygevylmocsxioahzuej.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
USE_SUPABASE_AUTH=true
REQUIRE_2FA=true
```

**Test User** (already created):
- Email: ron@titans.global
- Password: SecurePass123!@#