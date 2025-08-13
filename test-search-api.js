import fetch from 'node-fetch';

async function testSearch() {
  const url = 'https://municipal-inquiry-system.vercel.app/exact-search';
  
  const testQuery = 'קו 408';
  
  console.log('Testing regular search with:', testQuery);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        inquiry_text: testQuery
      })
    });
    
    const result = await response.json();
    
    console.log('\nResponse status:', response.status);
    console.log('Search phrase received by server:', result.search_phrase);
    console.log('Total matches:', result.total_matches);
    
    if (result.matches && result.matches.length > 0) {
      console.log('\nFirst 3 matches:');
      result.matches.slice(0, 3).forEach((match, i) => {
        console.log(`\n${i + 1}. Case ID: ${match.case_id}`);
        console.log(`   Inquiry: ${match.inquiry?.substring(0, 100)}...`);
        console.log(`   Score: ${match.relevance_score}`);
        console.log(`   Found in: ${match.found_in}`);
        console.log(`   Occurrences: ${match.occurrences.total}`);
      });
    }
    
    // Test if OpenAI generation works
    if (result.matches && result.matches.length > 0) {
      console.log('\n\nTesting OpenAI response generation...');
      const genUrl = 'https://municipal-inquiry-system.vercel.app/generate-official-response';
      
      const genResponse = await fetch(genUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
          inquiry_text: testQuery,
          match: result.matches[0]
        })
      });
      
      console.log('Generation response status:', genResponse.status);
      
      const contentType = genResponse.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const genResult = await genResponse.json();
        console.log('Generation response:', genResult);
      } else {
        const errorText = await genResponse.text();
        console.log('Generation error (not JSON):', errorText.substring(0, 200));
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testSearch();