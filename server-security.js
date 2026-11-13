import { isIP } from 'node:net';

export function deploymentConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const origin = env.NETWORK_LAB_PUBLIC_ORIGIN || '';
  if (origin && (new URL(origin).origin !== origin || !['http:', 'https:'].includes(new URL(origin).protocol))) throw Error('PUBLIC_ORIGIN must be an origin without a trailing slash or path.');
  if (production && (!origin.startsWith('https://') || env.NETWORK_LAB_HTTPS !== '1' || !env.NETWORK_LAB_DATA_DIR)) throw Error('Production requires an HTTPS PUBLIC_ORIGIN, NETWORK_LAB_HTTPS=1 and an external NETWORK_LAB_DATA_DIR.');
  if (production && (!env.OIDC_ISSUER?.startsWith('https://') || !env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET)) throw Error('Production requires a configured HTTPS OpenID Connect identity provider.');
  const proxy = env.NETWORK_LAB_TRUSTED_PROXY || '';
  if (proxy && !isIP(proxy)) throw Error('TRUSTED_PROXY must be one exact proxy IP address.');
  return { production, origin, proxy, host: env.HOST || '127.0.0.1', port: Number(env.PORT || 4317) };
}

export function securityHeaders(res, production) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

// Only the configured immediate reverse proxy may supply a client address.
export function clientAddress(req, proxy) {
  const peer = req.socket.remoteAddress || 'unknown';
  if (peer !== proxy) return peer;
  const value = req.headers['x-real-ip'];
  return typeof value === 'string' && isIP(value) ? value : peer;
}

export function createRateLimiter({ now = Date.now, maxKeys = 10000 } = {}) {
  const buckets = new Map();
  return function allow(key, limit, windowMs = 60000) {
    const time = now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= time) {
      if (buckets.size >= maxKeys) {
        for (const [id, entry] of buckets) if (entry.until <= time) buckets.delete(id);
        if (buckets.size >= maxKeys && !buckets.has(key)) return false;
      }
      bucket = { until: time + windowMs, count: 0 }; buckets.set(key, bucket);
    }
    return ++bucket.count <= limit;
  };
}
