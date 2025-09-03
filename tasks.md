# Smart Search Implementation Tasks

## Overview
Implementing an enhanced semantic search with GPT-4 validation to find relevant answers even when questions are phrased differently or in different contexts.

## Core Concept
Instead of just matching text, we'll:
1. Find potentially relevant answers using embeddings (semantic similarity)
2. Send top candidates to GPT-4 to validate if they actually answer the question
3. Generate a comprehensive response with source references

## Task List

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
- [x] Add 4th tab "חיפוש חכם" (Smart Search)
- [x] Create UI for smart search mode
- [x] Display results with source references
- [x] Add loading state for longer processing
- [x] Show confidence scores visually

### Phase 5: Testing & Optimization ⏳
- [ ] Test with various question phrasings
- [ ] Optimize response time
- [ ] Add result caching
- [ ] Monitor GPT-4 token usage
- [ ] Create fallback for API failures

## Technical Details

### Embeddings Explanation
- **What**: Convert text to numerical vectors that represent meaning
- **Why**: Find semantically similar content even with different words
- **How**: Using OpenAI's text-embedding-ada-002 model

### Smart Search Flow
```
User Question → Generate Embedding → Find Similar Content (low threshold)
                                    ↓
                        Collect Top 10 Candidates
                                    ↓
                        Send to GPT-4 for Validation
                                    ↓
                    GPT-4 Selects Relevant Answers
                                    ↓
                    Generate Final Response with Sources
```

### API Changes
- New endpoint: `POST /smart-search`
- Request: `{ inquiry_text: "user question" }`
- Response: `{ answer: "...", sources: [...], confidence: 0.95 }`

## Progress Tracking
- 🟢 Completed
- 🟡 In Progress  
- 🔴 Not Started
- ⏳ Current Focus

Last Updated: 2025-09-03