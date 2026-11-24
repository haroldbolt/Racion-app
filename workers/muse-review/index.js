import { createRemoteJWKSet, jwtVerify } from 'jose';

const origin = 'https://muse.racion-app.pages.dev';
const issuer = 'https://token.actions.githubusercontent.com';
const branch = 'refs/heads/feature/publicar-beta-muse';
const repo = 'haroldbolt/Racion-app';
const keys = createRemoteJWKSet(new URL(issuer + '/.well-known/jwks'));
const encoder = new TextEncoder();

function reply(body, status, headers = {}) {
  return new Response(body, { status, headers: {
    'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', ...headers,
  } });
}

async function signature(key, message) {
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}

async function openRunnerSession(request, signingKey) {
  const match = /^Bearer ([\w.-]+)$/.exec(request.headers.get('Authorization') || '');
  if (!match) return reply(null, 401);
  let claims;
  try {
    ({ payload: claims } = await jwtVerify(match[1], keys, {
      algorithms: ['RS256'], issuer, audience: origin, requiredClaims: ['exp', 'iat'],
      subject: 'repo:' + repo + ':ref:' + branch,
    }));
  } catch {
    return reply(null, 401);
  }
  if (claims.repository_id !== '1456129077' || claims.ref !== branch ||
      claims.workflow_ref !== repo + '/.github/workflows/muse-review.yml@' + branch ||
      !['push', 'workflow_dispatch'].includes(claims.event_name)) return reply(null, 403);
  const expires = Math.floor(Date.now() / 1000) + 1800;
  const ticket = 'ci.' + expires + '.' + crypto.randomUUID();
  return reply(JSON.stringify({ password: ticket + '.' + await signature(signingKey, ticket) }), 200,
    { 'Content-Type': 'application/json' });
}

async function matchesCredential(password, manual, signingKey) {
  const ticket = /^(ci\.(\d{10})\.[0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(password);
  const now = Math.floor(Date.now() / 1000);
  if (ticket && Number(ticket[2]) > now && Number(ticket[2]) <= now + 1800) {
    const bytes = Uint8Array.from(ticket[3].match(/../g), pair => parseInt(pair, 16));
    return crypto.subtle.verify('HMAC', signingKey, bytes, encoder.encode(ticket[1]));
  }
  const tag = await crypto.subtle.sign('HMAC', signingKey, encoder.encode(manual));
  return crypto.subtle.verify('HMAC', signingKey, tag, encoder.encode(password));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.origin !== origin) return reply(null, 404);
    if (!env.MUSE_REVIEW_PASSWORD || !env.MUSE_REVIEW_SIGNING_KEY) return reply(null, 503);
    const signingKey = await crypto.subtle.importKey('raw', encoder.encode(env.MUSE_REVIEW_SIGNING_KEY),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    if (url.pathname === '/__review/session' && request.method === 'POST') return openRunnerSession(request, signingKey);
    let credentials = '';
    const match = /^Basic ([\w+/=]+)$/i.exec(request.headers.get('Authorization') || '');
    if (match && match[1].length < 1024) {
      try { credentials = atob(match[1]); } catch { /* Invalid Basic credentials. */ }
    }
    if (!credentials.startsWith('muse:') || !await matchesCredential(credentials.slice(5), env.MUSE_REVIEW_PASSWORD, signingKey)) {
      return reply('Acceso de revisión de Ración App para Muse.', 401,
        { 'WWW-Authenticate': 'Basic realm="Racion App - Muse", charset="UTF-8"' });
    }
    if (!['GET', 'HEAD'].includes(request.method)) return reply(null, 405);
    const headers = new Headers(request.headers);
    headers.delete('Authorization');
    headers.delete('Cookie');
    const asset = await env.ASSETS.fetch(new Request(request, { headers }));
    const result = new Response(asset.body, asset);
    result.headers.set('Cache-Control', 'private, no-store');
    result.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return result;
  },
};
