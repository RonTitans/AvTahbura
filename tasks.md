# RAG Implementation Tasks for Vercel Deployment

## 🎯 Current Objective
Fix the RAG pipeline to work on Vercel production environment with proper module system, blob storage, and authentication.

## 📋 Task List

### Phase 1: Module System & Configuration
- [ ] **Convert to ES Modules**
  - [ ] Set `"type": "module"` in package.json
  - [ ] Convert all `/rag/core/*.js` files to ES modules
  - [ ] Convert all `/rag/storage/*.js` files to ES modules  
  - [ ] Convert all `/rag/llm/*.js` files to ES modules
  - [ ] Update all import paths to include `.js` extensions
  - [ ] Convert API endpoint files to ES modules

### Phase 2: Diagnostic Endpoints (Admin-only)
- [ ] **Create `/api/blob-selftest.js`**
  - [ ] Test PUT operation to Blob storage
  - [ ] Test GET/HEAD operations
  - [ ] Return clear error hints for 401/403/413
  - [ ] Add admin authentication protection

- [ ] **Create `/api/pack-selftest.js`**
  - [ ] Build tiny in-memory index pack
  - [ ] Upload vectors.bin + meta.json to Blob
  - [ ] Verify HEAD operations and return sizes + etags
  - [ ] Add admin authentication protection

### Phase 3: Core RAG Endpoints
- [ ] **Implement `/api/refresh.js`**
  - [ ] Parse GOOGLE_CREDENTIALS_JSON from env (no file reads)
  - [ ] Load data from Google Sheets using SPREADSHEET_ID
  - [ ] Normalize Hebrew text
  - [ ] Build delta embeddings with text-embedding-3-small
  - [ ] Create inverted indices (lines/locations/topics)
  - [ ] Optional int8 quantization for vectors
  - [ ] Upload Index Pack to Blob under `${INDEX_PACK_PREFIX}v1/`
  - [ ] Support `?dryRun=true` for size estimation
  - [ ] Return: `{ rows, embedded, tookMs, packUrls, etag }`

- [ ] **Implement `/api/recommend.js`**
  - [ ] Cold start: Check ETag and download pack if needed
  - [ ] Implement module-level cache with TTL
  - [ ] Query analyzer with Hebrew normalization
  - [ ] Extract entities: bus lines, locations, topics, operators
  - [ ] Hybrid retrieval pipeline:
    - [ ] Stage 1: Exact match (line + location)
    - [ ] Stage 2: BM25 with field weights (תמצית > הפניה)
    - [ ] Stage 3: Vector rerank on top-N
  - [ ] LLM gating: Skip if strong heuristic match
  - [ ] Return match reasons in Hebrew
  - [ ] Show "השלמה סמנטית" flag only if vector/LLM dominated

- [ ] **Implement `/api/status.js`**
  - [ ] Return refreshedAt timestamp
  - [ ] Return rows count and packEtag
  - [ ] Calculate and return LLM usage rate
  - [ ] Return P95 latencies for retrieval and LLM
  - [ ] Include pack version and health status

### Phase 4: Environment & Documentation
- [ ] **Create `.env.example`**
  - [ ] Document all required variables:
    - OPENAI_API_KEY
    - SPREADSHEET_ID
    - GOOGLE_CREDENTIALS_JSON
    - BLOB_READ_WRITE_TOKEN
    - INDEX_PACK_PREFIX=rag-packs/
    - EMBED_MODEL=text-embedding-3-small
    - SYNTHESIS_MODEL=gpt-4-turbo-preview
    - HEURISTIC_STRONG_T=0.75
    - INDEX_PACK_TTL=300
  - [ ] Add clear comments and examples
  - [ ] Include security warnings

### Phase 5: Testing & Validation
- [ ] **Local Testing**
  - [ ] Run `/api/blob-selftest` → must return ok:true
  - [ ] Run `/api/pack-selftest` → must return ok:true
  - [ ] Test `/api/refresh?dryRun=true` → verify counts
  - [ ] Test full `/api/refresh` → verify upload

- [ ] **Vercel Preview Testing**
  - [ ] Set all env vars in Vercel dashboard
  - [ ] Deploy to preview environment
  - [ ] Run both selftests again
  - [ ] Test `/api/refresh` → verify pack upload
  - [ ] Run `/api/status` → verify pack info

- [ ] **Golden Query Testing**
  - [ ] Test GQ1 → Must return CAS-653181-L8G1R8 as Top-1
  - [ ] Test GQ2 → Must return CAS-657647-B7P9C7 as Top-1
  - [ ] Test GQ3 → Must return CAS-571594-T2R3W4 as Top-1
  - [ ] Achieve Precision@1 = 100%

- [ ] **Performance Metrics**
  - [ ] Measure LLM skip rate (target > 70%)
  - [ ] Measure retrieve_ms (target < 200ms)
  - [ ] Measure llm_ms (target < 2s)
  - [ ] Check for any 401/403/413 errors
  - [ ] Verify no secrets in logs

## 🔍 Golden Queries for Testing

1. **GQ1**: "קו 18 לרמות מתי יגיע?"
   - Expected: CAS-653181-L8G1R8
   - Must extract: line=18, location=רמות

2. **GQ2**: "תלונה על צפיפות בקו 34א"
   - Expected: CAS-657647-B7P9C7
   - Must extract: line=34א, topic=צפיפות

3. **GQ3**: "שינוי מסלול קו 74 בגילה"
   - Expected: CAS-571594-T2R3W4
   - Must extract: line=74, location=גילה, topic=שינוי מסלול

## ✅ Acceptance Criteria

1. **Functionality**
   - All selftests pass (blob-selftest, pack-selftest)
   - Refresh successfully uploads versioned pack
   - Recommend loads pack on cold start
   - Golden queries achieve 100% Precision@1

2. **Performance**
   - LLM skip rate > 70%
   - P95 retrieval latency < 200ms
   - P95 total latency < 5s
   - No timeout errors on Vercel (10s limit)

3. **Security & Quality**
   - No secrets logged anywhere
   - Clear error messages for missing env vars
   - Admin-only protection on diagnostic endpoints
   - Proper Hebrew normalization and display

## 📊 Progress Tracking

- **Started**: 2025-01-09
- **Target Completion**: End of day
- **Current Phase**: Phase 1 - Module System Conversion
- **Blockers**: None currently

## 📝 Notes

- Production uses file-based API routes only (no Express server)
- All modules must be ES modules (no CommonJS)
- Vercel Blob storage requires BLOB_READ_WRITE_TOKEN
- Google auth must use env var, not file reads
- Keep Hebrew UI unchanged
- Minimize LLM usage through smart gating

---

Last Updated: 2025-01-09