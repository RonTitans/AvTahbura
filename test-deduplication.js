import XLSX from 'xlsx';
import { deduplicateByLatestDate, analyzeDuplicates } from './rag/preprocessing/deduplicate.js';
import { batchClean } from './rag/preprocessing/cleaner.js';
import { buildIndexPack } from './rag/core/indexer.js';

console.log('🧪 Testing RAG Improvements with Real Data\n');

// Load the Excel file
const workbook = XLSX.readFile('F:/ClaudeCode/AvTahbura/Copy of Cleaned_Answers_Data (1).xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rawData = XLSX.utils.sheet_to_json(sheet);

console.log('📊 Original Data:');
console.log(`   Total rows: ${rawData.length}`);

// Step 1: Analyze duplicates
console.log('\n🔍 Analyzing Duplicates:');
const dupeAnalysis = analyzeDuplicates(rawData);
console.log(`   Unique IDs: ${dupeAnalysis.uniqueIds}`);
console.log(`   Distribution:`);
Object.entries(dupeAnalysis.distribution).forEach(([count, freq]) => {
  console.log(`      ${count} row(s): ${freq} inquiries`);
});

// Step 2: Deduplicate
console.log('\n🔄 Deduplicating:');
const deduplicated = deduplicateByLatestDate(rawData);

// Step 3: Clean responses
console.log('\n🧹 Cleaning Responses:');
const cleaned = batchClean(deduplicated);

// Step 4: Show sample results
console.log('\n📋 Sample Results:');
const samples = cleaned.slice(0, 3);
samples.forEach((item, idx) => {
  console.log(`\n[${idx + 1}] Inquiry ID: ${item.inquiry_id}`);
  console.log(`   Topic: ${item.topic}`);
  console.log(`   Inquiry: ${item.inquiry_text?.substring(0, 100)}...`);
  console.log(`   Response (cleaned): ${item.response_text?.substring(0, 100)}...`);
  console.log(`   Quality: ${item.quality.is_internal ? 'INTERNAL' : 'PUBLIC'}`);
  console.log(`   Empty: ${item.quality.is_empty ? 'YES' : 'NO'}`);
});

// Step 5: Test specific queries
console.log('\n🎯 Testing Specific Queries:');
const testQueries = [
  'קו 18 רמות',
  'קו 408 שינוי מסלול',
  'קו 22 רמת אברהם'
];

// Find matches for test queries
testQueries.forEach(query => {
  console.log(`\n   Query: "${query}"`);
  
  // Extract bus line from query
  const lineMatch = query.match(/קו\s*(\d+[א-ת]?)/);
  const busLine = lineMatch ? lineMatch[1] : null;
  
  if (busLine) {
    // Find inquiries mentioning this bus line
    const matches = cleaned.filter(item => 
      item.inquiry_text?.includes(busLine) || 
      item.inquiry_text?.includes(`קו ${busLine}`)
    );
    
    console.log(`   Found ${matches.length} matches for line ${busLine}`);
    if (matches.length > 0) {
      const best = matches[0];
      console.log(`   Best match inquiry: ${best.inquiry_text?.substring(0, 80)}...`);
      console.log(`   Response: ${best.response_text?.substring(0, 80)}...`);
    }
  }
});

// Step 6: Statistics
console.log('\n📈 Final Statistics:');
const publicResponses = cleaned.filter(r => !r.quality.is_internal && !r.quality.is_empty);
console.log(`   Original rows: ${rawData.length}`);
console.log(`   After deduplication: ${deduplicated.length}`);
console.log(`   Clean public responses: ${publicResponses.length}`);
console.log(`   Reduction: ${((1 - publicResponses.length/rawData.length) * 100).toFixed(1)}%`);

// Step 7: Test index building (without embeddings)
console.log('\n🏗️ Building Index Pack:');
try {
  const indexPack = await buildIndexPack(
    deduplicated.slice(0, 100), // Test with first 100
    null, // No OpenAI
    null, // No previous pack
    { deduplicate: false, cleanResponses: true, skipEmbeddings: true }
  );
  
  console.log(`   Documents: ${indexPack.documents.length}`);
  console.log(`   Bus lines indexed: ${Object.keys(indexPack.indices?.busLines || {}).length}`);
  console.log(`   Locations indexed: ${Object.keys(indexPack.indices?.locations || {}).length}`);
  console.log(`   Topics indexed: ${Object.keys(indexPack.indices?.topics || {}).length}`);
} catch (error) {
  console.log(`   Error building index: ${error.message}`);
}

console.log('\n✅ Test Complete!');