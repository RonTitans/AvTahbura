import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the credentials file
const credsPath = path.join(__dirname, 'clauderon-bd2065b087b3.json');
const credentials = fs.readFileSync(credsPath, 'utf8');

// Escape for Windows command line
const escapedCreds = credentials.replace(/"/g, '\\"').replace(/\n/g, '\\n');

// Build the command
const command = `vercel --token 8AVjv9ssPQFbdtihtafTmac7 env add GOOGLE_CREDENTIALS_JSON "${escapedCreds}" production`;

console.log('Setting GOOGLE_CREDENTIALS_JSON in Vercel...');

try {
  execSync(command, { 
    cwd: __dirname,
    stdio: 'inherit',
    shell: true 
  });
  console.log('✅ Environment variable set successfully!');
} catch (error) {
  console.error('❌ Failed to set environment variable:', error.message);
}