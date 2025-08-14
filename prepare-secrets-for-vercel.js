// Script to prepare secrets for Vercel deployment
import fs from 'fs';
import dotenv from 'dotenv';

console.log('🔐 Preparing Secrets for Vercel Deployment\n');
console.log('=' .repeat(50));

// Load .env file
dotenv.config();

// Read google-credentials.json
let googleCredsJson = '';
try {
    const googleCreds = JSON.parse(fs.readFileSync('./google-credentials.json', 'utf8'));
    googleCredsJson = JSON.stringify(googleCreds);
    console.log('✅ Google credentials converted to single line');
} catch (error) {
    console.log('⚠️ Could not read google-credentials.json');
}

console.log('\n📋 COPY THESE TO VERCEL DASHBOARD:');
console.log('=' .repeat(50));
console.log('Go to: https://vercel.com/dashboard → Your Project → Settings → Environment Variables\n');

// List all environment variables
const envVars = [
    { key: 'ADMIN_PASSWORD', value: process.env.ADMIN_PASSWORD, required: true },
    { key: 'SESSION_SECRET', value: process.env.SESSION_SECRET, required: true },
    { key: 'NODE_ENV', value: 'production', required: true },
    { key: 'OPENAI_API_KEY', value: process.env.OPENAI_API_KEY, required: true },
    { key: 'SPREADSHEET_ID', value: process.env.SPREADSHEET_ID, required: true },
    { key: 'GOOGLE_CREDENTIALS_JSON', value: googleCredsJson, required: true },
    { key: 'SUPABASE_URL', value: process.env.SUPABASE_URL, required: true },
    { key: 'SUPABASE_ANON_KEY', value: process.env.SUPABASE_ANON_KEY, required: true },
    { key: 'USE_SUPABASE_AUTH', value: process.env.USE_SUPABASE_AUTH, required: true },
    { key: 'REQUIRE_2FA', value: process.env.REQUIRE_2FA, required: true },
];

console.log('Add each of these as a new environment variable:\n');

envVars.forEach((env, index) => {
    console.log(`${index + 1}. ${env.key}`);
    console.log('   Value: ' + (env.value ? 
        (env.value.length > 50 ? env.value.substring(0, 50) + '...' : env.value) 
        : '❌ MISSING - Check your .env file'));
    console.log('   Environment: Production, Preview, Development (select all)');
    console.log('');
});

console.log('=' .repeat(50));
console.log('\n⚠️ IMPORTANT NOTES:');
console.log('1. Do NOT wrap values in quotes in Vercel Dashboard');
console.log('2. GOOGLE_CREDENTIALS_JSON must be a single line (no line breaks)');
console.log('3. After adding all variables, redeploy your project');
console.log('4. Check Function Logs in Vercel if deployment fails');

// Create a file with the Google credentials for easy copying
if (googleCredsJson) {
    fs.writeFileSync('google-creds-for-vercel.txt', googleCredsJson);
    console.log('\n✅ Created google-creds-for-vercel.txt for easy copying');
    console.log('   (Delete this file after copying to Vercel!)');
}

console.log('\n🚀 Ready to deploy to Vercel!');