/**
 * LLM Gating Logic
 * Determines when to skip LLM calls to reduce costs
 */

import { normalizeHebrew } from '../core/normalizer.js';

/**
 * Determine if LLM should be skipped
 * @param {object} retrievalResult - Result from hybrid retrieval
 * @returns {object} Gating decision with reason
 */
function shouldSkipLLM(retrievalResult) {
  const { results, method, queryAnalysis } = retrievalResult;
  
  if (!results || results.length === 0) {
    return { skip: false, reason: 'no_results' };
  }
  
  const topResult = results[0];
  const threshold = parseFloat(process.env.EXACT_MATCH_THRESHOLD || '0.85');
  
  // Skip conditions
  
  // 1. Exact line + location match
  if (method === 'exact' && topResult.matchType === 'exact_line_location') {
    return { 
      skip: true, 
      reason: 'exact_line_location',
      confidence: 1.0
    };
  }
  
  // 2. Strong exact phrase match
  if (topResult.matchType === 'exact_phrase' && topResult.score >= 0.9) {
    return { 
      skip: true, 
      reason: 'exact_phrase',
      confidence: topResult.score
    };
  }
  
  // 3. High confidence score
  const finalScore = topResult.combinedScore || topResult.score;
  if (finalScore >= threshold) {
    return { 
      skip: true, 
      reason: 'high_confidence',
      confidence: finalScore
    };
  }
  
  // 4. Perfect entity match (all query entities found in top result)
  const doc = topResult.document;
  const perfectEntityMatch = 
    queryAnalysis.entities.busLines.every(line => doc.entities.busLines.includes(line)) &&
    queryAnalysis.entities.locations.every(loc => 
      doc.entities.locations.some(docLoc => 
        normalizeHebrew(docLoc) === normalizeHebrew(loc)
      )
    ) &&
    queryAnalysis.entities.busLines.length > 0; // Must have at least one bus line
  
  if (perfectEntityMatch) {
    return { 
      skip: true, 
      reason: 'perfect_entity_match',
      confidence: finalScore
    };
  }
  
  // Don't skip - need LLM synthesis
  return { 
    skip: false, 
    reason: 'needs_synthesis',
    confidence: finalScore
  };
}

/**
 * Prepare snippets for LLM synthesis
 * @param {array} results - Retrieval results
 * @param {number} maxSnippets - Maximum snippets to send
 * @returns {array} Prepared snippets
 */
function prepareSnippets(results, maxSnippets = 5) {
  const snippets = results.slice(0, maxSnippets).map((result, idx) => {
    const doc = result.document;
    
    // Truncate text fields
    const summaryTruncated = (doc.summary || '').substring(0, 300);
    const inquiryTruncated = (doc.inquiry || '').substring(0, 400);
    const responseTruncated = (doc.response || '').substring(0, 400);
    
    return {
      id: idx + 1,
      caseId: doc.caseId,
      rowNumber: doc.rowNumber,
      topic: doc.topic || '',
      summary: summaryTruncated,
      inquiry: inquiryTruncated,
      response: responseTruncated,
      score: result.combinedScore || result.score,
      entities: doc.entities
    };
  });
  
  return snippets;
}

/**
 * Format direct response (no LLM)
 * @param {object} result - Top retrieval result
 * @param {object} gatingDecision - Gating decision
 * @returns {object} Formatted response
 */
function formatDirectResponse(result, gatingDecision) {
  const doc = result.document;
  
  // Use response or summary as the answer
  const answer = doc.response || doc.summary || doc.inquiry || 'לא נמצאה תשובה מתאימה';
  
  return {
    answer: answer,
    confidence: gatingDecision.confidence,
    sources: [{
      caseId: doc.caseId,
      rowNumber: doc.rowNumber,
      relevance: Math.round(gatingDecision.confidence * 10)
    }],
    method: 'direct_match',
    llmSkipped: true,
    skipReason: gatingDecision.reason,
    matchReasons: {
      lines: doc.entities.busLines,
      locations: doc.entities.locations,
      topic: doc.entities.topic,
      operator: doc.entities.operators
    }
  };
}

/**
 * Calculate gating metrics
 * @param {array} decisions - Array of gating decisions
 * @returns {object} Metrics summary
 */
function calculateGatingMetrics(decisions) {
  const total = decisions.length;
  const skipped = decisions.filter(d => d.skip).length;
  const reasons = {};
  
  decisions.forEach(d => {
    if (d.skip) {
      reasons[d.reason] = (reasons[d.reason] || 0) + 1;
    }
  });
  
  return {
    total: total,
    skipped: skipped,
    llmCalls: total - skipped,
    skipRate: total > 0 ? (skipped / total) : 0,
    skipReasons: reasons
  };
}

export {
  shouldSkipLLM,
  prepareSnippets,
  formatDirectResponse,
  calculateGatingMetrics
};