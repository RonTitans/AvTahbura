/**
 * Debug script to check what's actually in the index for line 409
 */

import fetch from 'node-fetch';

async function debugLine409() {
  const baseUrl = 'https://municipal-inquiry-system-git-dev-titans4.vercel.app';
  
  // Test queries
  const queries = [
    "קו 409",
    "409",
    "קו 169",
    "קו 18"
  ];
  
  console.log('🔍 Testing queries against live server:\n');
  
  for (const query of queries) {
    console.log(`📝 Query: "${query}"`);
    console.log('─'.repeat(60));
    
    try {
      const response = await fetch(`${baseUrl}/smart-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inquiry_text: query })
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log(`  ✅ Success`);
        console.log(`  Row: ${data.source_rows?.[0] || 'unknown'}`);
        console.log(`  Method: ${data.method}`);
        console.log(`  Confidence: ${data.confidence}`);
        console.log(`  Answer preview: "${data.answer.substring(0, 100)}..."`);
        
        // Check if the answer looks like an internal chat
        const internalChatPatterns = [
          'אריאלה', 'ראובן', 'אייל', 'עידן מועלם', 
          'בטיפול שלך', 'מבירור מול', 'העביר את הפניה'
        ];
        
        const looksLikeInternalChat = internalChatPatterns.some(pattern => 
          data.answer.includes(pattern)
        );
        
        if (looksLikeInternalChat) {
          console.log(`  ⚠️ WARNING: Answer looks like internal chat, not a proper response!`);
        }
      } else {
        console.log(`  ❌ Error: ${data.error}`);
      }
    } catch (error) {
      console.log(`  ❌ Request failed: ${error.message}`);
    }
    
    console.log();
  }
  
  console.log('\n📊 Analysis:');
  console.log('━'.repeat(60));
  console.log('The system is returning documents that mention "409" in internal chats');
  console.log('rather than documents that are actually about bus line 409.');
  console.log('\nPossible issues:');
  console.log('1. The actual data might not have proper responses for line 409');
  console.log('2. The response field contains internal chats instead of actual answers');
  console.log('3. Need to filter out internal communications during indexing');
}

debugLine409();