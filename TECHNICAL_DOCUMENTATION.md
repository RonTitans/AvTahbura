# Municipal Inquiry System - Technical Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Core Technologies](#core-technologies)
4. [Search Functionality](#search-functionality)
5. [Generation Features](#generation-features)
6. [Data Flow](#data-flow)
7. [API Endpoints](#api-endpoints)
8. [Configuration](#configuration)
9. [Performance Optimizations](#performance-optimizations)
10. [Future Improvements](#future-improvements)

## System Overview

The Municipal Inquiry System is an AI-powered platform designed to handle transportation-related inquiries for Jerusalem's municipal services. It combines semantic search capabilities with GPT-based response generation to provide accurate, contextual answers to citizen inquiries.

### Key Features
- **Semantic Search**: Uses OpenAI embeddings to find relevant historical responses
- **Intelligent Response Generation**: GPT-3.5 generates contextual, personalized responses
- **Multi-layered Caching**: Improves performance and reduces API costs
- **Session Management**: Tracks conversation context for better responses
- **Analytics & Monitoring**: Built-in performance tracking and quality metrics
- **Google Sheets Integration**: Real-time data synchronization with municipal databases

## Architecture

### System Components

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Express.js     │────▶│  Google Sheets  │
│   (HTML/JS)     │◀────│   Server         │◀────│   Database      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │        │
                               ▼        ▼
                        ┌──────────┐  ┌──────────┐
                        │  OpenAI  │  │  Cache   │
                        │   API    │  │  Layer   │
                        └──────────┘  └──────────┘
```

### Core Modules

1. **server.js** (1420 lines)
   - Main application server
   - API endpoint handlers
   - Data loading and management
   - Integration orchestration

2. **gpt-improvements.js** (557 lines)
   - Enhanced GPT response generation
   - Response validation and quality control
   - Caching mechanisms
   - Analytics and session management

## Core Technologies

- **Backend**: Node.js + Express.js (ES6 modules)
- **Database**: Google Sheets API (real-time sync)
- **AI/ML**: OpenAI API (GPT-3.5-turbo, text-embedding-ada-002)
- **Frontend**: Vanilla JavaScript with modern HTML5/CSS3
- **Authentication**: Google Service Account for Sheets access
- **Caching**: In-memory LRU cache with TTL

## Search Functionality

### Overview
The system implements a sophisticated dual-mode search strategy that adapts based on available resources:

### 1. Semantic Search (Primary Mode)

```javascript
// Semantic search flow
async function findSemanticMatches(inquiryText, threshold = 0.78, maxResults = 5) {
    // 1. Generate embedding for inquiry
    const inquiryEmbedding = await generateEmbedding(inquiryText);
    
    // 2. Calculate cosine similarity with all stored embeddings
    const similarities = municipalData.map(entry => ({
        ...entry,
        similarity: cosineSimilarity(inquiryEmbedding, entry.embedding)
    }));
    
    // 3. Apply line number boosting
    // 4. Filter by threshold and return top matches
}
```

**Key Features:**
- Uses OpenAI's text-embedding-ada-002 model
- Cosine similarity calculation for semantic matching
- Configurable similarity threshold (default: 0.78)
- Line number boosting for transit-specific queries

### 2. Text-Based Fallback Search

```javascript
function findTextMatches(inquiryText, threshold = 0.2, maxResults = 5) {
    // Jaccard similarity calculation
    // Hebrew text normalization
    // Keyword extraction and matching
}
```

**Features:**
- Activates when OpenAI is unavailable or embeddings aren't ready
- Uses Jaccard similarity for text matching
- Lower threshold (0.2) for broader matching
- Optimized for Hebrew text processing

### 3. Search Enhancements

#### Line Number Boosting
```javascript
// Boost scores for entries mentioning same bus lines
if (inquiryLineNumbers.length > 0) {
    const commonLines = inquiryLineNumbers.filter(line => 
        entryLineNumbers.includes(line)
    );
    if (commonLines.length > 0) {
        const boost = 0.3 * (commonLines.length / inquiryLineNumbers.length);
        finalScore = Math.min(1.0, textSimilarity + boost);
    }
}
```

#### Hebrew Text Processing
- Normalization of Hebrew punctuation and spacing
- Extraction of bus line numbers (קו 123)
- Location recognition for Jerusalem neighborhoods
- Official response keyword detection

## Generation Features

### GPT Response Generation System

The system uses a sophisticated multi-layered approach for generating responses:

### 1. Prompt Engineering

Three specialized prompt variants for different use cases:

```javascript
const systemPrompts = {
    detailed: // Full, comprehensive responses
    concise:  // Short, direct answers
    empathetic: // Warm, understanding tone
}
```

### 2. Response Validation Pipeline

```javascript
function validateGPTResponse(response, inquiry) {
    // Check minimum length (100 chars)
    // Verify Hebrew content (>70%)
    // Relevance scoring
    // Hallucination detection
    // Structure validation
}
```

**Validation Checks:**
- Length requirements
- Language verification
- Relevance to inquiry
- Bus line validation (prevents hallucinated line numbers)
- Proper formatting (greeting, content, signature)

### 3. Intelligent Caching

```javascript
class ResponseCache {
    // LRU cache with TTL
    // Normalized key generation
    // Hit rate tracking
    // Automatic expiration
}
```

**Cache Features:**
- 100 response limit with 60-minute TTL
- Normalized inquiry keys for better hit rates
- Performance metrics tracking
- Memory-efficient LRU eviction

### 4. Session Context Management

```javascript
class ConversationContext {
    // Maintains conversation history
    // Tracks user preferences
    // Provides context to GPT
    // Limits history to 5 interactions
}
```

### 5. Quality Analytics

```javascript
class GPTAnalytics {
    // Request/response logging
    // Performance metrics
    // A/B testing support
    // Validation success rates
}
```

## Data Flow

### 1. Initial Data Loading
```
Google Sheets → Authentication → Data Fetch → 
Filtering (official responses only) → 
Embedding Generation → Memory Store
```

### 2. Request Processing
```
User Query → Session Context → Cache Check → 
Search (Semantic/Text) → Match Selection → 
GPT Enhancement → Validation → Response
```

### 3. Response Storage
```
Generated Response → Validation → 
Cache Storage → Analytics Logging → 
Optional: Google Sheets Append
```

## API Endpoints

### Core Endpoints

#### POST /recommend
Primary endpoint for inquiry processing
```javascript
{
    "inquiry_text": "string",
    "max_recommendations": 5,
    "prompt_variant": "detailed|concise|empathetic"
}
```

Response structure:
```javascript
{
    "inquiry": "original inquiry",
    "exact_match": null | { case_id, response, similarity },
    "related_matches": [...],
    "enhanced_response": "GPT-generated response",
    "debug": { ... }
}
```

#### GET /health
System health check and status

#### POST /refresh
Force reload data from Google Sheets

#### GET /analytics
Performance metrics and usage statistics

### Integration Management

#### GET /api/integrations/google-sheets
#### POST /api/integrations/test-google-sheets
#### GET /api/integrations/openai
#### POST /api/integrations/test-openai

### Administrative

#### POST /generate-official-response
Generate formal responses for selected matches

#### POST /append-to-sheet
Save new responses back to Google Sheets

## Configuration

### Environment Variables
```env
# Server Configuration
PORT=8009

# Google Sheets Integration
GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json
SPREADSHEET_ID=your-spreadsheet-id

# OpenAI Integration
OPENAI_API_KEY=sk-...
```

### Key Configuration Parameters
- **Similarity Threshold**: 0.78 (semantic), 0.2 (text)
- **Cache Size**: 100 responses
- **Cache TTL**: 60 minutes
- **Max Session History**: 5 interactions
- **Embedding Model**: text-embedding-ada-002
- **GPT Model**: gpt-3.5-turbo

## Performance Optimizations

### 1. Lazy Embedding Generation
- Skips embedding generation on startup for faster boot
- Generates embeddings on-demand or in background

### 2. Multi-Level Caching
- Response cache for repeated queries
- Session-based context caching
- Google Sheets data caching (5-minute refresh)

### 3. Fallback Mechanisms
- Text search when embeddings unavailable
- Template responses when GPT fails
- Local test data for development

### 4. Rate Limiting
- 50ms delay between embedding generations
- Prevents OpenAI API rate limit errors

## Future Improvements

### 1. Enhanced Search
- Implement vector database (Pinecone/Weaviate)
- Multi-language support
- Fuzzy matching for typos

### 2. Advanced AI Features
- GPT-4 integration for complex queries
- Fine-tuned models for transportation domain
- Multi-modal support (images, maps)

### 3. Performance & Scale
- Redis caching layer
- Horizontal scaling with load balancing
- WebSocket support for real-time updates

### 4. Analytics & Insights
- Machine learning for pattern detection
- Automated quality improvement
- User satisfaction tracking

### 5. Integration Expansion
- WhatsApp/Telegram bot integration
- CRM system connectivity
- Real-time transit API integration

## Security Considerations

### Current Implementation
- Service account authentication for Google Sheets
- API key protection via environment variables
- Input sanitization for Hebrew text
- No user authentication (public system)

### Recommended Enhancements
- Add rate limiting per IP
- Implement API authentication
- Encrypt sensitive data at rest
- Add request validation middleware
- Implement audit logging