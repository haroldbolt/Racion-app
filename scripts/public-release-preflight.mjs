import { isIP } from 'node:net';

const betaOrigin = 'https://racion-app.pages.dev';

function publicUrl(value, field) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Falta una URL HTTPS pública en ${field}.`); }
  const host = url.hostname;
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !host.includes('.') || isIP(host) || host.startsWith('[') || /(?:^|[.-])(?:mock|fixture)(?:[.-]|$)/i.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|invalid|example|test)\.?$/i.test(host) ||
      /(?:^|\.)example\.(?:org|com|net)\.?$/i.test(host)) {
    throw new Error(`${field} requiere una URL HTTPS pública.`);
  }
  return url;
}

/** Check public registration independently of the payment provider. These probes are read-only. */
async function verifyPublicRegistration(env, appUrls, request) {
  const required = ['VITE_BILLING_FIREBASE_PROJECT_ID', 'VITE_BILLING_FIREBASE_API_KEY', 'VITE_BILLING_API_URL'];
  const missing = required.filter(name => !env[name]?.trim());
  if (missing.length) throw new Error('Falta configurar ' + missing.join(', ') + '.');
  if (env.VITE_BILLING_AUTH_EMULATOR_URL?.trim() ||
      /^(?:demo-|fixture(?:-|$))/i.test(env.VITE_BILLING_FIREBASE_PROJECT_ID.trim()) ||
      !/^AIza[\w-]{35}$/.test(env.VITE_BILLING_FIREBASE_API_KEY.trim())) {
    throw new Error('Configura la aplicación web de Firebase Authentication de la beta pública.');
  }
  const worker = publicUrl(env.VITE_BILLING_API_URL.trim(), 'VITE_BILLING_API_URL');
  if (worker.pathname !== '/') throw new Error('VITE_BILLING_API_URL debe contener solo el origen del Worker.');
  const origins = new Set(appUrls.map(url => publicUrl(url, 'RACION_PUBLIC_URLS').origin));
  for (const origin of origins) {
    const status = new URL('/api/billing/status', worker);
    const options = { redirect: 'error', signal: AbortSignal.timeout(15000) };
    const cors = await request(status, { ...options, method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization, Content-Type',
    } });
    const allows = name => (cors.headers.get(name) || '').toLowerCase().split(',').map(s => s.trim());
    if (cors.status !== 204 || cors.headers.get('Access-Control-Allow-Origin') !== origin ||
        !allows('Access-Control-Allow-Methods').includes('get') ||
        !allows('Access-Control-Allow-Headers').includes('authorization') ||
        !allows('Access-Control-Allow-Headers').includes('content-type')) {
      throw new Error(`El Worker no permite solicitudes de registro desde ${origin} (CORS, HTTP ${cors.status}).`);
    }
    const response = await request(status, { ...options, method: 'GET', headers: { Origin: origin } });
    const body = await response.json().catch(() => null);
    if (response.status !== 401 || body?.error !== 'sign_in_required' ||
        response.headers.get('Access-Control-Allow-Origin') !== origin) {
      throw new Error(`El Worker de cuentas no está listo para ${origin} (HTTP ${response.status}).`);
    }
  }
}

export async function verifyPublicRelease(env, appUrls, request = fetch) {
  // The current billing UI and Worker only implement Stripe Sandbox.
  // Replace this hold with an end-to-end Hotmart release check when the integration exists.
  const blocked = 'Publicación comercial bloqueada. Falta integrar Hotmart y verificar una oferta de 72 horas con un único cobro de 18 USD al cuarto día, sin renovación.';
  try {
    await verifyPublicRegistration(env, appUrls, request);
  } catch (cause) {
    throw new Error(`${blocked} ${cause.message}`, { cause });
  }
  throw new Error(blocked);
}

/**
 * Also check builds initiated by the Cloudflare Pages dashboard.
 * @returns {import('vite').Plugin}
 */
export function publicRelease() {
  let commit;
  return {
    name: 'racion-public-release',
    apply: 'build',
    async configResolved(config) {
      commit = process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA;
      if (commit && !/^[\da-f]{40}$/i.test(commit)) throw new Error('El identificador de versión no es un SHA de Git válido.');
      if (process.env.RACION_PUBLIC_BUILD !== '1' && process.env.CF_PAGES !== '1') return;
      if (config.mode !== 'production') throw new Error('La beta pública requiere el modo production con acceso R0.');
      const urls = (process.env.RACION_PUBLIC_URLS || betaOrigin).split(',').map(url => url.trim());
      await verifyPublicRelease(config.env, urls);
    },
    transformIndexHtml() {
      if (commit) return [{ tag: 'meta', attrs: { name: 'racion-release', content: commit }, injectTo: 'head' }];
    },
  };
}
