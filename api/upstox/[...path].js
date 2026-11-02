// ==============================================================================
// Vercel Serverless Function: Upstox API V3 Proxy
// Handles all /api/upstox/* requests on Vercel
// ==============================================================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { path, ...restQuery } = req.query;
  const targetPath = Array.isArray(path) ? path.join('/') : (path || '');
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(restQuery)) {
    if (value !== undefined) {
      searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
  }
  const queryString = searchParams.toString();
  const targetUrl = `https://api.upstox.com/${targetPath}${queryString ? `?${queryString}` : ''}`;

  const forwardHeaders = {
    'Accept': 'application/json',
  };

  if (req.headers['authorization']) {
    forwardHeaders['Authorization'] = req.headers['authorization'];
  }
  if (req.headers['content-type']) {
    forwardHeaders['Content-Type'] = req.headers['content-type'];
  }

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
    return res.status(500).json({ status: false, message: error.message || 'Upstox proxy failed' });
  }
}

