// ==============================================================================
// Pure Web Crypto TOTP (RFC 6238) Generator for Angel One SmartAPI
// Works natively in modern browsers with zero external dependencies
// ==============================================================================

function base32ToBytes(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/[\s-]/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';

  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }

  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, (i + 1) * 8), 2);
  }
  return bytes;
}

export async function generateTOTP(secretOrCode: string): Promise<string> {
  const clean = (secretOrCode || '').trim().replace(/\s+/g, '');
  if (!clean) return '';

  // If already a 6-digit numeric OTP, return directly
  if (/^\d{6}$/.test(clean)) {
    return clean;
  }

  try {
    const keyBytes = base32ToBytes(clean);
    if (keyBytes.length === 0) return clean;

    const epochSec = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epochSec / 30);

    const counterBuffer = new ArrayBuffer(8);
    const view = new DataView(counterBuffer);
    view.setUint32(0, 0, false); // high 32 bits
    view.setUint32(4, counter, false); // low 32 bits (big-endian)

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      { name: 'HMAC', hash: { name: 'SHA-1' } },
      false,
      ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
    const hmac = new Uint8Array(signature);
    const offset = hmac[hmac.length - 1] & 0x0f;

    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  } catch (err) {
    console.warn('[TOTP] Failed to generate TOTP from secret, passing raw input:', err);
    return clean;
  }
}
