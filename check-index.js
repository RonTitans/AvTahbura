/**
 * Script to check index from Blob storage and debug line 409 issue
 */

import { downloadIndexPack } from './rag/storage/blob.js';

async function checkIndex() {
  console.log('📥 Loading index from Blob storage...');
  
  try {
    const result = await downloadIndexPack();
    const indexPack = result?.data;
    
    if (!indexPack) {
      console.log('❌ No index pack found in Blob storage');
      return;
    }
    
    console.log(`✅ Loaded index with ${indexPack.documents.length} documents`);
    console.log(`📅 Index version: ${indexPack.version}`);
    console.log(`⏰ Built at: ${new Date(indexPack.createdAt).toLocaleString()}`);
    
    // Check bus line indices
    console.log('\n🚌 Bus line index statistics:');
    const busLineIndex = indexPack.indices?.busLines || {};
    const lineStats = {};
    
    Object.keys(busLineIndex).forEach(line => {
      const count = busLineIndex[line].length;
      lineStats[line] = count;
    });
    
    // Show specific lines we're interested in
    ['409', '169', '490', '18', '34א'].forEach(line => {
      const count = lineStats[line] || 0;
      console.log(`  Line ${line}: ${count} documents`);
    });
    
    // Find documents for line 409
    console.log('\n📄 Documents for line 409:');
    const line409Docs = busLineIndex['409'] || [];
    
    if (line409Docs.length === 0) {
      console.log('  ⚠️ No documents found for line 409!');
      
      // Search manually
      console.log('\n🔍 Manual search for "409" in documents:');
      let found = 0;
      indexPack.documents.forEach((doc, idx) => {
        if (doc.inquiry.includes('409') || 
            doc.summary.includes('409') || 
            doc.response.includes('409') ||
            doc.normalizedText.includes('409')) {
          found++;
          console.log(`  Found in doc ${idx} (row ${doc.rowNumber}):`);
          console.log(`    Extracted bus lines: [${doc.entities.busLines.join(', ')}]`);
          console.log(`    Inquiry: ${doc.inquiry.substring(0, 80)}...`);
          
          // Show why it wasn't indexed
          if (!doc.entities.busLines.includes('409')) {
            console.log(`    ❌ Line 409 not in extracted bus lines!`);
            
            // Show the text where 409 appears
            const text = doc.normalizedText;
            const pos = text.indexOf('409');
            if (pos >= 0) {
              console.log(`    Context: ...${text.substring(Math.max(0, pos - 30), Math.min(text.length, pos + 40))}...`);
            }
          }
        }
      });
      console.log(`\n  Total documents mentioning "409": ${found}`);
    } else {
      line409Docs.slice(0, 5).forEach(docId => {
        const doc = indexPack.documents[docId];
        console.log(`\n  Doc ${docId} (row ${doc.rowNumber}):`);
        console.log(`    Bus lines: [${doc.entities.busLines.join(', ')}]`);
        console.log(`    Inquiry: ${doc.inquiry.substring(0, 100)}...`);
        console.log(`    Summary: ${doc.summary.substring(0, 100)}...`);
      });
    }
    
    // Check what's being returned instead
    console.log('\n🔍 Sample documents for lines 169 and 490:');
    
    ['169', '490'].forEach(line => {
      const docs = busLineIndex[line] || [];
      if (docs.length > 0) {
        const docId = docs[0];
        const doc = indexPack.documents[docId];
        console.log(`\n  Line ${line} - Doc ${docId} (row ${doc.rowNumber}):`);
        console.log(`    Inquiry: ${doc.inquiry.substring(0, 100)}...`);
        console.log(`    Response: ${doc.response.substring(0, 100)}...`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkIndex();