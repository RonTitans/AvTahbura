/**
 * Response Cleaner Module
 * Removes internal communications and extracts clean public responses
 */

/**
 * Clean a response text by removing internal communications
 * @param {string} text - Raw response text
 * @returns {string} Cleaned response suitable for public
 */
export function cleanResponse(text) {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove staff greetings and signatures
  const staffPatterns = [
    /^אורי שלום[,.]?.*$/gm,
    /^שלום אורי[,.]?.*$/gm,
    /^היי ראובן.*$/gm,
    /^ראובן שלום[,.]?.*$/gm,
    /^אריאלה שלום[,.]?.*$/gm,
    /^יונתן שלום[,.]?.*$/gm,
    /^אייל שלום[,.]?.*$/gm,
    /^שלמה שלום[,.]?.*$/gm,
    /^שלום רב[,.]?$/gm,
    /^הי [א-ת]+[,.]?$/gm, // Generic "Hi [name]"
  ];
  
  staffPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Remove internal status updates
  const statusPatterns = [
    /^.*בטיפול שלך.*$/gm,
    /^.*העברתי במייל.*$/gm,
    /^.*צריך את החלטתכם.*$/gm,
    /^.*מענה מאושר ע"י.*$/gm,
    /^.*בדומה לפניה אחרת.*$/gm,
    /^.*מוצעת התשובה הבאה:?$/gm,
    /^.*ניתן להשתמש במענה.*$/gm,
    /^.*אנא אשרו.*$/gm,
    /^.*לאישורך.*$/gm,
    /^\(?\d+\)?$/gm, // Reference numbers like (560493)
  ];
  
  statusPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Extract content after "מוצעת התשובה הבאה:" if present
  const suggestedAnswerMatch = text.match(/מוצעת התשובה הבאה:?\s*([\s\S]*)/);
  if (suggestedAnswerMatch) {
    cleaned = suggestedAnswerMatch[1];
  }
  
  // Extract content after "מענה מאושר" if present
  const approvedAnswerMatch = text.match(/מענה מאושר.*?:\s*([\s\S]*)/);
  if (approvedAnswerMatch) {
    cleaned = approvedAnswerMatch[1];
  }
  
  // Clean up extra whitespace and empty lines
  cleaned = cleaned
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
  
  // Ensure response starts properly (remove any remaining artifacts)
  cleaned = cleaned.replace(/^[:\-,.\s]+/, '');
  
  return cleaned;
}

/**
 * Detect if text contains internal communication patterns
 * @param {string} text - Text to analyze
 * @returns {Object} Detection results
 */
export function detectInternalContent(text) {
  if (!text) return { isInternal: false, score: 0, reasons: [] };
  
  const reasons = [];
  let score = 0;
  
  // Check for staff names
  const staffNames = ['אורי', 'ראובן', 'אריאלה', 'יונתן', 'אייל', 'שלמה', 'משה', 'דוד'];
  const textStart = text.substring(0, 100);
  
  staffNames.forEach(name => {
    if (textStart.includes(name + ' שלום') || textStart.includes('שלום ' + name)) {
      score += 0.3;
      reasons.push(`Staff greeting: ${name}`);
    }
  });
  
  // Check for internal phrases
  const internalPhrases = [
    { phrase: 'בטיפול שלך', weight: 0.4 },
    { phrase: 'העברתי במייל', weight: 0.4 },
    { phrase: 'לאישורך', weight: 0.3 },
    { phrase: 'מוצעת התשובה', weight: 0.2 },
    { phrase: 'בדומה לפניה', weight: 0.2 },
    { phrase: 'צריך את החלטתכם', weight: 0.4 },
    { phrase: 'מענה מאושר', weight: 0.1 }, // Low weight as it might indicate final answer
  ];
  
  internalPhrases.forEach(({ phrase, weight }) => {
    if (text.includes(phrase)) {
      score += weight;
      reasons.push(`Internal phrase: ${phrase}`);
    }
  });
  
  // Check for reference numbers
  if (/\(\d{6,}\)/.test(text)) {
    score += 0.1;
    reasons.push('Contains reference numbers');
  }
  
  return {
    isInternal: score > 0.5,
    score: Math.min(score, 1.0),
    reasons
  };
}

/**
 * Split and clean inquiry-response pairs
 * @param {Object} row - Data row with inquiry and response
 * @param {Object} columnMapping - Column name mapping
 * @returns {Object} Cleaned and structured data
 */
export function cleanInquiryResponsePair(row, columnMapping = {}) {
  const cols = {
    inquiryId: columnMapping.inquiryId || 'מזהה פניה',
    inquiry: columnMapping.inquiry || 'הפניה',
    response: columnMapping.response || 'תיאור',
    topic: columnMapping.topic || 'נושא',
    summary: columnMapping.summary || 'תמצית',
    date: columnMapping.date || 'נוצר ב:',
    createdBy: columnMapping.createdBy || 'נוצר על-ידי'
  };
  
  const inquiryText = row[cols.inquiry] || '';
  const responseText = row[cols.response] || '';
  
  // Clean the response
  const cleanedResponse = cleanResponse(responseText);
  
  // Detect if response is internal
  const internalDetection = detectInternalContent(responseText);
  
  // Clean the inquiry (remove any template text)
  const cleanedInquiry = inquiryText
    .replace(/^[^:]+:\s*/, '') // Remove field labels
    .replace(/הערות הפונה\s*/, '') // Remove "user comments" label
    .trim();
  
  return {
    inquiry_id: row[cols.inquiryId],
    inquiry_text: cleanedInquiry,
    response_text: cleanedResponse,
    original_response: responseText,
    topic: row[cols.topic],
    summary: row[cols.summary],
    date: row[cols.date],
    created_by: row[cols.createdBy],
    quality: {
      is_internal: internalDetection.isInternal,
      internal_score: internalDetection.score,
      internal_reasons: internalDetection.reasons,
      response_length: cleanedResponse.length,
      is_empty: cleanedResponse.length < 20
    }
  };
}

/**
 * Batch clean multiple rows
 * @param {Array} rows - Array of data rows
 * @param {Object} columnMapping - Column name mapping
 * @returns {Array} Cleaned rows
 */
export function batchClean(rows, columnMapping) {
  console.log(`🧹 Cleaning ${rows.length} rows...`);
  
  const cleaned = rows.map(row => cleanInquiryResponsePair(row, columnMapping));
  
  // Statistics
  const stats = {
    total: cleaned.length,
    internal: cleaned.filter(r => r.quality.is_internal).length,
    empty: cleaned.filter(r => r.quality.is_empty).length,
    clean: cleaned.filter(r => !r.quality.is_internal && !r.quality.is_empty).length
  };
  
  console.log(`✅ Cleaning complete:`);
  console.log(`   Total: ${stats.total}`);
  console.log(`   Clean: ${stats.clean} (${((stats.clean/stats.total)*100).toFixed(1)}%)`);
  console.log(`   Internal: ${stats.internal} (${((stats.internal/stats.total)*100).toFixed(1)}%)`);
  console.log(`   Empty: ${stats.empty} (${((stats.empty/stats.total)*100).toFixed(1)}%)`);
  
  return cleaned;
}