/**
 * Hybrid Retrieval System for RAG
 * Implements Exact → BM25 → Vector reranking pipeline
 */

import { normalizeHebrew, extractNGrams } from './normalizer.js';
import { analyzeQuery } from './analyzer.js';

/**
 * Calculate cosine similarity between vectors
 */
function cosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Stage 1: Exact matching with filters
 */
function exactMatch(queryAnalysis, indexPack) {
  const matches = [];
  const { documents, indices } = indexPack;
  const queryNgrams = new Set(queryAnalysis.ngrams);
  
  // Ensure indices exist
  if (!indices) {
    console.warn('⚠️ No indices found in index pack');
    return matches;
  }
  
  // Check for line + location AND filter
  if (queryAnalysis.metadata.hasExactLineLocation) {
    const lineDocIds = new Set();
    queryAnalysis.entities.busLines.forEach(line => {
      const docs = indices.busLines?.[line] || [];
      docs.forEach(id => lineDocIds.add(id));
    });
    
    const locationDocIds = new Set();
    queryAnalysis.entities.locations.forEach(loc => {
      const normalized = normalizeHebrew(loc);
      const docs = indices.locations?.[normalized] || [];
      docs.forEach(id => locationDocIds.add(id));
    });
    
    // Intersection of line and location matches
    const intersection = [...lineDocIds].filter(id => locationDocIds.has(id));
    
    intersection.forEach(docId => {
      matches.push({
        docId,
        score: 1.0,
        matchType: 'exact_line_location',
        document: documents[docId]
      });
    });
  }
  
  // Check for exact phrase matches
  documents.forEach((doc, docId) => {
    if (matches.some(m => m.docId === docId)) return; // Already matched
    
    let phraseScore = 0;
    queryNgrams.forEach(ngram => {
      if (doc.normalizedText.includes(ngram)) {
        // Higher score for longer phrases and matches in summary
        const weight = ngram.split(' ').length * 0.2;
        const fieldBoost = doc.summary.includes(ngram) ? 1.5 : 1.0;
        phraseScore += weight * fieldBoost;
      }
    });
    
    if (phraseScore > 0.5) {
      matches.push({
        docId,
        score: Math.min(phraseScore, 1.0),
        matchType: 'exact_phrase',
        document: doc
      });
    }
  });
  
  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Stage 2: BM25 scoring with adaptive weights
 */
function bm25Score(queryAnalysis, indexPack, topN = 20) {
  const { documents, tfIdf, termDocFreq } = indexPack;
  
  // Check if required data exists
  if (!documents || documents.length === 0) {
    console.warn('⚠️ No documents found for BM25 scoring');
    return [];
  }
  
  const k1 = 1.2;
  const b = 0.75;
  const avgDocLength = documents.reduce((sum, doc) => sum + (doc.tokens?.length || 0), 0) / documents.length;
  
  const scores = documents.map((doc, docId) => {
    let score = 0;
    
    // Entity matching with adaptive weights (with safe navigation)
    const entityScore = 
      (queryAnalysis.entities?.busLines?.filter(line => doc.entities?.busLines?.includes(line))?.length || 0) * 3 +
      (queryAnalysis.entities?.locations?.filter(loc => 
        doc.entities?.locations?.some(docLoc => normalizeHebrew(docLoc) === normalizeHebrew(loc))
      )?.length || 0) * 2 +
      (queryAnalysis.entities?.operators?.filter(op => 
        doc.entities?.operators?.some(docOp => normalizeHebrew(docOp) === normalizeHebrew(op))
      )?.length || 0) * 1 +
      (queryAnalysis.entities?.topic === doc.entities?.topic ? 1 : 0);
    
    // BM25 term scoring
    const queryTerms = queryAnalysis.keywords;
    queryTerms.forEach(term => {
      const termNorm = normalizeHebrew(term);
      const tf = doc.tokens.filter(t => t === termNorm).length;
      if (tf > 0) {
        const idf = Math.log((documents.length - (termDocFreq[termNorm] || 0) + 0.5) / 
                            ((termDocFreq[termNorm] || 0) + 0.5));
        const docLengthNorm = doc.tokens.length / avgDocLength;
        const bm25 = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLengthNorm));
        score += bm25;
      }
    });
    
    // Recency boost (newer documents get slight boost)
    const recencyBoost = doc.createdAt ? 
      Math.max(0, 1 - (Date.now() - new Date(doc.createdAt).getTime()) / (365 * 24 * 60 * 60 * 1000)) * 0.1 : 0;
    
    return {
      docId,
      score: score + entityScore + recencyBoost,
      matchType: 'bm25',
      document: doc,
      components: { bm25: score, entities: entityScore, recency: recencyBoost }
    };
  });
  
  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/**
 * Stage 3: Vector reranking with embeddings
 */
async function vectorRerank(queryAnalysis, candidates, indexPack, openai) {
  if (!indexPack.vectors || !openai) {
    return candidates; // Return as-is if no vectors available
  }
  
  // Generate query embedding
  const queryEmbedding = await openai.embeddings.create({
    model: process.env.EMBED_MODEL || 'text-embedding-3-small',
    input: queryAnalysis.normalized
  }).then(res => res.data[0].embedding);
  
  // Calculate cosine similarity for each candidate
  const reranked = candidates.map(candidate => {
    const docEmbedding = indexPack.vectors[candidate.docId];
    if (!docEmbedding) {
      return candidate; // Keep original score if no embedding
    }
    
    const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
    
    // Combine scores (weighted average)
    const combinedScore = (candidate.score * 0.6) + (similarity * 0.4);
    
    return {
      ...candidate,
      vectorSimilarity: similarity,
      combinedScore: combinedScore,
      matchType: 'hybrid'
    };
  });
  
  return reranked.sort((a, b) => 
    (b.combinedScore || b.score) - (a.combinedScore || a.score)
  );
}

/**
 * Main hybrid retrieval pipeline
 */
async function hybridRetrieve(query, indexPack, openai = null, options = {}) {
  const startTime = Date.now();
  const { maxResults = 5, skipVector = false } = options;
  
  // Analyze query
  const queryAnalysis = analyzeQuery(query);
  console.log(`🔍 Query analysis:`, {
    lines: queryAnalysis.entities?.busLines || [],
    locations: queryAnalysis.entities?.locations || [],
    type: queryAnalysis.queryType
  });
  
  // Stage 1: Exact matching
  const exactMatches = exactMatch(queryAnalysis, indexPack);
  if (exactMatches.length > 0 && exactMatches[0].score >= 0.9) {
    console.log(`✅ Found exact matches (${Date.now() - startTime}ms)`);
    return {
      results: exactMatches.slice(0, maxResults),
      method: 'exact',
      queryAnalysis,
      timing: Date.now() - startTime
    };
  }
  
  // Stage 2: BM25 scoring
  const bm25Matches = bm25Score(queryAnalysis, indexPack, 20);
  
  // Combine exact and BM25 matches
  const allMatches = [...exactMatches, ...bm25Matches];
  const uniqueMatches = Array.from(
    new Map(allMatches.map(m => [m.docId, m])).values()
  ).sort((a, b) => b.score - a.score);
  
  if (uniqueMatches[0]?.score >= 0.85 || skipVector) {
    console.log(`✅ Found strong heuristic matches (${Date.now() - startTime}ms)`);
    return {
      results: uniqueMatches.slice(0, maxResults),
      method: 'heuristic',
      queryAnalysis,
      timing: Date.now() - startTime
    };
  }
  
  // Stage 3: Vector reranking
  if (openai && !skipVector) {
    const reranked = await vectorRerank(queryAnalysis, uniqueMatches.slice(0, 20), indexPack, openai);
    console.log(`✅ Vector reranking complete (${Date.now() - startTime}ms)`);
    return {
      results: reranked.slice(0, maxResults),
      method: 'vector',
      queryAnalysis,
      timing: Date.now() - startTime
    };
  }
  
  return {
    results: uniqueMatches.slice(0, maxResults),
    method: 'heuristic',
    queryAnalysis,
    timing: Date.now() - startTime
  };
}

export {
  cosineSimilarity,
  exactMatch,
  bm25Score,
  vectorRerank,
  hybridRetrieve
};