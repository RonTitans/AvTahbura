import XLSX from 'xlsx';
import { deduplicateByLatestDate } from './rag/preprocessing/deduplicate.js';
import { batchClean } from './rag/preprocessing/cleaner.js';
import { buildIndexPack } from './rag/core/indexer.js';
import { hybridRetrieve } from './rag/core/retriever.js';
import { selectBestResponse } from './rag/core/selector.js';

console.log('🧪 Testing Complete RAG Pipeline with Real Data\n');

// Load the Excel file
const workbook = XLSX.readFile('F:/ClaudeCode/AvTahbura/Copy of Cleaned_Answers_Data (1).xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rawData = XLSX.utils.sheet_to_json(sheet);

// Step 1: Preprocess data
console.log('📊 Preprocessing Data:');
const deduplicated = deduplicateByLatestDate(rawData);
const cleaned = batchClean(deduplicated);

// Step 2: Analyze actual topics and locations in the data
console.log('\n📍 Analyzing Actual Data Content:');
const topics = new Set();
const locations = new Set();
const busLines = new Set();

cleaned.forEach(item => {
  if (item.topic) topics.add(item.topic);
  
  // Extract bus lines from inquiry
  const lineMatches = item.inquiry_text?.match(/קו\s*(\d+[א-ת]?)/g);
  if (lineMatches) {
    lineMatches.forEach(match => {
      const line = match.replace(/קו\s*/, '');
      busLines.add(line);
    });
  }
  
  // Common Jerusalem locations
  const jerusalemLocations = [
    'רמות', 'רמת אשכול', 'גילה', 'הר נוף', 'קטמון', 'בית וגן',
    'פסגת זאב', 'נווה יעקב', 'גבעת שאול', 'מלחה', 'תלפיות',
    'רמת בית שמש', 'בית שמש', 'מעלה אדומים', 'גבעת זאב'
  ];
  
  jerusalemLocations.forEach(loc => {
    if (item.inquiry_text?.includes(loc)) {
      locations.add(loc);
    }
  });
});

console.log(`Topics found (${topics.size}):`, Array.from(topics).slice(0, 10));
console.log(`Bus lines found (${busLines.size}):`, Array.from(busLines).slice(0, 20));
console.log(`Locations found (${locations.size}):`, Array.from(locations));

// Step 3: Build index pack
console.log('\n🏗️ Building Index Pack:');
const indexPack = await buildIndexPack(
  cleaned.slice(0, 500), // Test with first 500 for speed
  null, // No OpenAI for testing
  null,
  { deduplicate: false, cleanResponses: false, skipEmbeddings: true }
);

console.log(`Index built with ${indexPack.documents.length} documents`);

// Step 4: Test with REAL queries similar to what's in the data
console.log('\n🎯 Testing with Real-Style Queries:\n');

const testQueries = [
  {
    query: "שלום, אני גרה ברמות ועובדת בגבעת שאול. קו 32 שינה את המסלול ועכשיו לא עוצר ליד הבית שלי. למה שינו את המסלול? מתי יחזירו אותו?",
    expectedBusLine: "32",
    expectedLocations: ["רמות", "גבעת שאול"],
    expectedTopic: "שינוי מסלול"
  },
  {
    query: "אני תושב בית שמש וקו 408 ביטל כמה תחנות ברחוב נהר הירדן. זה גורם לי ללכת 15 דקות כל בוקר. למה עשו את השינוי הזה?",
    expectedBusLine: "408",
    expectedLocations: ["בית שמש"],
    expectedTopic: "שינוי מסלול"
  },
  {
    query: "גרה ברמת בית שמש ועובדת באזור התעשייה. קו 417 בוטל ואין לי איך להגיע לעבודה. מתי יחזירו את הקו?",
    expectedBusLine: "417",
    expectedLocations: ["רמת בית שמש"],
    expectedTopic: "ביטול"
  }
];

for (const testCase of testQueries) {
  console.log(`\n📝 Query: "${testCase.query.substring(0, 80)}..."`);
  console.log(`Expected: Line ${testCase.expectedBusLine}, Locations: ${testCase.expectedLocations.join(', ')}`);
  
  // Run retrieval
  const result = await hybridRetrieve(
    testCase.query,
    indexPack,
    null,
    { 
      maxResults: 5,
      skipVector: true,
      smartSelection: true,
      groupResponses: true
    }
  );
  
  if (result.results && result.results.length > 0) {
    const bestMatch = result.results[0];
    const doc = bestMatch.document || bestMatch;
    
    console.log(`\n✅ Found ${result.results.length} matches via ${result.method}`);
    console.log(`Match score: ${bestMatch.score?.toFixed(3) || 'N/A'}`);
    console.log(`Match type: ${bestMatch.matchType}`);
    
    // Show matched entities
    console.log(`Matched entities:`);
    console.log(`  - Bus lines: ${doc.entities?.busLines?.join(', ') || 'none'}`);
    console.log(`  - Locations: ${doc.entities?.locations?.join(', ') || 'none'}`);
    console.log(`  - Topic: ${doc.topic || doc.entities?.topic || 'none'}`);
    
    // Show response preview
    console.log(`\nResponse preview:`);
    console.log(`"${doc.response?.substring(0, 150) || 'No response'}..."`);
    
    // If multiple matches, show selection reason
    if (result.results.length > 1 && bestMatch.selectionMetadata) {
      console.log(`\nSelection reason: ${bestMatch.selectionMetadata.selectionReason}`);
      console.log(`Candidates considered: ${bestMatch.selectionMetadata.totalCandidates}`);
    }
  } else {
    console.log(`❌ No matches found`);
  }
}

// Step 5: Test grouping for common bus lines
console.log('\n\n📊 Testing Response Grouping for Common Lines:\n');

const commonLines = ['18', '32', '408', '417', '22'];
for (const line of commonLines) {
  // Find all documents about this line
  const lineDocs = indexPack.documents.filter(doc => 
    doc.entities?.busLines?.includes(line)
  );
  
  if (lineDocs.length > 0) {
    console.log(`\nקו ${line}: ${lineDocs.length} documents`);
    
    // Group by topic
    const byTopic = {};
    lineDocs.forEach(doc => {
      const topic = doc.topic || 'general';
      if (!byTopic[topic]) byTopic[topic] = [];
      byTopic[topic].push(doc);
    });
    
    console.log(`Topics:`);
    Object.entries(byTopic).forEach(([topic, docs]) => {
      console.log(`  - ${topic}: ${docs.length} cases`);
      // Show sample response
      if (docs[0].response) {
        console.log(`    Sample: "${docs[0].response.substring(0, 80)}..."`);
      }
    });
  }
}

console.log('\n\n✅ Full RAG Test Complete!');