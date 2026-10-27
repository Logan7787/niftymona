// ==============================================================================
// Server-Side Secure Credential Vault (AES-256-GCM)
// Strictly isolated on server. Never exposed to frontend or stored plaintext.
// ==============================================================================

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a reliable 32-byte encryption key from environment variable or secret.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.BROKER_ENCRYPTION_KEY;
  if (!envKey) {
    // In dev mode fallback to a consistent development key, with clear warning
    console.warn('[SECURITY WARNING] BROKER_ENCRYPTION_KEY not set in environment. Using fallback development key.');
    return crypto.scryptSync('development-local-vault-key-not-for-prod', 'vault-salt-nifty', 32);
  }

  // If 64-char hex string, convert to buffer
  if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }

  // Otherwise derive 32-byte key using scrypt
  return crypto.scryptSync(envKey, 'vault-salt-nifty', 32);
}

export interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

/**
 * Encrypts arbitrary sensitive credential objects using AES-256-GCM.
 */
export function encryptCredentials<T = any>(data: T): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    iv: iv.toString('hex'),
    tag: authTag.toString('hex'),
    ciphertext: encrypted
  };

  return JSON.stringify(payload);
}

/**
 * Decrypts encrypted payload on server side only.
 */
export function decryptCredentials<T = any>(encryptedString: string): T {
  try {
    const payload: EncryptedPayload = JSON.parse(encryptedString);
    if (!payload.iv || !payload.tag || !payload.ciphertext) {
      throw new Error('Malformed encrypted payload format.');
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(payload.iv, 'hex');
    const authTag = Buffer.from(payload.tag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted) as T;
  } catch (error: any) {
    throw new Error(`Failed to decrypt credentials: ${error.message}`);
  }
}

/**
 * Masks sensitive values for safe frontend display and logs.
 * Example: "AB123456" -> "AB****56"
 */
export function maskString(value: string | undefined | null, prefixLen = 2, suffixLen = 2): string {
  if (!value) return 'N/A';
  const str = String(value);
  if (str.length <= (prefixLen + suffixLen)) {
    return '****';
  }
  const prefix = str.slice(0, prefixLen);
  const suffix = str.slice(-suffixLen);
  const maskedCount = Math.max(4, str.length - prefixLen - suffixLen);
  return `${prefix}${'*'.repeat(maskedCount)}${suffix}`;
}

/**
 * Sanitizes and redacts any object before logging to console or file.
 */
export function redactSecrets(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(redactSecrets);
  }

  const SENSITIVE_KEYS = [
    'password', 'secret', 'apiKey', 'api_key', 'token', 'jwt', 
    'feedToken', 'feed_token', 'accessToken', 'access_token',
    'totp', 'totp_key', 'pin', 'client_secret', 'authorization'
  ];

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const isSensitive = SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()));
    if (isSensitive && typeof val === 'string') {
      sanitized[key] = maskString(val);
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = redactSecrets(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}
