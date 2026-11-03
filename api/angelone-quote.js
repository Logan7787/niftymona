import https from 'https';

function requestAngelQuote(apiKey, jwtToken, payload, publicIp) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload || {});
    const cleanJwt = String(jwtToken || '').replace(/^bearer\s+/i, '').trim();

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Accept': 'application/json',
      'Authorization': `Bearer ${cleanJwt}`,
      'X-PrivateKey': (apiKey || '').trim(),
      'X-SourceID': 'WEB',
      'X-UserType': 'USER',
      'X-ClientLocalIP': '127.0.0.1',
      'X-ClientPublicIP': (publicIp || '223.178.85.220').trim(),
      'X-MACAddress': '02:00:00:00:00:00',
    };

    const req = https.request(
      'https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote',
      {
        method: 'POST',
        headers,
        timeout: 10000,
      },
      (res) => {
        let rawBody = '';
        res.on('data', (chunk) => {
          rawBody += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(rawBody);
            resolve({
              httpStatus: res.statusCode,
              data: parsed,
            });
          } catch {
            resolve({
              httpStatus: res.statusCode,
              raw: rawBody,
            });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Angel One quote endpoint timed out (10s).'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

export default async function handler(req, res) {
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
    const { apiKey, jwtToken, payload, clientPublicIp } = body;

    if (!apiKey?.trim() || !jwtToken?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Both apiKey and jwtToken are required to fetch Angel One quotes.',
      });
    }

    const publicIp = clientPublicIp?.trim() || '223.178.85.220';
    const quoteResult = await requestAngelQuote(apiKey, jwtToken, payload, publicIp);

    const d = quoteResult.data;
    if (d && typeof d === 'object') {
      const errCode = d.errorcode || d.errorCode || '';
      const isExpired = errCode === 'AG8001' || errCode === 'AG8003' || String(d.message || '').toLowerCase().includes('token');

      return res.status(200).json({
        success: d.status === true || (Array.isArray(d.data?.fetched) && d.data.fetched.length > 0),
        status: d.status,
        message: d.message,
        errorCode: errCode,
        expired: isExpired,
        data: d.data,
      });
    }

    // Non-JSON or firewall response
    return res.status(200).json({
      success: false,
      message: typeof quoteResult.raw === 'string' ? quoteResult.raw : 'Non-JSON quote response from broker',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Server error while fetching Angel One quotes',
    });
  }
}

