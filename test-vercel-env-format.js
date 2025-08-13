/**
 * Test script to validate environment variable formats before Vercel deployment
 * 
 * This script helps identify potential formatting issues that might occur
 * when environment variables are transferred from local to Vercel environment.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Testing Environment Variable Formats for Vercel Compatibility...\n');

/**
 * Test Google Credentials JSON format
 */
function testGoogleCredentialsFormat() {
    console.log('📋 Testing Google Credentials JSON format...');
    
    const credentialsFile = path.join(__dirname, 'clauderon-bd2065b087b3.json');
    
    if (!fs.existsSync(credentialsFile)) {
        console.log('❌ Credentials file not found:', credentialsFile);
        return false;
    }
    
    try {
        // Read the file
        const fileContent = fs.readFileSync(credentialsFile, 'utf8');
        console.log(`✅ File read successfully, length: ${fileContent.length}`);
        
        // Test JSON parsing
        const parsed = JSON.parse(fileContent);
        console.log('✅ JSON parsing successful');
        console.log(`📧 Service account: ${parsed.client_email}`);
        console.log(`🏷️ Project ID: ${parsed.project_id}`);
        
        // Test stringification (what happens when we set it as env var)
        const stringified = JSON.stringify(parsed);
        console.log(`✅ JSON stringification successful, length: ${stringified.length}`);
        
        // Test re-parsing (what happens in Vercel)
        const reparsed = JSON.parse(stringified);
        console.log('✅ Re-parsing successful');
        
        // Check for potential escape issues
        const hasEscapeIssues = stringified.includes('\\"') || stringified.includes('\\n');
        if (hasEscapeIssues) {
            console.log('⚠️ Potential escape character issues detected');
            console.log('🔍 Contains \\": ', stringified.includes('\\"'));
            console.log('🔍 Contains \\n: ', stringified.includes('\\n'));
        } else {
            console.log('✅ No obvious escape character issues');
        }
        
        // Generate the exact format for Vercel environment variable
        console.log('\n🎯 VERCEL ENVIRONMENT VARIABLE FORMAT:');
        console.log('Variable name: GOOGLE_CREDENTIALS_JSON');
        console.log('Variable value (copy this exactly):');
        console.log('---START---');
        console.log(stringified);
        console.log('---END---');
        
        // Test potential newline issues in private key
        if (parsed.private_key) {
            const keyHasNewlines = parsed.private_key.includes('\n');
            const keyHasEscapedNewlines = parsed.private_key.includes('\\n');
            
            console.log(`\n🔑 Private key analysis:`);
            console.log(`   Has real newlines: ${keyHasNewlines}`);
            console.log(`   Has escaped newlines: ${keyHasEscapedNewlines}`);
            console.log(`   Key length: ${parsed.private_key.length}`);
            console.log(`   Starts correctly: ${parsed.private_key.startsWith('-----BEGIN PRIVATE KEY-----')}`);
            console.log(`   Ends correctly: ${parsed.private_key.endsWith('-----END PRIVATE KEY-----\\n') || parsed.private_key.endsWith('-----END PRIVATE KEY-----')}`);
            
            if (!keyHasNewlines && keyHasEscapedNewlines) {
                console.log('⚠️ Private key has escaped newlines - may need fixing in Vercel');
            }
        }
        
        return true;
        
    } catch (error) {
        console.log('❌ Error processing credentials:', error.message);
        return false;
    }
}

/**
 * Test environment variable reading from file
 */
function testEnvFileFormat() {
    console.log('\n📋 Testing .env file format...');
    
    const envFile = path.join(__dirname, '.env');
    
    if (!fs.existsSync(envFile)) {
        console.log('❌ .env file not found');
        return false;
    }
    
    try {
        const envContent = fs.readFileSync(envFile, 'utf8');
        const lines = envContent.split('\n');
        
        console.log(`✅ .env file read successfully, ${lines.length} lines`);
        
        // Check for Google credentials
        const googleCredLine = lines.find(line => line.startsWith('GOOGLE_CREDENTIALS_JSON='));
        if (googleCredLine) {
            console.log('✅ Found GOOGLE_CREDENTIALS_JSON in .env');
            const value = googleCredLine.split('=', 2)[1];
            
            if (value.startsWith('"') && value.endsWith('"')) {
                console.log('✅ Value is properly quoted');
                const unquoted = value.slice(1, -1);
                
                // Test parsing the unquoted value
                try {
                    JSON.parse(unquoted);
                    console.log('✅ JSON value parses correctly when unquoted');
                } catch (parseError) {
                    console.log('❌ JSON parsing failed:', parseError.message);
                }
            } else {
                console.log('⚠️ Value might need proper quoting');
            }
        }
        
        // Check for OpenAI key
        const openaiLine = lines.find(line => line.startsWith('OPENAI_API_KEY='));
        if (openaiLine) {
            console.log('✅ Found OPENAI_API_KEY in .env');
            const value = openaiLine.split('=', 2)[1];
            
            if (value.startsWith('sk-')) {
                console.log('✅ OpenAI key has correct format');
                console.log(`🔍 Key length: ${value.length}`);
            } else {
                console.log('❌ OpenAI key format appears incorrect');
            }
        }
        
        return true;
        
    } catch (error) {
        console.log('❌ Error reading .env file:', error.message);
        return false;
    }
}

/**
 * Generate Vercel deployment commands
 */
function generateVercelCommands() {
    console.log('\n🚀 Vercel Deployment Commands:');
    console.log('\nOption 1: Using Vercel CLI (Recommended)');
    console.log('vercel env add GOOGLE_CREDENTIALS_JSON');
    console.log('# Then paste the JSON string when prompted');
    console.log('');
    console.log('vercel env add OPENAI_API_KEY');
    console.log('# Then paste your API key when prompted');
    console.log('');
    console.log('Option 2: Using file upload');
    console.log('cat clauderon-bd2065b087b3.json | vercel env add GOOGLE_CREDENTIALS_JSON');
    console.log('');
    console.log('Option 3: Set via dashboard');
    console.log('Go to Vercel dashboard > Project > Settings > Environment Variables');
    console.log('');
    
    // Check if credentials file exists and generate exact command
    const credentialsFile = path.join(__dirname, 'clauderon-bd2065b087b3.json');
    if (fs.existsSync(credentialsFile)) {
        const content = fs.readFileSync(credentialsFile, 'utf8');
        const minified = JSON.stringify(JSON.parse(content));
        
        console.log('🎯 EXACT VERCEL CLI COMMAND:');
        console.log(`echo '${minified}' | vercel env add GOOGLE_CREDENTIALS_JSON production`);
    }
}

/**
 * Test potential Vercel-specific issues
 */
function testVercelSpecificIssues() {
    console.log('\n🔧 Testing Vercel-Specific Potential Issues...');
    
    // Test 1: Large environment variables
    const credentialsFile = path.join(__dirname, 'clauderon-bd2065b087b3.json');
    if (fs.existsSync(credentialsFile)) {
        const content = fs.readFileSync(credentialsFile, 'utf8');
        const size = Buffer.byteLength(content, 'utf8');
        
        console.log(`📏 Credentials file size: ${size} bytes`);
        
        if (size > 4096) {
            console.log('⚠️ Large environment variable - may hit Vercel limits');
        } else {
            console.log('✅ Size is within reasonable limits');
        }
    }
    
    // Test 2: Line endings
    console.log('\n🔍 Testing line ending compatibility...');
    if (fs.existsSync(credentialsFile)) {
        const content = fs.readFileSync(credentialsFile, 'utf8');
        const hasWindowsEndings = content.includes('\r\n');
        const hasUnixEndings = content.includes('\n') && !content.includes('\r\n');
        
        console.log(`Windows line endings (\\r\\n): ${hasWindowsEndings}`);
        console.log(`Unix line endings (\\n): ${hasUnixEndings}`);
        
        if (hasWindowsEndings) {
            console.log('⚠️ Windows line endings detected - may need conversion for Vercel');
        }
    }
    
    // Test 3: Character encoding
    console.log('\n🔍 Testing character encoding...');
    if (fs.existsSync(credentialsFile)) {
        try {
            const content = fs.readFileSync(credentialsFile, 'utf8');
            const parsed = JSON.parse(content);
            
            if (parsed.private_key) {
                const hasUnicodeChars = /[^\x00-\x7F]/.test(parsed.private_key);
                console.log(`Private key has non-ASCII characters: ${hasUnicodeChars}`);
                
                if (hasUnicodeChars) {
                    console.log('⚠️ Non-ASCII characters in private key may cause issues');
                }
            }
        } catch (error) {
            console.log('❌ Character encoding test failed:', error.message);
        }
    }
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Starting comprehensive environment variable format tests...\n');
    
    const results = {
        googleCredentials: testGoogleCredentialsFormat(),
        envFile: testEnvFileFormat()
    };
    
    testVercelSpecificIssues();
    generateVercelCommands();
    
    console.log('\n📊 Test Summary:');
    console.log(`Google Credentials: ${results.googleCredentials ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Environment File: ${results.envFile ? '✅ PASS' : '❌ FAIL'}`);
    
    if (results.googleCredentials && results.envFile) {
        console.log('\n🎉 All tests passed! Environment variables should work on Vercel.');
    } else {
        console.log('\n⚠️ Some tests failed. Check the output above for issues to resolve.');
    }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests().catch(console.error);
}

export { runAllTests, testGoogleCredentialsFormat, testEnvFileFormat };