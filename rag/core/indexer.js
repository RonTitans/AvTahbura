/**
 * Index Pack Builder for RAG System
 * Creates searchable index with embeddings and inverted indices
 * Updated to handle deduplicated inquiry-response pairs
 */

import { normalizeHebrew, buildDocumentText, extractBusLines } from './normalizer.js';
import { analyzeQuery, extractLocations, extractOperators, classifyTopic, scoreContentQuality } from './analyzer.js';
import { deduplicateByLatestDate } from '../preprocessing/deduplicate.js';
import { cleanInquiryResponsePair } from '../preprocessing/cleaner.js';
import crypto from 'crypto';

/**
 * Generate hash for content comparison (delta updates)
 * @param {object} row - Row data
 * @returns {string} Content hash
 */
export function generateRowHash(row) {
  const content = JSON.stringify({
    inquiryId: row['מזהה פניה'] || row.inquiry_id || '',
    inquiry: row['הפניה'] || row.inquiry_text || '',
    response: row['תיאור'] || row.response_text || '',
    topic: row['נושא'] || row.topic || ''
  });
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Build inverted indices for fast lookup
 * @param {array} documents - Array of processed documents
 * @returns {object} Inverted indices
 */
export function buildInvertedIndices(documents) {
  const indices = {
    busLines: {},      // line -> [docIds]
    locations: {},     // location -> [docIds]
    operators: {},     // operator -> [docIds]
    topics: {},        // topic -> [docIds]
    caseIds: {},       // caseId -> docId
    rowNumbers: {}     // rowNumber -> docId
  };
  
  documents.forEach((doc, docId) => {
    // Index bus lines
    doc.entities.busLines.forEach(line => {
      if (!indices.busLines[line]) {
        indices.busLines[line] = [];
      }
      indices.busLines[line].push(docId);
    });
    
    // Index locations
    doc.entities.locations.forEach(location => {
      const normalized = normalizeHebrew(location);
      if (!indices.locations[normalized]) {
        indices.locations[normalized] = [];
      }
      indices.locations[normalized].push(docId);
    });
    
    // Index operators
    doc.entities.operators.forEach(operator => {
      const normalized = normalizeHebrew(operator);
      if (!indices.operators[normalized]) {
        indices.operators[normalized] = [];
      }
      indices.operators[normalized].push(docId);
    });
    
    // Index topic
    if (doc.entities.topic) {
      if (!indices.topics[doc.entities.topic]) {
        indices.topics[doc.entities.topic] = [];
      }
      indices.topics[doc.entities.topic].push(docId);
    }
    
    // Index case ID
    if (doc.caseId) {
      indices.caseIds[doc.caseId] = docId;
    }
    
    // Index row number
    if (doc.rowNumber) {
      indices.rowNumbers[doc.rowNumber] = docId;
    }
  });
  
  // Sort and deduplicate indices
  Object.keys(indices).forEach(indexType => {
    if (indexType !== 'caseIds' && indexType !== 'rowNumbers') {
      Object.keys(indices[indexType]).forEach(key => {
        indices[indexType][key] = [...new Set(indices[indexType][key])].sort((a, b) => a - b);
      });
    }
  });
  
  return indices;
}

/**
 * Calculate TF-IDF weights for documents
 * @param {array} documents - Array of processed documents
 * @returns {object} TF-IDF weights
 */
export function calculateTFIDF(documents) {
  const docCount = documents.length;
  const termDocFreq = {}; // term -> number of docs containing it
  const tfIdf = [];
  
  // Calculate document frequency for each term
  documents.forEach(doc => {
    const terms = new Set(doc.tokens);
    terms.forEach(term => {
      termDocFreq[term] = (termDocFreq[term] || 0) + 1;
    });
  });
  
  // Calculate TF-IDF for each document
  documents.forEach(doc => {
    const termFreq = {};
    const docLength = doc.tokens.length;
    
    // Calculate term frequency
    doc.tokens.forEach(term => {
      termFreq[term] = (termFreq[term] || 0) + 1;
    });
    
    // Calculate TF-IDF
    const weights = {};
    Object.keys(termFreq).forEach(term => {
      const tf = termFreq[term] / docLength;
      const idf = Math.log(docCount / (termDocFreq[term] || 1));
      weights[term] = tf * idf;
    });
    
    tfIdf.push(weights);
  });
  
  return { tfIdf, termDocFreq };
}

/**
 * Process raw data into searchable documents
 * @param {array} rawData - Raw data from spreadsheet
 * @param {object} previousHashes - Previous document hashes for delta updates
 * @param {object} options - Processing options
 * @returns {object} Processed documents and metadata
 */
export async function processDocuments(rawData, previousHashes = {}, options = {}) {
  const { deduplicate = true, cleanResponses = true } = options;
  const documents = [];
  const hashes = {};
  const changedRows = [];
  
  // Step 1: Deduplicate if enabled
  let dataToProcess = rawData;
  if (deduplicate) {
    console.log(`🔄 Deduplicating ${rawData.length} rows...`);
    dataToProcess = deduplicateByLatestDate(rawData);
  }
  
  console.log(`📄 Processing ${dataToProcess.length} unique inquiries...`);
  
  dataToProcess.forEach((row, index) => {
    // Generate hash for delta detection
    const hash = generateRowHash(row);
    const caseId = row['מזהה פניה'] || row['case_id'] || `ROW_${index + 2}`;
    hashes[caseId] = hash;
    
    // Check if row has changed
    const hasChanged = !previousHashes[caseId] || previousHashes[caseId] !== hash;
    if (hasChanged) {
      changedRows.push(caseId);
    }
    
    // Clean inquiry-response pair if enabled
    let processedRow = row;
    if (cleanResponses) {
      processedRow = cleanInquiryResponsePair(row);
    }
    
    // Build document text (prioritize inquiry for matching)
    const inquiryText = processedRow.inquiry_text || row['הפניה'] || '';
    const responseText = processedRow.response_text || row['תיאור'] || '';
    const docText = `${inquiryText} ${row['תמצית'] || ''}`; // Focus on inquiry for matching
    const normalizedText = normalizeHebrew(docText);
    
    // Extract entities FROM INQUIRY (not response)
    const busLines = extractBusLines(inquiryText);
    const locations = extractLocations(inquiryText);
    const operators = extractOperators(inquiryText);
    const topic = classifyTopic(inquiryText);
    
    // Tokenize for TF-IDF
    const tokens = normalizedText.split(/\s+/).filter(t => t.length > 1);
    
    // IMPORTANT: Use the actual row_number from the data if available
    // This ensures consistency with how municipalData stores row numbers
    const actualRowNumber = row.row_number !== undefined ? row.row_number : (index + 2);
    
    // Create base document for quality scoring
    const baseDoc = {
      inquiry: row['הפניה'] || '',
      summary: row['תמצית'] || '',
      response: row['תיאור'] || '',
      topic: row['נושא'] || ''
    };
    
    // Score content quality
    const qualityAssessment = scoreContentQuality(baseDoc);
    
    // Create document object
    const doc = {
      id: index,
      caseId: caseId,
      rowNumber: actualRowNumber, // Use actual row number from data
      hash: hash,
      
      // Separate inquiry and response fields
      inquiry: processedRow.inquiry_text || row['הפניה'] || '',
      response: processedRow.response_text || row['תיאור'] || '',
      originalResponse: processedRow.original_response || row['תיאור'] || '',
      summary: row['תמצית'] || '',
      topic: row['נושא'] || '',
      
      // Processed text
      text: docText,
      normalizedText: normalizedText,
      tokens: tokens,
      
      // Extracted entities
      entities: {
        busLines: busLines,
        locations: locations,
        operators: operators,
        topic: topic
      },
      
      // Quality assessment
      quality: {
        score: qualityAssessment.score,
        classification: qualityAssessment.classification,
        isPublicResponse: qualityAssessment.classification === 'public_response',
        hasCompleteResponse: qualityAssessment.indicators.hasCompleteResponse
      },
      
      // Metadata
      createdAt: row['נוצר ב:'] || row['created_at'] || null,
      createdBy: row['נוצר על-ידי'] || row['created_by'] || null,
      
      // Flags
      needsEmbedding: hasChanged // Only generate embeddings for changed rows
    };
    
    documents.push(doc);
  });
  
  console.log(`✅ Processed ${documents.length} documents (${changedRows.length} changed)`);
  
  return {
    documents: documents,
    hashes: hashes,
    changedRows: changedRows,
    stats: {
      total: documents.length,
      changed: changedRows.length,
      withBusLines: documents.filter(d => d.entities.busLines.length > 0).length,
      withLocations: documents.filter(d => d.entities.locations.length > 0).length,
      withOperators: documents.filter(d => d.entities.operators.length > 0).length,
      qualityBreakdown: {
        publicResponses: documents.filter(d => d.quality.classification === 'public_response').length,
        mixedContent: documents.filter(d => d.quality.classification === 'mixed_content').length,
        internalComms: documents.filter(d => d.quality.classification === 'internal_communication').length,
        avgQualityScore: documents.reduce((sum, d) => sum + d.quality.score, 0) / documents.length
      }
    }
  };
}

/**
 * Generate embeddings for documents (with delta optimization)
 * IMPORTANT: Embed inquiries, not responses, for better matching
 * @param {array} documents - Array of documents
 * @param {object} openai - OpenAI client
 * @param {object} existingEmbeddings - Existing embeddings to reuse
 * @returns {array} Array of embeddings
 */
export async function generateEmbeddings(documents, openai, existingEmbeddings = {}) {
  const embeddings = [];
  const model = process.env.EMBED_MODEL || 'text-embedding-3-small';
  const batchSize = 20;
  
  // Identify documents needing embeddings
  const toEmbed = documents.filter(doc => doc.needsEmbedding);
  
  if (toEmbed.length === 0) {
    console.log('✅ No documents need new embeddings, reusing existing');
    // Return existing embeddings in correct order
    documents.forEach(doc => {
      embeddings.push(existingEmbeddings[doc.caseId] || null);
    });
    return embeddings;
  }
  
  console.log(`🧠 Generating embeddings for ${toEmbed.length} documents...`);
  
  // Process in batches
  for (let i = 0; i < toEmbed.length; i += batchSize) {
    const batch = toEmbed.slice(i, i + batchSize);
    // IMPORTANT: Embed inquiries for better query matching
    const texts = batch.map(doc => normalizeHebrew(doc.inquiry || doc.normalizedText));
    
    try {
      const response = await openai.embeddings.create({
        model: model,
        input: texts
      });
      
      // Store embeddings by case ID
      batch.forEach((doc, idx) => {
        existingEmbeddings[doc.caseId] = response.data[idx].embedding;
      });
      
      console.log(`✅ Embedded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(toEmbed.length / batchSize)}`);
    } catch (error) {
      console.error(`❌ Error generating embeddings for batch:`, error.message);
      // Fill with null for failed embeddings
      batch.forEach(doc => {
        existingEmbeddings[doc.caseId] = null;
      });
    }
  }
  
  // Return embeddings in document order
  documents.forEach(doc => {
    embeddings.push(existingEmbeddings[doc.caseId] || null);
  });
  
  const successCount = embeddings.filter(e => e !== null).length;
  console.log(`✅ Generated ${successCount}/${documents.length} embeddings`);
  
  return embeddings;
}

/**
 * Build complete Index Pack
 * @param {array} rawData - Raw data from source
 * @param {object} openai - OpenAI client (optional for embeddings)
 * @param {object} previousPack - Previous index pack for delta updates
 * @returns {object} Complete index pack
 */
export async function buildIndexPack(rawData, openai = null, previousPack = null, options = {}) {
  const startTime = Date.now();
  const { deduplicate = true, cleanResponses = true, skipEmbeddings = false } = options;
  
  // Process documents with deduplication and cleaning
  const previousHashes = previousPack?.hashes || {};
  const { documents, hashes, changedRows, stats } = await processDocuments(
    rawData, 
    previousHashes,
    { deduplicate, cleanResponses }
  );
  
  // Build inverted indices
  const indices = buildInvertedIndices(documents);
  
  // Calculate TF-IDF weights
  const { tfIdf, termDocFreq } = calculateTFIDF(documents);
  
  // Generate embeddings if OpenAI is available
  let vectors = null;
  if (openai) {
    const existingEmbeddings = previousPack?.embeddingsByCase || {};
    vectors = await generateEmbeddings(documents, openai, existingEmbeddings);
  }
  
  // Build the index pack
  const indexPack = {
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    rowCount: documents.length,
    embeddingModel: process.env.EMBED_MODEL || 'text-embedding-3-small',
    embeddingDimensions: 1536,
    
    // Documents (without embeddings to save space)
    documents: documents.map(doc => ({
      ...doc,
      needsEmbedding: undefined // Remove flag
    })),
    
    // Vectors as separate array
    vectors: vectors,
    
    // Inverted indices for fast lookup
    indices: indices,
    
    // TF-IDF weights
    tfIdf: tfIdf,
    termDocFreq: termDocFreq,
    
    // Hashes for delta detection
    hashes: hashes,
    
    // Embeddings by case ID for reuse
    embeddingsByCase: vectors ? documents.reduce((acc, doc, idx) => {
      if (vectors[idx]) {
        acc[doc.caseId] = vectors[idx];
      }
      return acc;
    }, {}) : {},
    
    // Statistics
    stats: {
      ...stats,
      buildTime: Date.now() - startTime,
      changedRows: changedRows.length,
      indexSizes: {
        busLines: Object.keys(indices.busLines).length,
        locations: Object.keys(indices.locations).length,
        operators: Object.keys(indices.operators).length,
        topics: Object.keys(indices.topics).length
      }
    }
  };
  
  console.log(`✅ Index Pack built in ${indexPack.stats.buildTime}ms`);
  console.log(`📊 Stats:`, indexPack.stats);
  
  return indexPack;
}

// Default export for convenience
export default {
  generateRowHash,
  buildInvertedIndices,
  calculateTFIDF,
  processDocuments,
  generateEmbeddings,
  buildIndexPack
};