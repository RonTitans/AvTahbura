/**
 * Query Analyzer for RAG System
 * Extracts entities and classifies queries for optimal retrieval
 */

import { normalizeHebrew, extractBusLines, extractNGrams } from './normalizer.js';
import locations from '../dictionaries/locations.json' with { type: 'json' };
import operators from '../dictionaries/operators.json' with { type: 'json' };
import topics from '../dictionaries/topics.json' with { type: 'json' };
import stopwords from '../dictionaries/stopwords.json' with { type: 'json' };

/**
 * Extract location entities from text with fuzzy matching
 * @param {string} text - Input text
 * @returns {string[]} Array of matched locations
 */
function extractLocations(text) {
  const found = new Set();
  const normalizedText = normalizeHebrew(text);
  
  // Check neighborhoods
  locations.neighborhoods.forEach(location => {
    if (normalizedText.includes(normalizeHebrew(location))) {
      found.add(location);
    }
  });
  
  // Check major streets
  locations.majorStreets.forEach(street => {
    if (normalizedText.includes(normalizeHebrew(street))) {
      found.add(street);
    }
  });
  
  // Check landmarks
  locations.landmarks.forEach(landmark => {
    if (normalizedText.includes(normalizeHebrew(landmark))) {
      found.add(landmark);
    }
  });
  
  // Check synonyms and add canonical form
  Object.entries(locations.synonyms).forEach(([canonical, synonymList]) => {
    synonymList.forEach(synonym => {
      if (normalizedText.includes(normalizeHebrew(synonym))) {
        found.add(canonical);
      }
    });
  });
  
  return Array.from(found);
}

/**
 * Extract operator entities from text
 * @param {string} text - Input text
 * @returns {string[]} Array of matched operators
 */
function extractOperators(text) {
  const found = new Set();
  const normalizedText = normalizeHebrew(text);
  
  // Check main operators
  operators.operators.forEach(operator => {
    if (normalizedText.includes(normalizeHebrew(operator))) {
      found.add(operator);
    }
  });
  
  // Check aliases
  Object.entries(operators.aliases).forEach(([canonical, aliasList]) => {
    aliasList.forEach(alias => {
      if (normalizedText.includes(normalizeHebrew(alias))) {
        found.add(canonical);
      }
    });
  });
  
  return Array.from(found);
}

/**
 * Classify query topic based on keywords
 * @param {string} text - Input text
 * @returns {string} Topic classification
 */
function classifyTopic(text) {
  const normalizedText = normalizeHebrew(text);
  let bestMatch = null;
  let maxScore = 0;
  
  Object.entries(topics.topics).forEach(([topicName, topicData]) => {
    let score = 0;
    topicData.keywords.forEach(keyword => {
      if (normalizedText.includes(normalizeHebrew(keyword))) {
        score += keyword.split(' ').length; // Multi-word keywords get higher score
      }
    });
    
    if (score > maxScore) {
      maxScore = score;
      bestMatch = topicName;
    }
  });
  
  return bestMatch || topics.defaultTopic;
}

/**
 * Remove stopwords from text
 * @param {string} text - Input text
 * @returns {string[]} Array of meaningful words
 */
function removeStopwords(text) {
  const words = text.split(/\s+/);
  const hebrewStopwords = new Set(stopwords.hebrew.concat(stopwords.additionalFilters));
  
  return words.filter(word => {
    const normalized = normalizeHebrew(word);
    return normalized.length > 1 && !hebrewStopwords.has(normalized);
  });
}

/**
 * Extract key phrases considering entity importance
 * @param {string} text - Input text
 * @param {object} entities - Extracted entities
 * @returns {string[]} Array of key phrases
 */
function extractKeyPhrases(text, entities) {
  const phrases = [];
  const ngrams = extractNGrams(text, 2, 4); // Shorter n-grams for key phrases
  
  // Filter n-grams that contain important entities
  ngrams.forEach(ngram => {
    let importance = 0;
    
    // Check if contains bus line
    entities.busLines.forEach(line => {
      if (ngram.includes(line)) importance += 3;
    });
    
    // Check if contains location
    entities.locations.forEach(location => {
      if (normalizeHebrew(ngram).includes(normalizeHebrew(location))) importance += 2;
    });
    
    // Check if contains operator
    entities.operators.forEach(operator => {
      if (normalizeHebrew(ngram).includes(normalizeHebrew(operator))) importance += 1;
    });
    
    if (importance > 0) {
      phrases.push({ phrase: ngram, importance });
    }
  });
  
  // Sort by importance and return top phrases
  return phrases
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5)
    .map(p => p.phrase);
}

/**
 * Analyze query and extract all entities
 * @param {string} query - Input query
 * @returns {object} Analysis result with entities and metadata
 */
function analyzeQuery(query) {
  const normalized = normalizeHebrew(query);
  
  // Extract entities
  const busLines = extractBusLines(query);
  const locationsList = extractLocations(query);
  const operatorsList = extractOperators(query);
  const topic = classifyTopic(query);
  const ngrams = extractNGrams(normalized);
  const keywords = removeStopwords(normalized);
  
  const entities = {
    busLines,
    locations: locationsList,
    operators: operatorsList,
    topic
  };
  
  const keyPhrases = extractKeyPhrases(query, entities);
  
  // Determine query type
  let queryType = 'general';
  if (busLines.length > 0 && locationsList.length > 0) {
    queryType = 'specific'; // Has both line and location
  } else if (busLines.length > 0 || locationsList.length > 0) {
    queryType = 'semi-specific'; // Has either line or location
  }
  
  // Calculate specificity score
  const specificityScore = 
    (busLines.length * 3) + 
    (locationsList.length * 2) + 
    (operatorsList.length * 1) +
    (topic !== topics.defaultTopic ? 1 : 0);
  
  return {
    original: query,
    normalized: normalized,
    entities: entities,
    ngrams: ngrams,
    keyPhrases: keyPhrases,
    keywords: keywords.slice(0, 10), // Top 10 keywords
    queryType: queryType,
    specificityScore: specificityScore,
    metadata: {
      hasExactLineLocation: busLines.length > 0 && locationsList.length > 0,
      entityCount: busLines.length + locationsList.length + operatorsList.length,
      queryLength: query.length,
      wordCount: query.split(/\s+/).length
    }
  };
}

/**
 * Check if two queries are asking about the same thing
 * @param {object} analysis1 - First query analysis
 * @param {object} analysis2 - Second query analysis
 * @returns {number} Similarity score (0-1)
 */
function querySimilarity(analysis1, analysis2) {
  let score = 0;
  let factors = 0;
  
  // Bus lines similarity (highest weight)
  if (analysis1.entities.busLines.length > 0 || analysis2.entities.busLines.length > 0) {
    const lines1 = new Set(analysis1.entities.busLines);
    const lines2 = new Set(analysis2.entities.busLines);
    const intersection = [...lines1].filter(x => lines2.has(x));
    const union = new Set([...lines1, ...lines2]);
    if (union.size > 0) {
      score += (intersection.length / union.size) * 3;
      factors += 3;
    }
  }
  
  // Locations similarity
  if (analysis1.entities.locations.length > 0 || analysis2.entities.locations.length > 0) {
    const locs1 = new Set(analysis1.entities.locations.map(l => normalizeHebrew(l)));
    const locs2 = new Set(analysis2.entities.locations.map(l => normalizeHebrew(l)));
    const intersection = [...locs1].filter(x => locs2.has(x));
    const union = new Set([...locs1, ...locs2]);
    if (union.size > 0) {
      score += (intersection.length / union.size) * 2;
      factors += 2;
    }
  }
  
  // Topic similarity
  if (analysis1.entities.topic === analysis2.entities.topic && 
      analysis1.entities.topic !== topics.defaultTopic) {
    score += 1;
    factors += 1;
  }
  
  // N-gram overlap
  const ngrams1 = new Set(analysis1.ngrams);
  const ngrams2 = new Set(analysis2.ngrams);
  const ngramOverlap = [...ngrams1].filter(x => ngrams2.has(x));
  if (ngrams1.size > 0 || ngrams2.size > 0) {
    const ngramUnion = new Set([...ngrams1, ...ngrams2]);
    score += (ngramOverlap.length / ngramUnion.size) * 0.5;
    factors += 0.5;
  }
  
  return factors > 0 ? score / factors : 0;
}

/**
 * Score content quality to identify internal communications vs public responses
 * @param {object} document - Document object with inquiry, summary, and response fields
 * @returns {object} Quality assessment with score and classification
 */
function scoreContentQuality(document) {
  const { inquiry, summary, response, topic } = document;
  const fullText = `${inquiry || ''} ${summary || ''} ${response || ''}`;
  const normalizedText = normalizeHebrew(fullText);
  
  // Internal communication patterns (negative indicators)
  const internalPatterns = [
    // Staff names at beginning of text (strong indicator of internal chat)
    { pattern: /^(ראובן|אריאלה|אייל|ישראל|עידן|יונתן|שלמה|נפתלי|אינה|אורי|יוסי|רחל|משה|דניאל)\s+(שלום|היי|הי)/gm, weight: -0.6 },
    // Staff names commonly found in internal chats
    { pattern: /ראובן|אריאלה|אייל|ישראל|עידן|מועלם|דניאל|יוסי|רחל|משה|יונתן|שלמה|נפתלי|אינה|אורי/g, weight: -0.3 },
    // Internal communication phrases
    { pattern: /בטיפול שלך|העבירי את זה|מבירור מול|טיפול שלך ושל|נמצא בטיפול/g, weight: -0.4 },
    { pattern: /העבר ל|העברתי ל|מחכה ל|ממתין ל|בהמשך ל|העברתי במייל/g, weight: -0.3 },
    { pattern: /צריך את החלטתכם|צריך לקבל התייחסות|צריך את עמדתו/g, weight: -0.4 },
    { pattern: /היי |הי |אהלן/g, weight: -0.2 },
    // Status updates between staff
    { pattern: /טופל|בוצע|אושר על ידי|נשלח ל|קיבלתי את|ראיתי את/g, weight: -0.2 },
    // Questions between staff
    { pattern: /מה הסטטוס|איפה זה עומד|יש עדכון|תעדכן אותי/g, weight: -0.3 },
    // References to internal processes
    { pattern: /מוצעת התשובה הבאה|אני מציע|כפי ש.*אמר|ע"פ הערות קודמות/g, weight: -0.3 }
  ];
  
  // Public response patterns (positive indicators)
  const publicPatterns = [
    // Formal greetings and closings
    { pattern: /שלום רב|שלום וברכה|לכבוד|נכבדי|תושב יקר/g, weight: 0.3 },
    { pattern: /בברכה|בכבוד רב|תודה על פנייתך|תודה על הפנייה/g, weight: 0.3 },
    // Official response language
    { pattern: /פנייתך התקבלה|בקשתך נבדקה|הנושא נבחן|לאחר בדיקה/g, weight: 0.4 },
    { pattern: /אנו מתנצלים|לצערנו|נשמח לעדכן|נעדכן אותך/g, weight: 0.3 },
    { pattern: /בהתאם ל|על פי|לפי הנהלים|בהתאם להנחיות/g, weight: 0.3 },
    { pattern: /הוחלט|אושר|נדחה|התקבל|לא התקבל/g, weight: 0.3 },
    // Complete sentences indicators
    { pattern: /\. |\.$/g, weight: 0.1 },
    // Reference to citizen/resident
    { pattern: /התושב|הפונה|האזרח|תושבי|אזרחי/g, weight: 0.2 }
  ];
  
  // Calculate scores
  let score = 0.5; // Start with neutral score
  let internalMatches = 0;
  let publicMatches = 0;
  
  // Special check: if response starts with staff name greeting, it's very likely internal
  const responseText = response || summary || '';
  if (responseText && /^(ראובן|אריאלה|אייל|ישראל|עידן|יונתן|שלמה|נפתלי|אינה|אורי|יוסי|רחל|משה|דניאל)\s+(שלום|היי)/i.test(responseText.trim())) {
    score -= 0.5; // Strong penalty for internal greeting at start
    internalMatches += 5; // Count as significant internal indicator
  }
  
  // Check for mixed content pattern: internal intro followed by suggested response
  if (responseText && /^[^,]+,?\s*(מוצעת התשובה הבאה|התשובה המוצעת|להלן התשובה|תשובה מוצעת)/i.test(responseText)) {
    // This is mixed content - internal communication with embedded public response
    score = 0.45; // Force into mixed_content range
    internalMatches += 3;
  }
  
  // Check internal patterns
  internalPatterns.forEach(({ pattern, weight }) => {
    const matches = normalizedText.match(pattern);
    if (matches) {
      score += weight * Math.min(matches.length, 3); // Cap impact per pattern
      internalMatches += matches.length;
    }
  });
  
  // Check public patterns
  publicPatterns.forEach(({ pattern, weight }) => {
    const matches = normalizedText.match(pattern);
    if (matches) {
      score += weight * Math.min(matches.length, 3); // Cap impact per pattern
      publicMatches += matches.length;
    }
  });
  
  // Length-based adjustments
  const responseLength = (response || '').length;
  if (responseLength < 50) {
    score -= 0.2; // Very short responses are likely fragments
  } else if (responseLength > 200) {
    score += 0.1; // Longer responses are more likely to be complete
  }
  
  // Check for incomplete response indicators
  if (normalizedText.match(/^\.\.\.|\.\.\.$/)) {
    score -= 0.2; // Ellipsis suggests incomplete
  }
  
  // Ensure score is between 0 and 1
  score = Math.max(0, Math.min(1, score));
  
  // Classify based on score
  let classification;
  if (score >= 0.7) {
    classification = 'public_response';
  } else if (score >= 0.4) {
    classification = 'mixed_content';
  } else {
    classification = 'internal_communication';
  }
  
  return {
    score,
    classification,
    indicators: {
      internalMatches,
      publicMatches,
      responseLength,
      hasCompleteResponse: responseLength > 100 && publicMatches > internalMatches
    }
  };
}

export {
  extractLocations,
  extractOperators,
  classifyTopic,
  removeStopwords,
  extractKeyPhrases,
  analyzeQuery,
  querySimilarity,
  scoreContentQuality
};