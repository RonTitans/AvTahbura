/**
 * Debug script to test why "קו 409" returns wrong results
 */

import fs from 'fs';
import { analyzeQuery } from './rag/core/analyzer.js';
import { extractBusLines } from './rag/core/normalizer.js';

// Test queries
const testQueries = [
  "קו 409",
  "הוספת תחנה קו 409 חברת אלקטרה אפיקים תחבורה",
  "409",
  "קו 169",
  "קו 490"
];

// Test bus line extraction
console.log('🔍 Testing bus line extraction:');
testQueries.forEach(query => {
  const lines = extractBusLines(query);
  console.log(`  "${query}" → [${lines.join(', ')}]`);
});

// Test query analysis
console.log('\n📊 Testing query analysis:');
testQueries.forEach(query => {
  const analysis = analyzeQuery(query);
  console.log(`  "${query}":`);
  console.log(`    Bus lines: [${analysis.entities.busLines.join(', ')}]`);
  console.log(`    Normalized: "${analysis.normalized}"`);
});

// Load and check index if it exists
try {
  const indexPath = './index-pack.json';
  if (fs.existsSync(indexPath)) {
    console.log('\n📚 Loading index pack...');
    const indexPack = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    
    // Check bus line indices
    console.log('\n🚌 Bus line index entries:');
    const busLineIndex = indexPack.indices?.busLines || {};
    ['409', '169', '490', '18'].forEach(line => {
      const docIds = busLineIndex[line] || [];
      console.log(`  Line ${line}: ${docIds.length} documents`);
      if (docIds.length > 0 && docIds.length <= 3) {
        console.log(`    Doc IDs: [${docIds.join(', ')}]`);
      }
    });
    
    // Find and display a few documents with line 409
    console.log('\n📄 Sample documents:');
    
    // Look for document with line 409
    const line409Docs = busLineIndex['409'] || [];
    if (line409Docs.length > 0) {
      const docId = line409Docs[0];
      const doc = indexPack.documents[docId];
      if (doc) {
        console.log(`\n  Document ${docId} (Line 409):`);
        console.log(`    Row: ${doc.rowNumber}`);
        console.log(`    Bus lines: [${doc.entities.busLines.join(', ')}]`);
        console.log(`    Summary: ${doc.summary.substring(0, 100)}...`);
        console.log(`    Inquiry: ${doc.inquiry.substring(0, 100)}...`);
      }
    }
    
    // Look for documents with lines 169 and 490
    ['169', '490'].forEach(line => {
      const docs = busLineIndex[line] || [];
      if (docs.length > 0) {
        const docId = docs[0];
        const doc = indexPack.documents[docId];
        if (doc) {
          console.log(`\n  Document ${docId} (Line ${line}):`);
          console.log(`    Row: ${doc.rowNumber}`);
          console.log(`    Bus lines: [${doc.entities.busLines.join(', ')}]`);
          console.log(`    Summary: ${doc.summary.substring(0, 100)}...`);
        }
      }
    });
    
    // Search for any document that mentions 409 in text
    console.log('\n🔎 Searching for "409" in all documents:');
    let found409 = 0;
    indexPack.documents.forEach((doc, idx) => {
      if (doc.normalizedText && doc.normalizedText.includes('409')) {
        found409++;
        if (found409 <= 3) {
          console.log(`  Found in doc ${idx}:`);
          console.log(`    Row: ${doc.rowNumber}`);
          console.log(`    Extracted lines: [${doc.entities.busLines.join(', ')}]`);
          console.log(`    Text snippet: ...${doc.normalizedText.substring(doc.normalizedText.indexOf('409') - 20, doc.normalizedText.indexOf('409') + 30)}...`);
        }
      }
    });
    console.log(`  Total documents mentioning "409": ${found409}`);
    
  } else {
    console.log('\n⚠️ No index-pack.json found locally');
  }
} catch (error) {
  console.error('❌ Error loading index:', error.message);
}

// Test exact match logic
console.log('\n🎯 Testing exact match logic:');
const testTexts = [
  "קו 409 לא עוצר",
  "קווים 169 ו-490",
  "בקו 409 יש בעיה",
  "קו 409א צריך תיקון",
  "409 מאחר"
];

testTexts.forEach(text => {
  const lines = extractBusLines(text);
  console.log(`  "${text}" → [${lines.join(', ')}]`);
});