/**
 * Test script for quality filtering in RAG system
 * Tests the new content quality scoring and multiple results features
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.VERCEL_URL || 'http://localhost:3001';

// Test queries
const testQueries = [
  {
    name: 'Bus Line 409',
    query: 'קו 409',
    expectedBusLines: ['409']
  },
  {
    name: 'Bus Line 18 to Ramot',
    query: 'קו 18 לרמות',
    expectedBusLines: ['18'],
    expectedLocations: ['רמות']
  },
  {
    name: 'Adding stop to line 409',
    query: 'הוספת תחנה קו 409',
    expectedBusLines: ['409']
  },
  {
    name: 'Crowding complaint line 34א',
    query: 'תלונה על צפיפות בקו 34א',
    expectedBusLines: ['34א']
  }
];

/**
 * Test single result mode
 */
async function testSingleResult(query) {
  console.log(`\n📝 Testing single result for: "${query.query}"`);
  console.log('=' . repeat(60));
  
  try {
    const response = await fetch(`${API_URL}/smart-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inquiry_text: query.query,
        return_multiple: false
      })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('❌ Search failed:', data.error);
      return;
    }
    
    console.log(`✅ Answer: ${data.answer.substring(0, 200)}${data.answer.length > 200 ? '...' : ''}`);
    console.log(`📊 Confidence: ${data.confidence}`);
    
    if (data.quality_warning) {
      console.log(`⚠️  Quality Warning: ${data.quality_warning}`);
    }
    
    if (data.search_info?.top_result_quality) {
      const quality = data.search_info.top_result_quality;
      console.log(`📈 Quality Score: ${quality.score.toFixed(2)}`);
      console.log(`🏷️  Classification: ${quality.classification}`);
    }
    
    console.log(`🔍 Method: ${data.method}`);
    console.log(`📚 Sources: ${data.source_rows?.join(', ') || 'None'}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

/**
 * Test multiple results mode
 */
async function testMultipleResults(query) {
  console.log(`\n📋 Testing multiple results for: "${query.query}"`);
  console.log('=' . repeat(60));
  
  try {
    const response = await fetch(`${API_URL}/smart-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inquiry_text: query.query,
        return_multiple: true
      })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('❌ Search failed:', data.error);
      return;
    }
    
    console.log(`📊 Found ${data.total_results} results`);
    console.log(`⏱️  Search time: ${data.search_info?.timing}ms`);
    
    // Quality statistics
    const stats = data.search_info?.quality_stats;
    if (stats) {
      console.log(`\n📈 Quality Distribution:`);
      console.log(`  • Public responses: ${stats.public_responses}`);
      console.log(`  • Mixed content: ${stats.mixed_content}`);
      console.log(`  • Internal communications: ${stats.internal_comms}`);
    }
    
    // Display each result
    console.log(`\n🔍 Results:`);
    data.multiple_results?.forEach((result, index) => {
      console.log(`\n${index + 1}. Row #${result.rowNumber} (Score: ${result.score})`);
      console.log(`   Match Type: ${result.matchType}`);
      
      if (result.quality) {
        const emoji = result.quality.classification === 'public_response' ? '✅' : 
                      result.quality.classification === 'mixed_content' ? '⚠️' : '❌';
        console.log(`   Quality: ${emoji} ${result.quality.classification} (${result.quality.score})`);
        
        if (result.quality.warning) {
          console.log(`   Warning: ${result.quality.warning}`);
        }
      }
      
      if (result.busLines?.length > 0) {
        console.log(`   Bus Lines: ${result.busLines.join(', ')}`);
      }
      
      if (result.locations?.length > 0) {
        console.log(`   Locations: ${result.locations.join(', ')}`);
      }
      
      console.log(`   Preview: ${result.preview}`);
    });
    
    // Check if expected entities were found
    if (query.expectedBusLines) {
      const foundLines = new Set(data.multiple_results?.flatMap(r => r.busLines) || []);
      const hasExpectedLines = query.expectedBusLines.every(line => foundLines.has(line));
      console.log(`\n✅ Expected bus lines found: ${hasExpectedLines ? 'Yes' : 'No'}`);
    }
    
    if (query.expectedLocations) {
      const foundLocations = new Set(data.multiple_results?.flatMap(r => r.locations) || []);
      const hasExpectedLocations = query.expectedLocations.some(loc => 
        Array.from(foundLocations).some(foundLoc => foundLoc.includes(loc))
      );
      console.log(`✅ Expected locations found: ${hasExpectedLocations ? 'Yes' : 'No'}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🚀 Starting Quality Filter Tests');
  console.log('=' . repeat(60));
  console.log(`📍 API URL: ${API_URL}`);
  
  for (const query of testQueries) {
    // Test single result mode
    await testSingleResult(query);
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test multiple results mode
    await testMultipleResults(query);
    
    // Delay between queries
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n✅ All tests completed!');
}

// Run tests
runTests().catch(console.error);