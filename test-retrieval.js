/**
 * Test retrieval logic locally to debug line 409 issue
 */

import { analyzeQuery } from './rag/core/analyzer.js';
import { exactMatch, bm25Score } from './rag/core/retriever.js';

// Mock index pack with sample documents
const mockIndexPack = {
  documents: [
    {
      id: 0,
      rowNumber: 16,
      inquiry: "קו 169 סטייה",
      summary: "בדיקת סטייה בקו 169",
      response: "אריאלה שלום מבירור מול אייל, הנושא נמצא בטיפול שלך ושל ישראל מול עידן מועלם",
      normalizedText: "קו 169 סטייה בדיקת סטייה בקו 169 אריאלה שלומ מבירור מול אייל",
      entities: {
        busLines: ["169"],
        locations: [],
        operators: [],
        topic: "route_change"
      },
      tokens: ["קו", "169", "סטייה"]
    },
    {
      id: 1,
      rowNumber: 100,
      inquiry: "הוספת תחנה קו 409 חברת אלקטרה אפיקים",
      summary: "בקשה להוספת תחנה בקו 409",
      response: "הבקשה להוספת תחנה בקו 409 הועברה לבדיקה",
      normalizedText: "הוספת תחנה קו 409 חברת אלקטרה אפיקימ בקשה להוספת תחנה בקו 409",
      entities: {
        busLines: ["409"],
        locations: [],
        operators: ["אלקטרה אפיקים"],
        topic: "stop_addition"
      },
      tokens: ["הוספת", "תחנה", "קו", "409"]
    },
    {
      id: 2,
      rowNumber: 200,
      inquiry: "קו 490 לא מגיע",
      summary: "תלונה על אי הגעת קו 490",
      response: "הנושא הועבר למפעיל הקו",
      normalizedText: "קו 490 לא מגיע תלונה על אי הגעת קו 490",
      entities: {
        busLines: ["490"],
        locations: [],
        operators: [],
        topic: "no_show"
      },
      tokens: ["קו", "490", "לא", "מגיע"]
    }
  ],
  indices: {
    busLines: {
      "169": [0],
      "409": [1],
      "490": [2]
    },
    locations: {},
    operators: {
      "אלקטרה אפיקימ": [1]
    }
  },
  tfIdf: [
    { "קו": 0.1, "169": 0.3, "סטייה": 0.2 },
    { "הוספת": 0.2, "תחנה": 0.2, "קו": 0.1, "409": 0.3 },
    { "קו": 0.1, "490": 0.3, "לא": 0.1, "מגיע": 0.2 }
  ],
  termDocFreq: {
    "קו": 3,
    "169": 1,
    "409": 1,
    "490": 1,
    "הוספת": 1,
    "תחנה": 1,
    "סטייה": 1
  }
};

// Test queries
const testQueries = [
  "קו 409",
  "הוספת תחנה קו 409",
  "409",
  "קו 169"
];

console.log('🧪 Testing retrieval logic with mock data:\n');

testQueries.forEach(query => {
  console.log(`\n📝 Query: "${query}"`);
  console.log('─'.repeat(50));
  
  // Analyze query
  const queryAnalysis = analyzeQuery(query);
  console.log(`  Extracted bus lines: [${queryAnalysis.entities.busLines.join(', ')}]`);
  console.log(`  Query type: ${queryAnalysis.queryType}`);
  
  // Test exact match
  console.log('\n  Stage 1: Exact Match');
  const exactMatches = exactMatch(queryAnalysis, mockIndexPack);
  if (exactMatches.length > 0) {
    exactMatches.forEach(match => {
      console.log(`    - Doc ${match.docId} (row ${match.document.rowNumber}): score=${match.score.toFixed(2)}, type=${match.matchType}`);
      console.log(`      Bus lines: [${match.document.entities.busLines.join(', ')}]`);
    });
  } else {
    console.log('    No exact matches found');
  }
  
  // Test BM25
  console.log('\n  Stage 2: BM25 Scoring');
  const bm25Matches = bm25Score(queryAnalysis, mockIndexPack, 5);
  bm25Matches.forEach(match => {
    console.log(`    - Doc ${match.docId} (row ${match.document.rowNumber}): score=${match.score.toFixed(2)}`);
    console.log(`      Components: BM25=${match.components.bm25.toFixed(2)}, Entities=${match.components.entities.toFixed(2)}`);
  });
  
  // Show what would be returned
  const topMatch = exactMatches[0] || bm25Matches[0];
  if (topMatch) {
    console.log(`\n  ✅ Would return: Row ${topMatch.document.rowNumber} with score ${topMatch.score.toFixed(2)}`);
    console.log(`     Response: "${topMatch.document.response.substring(0, 60)}..."`);
  }
});

// Test the actual issue
console.log('\n\n🔍 DEBUGGING THE ACTUAL ISSUE:');
console.log('━'.repeat(50));
console.log('Why does "קו 409" return row 16 (line 169 content)?');
console.log('\nPossible causes:');
console.log('1. Bus line index is wrong (409 points to wrong doc IDs)');
console.log('2. Documents have wrong bus lines extracted');
console.log('3. Retrieval logic has a bug in matching');
console.log('4. The actual data in row 16 contains "409" but extraction missed it');
console.log('\nBased on mock test above:');
console.log('- Line 409 query correctly matches doc with line 409');
console.log('- Line 169 query correctly matches doc with line 169');
console.log('\n=> The issue is likely in the INDEX BUILD process, not retrieval!');