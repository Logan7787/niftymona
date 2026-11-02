// ==============================================================================
// Vercel Serverless Function: Angel One SmartAPI Secure Proxy
// Handles all /api/angelone/* requests on Vercel with correct Origin, Host, and CORS headers
// ==============================================================================

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-PrivateKey, X-SourceID, X-ClientLocalIP, X-ClientPublicIP, X-MACAddress, X-UserType'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { path } = req.query;
  const targetPath = Array.isArray(path) ? path.join('/') : (path || '');
  const targetUrl = `https://apiconnect.angelone.in/${targetPath}`;

  const forwardHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Origin': 'https://apiconnect.angelone.in',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  const copyHeader = (key) => {
    const val = req.headers[key.toLowerCase()] || req.headers[key];
    if (val) forwardHeaders[key] = val;
  };

  copyHeader('Authorization');
  copyHeader('X-PrivateKey');
  copyHeader('X-SourceID');
  copyHeader('X-ClientLocalIP');
  copyHeader('X-ClientPublicIP');
  copyHeader('X-MACAddress');
  copyHeader('X-UserType');

  // Fallback defaults expected by Angel One SmartAPI
  if (!forwardHeaders['X-SourceID']) forwardHeaders['X-SourceID'] = 'WEB';
  if (!forwardHeaders['X-ClientLocalIP']) forwardHeaders['X-ClientLocalIP'] = '127.0.0.1';
  if (!forwardHeaders['X-ClientPublicIP']) forwardHeaders['X-ClientPublicIP'] = '127.0.0.1';
  if (!forwardHeaders['X-MACAddress']) forwardHeaders['X-MACAddress'] = 'fe80::1';
  if (!forwardHeaders['X-UserType']) forwardHeaders['X-UserType'] = 'USER';

  try {
    const bodyStr = req.body
      ? typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body)
      : undefined;

    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? bodyStr : undefined,
    });

    const responseText = await upstreamRes.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(upstreamRes.status).send(responseText);
    }

    return res.status(upstreamRes.status).json(data);
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message || 'Angel One proxy failed' });
  }
}

