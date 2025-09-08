/**
 * Hebrew Text Normalizer for RAG System
 * Handles Hebrew text normalization, bus line extraction, and text cleaning
 */

/**
 * Normalize Hebrew text by removing diacritics, normalizing finals, quotes, and spaces
 * @param {string} text - Input Hebrew text
 * @returns {string} Normalized Hebrew text
 */
function normalizeHebrew(text) {
  if (!text) return '';
  
  return text
    // Remove niqqud (diacritics)
    .replace(/[\u0591-\u05C7]/g, '')
    // Normalize final letters
    .replace(/ך/g, 'כ')
    .replace(/ם/g, 'מ')
    .replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ')
    .replace(/ץ/g, 'צ')
    // Normalize quotes and apostrophes
    .replace(/[״""''׳`´]/g, '"')
    // Normalize dashes
    .replace(/[–—־]/g, '-')
    // Remove extra punctuation but keep essential ones
    .replace(/[,;:!?(){}[\]]/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract bus line numbers from text, handling various formats
 * @param {string} text - Input text
 * @returns {string[]} Array of normalized bus line numbers
 */
function extractBusLines(text) {
  const lines = new Set();
  const normalizedText = text.replace(/[\u0591-\u05C7]/g, ''); // Remove niqqud first
  
  // Patterns to match:
  // "קו 18", "קווים 18", "קו 18א", "18-א", "18א'", "קו 408"
  const patterns = [
    /קו(?:וים)?\s+(\d+[א-ת]?'?)/g,  // קו/קווים followed by number+optional letter
    /\b(\d{1,3}[א-ת]?'?)(?=\s|$|[,.])/g,  // Standalone numbers with optional Hebrew letter
    /\b(\d+)-([א-ת])/g,  // Number-letter format (e.g., "18-א")
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      if (pattern === patterns[2]) {
        // Handle number-letter format
        lines.add(`${match[1]}${match[2]}`);
      } else {
        let line = match[1];
        // Normalize the line format
        line = line.replace(/['-]/g, '').replace(/׳/g, '');
        // Filter out unlikely line numbers (too large or dates)
        if (parseInt(line) <= 999 || /[א-ת]/.test(line)) {
          lines.add(line);
        }
      }
    }
  });
  
  // Handle special cases like "קווים 34 ו-34א"
  const multiLinePattern = /קווים\s+(\d+[א-ת]?)\s+ו-?(\d+[א-ת]?)/g;
  let multiMatch;
  while ((multiMatch = multiLinePattern.exec(normalizedText)) !== null) {
    lines.add(multiMatch[1]);
    lines.add(multiMatch[2]);
  }
  
  return Array.from(lines).sort((a, b) => {
    // Sort numerically first, then alphabetically for suffixes
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  });
}

/**
 * Clean boilerplate and potential PII from text
 * @param {string} text - Input text
 * @returns {string} Cleaned text
 */
function cleanBoilerplate(text) {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove email patterns
  cleaned = cleaned.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[email]');
  
  // Remove phone numbers (Israeli format)
  cleaned = cleaned.replace(/\b0\d{1,2}-?\d{7,8}\b/g, '[phone]');
  cleaned = cleaned.replace(/\b05\d{1}-?\d{7}\b/g, '[mobile]');
  
  // Remove ID numbers (9 digits)
  cleaned = cleaned.replace(/\b\d{9}\b/g, '[id]');
  
  // Remove common boilerplate phrases
  const boilerplatePhrases = [
    /שלום וברכה[,.]?/g,
    /בברכה[,.]?/g,
    /תודה רבה[,.]?/g,
    /בכבוד רב[,.]?/g,
  ];
  
  boilerplatePhrases.forEach(phrase => {
    cleaned = cleaned.replace(phrase, '');
  });
  
  return cleaned.trim();
}

/**
 * Extract n-grams from text for exact phrase matching
 * @param {string} text - Input text
 * @param {number} minN - Minimum n-gram size (default 3)
 * @param {number} maxN - Maximum n-gram size (default 6)
 * @returns {string[]} Array of n-grams
 */
function extractNGrams(text, minN = 3, maxN = 6) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const ngrams = [];
  
  for (let n = minN; n <= maxN && n <= words.length; n++) {
    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n).join(' ');
      // Filter out n-grams that are mostly stopwords or too short
      if (ngram.length > n * 2) { // Average word length check
        ngrams.push(ngram);
      }
    }
  }
  
  return ngrams;
}

/**
 * Normalize a query for consistent comparison
 * @param {string} query - Input query
 * @returns {object} Normalized query with extracted entities
 */
function normalizeQuery(query) {
  const normalized = normalizeHebrew(query);
  const cleaned = cleanBoilerplate(normalized);
  const busLines = extractBusLines(query); // Use original for better line extraction
  const ngrams = extractNGrams(cleaned);
  
  return {
    original: query,
    normalized: normalized,
    cleaned: cleaned,
    busLines: busLines,
    ngrams: ngrams
  };
}

/**
 * Build document text from row data for indexing
 * @param {object} row - Row data from spreadsheet
 * @returns {string} Formatted document text
 */
function buildDocumentText(row) {
  const parts = [];
  
  // Add topic if exists
  if (row['נושא']) {
    parts.push(`[${row['נושא']}]`);
  }
  
  // Add extracted bus lines
  const allText = `${row['הפניה'] || ''} ${row['תמצית'] || ''} ${row['תיאור'] || ''}`;
  const busLines = extractBusLines(allText);
  if (busLines.length > 0) {
    parts.push(`קווים: ${busLines.join(', ')}`);
  }
  
  // Add summary
  if (row['תמצית']) {
    parts.push(`תמצית: ${row['תמצית']}`);
  }
  
  // Add inquiry text
  if (row['הפניה']) {
    parts.push(`הפניה: ${row['הפניה']}`);
  }
  
  // Add description if different from inquiry
  if (row['תיאור'] && row['תיאור'] !== row['הפניה']) {
    parts.push(`תיאור: ${row['תיאור']}`);
  }
  
  return parts.join(' · ');
}

module.exports = {
  normalizeHebrew,
  extractBusLines,
  cleanBoilerplate,
  extractNGrams,
  normalizeQuery,
  buildDocumentText
};