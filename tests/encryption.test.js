import { jest } from '@jest/globals';
import fs from 'fs';
import { encrypt, decrypt, saveConfig, loadConfig, maskValue } from '../utils/encryption.js';

// Mock fs module
jest.mock('fs');

describe('Encryption Utils', () => {
  const testPassword = 'test-secret-key-123';
  const testData = 'This is sensitive data';

  beforeEach(() => {
    process.env.CONFIG_SECRET = testPassword;
    fs.existsSync.mockReturnValue(false);
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly', () => {
      const encrypted = encrypt(testData, testPassword);
      expect(encrypted).not.toBe(testData);
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 pattern
      
      const decrypted = decrypt(encrypted, testPassword);
      expect(decrypted).toBe(testData);
    });

    it('should produce different ciphertext each time', () => {
      const encrypted1 = encrypt(testData, testPassword);
      const encrypted2 = encrypt(testData, testPassword);
      
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to same value
      expect(decrypt(encrypted1, testPassword)).toBe(testData);
      expect(decrypt(encrypted2, testPassword)).toBe(testData);
    });

    it('should fail to decrypt with wrong password', () => {
      const encrypted = encrypt(testData, testPassword);
      
      expect(() => decrypt(encrypted, 'wrong-password')).toThrow();
    });

    it('should handle empty strings', () => {
      const encrypted = encrypt('', testPassword);
      const decrypted = decrypt(encrypted, testPassword);
      expect(decrypted).toBe('');
    });

    it('should handle unicode data', () => {
      const unicodeData = 'שלום 👋 Hello 世界';
      const encrypted = encrypt(unicodeData, testPassword);
      const decrypted = decrypt(encrypted, testPassword);
      expect(decrypted).toBe(unicodeData);
    });
  });

  describe('saveConfig/loadConfig', () => {
    it('should save config encrypted', () => {
      const config = {
        googleSheets: { spreadsheetId: 'test-id' },
        openai: { apiKey: 'sk-test' }
      };
      
      saveConfig(config);
      
      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedData = fs.writeFileSync.mock.calls[0][1];
      
      // Should be encrypted (base64)
      expect(savedData).toMatch(/^[A-Za-z0-9+/=]+$/);
      
      // Should not contain plain text
      expect(savedData).not.toContain('test-id');
      expect(savedData).not.toContain('sk-test');
    });

    it('should load config decrypted', () => {
      const config = {
        googleSheets: { spreadsheetId: 'test-id' },
        openai: { apiKey: 'sk-test' }
      };
      
      // Mock encrypted file content
      const encrypted = encrypt(JSON.stringify(config), testPassword);
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(encrypted);
      
      const loaded = loadConfig();
      
      expect(loaded).toEqual(config);
    });

    it('should return empty config if file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      
      const loaded = loadConfig();
      
      expect(loaded).toEqual({ googleSheets: {}, openai: {} });
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should return empty config on decryption error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid-encrypted-data');
      
      const loaded = loadConfig();
      
      expect(loaded).toEqual({ googleSheets: {}, openai: {} });
    });

    it('should throw if CONFIG_SECRET not set', () => {
      delete process.env.CONFIG_SECRET;
      
      expect(() => saveConfig({})).toThrow('CONFIG_SECRET not set');
      expect(() => loadConfig()).toThrow('CONFIG_SECRET not set');
    });
  });

  describe('maskValue', () => {
    it('should mask value showing last 4 characters', () => {
      const masked = maskValue('1234567890abcdef');
      expect(masked).toBe('************cdef');
    });

    it('should mask with custom visible length', () => {
      const masked = maskValue('1234567890abcdef', 6);
      expect(masked).toBe('**********abcdef');
    });

    it('should not mask short values', () => {
      expect(maskValue('abc')).toBe('abc');
      expect(maskValue('abcd')).toBe('abcd');
    });

    it('should handle empty values', () => {
      expect(maskValue('')).toBe('');
      expect(maskValue(null)).toBe(null);
      expect(maskValue(undefined)).toBe(undefined);
    });

    it('should ensure minimum masked length', () => {
      const masked = maskValue('12345', 4);
      expect(masked).toBe('****5');
    });
  });
});