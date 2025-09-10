/**
 * Response Selection Module
 * Intelligently selects the best response when multiple matches exist
 * for the same bus line or topic
 */

import { normalizeHebrew } from './normalizer.js';

/**
 * Calculate topic similarity between query and document
 * @param {string} queryTopic - Topic from query analysis
 * @param {string} docTopic - Topic from document
 * @returns {number} Similarity score 0-1
 */
function topicSimilarity(queryTopic, docTopic) {
  if (!queryTopic || !docTopic) return 0;
  
  // Exact match
  if (queryTopic === docTopic) return 1.0;
  
  // Partial matches for common topics
  const topicMap = {
    'שינוי מסלול': ['שינוי', 'מסלול', 'route_change'],
    'תדירות': ['תדירות', 'זמנים', 'frequency', 'לוח זמנים'],
    'צפיפות': ['צפיפות', 'עומס', 'מלא', 'crowding'],
    'ביטול': ['ביטול', 'הופסק', 'cancellation'],
    'הוספת קו': ['הוספה', 'קו חדש', 'new_line'],
    'תלונה': ['תלונה', 'complaint', 'בעיה'],
    'תחנה': ['תחנה', 'תחנות', 'stop', 'station']
  };
  
  // Check if topics belong to same category
  for (const [category, keywords] of Object.entries(topicMap)) {
    const queryMatches = keywords.some(kw => queryTopic.includes(kw));
    const docMatches = keywords.some(kw => docTopic.includes(kw));
    if (queryMatches && docMatches) return 0.7;
  }
  
  return 0;
}

/**
 * Calculate location overlap between query and document
 * @param {Array} queryLocations - Locations from query
 * @param {Array} docLocations - Locations from document
 * @returns {number} Overlap score 0-1
 */
function locationOverlap(queryLocations, docLocations) {
  if (!queryLocations?.length || !docLocations?.length) return 0;
  
  const querySet = new Set(queryLocations.map(loc => normalizeHebrew(loc)));
  const docSet = new Set(docLocations.map(loc => normalizeHebrew(loc)));
  
  let matches = 0;
  querySet.forEach(loc => {
    if (docSet.has(loc)) matches++;
  });
  
  // Jaccard similarity
  const union = new Set([...querySet, ...docSet]);
  return matches / union.size;
}

/**
 * Calculate recency score based on date
 * @param {any} date - Document date (Excel serial or Date)
 * @returns {number} Recency score 0-1
 */
function recencyScore(date) {
  if (!date) return 0.5; // Default for missing dates
  
  let jsDate;
  if (typeof date === 'number' && date < 100000) {
    // Excel serial date
    jsDate = new Date((date - 25569) * 86400 * 1000);
  } else {
    jsDate = new Date(date);
  }
  
  const now = new Date();
  const daysDiff = (now - jsDate) / (1000 * 60 * 60 * 24);
  
  // Score based on age (newer = higher score)
  if (daysDiff < 30) return 1.0;      // Last month
  if (daysDiff < 90) return 0.8;      // Last 3 months
  if (daysDiff < 180) return 0.6;     // Last 6 months
  if (daysDiff < 365) return 0.4;     // Last year
  return 0.2;                         // Older
}

/**
 * Select best response from multiple matches
 * @param {Array} matches - Array of matched documents
 * @param {Object} queryAnalysis - Analysis of user query
 * @param {Object} options - Selection options
 * @returns {Object} Best match with selection metadata
 */
export function selectBestResponse(matches, queryAnalysis, options = {}) {
  const {
    preferRecent = true,
    topicWeight = 0.35,
    locationWeight = 0.25,
    similarityWeight = 0.25,
    recencyWeight = 0.15
  } = options;
  
  if (!matches || matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  
  // Score each match
  const scoredMatches = matches.map(match => {
    const doc = match.document || match;
    
    // Calculate component scores
    const topicScore = topicSimilarity(
      queryAnalysis.entities?.topic,
      doc.entities?.topic || doc.topic
    );
    
    const locationScore = locationOverlap(
      queryAnalysis.entities?.locations,
      doc.entities?.locations
    );
    
    const similarityScore = match.score || match.similarity || 0;
    
    const recency = preferRecent ? recencyScore(doc.createdAt || doc.date) : 0.5;
    
    // Calculate weighted total
    const totalScore = 
      (topicScore * topicWeight) +
      (locationScore * locationWeight) +
      (similarityScore * similarityWeight) +
      (recency * recencyWeight);
    
    return {
      ...match,
      selectionScore: totalScore,
      selectionComponents: {
        topic: topicScore,
        location: locationScore,
        similarity: similarityScore,
        recency: recency
      }
    };
  });
  
  // Sort by selection score
  scoredMatches.sort((a, b) => b.selectionScore - a.selectionScore);
  
  // Return best match with metadata
  const best = scoredMatches[0];
  best.selectionMetadata = {
    totalCandidates: matches.length,
    selectionReason: getSelectionReason(best.selectionComponents),
    runnerUp: scoredMatches[1]?.selectionScore
  };
  
  return best;
}

/**
 * Get human-readable selection reason
 * @param {Object} components - Score components
 * @returns {string} Selection reason in Hebrew
 */
function getSelectionReason(components) {
  const reasons = [];
  
  if (components.topic >= 0.7) {
    reasons.push('התאמת נושא מדויקת');
  }
  if (components.location >= 0.5) {
    reasons.push('התאמת מיקום');
  }
  if (components.similarity >= 0.8) {
    reasons.push('דמיון גבוה לשאלה');
  }
  if (components.recency >= 0.8) {
    reasons.push('תשובה עדכנית');
  }
  
  return reasons.length > 0 ? reasons.join(', ') : 'התאמה כללית';
}

/**
 * Group matches by response pattern
 * @param {Array} matches - Array of matches
 * @returns {Array} Grouped matches
 */
export function groupByResponsePattern(matches) {
  const groups = {};
  
  matches.forEach(match => {
    const doc = match.document || match;
    const response = doc.response || doc.response_text || '';
    
    // Create response fingerprint (first 100 chars normalized)
    const fingerprint = normalizeHebrew(response.substring(0, 100));
    
    if (!groups[fingerprint]) {
      groups[fingerprint] = {
        response: response,
        matches: [],
        count: 0,
        topics: new Set(),
        busLines: new Set()
      };
    }
    
    groups[fingerprint].matches.push(match);
    groups[fingerprint].count++;
    
    if (doc.entities?.topic) {
      groups[fingerprint].topics.add(doc.entities.topic);
    }
    doc.entities?.busLines?.forEach(line => {
      groups[fingerprint].busLines.add(line);
    });
  });
  
  // Convert to array and sort by frequency
  return Object.values(groups)
    .map(group => ({
      ...group,
      topics: Array.from(group.topics),
      busLines: Array.from(group.busLines)
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Check if responses are similar enough to merge
 * @param {string} response1 - First response
 * @param {string} response2 - Second response
 * @returns {boolean} True if similar
 */
export function areResponsesSimilar(response1, response2) {
  if (!response1 || !response2) return false;
  
  const norm1 = normalizeHebrew(response1);
  const norm2 = normalizeHebrew(response2);
  
  // Check if one contains the other (subset)
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
  
  // Check Jaccard similarity of words
  const words1 = new Set(norm1.split(/\s+/));
  const words2 = new Set(norm2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  const jaccard = intersection.size / union.size;
  return jaccard > 0.7;
}