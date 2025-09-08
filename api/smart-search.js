export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { inquiry_text } = req.body;
  
  if (!inquiry_text) {
    return res.status(400).json({ 
      error: 'Missing inquiry_text parameter',
      success: false 
    });
  }

  console.log(`Smart Search API called for: "${inquiry_text}"`);

  // For now, return a test response to verify endpoint works
  return res.status(200).json({
    success: true,
    inquiry: inquiry_text,
    answer: `Processing: ${inquiry_text}. RAG system integration in progress.`,
    confidence: 0.5,
    sources: [],
    method: 'vercel_api_test',
    message: 'Vercel API endpoint working'
  });
}