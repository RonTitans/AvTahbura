// Validation utilities for integrations

// Validate Google Sheets ID
export function validateSheetId(sheetId) {
  if (!sheetId || typeof sheetId !== 'string') {
    return { valid: false, error: 'Sheet ID is required' };
  }
  
  // Google Sheets ID pattern: 40+ alphanumeric characters, underscores, or hyphens
  const pattern = /^[a-zA-Z0-9_-]{40,}$/;
  
  if (!pattern.test(sheetId)) {
    return { 
      valid: false, 
      error: 'Invalid Sheet ID format. Must be 40+ characters containing only letters, numbers, underscores, or hyphens' 
    };
  }
  
  return { valid: true };
}

// Validate OpenAI API Key
export function validateOpenAIKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return { valid: false, error: 'API key is required' };
  }
  
  // OpenAI key pattern: starts with 'sk-' followed by 48 alphanumeric characters
  const pattern = /^sk-[a-zA-Z0-9]{48}$/;
  
  if (!pattern.test(apiKey)) {
    return { 
      valid: false, 
      error: 'Invalid API key format. Must start with "sk-" followed by 48 alphanumeric characters' 
    };
  }
  
  return { valid: true };
}

// Test Google Sheets connection
export async function testGoogleSheetsConnection(sheetId, sheets) {
  try {
    // Try to read first 10 rows
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A1:Z10' // Read first 10 rows across all columns
    });
    
    const rows = response.data.values;
    
    if (!rows || rows.length === 0) {
      return { 
        success: false, 
        error: 'Sheet is empty or inaccessible' 
      };
    }
    
    return { 
      success: true, 
      rowCount: rows.length,
      columnCount: rows[0]?.length || 0
    };
  } catch (error) {
    console.error('Google Sheets test failed:', error);
    
    let errorMessage = 'Failed to connect to Google Sheets';
    if (error.message?.includes('not found')) {
      errorMessage = 'Sheet ID not found or not accessible';
    } else if (error.message?.includes('permission')) {
      errorMessage = 'No permission to access this sheet';
    }
    
    return { 
      success: false, 
      error: errorMessage 
    };
  }
}

// Test OpenAI connection
export async function testOpenAIConnection(apiKey, openai) {
  try {
    // Create temporary OpenAI instance with the new key
    const OpenAI = (await import('openai')).default;
    const testClient = new OpenAI({ apiKey });
    
    // Try to generate a simple embedding as a ping test
    const response = await testClient.embeddings.create({
      model: 'text-embedding-ada-002',
      input: 'test connection'
    });
    
    if (response.data && response.data.length > 0) {
      return { success: true };
    }
    
    return { 
      success: false, 
      error: 'Unexpected response from OpenAI' 
    };
  } catch (error) {
    console.error('OpenAI test failed:', error);
    
    let errorMessage = 'Failed to connect to OpenAI';
    if (error.message?.includes('Incorrect API key')) {
      errorMessage = 'Invalid API key';
    } else if (error.message?.includes('quota')) {
      errorMessage = 'API quota exceeded';
    } else if (error.message?.includes('rate')) {
      errorMessage = 'Rate limit exceeded';
    }
    
    return { 
      success: false, 
      error: errorMessage 
    };
  }
}