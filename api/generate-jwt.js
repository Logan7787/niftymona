import https from 'https';
import crypto from 'crypto';

function base32ToBuffer(base32) {
  const clean = (base32 || '').toUpperCase().replace(/[\s-]/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function computeTotp(secret, epochSec = Math.floor(Date.now() / 1000)) {
  const key = base32ToBuffer(secret);
  if (key.length === 0) return '';
  const counter = Math.floor(epochSec / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

function sendAngelLogin(apiKey, clientCode, password, totpCode, publicIp) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      clientcode: clientCode.trim().toUpperCase(),
      password: password.trim(),
      totp: totpCode.trim(),
    });

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Accept': 'application/json',
      'X-PrivateKey': apiKey.trim(),
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-ClientLocalIP': '127.0.0.1',
      'X-ClientPublicIP': publicIp || '223.178.85.220',
      'X-MACAddress': '02:00:00:00:00:00',
    };

    const req = https.request(
      {
        hostname: 'apiconnect.angelone.in',
        path: '/rest/auth/angelbroking/user/v1/loginByPassword',
        method: 'POST',
        headers,
        timeout: 12000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            resolve({ statusCode: res.statusCode, data: json, raw });
          } catch {
            resolve({ statusCode: res.statusCode, data: raw, raw });
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Angel One connection timed out'));
    });

    req.write(postData);
    req.end();
  });
}

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const raw = req.body;
    const body = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    const { apiKey, clientCode, password, totp, clientPublicIp } = body;

    if (!apiKey?.trim() || !clientCode?.trim() || !password?.trim() || !totp?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'SmartAPI Key, Client Code, PIN, and TOTP are all required.',
      });
    }

    const publicIp = clientPublicIp?.trim() || '223.178.85.220';
    const cleanTotpInput = String(totp).trim().replace(/\s+/g, '');
    const isDirectCode = /^\d{6}$/.test(cleanTotpInput);

    let totpCode = isDirectCode ? cleanTotpInput : computeTotp(cleanTotpInput);
    if (!/^\d{6}$/.test(totpCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid TOTP code or secret key. Please enter a valid 6-digit code or permanent TOTP Key.',
      });
    }

    // Attempt 1: Using current OTP
    let response = await sendAngelLogin(apiKey, clientCode, password, totpCode, publicIp);

    // If Base32 key was provided and first attempt failed with AB1050 (drift), try window -1 and +1
    if (!isDirectCode && response.data?.errorcode === 'AB1050') {
      const now = Math.floor(Date.now() / 1000);
      const prevCode = computeTotp(cleanTotpInput, now - 30);
      if (prevCode && prevCode !== totpCode) {
        response = await sendAngelLogin(apiKey, clientCode, password, prevCode, publicIp);
      }
      if (response.data?.errorcode === 'AB1050') {
        const nextCode = computeTotp(cleanTotpInput, now + 30);
        if (nextCode && nextCode !== totpCode) {
          response = await sendAngelLogin(apiKey, clientCode, password, nextCode, publicIp);
        }
      }
    }

    const d = response.data;

    // Success response with JWT session token
    if (d && typeof d === 'object' && d.status === true && d.data?.jwtToken) {
      const cleanJwt = String(d.data.jwtToken).replace(/^bearer\s+/i, '').trim();
      return res.status(200).json({
        success: true,
        jwtToken: cleanJwt,
        feedToken: d.data.feedToken,
        refreshToken: d.data.refreshToken,
        message: 'Angel One JWT session token generated successfully!',
      });
    }

    // Process error response from Angel One SmartAPI
    let errMsg = 'Failed to generate JWT token from Angel One.';
    if (typeof d === 'string') {
      if (d.includes('exceeding access rate') || d.includes('Access denied')) {
        errMsg = 'Angel One rate limit reached (too many rapid requests). Please wait 15 seconds before trying again.';
      } else if (d.includes('Request Rejected') || d.includes('<html')) {
        errMsg = 'Request rejected by Angel One security firewall. Please try again.';
      } else {
        errMsg = d;
      }
    } else if (d && typeof d === 'object') {
      const errCode = d.errorcode || d.errorCode || '';
      if (errCode === 'AB1050') {
        errMsg = 'Invalid TOTP / Client combination (AB1050). The 6-digit OTP has expired or does not match SmartAPI. Please enter a fresh 6-digit code from Google Authenticator (SmartAPI), or paste your permanent TOTP Secret Key from smartapi.angelone.in/enable-totp.';
      } else if (errCode === 'AB1010') {
        errMsg = 'Invalid Account PIN (AB1010). Please verify your 4-digit demat trading PIN.';
      } else if (d.message) {
        errMsg = errCode ? `${d.message} (${errCode})` : d.message;
      }
    }

    return res.status(200).json({
      success: false,
      message: errMsg,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Server error while generating JWT token',
    });
  }
}

