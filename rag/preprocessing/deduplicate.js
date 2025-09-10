/**
 * Data Deduplication Module
 * Keeps only the latest response per inquiry ID
 * Removes internal chat history and draft responses
 */

/**
 * Deduplicate rows by keeping only the latest entry per inquiry ID
 * @param {Array} rows - Raw data rows from spreadsheet
 * @param {Object} columnMapping - Maps standard names to actual column names
 * @returns {Array} Deduplicated rows with only final responses
 */
export function deduplicateByLatestDate(rows, columnMapping = {}) {
  // Default column names (can be overridden)
  const cols = {
    inquiryId: columnMapping.inquiryId || 'מזהה פניה',
    date: columnMapping.date || 'נוצר ב:',
    inquiry: columnMapping.inquiry || 'הפניה',
    response: columnMapping.response || 'תיאור',
    topic: columnMapping.topic || 'נושא',
    summary: columnMapping.summary || 'תמצית',
    createdBy: columnMapping.createdBy || 'נוצר על-ידי'
  };

  // Group rows by inquiry ID
  const grouped = {};
  let duplicatesFound = 0;
  
  rows.forEach((row, index) => {
    const id = row[cols.inquiryId];
    
    if (!id) {
      console.warn(`Row ${index} has no inquiry ID, skipping`);
      return;
    }
    
    if (!grouped[id]) {
      grouped[id] = [];
    }
    
    grouped[id].push({
      ...row,
      _originalIndex: index,
      _dateValue: row[cols.date]
    });
  });

  // Keep only the latest entry for each ID
  const deduplicated = [];
  
  Object.entries(grouped).forEach(([id, entries]) => {
    if (entries.length > 1) {
      duplicatesFound += entries.length - 1;
      
      // Sort by date (newest first)
      entries.sort((a, b) => {
        const dateA = a._dateValue || 0;
        const dateB = b._dateValue || 0;
        return dateB - dateA;
      });
    }
    
    // Take the latest entry
    const latest = entries[0];
    delete latest._originalIndex;
    delete latest._dateValue;
    
    deduplicated.push(latest);
  });

  console.log(`📊 Deduplication Results:`);
  console.log(`   Original rows: ${rows.length}`);
  console.log(`   Unique inquiries: ${deduplicated.length}`);
  console.log(`   Duplicates removed: ${duplicatesFound}`);
  console.log(`   Reduction: ${((duplicatesFound / rows.length) * 100).toFixed(1)}%`);

  return deduplicated;
}

/**
 * Analyze duplicate patterns in the data
 * @param {Array} rows - Raw data rows
 * @param {string} idColumn - Name of the ID column
 * @returns {Object} Analysis results
 */
export function analyzeDuplicates(rows, idColumn = 'מזהה פניה') {
  const grouped = {};
  
  rows.forEach(row => {
    const id = row[idColumn];
    if (!id) return;
    
    if (!grouped[id]) {
      grouped[id] = [];
    }
    grouped[id].push(row);
  });

  // Calculate statistics
  const stats = {
    totalRows: rows.length,
    uniqueIds: Object.keys(grouped).length,
    distribution: {}
  };

  // Count distribution (how many IDs have 1, 2, 3... rows)
  Object.values(grouped).forEach(entries => {
    const count = entries.length;
    stats.distribution[count] = (stats.distribution[count] || 0) + 1;
  });

  // Find examples of heavily duplicated entries
  const heavyDuplicates = Object.entries(grouped)
    .filter(([id, entries]) => entries.length > 3)
    .slice(0, 5)
    .map(([id, entries]) => ({
      id,
      count: entries.length,
      dates: entries.map(e => e['נוצר ב:'] || 'no date').sort()
    }));

  stats.heavyDuplicates = heavyDuplicates;

  return stats;
}

/**
 * Validate deduplication results
 * @param {Array} original - Original rows
 * @param {Array} deduplicated - Deduplicated rows
 * @returns {Object} Validation results
 */
export function validateDeduplication(original, deduplicated, idColumn = 'מזהה פניה') {
  const originalIds = new Set(original.map(r => r[idColumn]).filter(Boolean));
  const deduplicatedIds = new Set(deduplicated.map(r => r[idColumn]).filter(Boolean));
  
  const validation = {
    success: true,
    issues: []
  };

  // Check if all unique IDs are preserved
  const missingIds = [...originalIds].filter(id => !deduplicatedIds.has(id));
  if (missingIds.length > 0) {
    validation.success = false;
    validation.issues.push(`Missing ${missingIds.length} IDs after deduplication`);
    validation.missingIds = missingIds.slice(0, 10);
  }

  // Check for any duplicate IDs in the result
  const idCounts = {};
  deduplicated.forEach(row => {
    const id = row[idColumn];
    idCounts[id] = (idCounts[id] || 0) + 1;
  });
  
  const stillDuplicated = Object.entries(idCounts)
    .filter(([id, count]) => count > 1)
    .map(([id, count]) => ({ id, count }));
    
  if (stillDuplicated.length > 0) {
    validation.success = false;
    validation.issues.push(`Found ${stillDuplicated.length} IDs still duplicated`);
    validation.stillDuplicated = stillDuplicated;
  }

  return validation;
}