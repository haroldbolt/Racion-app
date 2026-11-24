import { purchaseTerms } from '../../src/utils/hotmart.mjs';
import { firebaseAccount } from './auth';
import { buyerKey, normalizedEmail } from './engine';
import { checkoutUrl, productConfigured, purchaseNotice, validHottok, type HotmartEnv } from './webhook';

export interface BillingWorkerEnv extends HotmartEnv {
  ALLOWED_ORIGINS?: string;
  FIREBASE_PROJECT_ID?: string;
  BILLING_ACCOUNTS: {getByName(name:string):{fetch(request:Request):Promise<Response>}};
}

async function readBody(request: Request, limit: number) {
  if (Number(request.headers.get('Content-Length')) > limit) throw new Error('body_too_large');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder('utf-8', {fatal:true});
  let size = 0;
  let result = '';
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) return result + decoder.decode();
      size += value.byteLength;
      if (size > limit) throw new Error('body_too_large');
      result += decoder.decode(value, {stream:true});
    }
  } finally {
    reader.releaseLock();
  }
}

function appOrigin(origin: string | null, configured = '') {
  if (!origin) return false;
  return configured.split(',').some(entry => {
    if (!URL.canParse(entry.trim())) return false;
    const url = new URL(entry.trim());
    const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    return origin === url.origin && !url.username && !url.password &&
      (url.protocol === 'https:' || (local && url.protocol === 'http:'));
  });
}

function dispatch(env: BillingWorkerEnv, path: string, body: unknown) {
  const ledger = env.BILLING_ACCOUNTS.getByName('hotmart-product:' + env.HOTMART_PRODUCT_ID);
  return ledger.fetch(new Request('https://billing.internal/' + path, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
  }));
}

export async function handleBilling(
  request: Request, env: BillingWorkerEnv, identity: typeof firebaseAccount = firebaseAccount
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const headers = new Headers({'Cache-Control':'no-store', Vary:'Origin'});
  const reply = (status: number, body: unknown) => Response.json(body, {status, headers});
  if (path === '/api/billing/webhook') {
    if (request.method !== 'POST') return reply(405, {error:'method_not_allowed'});
    if (!env.HOTMART_HOTTOK?.trim() || !productConfigured(env)) return reply(503, {error:'billing_not_configured'});
    if (!await validHottok(request.headers.get('X-HOTMART-HOTTOK'), env.HOTMART_HOTTOK)) {
      return reply(401, {error:'invalid_webhook_token'});
    }
    let notice;
    try {
      notice = await purchaseNotice(JSON.parse(await readBody(request, 128 * 1024)), env);
    } catch {
      return reply(400, {error:'invalid_webhook'});
    }
    if (notice) {
      try {
        const result = await dispatch(env, 'event', notice);
        if (!result.ok) throw new Error('failed_to_save_event');
      } catch {
        return reply(503, {error:'retry_webhook'});
      }
    }
    return reply(200, {received:true});
  }
  if (path !== '/api/billing/status' && path !== '/api/billing/offer') return reply(404, {error:'not_found'});
  const origin = request.headers.get('Origin');
  if (!origin || !appOrigin(origin, env.ALLOWED_ORIGINS)) return reply(403, {error:'origin_not_allowed'});
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (request.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (request.method !== 'GET') return reply(405, {error:'method_not_allowed'});

  if (path === '/api/billing/offer') {
    const url = checkoutUrl(env);
    if (!url || !productConfigured(env) || !env.HOTMART_HOTTOK?.trim() || !env.FIREBASE_PROJECT_ID?.trim()) {
      return reply(503, {error:'billing_not_configured'});
    }
    return reply(200, {provider:'hotmart', checkoutUrl:url, ...purchaseTerms});
  }

  const bearer = /^Bearer ([A-Za-z0-9._-]{10,8192})$/.exec(request.headers.get('Authorization') ?? '');
  if (!bearer) return reply(401, {error:'sign_in_required'});
  // A paused checkout must not prevent a previous buyer from using their purchase.
  if (!env.FIREBASE_PROJECT_ID?.trim() || !/^[1-9]\d*$/.test(env.HOTMART_PRODUCT_ID || '')) {
    return reply(503, {error:'billing_not_configured'});
  }
  let account: Awaited<ReturnType<typeof firebaseAccount>>;
  try {
    account = await identity(bearer[1], env.FIREBASE_PROJECT_ID);
  } catch {
    return reply(401, {error:'invalid_identity'});
  }
  const email = normalizedEmail(account.email);
  if (!account.emailVerified || !email) return reply(403, {error:'email_not_verified'});
  try {
    const result = await dispatch(env, 'status', {buyer:await buyerKey(email)});
    if (!result.ok) throw new Error('failed_to_read_account');
    return reply(200, await result.json());
  } catch {
    return reply(503, {error:'billing_unavailable'});
  }
}
