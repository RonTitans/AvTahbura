# CLAUDE.md - RAG Implementation Guide for AI Assistants

## 🎯 Project Context
You are implementing a Retrieval-Augmented Generation (RAG) system for Jerusalem public transportation inquiries. The system must maintain the existing Hebrew RTL UI while significantly improving search accuracy through hybrid retrieval and smart LLM gating.

## ⚠️ Critical Constraints
1. **UI**: DO NOT change the UI - single search box, one button labeled "חפש"
2. **Hebrew**: All user-facing text must be RTL Hebrew
3. **Serverless**: Code must work on Vercel (cold starts, 10s timeout)
4. **Cost**: Minimize LLM calls through smart gating
5. **Data**: Currently using Google Sheets, may switch to OneDrive

## 📋 Current Task Status
Check `tasks.md` for current progress. Always update task checkboxes as you complete items.

## 🛠️ Code Standards

### Hebrew Text Processing
ALWAYS normalize Hebrew text using these rules:
```javascript
function normalizeHebrew(text) {
  return text
    .replace(/[\u0591-\u05C7]/g, '') // Remove niqqud
    .replace(/ך/g, 'כ').replace(/ם/g, 'מ') // Normalize finals
    .replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
    .replace(/[״""''׳]/g, '"') // Normalize quotes
    .replace(/\s+/g, ' ').trim(); // Collapse spaces
}
```

### Bus Line Extraction
Handle various formats consistently:
```javascript
// Examples to handle:
"קו 18" → "18"
"18א" → "18א"  
"18-א" → "18א"
"קווים 34 ו-34א" → ["34", "34א"]
"קו 74א'" → "74א"
```

### Entity Extraction Priority
1. **Bus lines** (highest priority) - exact match critical
2. **Locations** (neighborhoods/streets) - fuzzy match allowed
3. **Problem types** (שינוי מסלול, תדירות, etc.)
4. **Operators** (אגד, בית שמש אקספרס, etc.)

## 📁 File Structure Requirements
```
/rag/
  ├── core/          # Core algorithms
  │   ├── normalizer.js    # Hebrew text normalization
  │   ├── analyzer.js      # Query analysis & entity extraction
  │   ├── indexer.js       # Build Index Pack
  │   └── retriever.js     # Hybrid retrieval pipeline
  ├── storage/       # Persistence layer
  │   ├── blob.js          # Vercel Blob interface
  │   └── cache.js         # In-memory caching
  ├── llm/           # LLM integration
  │   ├── gating.js        # Skip LLM logic
  │   └── synthesis.js     # Response generation
  └── dictionaries/  # Hebrew dictionaries
      ├── locations.json   # Jerusalem neighborhoods
      ├── operators.json   # Bus companies
      ├── stopwords.json   # Hebrew stopwords
      └── topics.json      # Problem type mappings
```

## 🔗 API Endpoint Patterns
- `/api/recommend` - Main search (was /smart-search)
- `/api/refresh` - Rebuild index
- `/api/status` - System health

### Endpoint Response Format
```javascript
// /api/recommend
{
  success: true,
  inquiry: "user query in Hebrew",
  answer: "response in Hebrew",
  confidence: 0.85,
  sources: [
    { case_id: "123", row_number: 45, relevance: 9 }
  ],
  match_reasons: {
    lines: ["18", "34א"],
    locations: ["רמות", "גילה"],
    type: "שינוי מסלול"
  },
  method: "exact_match" // or "heuristic", "vector", "llm_synthesis"
}
```

## 🧪 Testing Requirements
When testing, ALWAYS:
1. Run with real Hebrew queries
2. Check RTL display in browser
3. Verify match reasons in Hebrew
4. Test with/without LLM gating
5. Measure latency and LLM usage

### Golden Test Examples
```javascript
const goldenTests = [
  {
    query: "מתי יגיע קו 18 לרמות?",
    expectedRow: 123,
    mustContain: ["18", "רמות"]
  },
  {
    query: "תלונה על צפיפות בקו 34א",
    expectedRow: 456,
    mustContain: ["34א", "צפיפות"]
  }
];
```

## ⚡ Performance Targets
- **Index Pack load**: < 500ms
- **Retrieval**: < 200ms  
- **LLM synthesis**: < 2s
- **Total P95**: < 5s
- **LLM calls**: < 30% of searches

## 🔴 Error Handling
ALWAYS provide Hebrew fallbacks:
```javascript
try {
  // main logic
} catch (error) {
  if (error.name === 'TimeoutError') {
    return {
      answer: bestCandidate.response_text,
      note: "החיפוש נקטע - מציג תוצאה מקורית"
    };
  }
  
  if (!openaiAvailable) {
    return {
      answer: bestCandidate.response_text,
      note: "מציג תוצאה ללא עיבוד נוסף"
    };
  }
  
  // Generic fallback
  return {
    answer: "מצטערים, אירעה שגיאה. אנא נסו שוב.",
    error: true
  };
}
```

## 📝 Git Commit Pattern
```bash
feat(rag): implement Hebrew normalizer
fix(retrieval): improve bus line extraction  
perf(index): add delta embeddings
docs(rag): update CLAUDE.md with new patterns
test(golden): add 5 new test queries
```

## 🔐 Environment Variables
NEVER hardcode these - always use process.env:
```javascript
// Data Source
process.env.DATA_SOURCE // "GOOGLE_SHEET" or "ONEDRIVE"
process.env.GOOGLE_APPLICATION_CREDENTIALS
process.env.SPREADSHEET_ID
process.env.ONEDRIVE_URL

// OpenAI
process.env.OPENAI_API_KEY
process.env.EMBED_MODEL // "text-embedding-3-small"
process.env.SYNTHESIS_MODEL // "gpt-4-turbo-preview"

// Storage
process.env.BLOB_READ_WRITE_TOKEN

// Feature Flags
process.env.ENABLE_LLM_GATING // "true"
process.env.EXACT_MATCH_THRESHOLD // "0.85"
```

## 🐛 Debug Helpers
Add debug info for Ron:
```javascript
if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
  console.log('🔍 Query entities:', entities);
  console.log('📊 Retrieval scores:', scores);
  console.log('🤖 LLM skipped:', gatingResult);
  console.log('⏱️ Timings:', { 
    retrieval: retrievalMs, 
    llm: llmMs, 
    total: totalMs 
  });
}
```

## 💻 Commands to Run
```bash
# Development
npm run dev

# Test search
curl -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"query":"קו 18 לרמות"}'

# Rebuild index
curl -X POST http://localhost:3000/api/refresh

# Check status
curl http://localhost:3000/api/status

# Run tests
npm test

# Deploy to Vercel
vercel --prod
```

## 🚨 Common Pitfalls to Avoid
1. **DON'T** change the UI - keep single search box
2. **DON'T** forget Hebrew normalization
3. **DON'T** load full data on every request - use Index Pack
4. **DON'T** call LLM for exact matches
5. **DON'T** exceed 10s Vercel timeout
6. **DON'T** log PII or sensitive data

## 📊 Metrics to Track
```javascript
const metrics = {
  searches: 0,
  llmCalls: 0,
  llmSkipped: 0,
  exactMatches: 0,
  heuristicMatches: 0,
  vectorMatches: 0,
  avgLatency: 0,
  p95Latency: 0,
  cacheHits: 0,
  precision: 0 // From golden tests
};
```

## 🆘 When Stuck
1. Check existing `/server.js` for patterns
2. Review `tasks.md` for current phase
3. Test with actual Hebrew queries
4. Ask Ron for:
   - Golden test queries
   - Vercel Blob token
   - Expected row numbers
5. Verify UI remains unchanged

## 📚 Reference Implementation Snippets

### Hybrid Retrieval Pipeline
```javascript
async function hybridRetrieve(query, indexPack) {
  // Stage 1: Exact match
  const exactMatches = findExactMatches(query, indexPack);
  if (exactMatches.length > 0 && exactMatches[0].score > 0.9) {
    return { results: exactMatches, method: 'exact' };
  }
  
  // Stage 2: Heuristic (BM25)
  const heuristicMatches = bm25Score(query, indexPack);
  if (heuristicMatches[0].score > 0.85) {
    return { results: heuristicMatches, method: 'heuristic' };
  }
  
  // Stage 3: Vector rerank
  const topCandidates = heuristicMatches.slice(0, 20);
  const reranked = await vectorRerank(query, topCandidates);
  return { results: reranked.slice(0, 5), method: 'vector' };
}
```

### LLM Gating Logic
```javascript
function shouldSkipLLM(retrievalResult) {
  // Skip conditions
  if (retrievalResult.method === 'exact') return true;
  if (retrievalResult.results[0].score > 0.85) return true;
  if (retrievalResult.hasExactPhrase) return true;
  
  // Use LLM for synthesis
  return false;
}
```

## 🎯 Success Criteria
- [ ] All golden tests pass with Precision@1 > 80%
- [ ] LLM usage < 30% of searches
- [ ] P95 latency < 5 seconds
- [ ] UI completely unchanged
- [ ] Hebrew display correct on all devices
- [ ] Ron approves the implementation

---
Last Updated: 2025-09-08
Version: 1.0