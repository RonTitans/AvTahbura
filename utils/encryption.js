import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

// Get config file path
const CONFIG_FILE = path.join(__dirname, '..', 'integrations.yaml');

// Derive key from password
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

// Encrypt data
export function encrypt(text, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return Buffer.concat([salt, iv, authTag, Buffer.from(encrypted, 'hex')]).toString('base64');
}

// Decrypt data
export function decrypt(encryptedData, password) {
  const buffer = Buffer.from(encryptedData, 'base64');
  
  const salt = buffer.slice(0, SALT_LENGTH);
  const iv = buffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = buffer.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  
  const key = deriveKey(password, salt);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, null, 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// Save encrypted config
export function saveConfig(config) {
  const secret = process.env.CONFIG_SECRET;
  if (!secret) {
    throw new Error('CONFIG_SECRET not set in environment');
  }
  
  const yamlStr = yaml.dump(config);
  const encrypted = encrypt(yamlStr, secret);
  
  fs.writeFileSync(CONFIG_FILE, encrypted, 'utf8');
}

// Load encrypted config
export function loadConfig() {
  const secret = process.env.CONFIG_SECRET;
  if (!secret) {
    throw new Error('CONFIG_SECRET not set in environment');
  }
  
  if (!fs.existsSync(CONFIG_FILE)) {
    return { googleSheets: {}, openai: {} };
  }
  
  try {
    const encrypted = fs.readFileSync(CONFIG_FILE, 'utf8');
    const decrypted = decrypt(encrypted, secret);
    return yaml.load(decrypted) || { googleSheets: {}, openai: {} };
  } catch (error) {
    console.error('Error loading config:', error);
    return { googleSheets: {}, openai: {} };
  }
}

// Mask sensitive values
export function maskValue(value, showLast = 4) {
  if (!value || value.length <= showLast) return value;
  
  const visiblePart = value.slice(-showLast);
  const maskedLength = Math.max(value.length - showLast, 4);
  return '*'.repeat(maskedLength) + visiblePart;
}