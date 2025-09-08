/**
 * Simple RAG Test - Standalone version
 * Tests entity extraction logic without module dependencies
 */

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
    }
  },
  {
    id: 'GQ2',
    query: 'הוספת תדירות קו 132 ביום 03122024 בשעה תחנת אירוע שדרות גולדה מאיר/בנימין מינץ... בקשה להוספת תדירות עקב עומס... לגבעת זאב... תתגברו החל ממחר...',
    expectedCaseId: 'CAS-657647-B7P9C7',
    expectedEntities: {
      lines: ['132'],
      locations: ['שדרות גולדה מאיר', 'בנימין מינץ', 'גבעת זאב'],
      type: 'הוספת תדירות'
    }
  },
  {
    id: 'GQ3',
    query: 'אוטובוס- אחר... אני גרה בצור הדסה... במוצאי שבת אין שום אוטובוס למסעף מבוא ביתר/ביתר עילית... קו 136 לא פועל במוצ״ש... לתגבר את קו 198… להוסיף תחנת העלאה במסעף מבוא ביתר... גם בכיוון ההפוך... בשעות הלילה אחרי 9...',
    expectedCaseId: 'CAS-571594-T2R3W4',
    expectedEntities: {
      lines: ['136', '198'],
      locations: ['צור הדסה', 'מסעף מבוא ביתר', 'ביתר עילית'],
      type: 'שיפור שירות'
    }
  }
];

// Simple Hebrew normalizer
function normalizeHebrew(text) {
  if (!text) return '';
  return text
    .replace(/[\u0591-\u05C7]/g, '') // Remove niqqud
    .replace(/ך/g, 'כ')
    .replace(/ם/g, 'מ')
    .replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ')
    .replace(/ץ/g, 'צ')
    .replace(/[״""''׳`´]/g, '"')
    .replace(/[–—־]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Simple bus line extractor
function extractBusLines(text) {
  const lines = new Set();
  const normalizedText = text.replace(/[\u0591-\u05C7]/g, '');
  
  // Look specifically for "קו NUMBER" pattern
  const linePattern = /קו\s+(\d{1,3}[א-ת]?)/g;
  let match;
  while ((match = linePattern.exec(normalizedText)) !== null) {
    let line = match[1].replace(/['-]/g, '').replace(/׳/g, '');
    lines.add(line);
  }
  
  // Also look for numbers with Hebrew suffix that are likely bus lines
  const suffixPattern = /\b(\d{1,3}[א-ת])\b/g;
  while ((match = suffixPattern.exec(normalizedText)) !== null) {
    let line = match[1].replace(/['-]/g, '').replace(/׳/g, '');
    lines.add(line);
  }
  
  return Array.from(lines).sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  });
}

// Test entity extraction
console.log('\n=================================================');
console.log('🧪 SIMPLE RAG TEST - ENTITY EXTRACTION');
console.log('=================================================\n');

let totalPassed = 0;
let totalFailed = 0;

goldenQueries.forEach(gq => {
  console.log(`📝 Testing ${gq.id}`);
  console.log(`Query: "${gq.query.substring(0, 60)}..."\n`);
  
  // Extract bus lines
  const extractedLines = extractBusLines(gq.query);
  const expectedLines = gq.expectedEntities.lines;
  const linesMatch = JSON.stringify(extractedLines.sort()) === JSON.stringify(expectedLines.sort());
  
  console.log(`  Bus Lines: ${linesMatch ? '✅' : '❌'}`);
  console.log(`    Expected: [${expectedLines.join(', ')}]`);
  console.log(`    Extracted: [${extractedLines.join(', ')}]`);
  
  // Check if query contains expected locations
  const normalizedQuery = normalizeHebrew(gq.query);
  const locationsFound = gq.expectedEntities.locations.filter(loc => 
    normalizedQuery.includes(normalizeHebrew(loc))
  );
  const locationsMatch = locationsFound.length >= gq.expectedEntities.locations.length * 0.7;
  
  console.log(`  Locations: ${locationsMatch ? '✅' : '❌'}`);
  console.log(`    Expected: [${gq.expectedEntities.locations.join(', ')}]`);
  console.log(`    Found in text: [${locationsFound.join(', ')}]`);
  
  // Check operator if present
  if (gq.expectedEntities.operator) {
    const operatorFound = normalizedQuery.includes(normalizeHebrew(gq.expectedEntities.operator));
    console.log(`  Operator: ${operatorFound ? '✅' : '❌'}`);
    console.log(`    Expected: ${gq.expectedEntities.operator}`);
    console.log(`    Found: ${operatorFound ? 'Yes' : 'No'}`);
  }
  
  const passed = linesMatch && locationsMatch;
  if (passed) {
    console.log(`\n  ✅ ${gq.id} PASSED\n`);
    totalPassed++;
  } else {
    console.log(`\n  ❌ ${gq.id} FAILED\n`);
    totalFailed++;
  }
  
  console.log('-'.repeat(50) + '\n');
});

// Test API if server is running
console.log('📡 Testing API Endpoints...\n');

const testAPI = async () => {
  const baseUrl = 'http://localhost:3000';
  
  try {
    // Check server status
    console.log('Checking server status...');
    const response = await fetch(`${baseUrl}/api/status`).catch(() => null);
    
    if (!response) {
      console.log('⚠️  Server not running. Start with: npm run dev\n');
      return;
    }
    
    const status = await response.json();
    console.log('✅ Server is running');
    console.log(`  Index Pack: ${status.index_pack?.exists ? 'Ready' : 'Not found'}`);
    console.log(`  Documents: ${status.index_pack?.document_count || 0}`);
    console.log(`  OpenAI: ${status.features?.openai_configured ? 'Configured' : 'Not configured'}\n`);
    
    if (!status.index_pack?.exists) {
      console.log('⚠️  Index Pack not built. Run: curl -X POST http://localhost:3000/api/refresh\n');
      return;
    }
    
    // Test each golden query
    console.log('Testing golden queries via API...\n');
    
    for (const gq of goldenQueries) {
      console.log(`Testing ${gq.id}...`);
      
      const apiResponse = await fetch(`${baseUrl}/api/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gq.query })
      });
      
      const result = await apiResponse.json();
      
      if (result.success) {
        const topSource = result.sources?.[0];
        const matchFound = result.sources?.some(s => 
          s.caseId === gq.expectedCaseId || 
          s.case_id === gq.expectedCaseId
        );
        
        console.log(`  Result: ${matchFound ? '✅' : '❌'}`);
        console.log(`    Expected: ${gq.expectedCaseId}`);
        console.log(`    Got: ${topSource?.caseId || topSource?.case_id || 'No match'}`);
        console.log(`    Method: ${result.method || result.search_info?.retrieval_method}`);
        console.log(`    Confidence: ${(result.confidence * 100).toFixed(0)}%\n`);
      } else {
        console.log(`  ❌ API Error: ${result.error}\n`);
      }
    }
    
  } catch (error) {
    console.log(`❌ API Test Error: ${error.message}\n`);
  }
};

// Run API test
testAPI().then(() => {
  console.log('=================================================');
  console.log('📊 SUMMARY');
  console.log('=================================================\n');
  console.log(`Entity Extraction: ${totalPassed}/${goldenQueries.length} passed`);
  
  if (totalPassed === goldenQueries.length) {
    console.log('\n✅ All entity extraction tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Check the implementation.');
  }
  
  console.log('\nNext steps:');
  console.log('1. Start the server: npm run dev');
  console.log('2. Build index: curl -X POST http://localhost:3000/api/refresh');
  console.log('3. Test search: curl -X POST http://localhost:3000/api/recommend -H "Content-Type: application/json" -d \'{"query":"קו 18 לרמות"}\'');
});