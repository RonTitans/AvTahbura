/**
 * Comprehensive Environment Variable Debug Script for Vercel
 * 
 * This script tests and validates environment variables to identify
 * exactly where the formatting issues occur on Vercel vs local environment.
 */

import dotenv from 'dotenv';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import OpenAI from 'openai';
import fs from 'fs';

// Load environment variables
dotenv.config();

const DEBUG_RESULTS = {
    environment: process.env.NODE_ENV || 'development',
    platform: process.platform,
    timestamp: new Date().toISOString(),
    tests: []
};

/**
 * Add test result to debug results
 */
function addTestResult(testName, status, details, error = null) {
    const result = {
        test: testName,
        status: status, // 'pass', 'fail', 'warning'
        details: details,
        timestamp: new Date().toISOString()
    };
    
    if (error) {
        result.error = {
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines
            code: error.code
        };
    }
    
    DEBUG_RESULTS.tests.push(result);
    
    const statusEmoji = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
    console.log(`${statusEmoji} ${testName}: ${details}`);
    if (error) {
        console.log(`   Error: ${error.message}`);
    }
}

/**
 * Test 1: Basic Environment Variable Presence
 */
function testEnvVarPresence() {
    console.log('\n🔍 Testing Environment Variable Presence...');
    
    const requiredVars = [
        'GOOGLE_CREDENTIALS_JSON',
        'SPREADSHEET_ID', 
        'OPENAI_API_KEY',
        'SESSION_SECRET',
        'ADMIN_PASSWORD'
    ];
    
    requiredVars.forEach(varName => {
        const value = process.env[varName];
        if (value) {
            addTestResult(
                `${varName} Present`,
                'pass',
                `Length: ${value.length} chars, First 20: "${value.substring(0, 20)}..."`
            );
        } else {
            addTestResult(
                `${varName} Present`,
                'fail',
                'Environment variable not found or empty'
            );
        }
    });
}

/**
 * Test 2: Google Credentials JSON Parsing
 */
function testGoogleCredentialsFormat() {
    console.log('\n🔍 Testing Google Credentials JSON Format...');
    
    const credsJson = process.env.GOOGLE_CREDENTIALS_JSON;
    
    if (!credsJson) {
        addTestResult(
            'Google Credentials Format',
            'fail',
            'GOOGLE_CREDENTIALS_JSON environment variable not found'
        );
        return;
    }
    
    // Test raw string properties
    addTestResult(
        'Credentials Raw Length',
        'pass',
        `${credsJson.length} characters`
    );
    
    // Check for common escape character issues
    const escapeIssues = [];
    if (credsJson.includes('\\"')) escapeIssues.push('Contains \\"');
    if (credsJson.includes('\\n')) escapeIssues.push('Contains \\n');
    if (credsJson.includes('\\r')) escapeIssues.push('Contains \\r');
    if (credsJson.includes('\\\\"')) escapeIssues.push('Contains \\\\"');
    
    if (escapeIssues.length > 0) {
        addTestResult(
            'Escape Character Issues',
            'warning',
            `Found: ${escapeIssues.join(', ')}`
        );
    } else {
        addTestResult(
            'Escape Character Issues',
            'pass',
            'No obvious escape character issues found'
        );
    }
    
    // Test JSON parsing
    try {
        const parsed = JSON.parse(credsJson);
        addTestResult(
            'JSON Parsing',
            'pass',
            `Successfully parsed. Keys: ${Object.keys(parsed).join(', ')}`
        );
        
        // Validate required fields
        const requiredFields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email', 'client_id'];
        const missingFields = requiredFields.filter(field => !parsed[field]);
        
        if (missingFields.length === 0) {
            addTestResult(
                'Required Credential Fields',
                'pass',
                `All required fields present. Service Account: ${parsed.client_email}`
            );
        } else {
            addTestResult(
                'Required Credential Fields',
                'fail',
                `Missing fields: ${missingFields.join(', ')}`
            );
        }
        
        // Test private key format
        if (parsed.private_key) {
            if (parsed.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
                addTestResult(
                    'Private Key Format',
                    'pass',
                    'Private key has correct header format'
                );
            } else {
                addTestResult(
                    'Private Key Format',
                    'fail',
                    'Private key missing proper header/format'
                );
            }
            
            // Check for newline issues in private key
            const keyLines = parsed.private_key.split('\n').length;
            addTestResult(
                'Private Key Line Structure',
                keyLines > 5 ? 'pass' : 'warning',
                `Private key has ${keyLines} lines (should be > 5)`
            );
        }
        
    } catch (error) {
        addTestResult(
            'JSON Parsing',
            'fail',
            'Failed to parse GOOGLE_CREDENTIALS_JSON as valid JSON',
            error
        );
        
        // Try to identify specific parsing issues
        if (error.message.includes('Unexpected')) {
            const position = error.message.match(/position (\d+)/);
            if (position) {
                const pos = parseInt(position[1]);
                const context = credsJson.substring(Math.max(0, pos - 20), pos + 20);
                addTestResult(
                    'JSON Parse Error Context',
                    'fail',
                    `Error near position ${pos}: "${context}"`
                );
            }
        }
    }
}

/**
 * Test 3: OpenAI API Key Format
 */
function testOpenAIKeyFormat() {
    console.log('\n🔍 Testing OpenAI API Key Format...');
    
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
        addTestResult(
            'OpenAI API Key Format',
            'fail',
            'OPENAI_API_KEY environment variable not found'
        );
        return;
    }
    
    addTestResult(
        'API Key Length',
        'pass',
        `${apiKey.length} characters`
    );
    
    if (apiKey.startsWith('sk-')) {
        addTestResult(
            'API Key Prefix',
            'pass',
            'Starts with "sk-" as expected'
        );
    } else {
        addTestResult(
            'API Key Prefix',
            'fail',
            `Unexpected prefix: "${apiKey.substring(0, 10)}..."`
        );
    }
    
    // Check for whitespace issues
    if (apiKey.trim() !== apiKey) {
        addTestResult(
            'API Key Whitespace',
            'fail',
            'API key has leading or trailing whitespace'
        );
    } else {
        addTestResult(
            'API Key Whitespace',
            'pass',
            'No leading/trailing whitespace found'
        );
    }
    
    // Check for unexpected characters
    const validChars = /^[a-zA-Z0-9\-_]+$/;
    if (validChars.test(apiKey)) {
        addTestResult(
            'API Key Characters',
            'pass',
            'Contains only valid characters'
        );
    } else {
        addTestResult(
            'API Key Characters',
            'warning',
            'Contains unexpected characters'
        );
    }
}

/**
 * Test 4: Google Sheets Authentication
 */
async function testGoogleSheetsAuth() {
    console.log('\n🔍 Testing Google Sheets Authentication...');
    
    if (!process.env.GOOGLE_CREDENTIALS_JSON) {
        addTestResult(
            'Google Sheets Auth',
            'fail',
            'No credentials to test'
        );
        return;
    }
    
    try {
        // Parse credentials
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        
        // Create auth instance
        const auth = new GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        
        addTestResult(
            'GoogleAuth Instance Creation',
            'pass',
            'Successfully created GoogleAuth instance'
        );
        
        // Get auth client
        const authClient = await auth.getClient();
        addTestResult(
            'Auth Client Creation',
            'pass',
            'Successfully created auth client'
        );
        
        // Create sheets instance
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        addTestResult(
            'Sheets API Instance',
            'pass',
            'Successfully created Sheets API instance'
        );
        
        // Test actual spreadsheet access if SPREADSHEET_ID is available
        if (process.env.SPREADSHEET_ID) {
            try {
                const response = await sheets.spreadsheets.get({
                    spreadsheetId: process.env.SPREADSHEET_ID
                });
                
                addTestResult(
                    'Spreadsheet Access',
                    'pass',
                    `Successfully accessed: "${response.data.properties.title}"`
                );
                
                // Test data reading
                const dataResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: process.env.SPREADSHEET_ID,
                    range: 'Cleaned_Answers_Data!A1:C5'
                });
                
                const rows = dataResponse.data.values;
                addTestResult(
                    'Data Reading',
                    'pass',
                    `Successfully read ${rows?.length || 0} rows`
                );
                
            } catch (error) {
                addTestResult(
                    'Spreadsheet Access',
                    'fail',
                    'Failed to access spreadsheet',
                    error
                );
            }
        } else {
            addTestResult(
                'Spreadsheet Access',
                'warning',
                'SPREADSHEET_ID not available for testing'
            );
        }
        
    } catch (error) {
        addTestResult(
            'Google Sheets Authentication',
            'fail',
            'Authentication failed',
            error
        );
    }
}

/**
 * Test 5: OpenAI Connection
 */
async function testOpenAIConnection() {
    console.log('\n🔍 Testing OpenAI Connection...');
    
    if (!process.env.OPENAI_API_KEY) {
        addTestResult(
            'OpenAI Connection',
            'fail',
            'No API key to test'
        );
        return;
    }
    
    try {
        const openai = new OpenAI({ 
            apiKey: process.env.OPENAI_API_KEY 
        });
        
        addTestResult(
            'OpenAI Instance Creation',
            'pass',
            'Successfully created OpenAI instance'
        );
        
        // Test simple completion
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: "Say 'Connection test successful'" }],
            max_tokens: 10
        });
        
        if (completion.choices && completion.choices.length > 0) {
            addTestResult(
                'OpenAI API Call',
                'pass',
                `Response: "${completion.choices[0].message.content}"`
            );
        } else {
            addTestResult(
                'OpenAI API Call',
                'fail',
                'No response received from OpenAI'
            );
        }
        
    } catch (error) {
        addTestResult(
            'OpenAI Connection',
            'fail',
            'Connection failed',
            error
        );
    }
}

/**
 * Test 6: Environment-Specific Checks
 */
function testEnvironmentSpecifics() {
    console.log('\n🔍 Testing Environment-Specific Configuration...');
    
    // Check if we're running on Vercel
    const isVercel = !!process.env.VERCEL || !!process.env.NOW_REGION;
    addTestResult(
        'Platform Detection',
        'pass',
        `Running on ${isVercel ? 'Vercel' : 'Local/Other'}`
    );
    
    if (isVercel) {
        // Vercel-specific checks
        addTestResult(
            'Vercel Region',
            'pass',
            `Region: ${process.env.VERCEL_REGION || process.env.NOW_REGION || 'Unknown'}`
        );
        
        addTestResult(
            'Vercel URL',
            'pass',
            `URL: ${process.env.VERCEL_URL || 'Not available'}`
        );
    }
    
    // Memory and limits
    const memUsage = process.memoryUsage();
    addTestResult(
        'Memory Usage',
        'pass',
        `Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`
    );
    
    // Node version
    addTestResult(
        'Node.js Version',
        'pass',
        `Version: ${process.version}`
    );
}

/**
 * Main debug function
 */
export async function runEnvironmentDebug() {
    console.log('🚀 Starting Comprehensive Environment Variable Debug...');
    console.log(`📅 Timestamp: ${DEBUG_RESULTS.timestamp}`);
    console.log(`🌍 Environment: ${DEBUG_RESULTS.environment}`);
    console.log(`💻 Platform: ${DEBUG_RESULTS.platform}`);
    
    try {
        // Run all tests
        testEnvVarPresence();
        testGoogleCredentialsFormat();
        testOpenAIKeyFormat();
        await testGoogleSheetsAuth();
        await testOpenAIConnection();
        testEnvironmentSpecifics();
        
        // Summary
        const passCount = DEBUG_RESULTS.tests.filter(t => t.status === 'pass').length;
        const failCount = DEBUG_RESULTS.tests.filter(t => t.status === 'fail').length;
        const warningCount = DEBUG_RESULTS.tests.filter(t => t.status === 'warning').length;
        
        console.log('\n📊 DEBUG SUMMARY:');
        console.log(`✅ Passed: ${passCount}`);
        console.log(`❌ Failed: ${failCount}`);
        console.log(`⚠️  Warnings: ${warningCount}`);
        console.log(`📝 Total Tests: ${DEBUG_RESULTS.tests.length}`);
        
        if (failCount > 0) {
            console.log('\n🚨 CRITICAL ISSUES FOUND:');
            DEBUG_RESULTS.tests
                .filter(t => t.status === 'fail')
                .forEach(test => {
                    console.log(`❌ ${test.test}: ${test.details}`);
                    if (test.error) {
                        console.log(`   Error: ${test.error.message}`);
                    }
                });
        }
        
        return DEBUG_RESULTS;
        
    } catch (error) {
        console.error('❌ Debug script failed:', error);
        addTestResult(
            'Debug Script Execution',
            'fail',
            'Script execution failed',
            error
        );
        return DEBUG_RESULTS;
    }
}

/**
 * Express endpoint for running debug tests
 */
export function debugEndpointHandler(req, res) {
    runEnvironmentDebug()
        .then(results => {
            res.json({
                success: true,
                debug_results: results,
                recommendations: generateRecommendations(results)
            });
        })
        .catch(error => {
            res.status(500).json({
                success: false,
                error: error.message,
                debug_results: DEBUG_RESULTS
            });
        });
}

/**
 * Generate recommendations based on test results
 */
function generateRecommendations(results) {
    const recommendations = [];
    const failedTests = results.tests.filter(t => t.status === 'fail');
    
    failedTests.forEach(test => {
        switch (test.test) {
            case 'JSON Parsing':
                recommendations.push({
                    issue: 'Google Credentials JSON parsing failed',
                    solution: 'Check for escape character issues. On Vercel, ensure the JSON is properly escaped when setting the environment variable.',
                    action: 'Try using single quotes around the JSON value or use the Vercel CLI to set the variable from a file.'
                });
                break;
                
            case 'OpenAI API Key Format':
                recommendations.push({
                    issue: 'OpenAI API key format invalid',
                    solution: 'Verify the API key starts with "sk-" and contains no extra characters.',
                    action: 'Re-copy the API key from OpenAI dashboard, ensuring no whitespace is included.'
                });
                break;
                
            case 'Spreadsheet Access':
                recommendations.push({
                    issue: 'Cannot access Google Spreadsheet',
                    solution: 'Verify the service account has been granted access to the spreadsheet.',
                    action: 'Share the spreadsheet with the service account email address with Editor permissions.'
                });
                break;
                
            case 'OpenAI Connection':
                recommendations.push({
                    issue: 'OpenAI API connection failed',
                    solution: 'Check if API key is valid and has sufficient credits.',
                    action: 'Verify API key in OpenAI dashboard and check billing status.'
                });
                break;
        }
    });
    
    return recommendations;
}

// If running directly (not as import)
if (import.meta.url === `file://${process.argv[1]}`) {
    runEnvironmentDebug().catch(console.error);
}