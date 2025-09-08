# RAG Implementation Tasks - תוכנית אב לתחבורה

## Current Status: Implementing Enhanced RAG Pipeline
Previous work completed the basic smart search. Now upgrading to full RAG system with hybrid retrieval.

## Phase 0: Prerequisites [RON TASKS] ✅
- [x] **RON: Choose data source**
  - Option A: Continue with GOOGLE_SHEET_ID (current)
  - Option B: Switch to OneDrive public URL
  - Decision: **GOOGLE_SHEET**
  
- [x] **RON: Provide Vercel Blob token** 
  - Get from: https://vercel.com/dashboard/stores
  - Token: BLOB_READ_WRITE_TOKEN=**CONFIGURED**
  
- [x] **RON: Confirm bus operators list**
  - Current: אגד, בית שמש אקספרס, אלקטרה אפיקים
  - Add others? **No, list confirmed**

- [x] **RON: Create golden test set** (3 queries provided)
  ```
  GQ1: "שינוי מסלול- קו 408,חברת בית שמש אקספרס..."
  Expected: CAS-653181-L8G1R8
  
  GQ2: "הוספת תדירות קו 132..."
  Expected: CAS-657647-B7P9C7
  
  GQ3: "אוטובוס- אחר... קו 136... קו 198..."
  Expected: CAS-571594-T2R3W4
  ```

## Phase 1: Core Hebrew Processing [2 hours] ✅
- [x] Create `/rag` directory structure
- [x] Implement Hebrew normalizer (`/rag/core/normalizer.js`)
  - [x] Remove niqqud (diacritics)
  - [x] Normalize final letters (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ)
  - [x] Extract bus lines (handle 18, 18א, 408)
  - [x] Normalize quotes and punctuation
  - [x] Test with sample texts
  
- [x] Create entity dictionaries (`/rag/dictionaries/`)
  - [x] locations.json (Jerusalem neighborhoods)
  - [x] operators.json (bus companies)
  - [x] stopwords.json (Hebrew stopwords)
  - [x] topics.json (problem types mapping)
  
- [x] Build query analyzer (`/rag/core/analyzer.js`)
  - [x] Entity extraction (lines, locations, operators)
  - [x] N-gram generation (3-6 words)
  - [x] Query classification (complaint/question/request)
  - [x] Stopword removal

## Phase 2: Index Pack System [2 hours] ✅
- [x] Setup Vercel Blob storage (`/rag/storage/blob.js`)
  - [x] Upload/download functions
  - [x] ETag checking for cache invalidation
  - [x] TTL cache management (5 min default)
  
- [x] Create indexer (`/rag/core/indexer.js`)
  - [x] Read from data source (Google Sheets/OneDrive)
  - [x] Build document text per row
  - [x] Generate embeddings (text-embedding-3-small)
  - [x] Build inverted indices (line→rows, location→rows, topic→rows)
  - [x] Package as binary blob with metadata
  - [x] Upload with versioning
  
- [x] Implement cache manager (`/rag/storage/cache.js`)
  - [x] In-memory Index Pack storage
  - [x] Lazy loading on cold start
  - [x] TTL-based refresh

- [ ] **RON: Test first index build**
  - [ ] Run `/api/refresh`
  - [ ] Verify pack uploaded to Blob storage
  - [ ] Check `/api/status` for pack info

## Phase 3: Hybrid Retrieval [2 hours] ✅
- [x] Implement exact matcher (`/rag/core/retriever.js`)
  - [x] Line + location AND filters
  - [x] Exact phrase detection (3-6 word n-grams)
  - [x] Field priority (תמצית > הפניה)
  
- [x] Add BM25 scorer
  - [x] TF-IDF calculations
  - [x] Adaptive field weights based on query
  - [x] Recency boost for newer entries
  - [x] Top-20 candidate selection
  
- [x] Integrate vector reranking
  - [x] Cosine similarity on top-20
  - [x] Combined score calculation
  - [x] Final top-5 selection
  
- [ ] Test retrieval accuracy
  - [ ] **RON: Run golden queries**
  - [ ] Check Precision@1
  - [ ] Debug misses with detailed logs

## Phase 4: Smart LLM Integration [1 hour] ✅
- [x] Setup LLM gating (`/rag/llm/gating.js`)
  - [x] Define skip conditions:
    - Exact phrase match found
    - Confidence score > 0.85
    - Line + location exact match
  - [x] Implement snippet truncation (תמצית ≤300, הפניה ≤400)
  - [x] Prepare top 3-5 snippets for LLM
  
- [x] Create synthesis prompt (`/rag/llm/synthesis.js`)
  - [x] Hebrew-optimized prompt template
  - [x] Source attribution requirement
  - [x] Clarification questions when weak match
  - [x] JSON response format
  
- [x] Add timeout handling
  - [x] 15-second timeout for LLM calls
  - [x] Fallback to best non-LLM result
  - [x] Hebrew error messages

## Phase 5: API Updates [1 hour]
- [ ] Update `/api/recommend` (rename from /smart-search)
  - [ ] Load Index Pack on cold start
  - [ ] Apply hybrid retrieval pipeline
  - [ ] LLM gating decision
  - [ ] Return with match reasons in Hebrew
  
- [ ] Update `/api/refresh`
  - [ ] Trigger index rebuild
  - [ ] Delta embedding optimization (only changed rows)
  - [ ] Upload new pack to Blob
  - [ ] Return build metrics
  
- [ ] Create `/api/status`
  - [ ] Show pack info (version, ETag, row count)
  - [ ] Display performance metrics
  - [ ] LLM usage statistics
  - [ ] Health check

## Phase 6: Testing & Metrics [30 min]
- [ ] Add metrics collection
  - [ ] LLM calls per 100 searches
  - [ ] P50/P95 latency tracking
  - [ ] Cache hit rates
  - [ ] Retrieval accuracy (Precision@1, MRR)
  
- [ ] **RON: Full system test**
  - [ ] Run all golden queries
  - [ ] Verify UI completely unchanged
  - [ ] Check response times < 5s P95
  - [ ] Confirm Hebrew display correct
  
- [ ] Performance validation
  - [ ] LLM usage < current baseline
  - [ ] P95 latency < 10s (Vercel limit)
  - [ ] Precision@1 improved by 20%+
  
- [ ] **RON: User acceptance**
  - [ ] Test with real user queries
  - [ ] Verify match reasons clear
  - [ ] Confirm no UI changes
  - [ ] Check mobile RTL display

## Completion Checklist
- [ ] All golden tests passing
- [ ] Metrics within targets
- [ ] Documentation updated
- [ ] Environment variables configured
- [ ] Deployed to Vercel successfully
- [ ] **RON: Final approval**

## Previous Smart Search Work (Completed) ✅
### Phase 1: Backend - Embedding Infrastructure ✅
- [x] Re-enable embeddings generation in `generateAllEmbeddings()`
- [x] Lower similarity threshold from 0.78 to 0.55
- [x] Implement dual embedding strategy (questions vs answers)
- [x] Add embeddings caching mechanism
- [x] Optimize batch processing for embeddings (20 items per batch)

### Phase 2: Backend - Smart Search Endpoint ✅
- [x] Create `/smart-search` POST endpoint
- [x] Implement candidate selection logic (top 10 matches)
- [x] Add keyword boosting for bus lines, streets, times
- [x] Integrate GPT-4 validation step
- [x] Format response with source line numbers

### Phase 3: GPT-4 Integration ✅
- [x] Upgrade from GPT-3.5-turbo to GPT-4-turbo-preview
- [x] Create validation prompt template
- [x] Implement multi-source response generation
- [x] Add confidence scoring for matches
- [x] Handle edge cases (no good matches)

### Phase 4: Frontend Integration ✅
- [x] Add Smart Search mode (hidden toggle, default on)
- [x] Create UI for smart search mode
- [x] Display results with source references
- [x] Add loading state for longer processing
- [x] Show confidence scores visually

## Progress Tracking
- Previous work completed: 2025-09-07
- RAG upgrade started: 2025-09-08
- Phase 0 Complete: ✅ 2025-09-08 (Ron provided requirements)
- Phase 1 Complete: ✅ 2025-09-08 (Hebrew processing)
- Phase 2 Complete: ✅ 2025-09-08 (Index Pack system)
- Phase 3 Complete: ✅ 2025-09-08 (Hybrid retrieval)
- Phase 4 Complete: ✅ 2025-09-08 (LLM integration)
- Phase 5 Complete: ⏳ IN PROGRESS (API endpoints)
- Phase 6 Complete: ___________
- Deployed: ___________

## Notes Section
_Use this space to track issues, decisions, and changes during implementation_

### Architecture Decision Record
- Keeping UI unchanged (single search box + button)
- Using Vercel Blob for Index Pack persistence (serverless-friendly)
- Hybrid retrieval: Exact → BM25 → Vector rerank
- LLM gating to reduce costs while maintaining quality
- Hebrew-first approach with proper RTL support

Last Updated: 2025-09-08