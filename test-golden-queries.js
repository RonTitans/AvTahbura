/**
 * Golden Query Test Suite for RAG System
 * Tests the 3 provided queries to validate Precision@1 and system behavior
 */

require('dotenv').config();
const { analyzeQuery } = require('./rag/core/analyzer');
const { normalizeHebrew, extractBusLines } = require('./rag/core/normalizer');

// Golden test queries from Ron
const goldenQueries = [
  {
    id: 'GQ1',
    query: 'שינוי מסלול- קו 408,חברת בית שמש אקספרס ביום 01112024 שינוי מסלול הערות הפונה שלום וברכה, לאחרונה שונה מסלול קו 408, באיצטלה של יעול הקו ושיפור השירות... מה עם אלפי התושבים המגוררים לאורך רחוב נהר הירדן... צריך להוסיף עוד קווים , לא לשנות מסלול !!! ...',
    expectedCaseId: 'CAS-653181-L8G1R8',
    expectedEntities: {
      lines: ['408'],
      locations: ['בית שמש', 'נהר הירדן'],
      type: 'שינוי מסלול',
      operator: 'בית שמש אקספרס'
    },
    llmGatingExpect: 'SKIP' // Should skip LLM due to exact line+location match
  },
  {
    id: 'GQ2',
    query: 'הוספת תדירות קו 132 ביום 03122024 בשעה תחנת אירוע שדרות גולדה מאיר/בנימין מינץ... בקשה להוספת תדירות עקב עומס... לגבעת זאב... תתגברו החל ממחר...',
    expectedCaseId: 'CAS-657647-B7P9C7',
    expectedEntities: {
      lines: ['132'],
      locations: ['שדרות גולדה מאיר', 'בנימין מינץ', 'גבעת זאב'],
      type: 'הוספת תדירות'
    },
    llmGatingExpect: 'SKIP' // Should skip due to strong match
  },
  {
    id: 'GQ3',
    query: 'אוטובוס- אחר... אני גרה בצור הדסה... במוצאי שבת אין שום אוטובוס למסעף מבוא ביתר/ביתר עילית... קו 136 לא פועל במוצ״ש... לתגבר את קו 198… להוסיף תחנת העלאה במסעף מבוא ביתר... גם בכיוון ההפוך... בשעות הלילה אחרי 9...',
    expectedCaseId: 'CAS-571594-T2R3W4',
    expectedEntities: {
      lines: ['136', '198'],
      locations: ['צור הדסה', 'מסעף מבוא ביתר', 'ביתר עילית'],
      type: 'שיפור שירות'
    },
    llmGatingExpect: 'USE_LLM' // Multi-entity, should use LLM for synthesis
  }
];

/**
 * Test entity extraction
 */
function testEntityExtraction() {
  console.log('\n' + '='.repeat(60));
  console.log('📝 TESTING ENTITY EXTRACTION');
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  goldenQueries.forEach(gq => {
    console.log(`\n🔍 Testing ${gq.id}: Entity Extraction`);
    console.log(`Query: "${gq.query.substring(0, 80)}..."`);
    
    // Analyze query
    const analysis = analyzeQuery(gq.query);
    
    // Check bus lines
    const expectedLines = gq.expectedEntities.lines.sort();
    const extractedLines = analysis.entities.busLines.sort();
    const linesMatch = JSON.stringify(expectedLines) === JSON.stringify(extractedLines);
    
    console.log(`  Bus Lines: ${linesMatch ? '✅' : '❌'}`);
    console.log(`    Expected: [${expectedLines.join(', ')}]`);
    console.log(`    Extracted: [${extractedLines.join(', ')}]`);
    
    // Check locations (fuzzy match)
    const expectedLocs = gq.expectedEntities.locations;
    const extractedLocs = analysis.entities.locations;
    let locMatches = 0;
    expectedLocs.forEach(loc => {
      if (extractedLocs.some(extracted => 
        normalizeHebrew(extracted).includes(normalizeHebrew(loc)) ||
        normalizeHebrew(loc).includes(normalizeHebrew(extracted))
      )) {
        locMatches++;
      }
    });
    const locsMatch = locMatches >= expectedLocs.length * 0.7; // 70% match threshold
    
    console.log(`  Locations: ${locsMatch ? '✅' : '❌'}`);
    console.log(`    Expected: [${expectedLocs.join(', ')}]`);
    console.log(`    Extracted: [${extractedLocs.join(', ')}]`);
    
    // Check topic
    const topicMatch = analysis.entities.topic === gq.expectedEntities.type;
    console.log(`  Topic: ${topicMatch ? '✅' : '❌'}`);
    console.log(`    Expected: ${gq.expectedEntities.type}`);
    console.log(`    Extracted: ${analysis.entities.topic}`);
    
    // Check operator if specified
    if (gq.expectedEntities.operator) {
      const operatorMatch = analysis.entities.operators.includes(gq.expectedEntities.operator);
      console.log(`  Operator: ${operatorMatch ? '✅' : '❌'}`);
      console.log(`    Expected: ${gq.expectedEntities.operator}`);
      console.log(`    Extracted: [${analysis.entities.operators.join(', ')}]`);
    }
    
    // Overall test result
    const testPassed = linesMatch && locsMatch;
    if (testPassed) {
      console.log(`\n  ✅ ${gq.id} PASSED entity extraction`);
      passed++;
    } else {
      console.log(`\n  ❌ ${gq.id} FAILED entity extraction`);
      failed++;
    }
  });
  
  console.log('\n' + '-'.repeat(60));
  console.log(`Entity Extraction Results: ${passed}/${goldenQueries.length} passed`);
  
  return { passed, failed };
}

/**
 * Test API endpoints (requires server running)
 */
async function testAPIEndpoints() {
  console.log('\n' + '='.repeat(60));
  console.log('🔌 TESTING API ENDPOINTS');
  console.log('='.repeat(60));
  
  const baseUrl = process.env.API_URL || 'http://localhost:3000';
  
  // Test /api/status
  console.log('\n📊 Testing /api/status...');
  try {
    const response = await fetch(`${baseUrl}/api/status`);
    const status = await response.json();
    
    console.log('  Index Pack exists:', status.index_pack?.exists ? '✅' : '❌');
    console.log('  Cache loaded:', status.index_pack?.loaded_in_cache ? '✅' : '❌');
    console.log('  Documents:', status.index_pack?.document_count || 0);
    console.log('  OpenAI configured:', status.features?.openai_configured ? '✅' : '❌');
    
    if (!status.index_pack?.exists) {
      console.log('\n⚠️  Index Pack not found. Run /api/refresh first!');
      return { passed: 0, failed: 1 };
    }
  } catch (error) {
    console.error('❌ Failed to connect to API:', error.message);
    console.log('\n⚠️  Make sure the server is running: npm run dev');
    return { passed: 0, failed: 1 };
  }
  
  // Test golden queries
  console.log('\n🔍 Testing Golden Queries via API...');
  let passed = 0;
  let failed = 0;
  
  for (const gq of goldenQueries) {
    console.log(`\n📝 Testing ${gq.id}...`);
    console.log(`Query: "${gq.query.substring(0, 80)}..."`);
    
    try {
      const response = await fetch(`${baseUrl}/api/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gq.query })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        console.log(`  ❌ API returned error: ${result.error}`);
        failed++;
        continue;
      }
      
      // Check if the expected case ID is in top results
      const sources = result.sources || [];
      const topSource = sources[0];
      const matchFound = sources.some(s => s.caseId === gq.expectedCaseId);
      
      console.log(`  Top result: ${topSource?.caseId || 'none'}`);
      console.log(`  Expected: ${gq.expectedCaseId}`);
      console.log(`  Match: ${matchFound ? '✅' : '❌'}`);
      
      // Check LLM gating
      const llmUsed = result.search_info?.llm_used;
      const expectedLLM = gq.llmGatingExpect === 'USE_LLM';
      const gatingCorrect = llmUsed === expectedLLM;
      
      console.log(`  LLM Gating: ${gatingCorrect ? '✅' : '❌'}`);
      console.log(`    Expected: ${gq.llmGatingExpect}`);
      console.log(`    Actual: ${llmUsed ? 'USE_LLM' : 'SKIP'} (${result.search_info?.skip_reason || 'used'})`);
      
      // Check retrieval method
      console.log(`  Method: ${result.search_info?.retrieval_method || result.method}`);
      console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      console.log(`  Response time: ${result.search_info?.timing_ms || 'N/A'}ms`);
      
      if (matchFound) {
        console.log(`\n  ✅ ${gq.id} PASSED`);
        passed++;
      } else {
        console.log(`\n  ❌ ${gq.id} FAILED - wrong top result`);
        failed++;
      }
      
    } catch (error) {
      console.error(`  ❌ API call failed:`, error.message);
      failed++;
    }
  }
  
  console.log('\n' + '-'.repeat(60));
  console.log(`API Test Results: ${passed}/${goldenQueries.length} passed`);
  
  // Calculate Precision@1
  const precision = passed / goldenQueries.length;
  console.log(`Precision@1: ${(precision * 100).toFixed(0)}%`);
  
  return { passed, failed, precision };
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n🚀 RAG SYSTEM GOLDEN QUERY TEST SUITE');
  console.log('=====================================\n');
  
  // Test 1: Entity Extraction
  const entityResults = testEntityExtraction();
  
  // Test 2: API Endpoints (if server is running)
  console.log('\n⏳ Waiting 2 seconds before API tests...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const apiResults = await testAPIEndpoints();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL TEST SUMMARY');
  console.log('='.repeat(60));
  
  const totalPassed = entityResults.passed + apiResults.passed;
  const totalTests = goldenQueries.length * 2; // Entity + API tests
  
  console.log(`\nEntity Extraction: ${entityResults.passed}/${goldenQueries.length} passed`);
  console.log(`API Integration: ${apiResults.passed}/${goldenQueries.length} passed`);
  console.log(`Precision@1: ${((apiResults.precision || 0) * 100).toFixed(0)}%`);
  console.log(`\nOverall: ${totalPassed}/${totalTests} tests passed`);
  
  if (apiResults.precision >= 0.8) {
    console.log('\n✅ SUCCESS: Precision@1 target (80%) achieved!');
  } else {
    console.log('\n⚠️  Precision@1 below target (80%)');
    console.log('   Consider adding more golden test cases');
  }
  
  process.exit(totalPassed === totalTests ? 0 : 1);
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = {
  goldenQueries,
  testEntityExtraction,
  testAPIEndpoints,
  runTests
};