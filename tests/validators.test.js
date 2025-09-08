import { jest } from '@jest/globals';
import { 
  validateSheetId, 
  validateOpenAIKey,
  testGoogleSheetsConnection,
  testOpenAIConnection
} from '../utils/validators.js';

describe('Validators', () => {
  describe('validateSheetId', () => {
    it('should validate correct sheet ID', () => {
      const result = validateSheetId('1m59UUY2ZvDg4xQjRbReF-npJy_k63wxd2pUt8HBIOn8');
      expect(result.valid).toBe(true);
    });

    it('should reject short sheet ID', () => {
      const result = validateSheetId('shortid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('40+ characters');
    });

    it('should reject sheet ID with special characters', () => {
      const result = validateSheetId('1m59UUY2ZvDg4xQjRbReF-npJy_k63wxd2pUt8HBI@n8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid Sheet ID format');
    });

    it('should reject empty sheet ID', () => {
      const result = validateSheetId('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Sheet ID is required');
    });

    it('should reject null/undefined', () => {
      expect(validateSheetId(null).valid).toBe(false);
      expect(validateSheetId(undefined).valid).toBe(false);
    });
  });

  describe('validateOpenAIKey', () => {
    it('should validate correct API key', () => {
      const result = validateOpenAIKey('sk-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstu');
      expect(result.valid).toBe(true);
    });

    it('should reject key without sk- prefix', () => {
      const result = validateOpenAIKey('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must start with "sk-"');
    });

    it('should reject key with wrong length', () => {
      const result = validateOpenAIKey('sk-tooshort');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('48 alphanumeric characters');
    });

    it('should reject empty API key', () => {
      const result = validateOpenAIKey('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('API key is required');
    });

    it('should reject key with special characters', () => {
      const result = validateOpenAIKey('sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ@bcdefghijklmnopqrst');
      expect(result.valid).toBe(false);
    });
  });

  describe('testGoogleSheetsConnection', () => {
    it('should return success for valid sheet', async () => {
      const mockSheets = {
        spreadsheets: {
          values: {
            get: jest.fn().mockResolvedValue({
              data: {
                values: [
                  ['Header1', 'Header2', 'Header3'],
                  ['Data1', 'Data2', 'Data3']
                ]
              }
            })
          }
        }
      };

      const result = await testGoogleSheetsConnection('test-sheet-id', mockSheets);
      expect(result.success).toBe(true);
      expect(result.rowCount).toBe(2);
      expect(result.columnCount).toBe(3);
    });

    it('should handle empty sheet', async () => {
      const mockSheets = {
        spreadsheets: {
          values: {
            get: jest.fn().mockResolvedValue({
              data: { values: [] }
            })
          }
        }
      };

      const result = await testGoogleSheetsConnection('test-sheet-id', mockSheets);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Sheet is empty or inaccessible');
    });

    it('should handle not found error', async () => {
      const mockSheets = {
        spreadsheets: {
          values: {
            get: jest.fn().mockRejectedValue(new Error('Requested entity was not found'))
          }
        }
      };

      const result = await testGoogleSheetsConnection('test-sheet-id', mockSheets);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Sheet ID not found or not accessible');
    });

    it('should handle permission error', async () => {
      const mockSheets = {
        spreadsheets: {
          values: {
            get: jest.fn().mockRejectedValue(new Error('The caller does not have permission'))
          }
        }
      };

      const result = await testGoogleSheetsConnection('test-sheet-id', mockSheets);
      expect(result.success).toBe(false);
      expect(result.error).toBe('No permission to access this sheet');
    });
  });

  describe('testOpenAIConnection', () => {
    it('should return success for valid API key', async () => {
      // Mock the OpenAI module
      jest.unstable_mockModule('openai', () => ({
        default: class MockOpenAI {
          constructor({ apiKey }) {
            this.apiKey = apiKey;
          }
          embeddings = {
            create: jest.fn().mockResolvedValue({
              data: [{ embedding: [0.1, 0.2, 0.3] }]
            })
          };
        }
      }));

      const { testOpenAIConnection } = await import('../utils/validators.js');
      const result = await testOpenAIConnection('sk-validkeywith48charactersAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(result.success).toBe(true);
    });

    it('should handle invalid API key error', async () => {
      jest.unstable_mockModule('openai', () => ({
        default: class MockOpenAI {
          constructor({ apiKey }) {
            this.apiKey = apiKey;
          }
          embeddings = {
            create: jest.fn().mockRejectedValue(new Error('Incorrect API key provided'))
          };
        }
      }));

      const { testOpenAIConnection } = await import('../utils/validators.js');
      const result = await testOpenAIConnection('sk-invalidkey');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('should handle quota exceeded error', async () => {
      jest.unstable_mockModule('openai', () => ({
        default: class MockOpenAI {
          constructor({ apiKey }) {
            this.apiKey = apiKey;
          }
          embeddings = {
            create: jest.fn().mockRejectedValue(new Error('You exceeded your current quota'))
          };
        }
      }));

      const { testOpenAIConnection } = await import('../utils/validators.js');
      const result = await testOpenAIConnection('sk-validkey');
      expect(result.success).toBe(false);
      expect(result.error).toBe('API quota exceeded');
    });
  });
});