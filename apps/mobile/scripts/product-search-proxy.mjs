import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

loadLocalEnv();

const port = Number(process.env.PORT ?? 8787);
const naverClientId = process.env.NAVER_CLIENT_ID ?? '';
const naverClientSecret = process.env.NAVER_CLIENT_SECRET ?? '';
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 60);
const rateLimitBuckets = new Map();

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`);

  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (requestUrl.pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      provider: 'naver-shopping-search',
      configured: hasCredentials(),
    });
    return;
  }

  if (requestUrl.pathname !== '/search/products') {
    sendJson(response, 404, { error: 'NOT_FOUND' });
    return;
  }

  if (!hasCredentials()) {
    sendJson(response, 503, {
      error: 'NAVER_SEARCH_CREDENTIALS_MISSING',
    });
    return;
  }

  const query = requestUrl.searchParams.get('q')?.trim() ?? '';

  if (query.length < 2) {
    sendJson(response, 400, { error: 'QUERY_TOO_SHORT' });
    return;
  }

  if (!consumeRateLimit(getClientIp(request))) {
    sendJson(response, 429, { error: 'RATE_LIMITED' });
    return;
  }

  try {
    const items = await fetchNaverShoppingItems(query);

    sendJson(response, 200, { items });
  } catch (error) {
    sendJson(response, 502, {
      error: error instanceof Error ? error.message : 'NAVER_SEARCH_FAILED',
    });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[product-search-proxy] listening on http://0.0.0.0:${port}`);
  console.log(
    `[product-search-proxy] naver credentials ${hasCredentials() ? 'loaded' : 'missing'}`,
  );
});

function hasCredentials() {
  return naverClientId.length > 0 && naverClientSecret.length > 0;
}

function loadLocalEnv() {
  ['.env.local', '.env'].forEach((filename) => {
    const filePath = path.resolve(process.cwd(), filename);

    if (!fs.existsSync(filePath)) {
      return;
    }

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

    lines.forEach((line) => {
      const trimmed = line.trim();

      if (trimmed.length === 0 || trimmed.startsWith('#')) {
        return;
      }

      const equalsIndex = trimmed.indexOf('=');

      if (equalsIndex === -1) {
        return;
      }

      const key = trimmed.slice(0, equalsIndex).trim();
      const value = trimmed
        .slice(equalsIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');

      if (process.env[key] == null) {
        process.env[key] = value;
      }
    });
  });
}

async function fetchNaverShoppingItems(query) {
  const upstreamUrl = new URL('https://openapi.naver.com/v1/search/shop.json');
  upstreamUrl.searchParams.set('query', query);
  upstreamUrl.searchParams.set('display', '8');
  upstreamUrl.searchParams.set('sort', 'sim');

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      'X-Naver-Client-Id': naverClientId,
      'X-Naver-Client-Secret': naverClientSecret,
    },
  });

  if (!upstreamResponse.ok) {
    const text = await upstreamResponse.text();
    throw new Error(`NAVER_UPSTREAM_${upstreamResponse.status}:${text.slice(0, 160)}`);
  }

  const payload = await upstreamResponse.json();

  return (payload.items ?? []).map((item) => ({
    id: item.productId || item.link || item.title,
    title: stripTags(item.title ?? ''),
    brand: item.brand ?? '',
    maker: item.maker ?? '',
    mallName: item.mallName ?? '',
    image: item.image ?? '',
    link: item.link ?? '',
    price: Number(item.lprice ?? 0),
    priceLabel:
      Number(item.lprice ?? 0) > 0
        ? `${new Intl.NumberFormat('ko-KR').format(Number(item.lprice))}원`
        : '가격 확인',
    categories: [item.category1, item.category2, item.category3, item.category4].filter(
      Boolean,
    ),
  }));
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, '');
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function consumeRateLimit(clientIp) {
  if (rateLimitMax <= 0) {
    return true;
  }

  const now = Date.now();
  const current = rateLimitBuckets.get(clientIp);

  if (current == null || current.resetAt <= now) {
    rateLimitBuckets.set(clientIp, {
      count: 1,
      resetAt: now + rateLimitWindowMs,
    });
    cleanupRateLimitBuckets(now);
    return true;
  }

  if (current.count >= rateLimitMax) {
    return false;
  }

  current.count += 1;
  return true;
}

function cleanupRateLimitBuckets(now) {
  if (rateLimitBuckets.size < 500) {
    return;
  }

  for (const [clientIp, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(clientIp);
    }
  }
}

function getClientIp(request) {
  const forwardedFor = request.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return request.socket.remoteAddress ?? 'unknown';
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}
