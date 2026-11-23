import { firebaseAccount } from './auth';
import { BILLING_CONSENT_VERSION } from './engine';
import { hasStripeTestKey, type GatewayEnv } from './gateway';
import { signedNotification } from './webhook';

export interface BillingWorkerEnv extends GatewayEnv {
  ALLOWED_ORIGINS?: string;
  FIREBASE_PROJECT_ID?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  BILLING_ACCOUNTS: {getByName(uid:string):{fetch(request:Request):Promise<Response>}};
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
      if (size > limit) {
        await reader.cancel();
        throw new Error('body_too_large');
      }
      result += decoder.decode(value, {stream:true});
    }
  } finally {
    reader.releaseLock();
  }
}

function appUrl(origin: string | null, configured = '') {
  if (!origin) return;
  for (const candidate of configured.split(',').map(s => s.trim()).filter(Boolean)) {
    if (!URL.canParse(candidate)) continue;
    const url = new URL(candidate);
    const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if (url.origin === origin && (url.protocol === 'https:' || (local && url.protocol === 'http:'))) return url.href;
  }
}

function dispatch(env: BillingWorkerEnv, action: string, uid: string, fields: Record<string, unknown> = {}) {
  return env.BILLING_ACCOUNTS.getByName(uid).fetch(new Request('https://billing.internal/' + action, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...fields, uid}),
  }));
}

// Browser inputs never select the account, amount, due date or destination for a Stripe callback.
export async function handleBilling(
  request: Request, env: BillingWorkerEnv, identity: typeof firebaseAccount = firebaseAccount
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const headers = new Headers({'Cache-Control':'no-store', Vary:'Origin'});
  const reply = (status: number, body: unknown) => Response.json(body, {status, headers});

  if (path === '/api/billing/webhook' && request.method === 'POST') {
    if (!hasStripeTestKey(env.STRIPE_SECRET_KEY) || !env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
      return reply(503, {error:'billing_not_configured'});
    }
    let event;
    try {
      const raw = await readBody(request, 128 * 1024);
      event = await signedNotification(raw, request.headers.get('Stripe-Signature') ?? '', env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return reply(400, {error:'invalid_webhook'});
    }
    if (event) {
      try {
        const result = await dispatch(env, 'notify', event.uid, event);
        if (!result.ok) return reply(503, {error:'retry_webhook'});
      } catch {
        return reply(503, {error:'retry_webhook'});
      }
    }
    return reply(200, {received:true});
  }

  const operations: Record<string,[string,string]> = {
    '/api/billing/status':['GET', 'status'], '/api/billing/checkout':['POST','checkout'],
    '/api/billing/confirm':['POST','refresh'], '/api/billing/cancel':['POST','cancel'],
  };
  if (!Object.hasOwn(operations, path)) return reply(404, {error:'not_found'});
  const [method, action] = operations[path];
  const origin = request.headers.get('Origin');
  const returnOrigin = appUrl(origin, env.ALLOWED_ORIGINS);
  if (!returnOrigin || !origin) return reply(403, {error:'origin_not_allowed'});
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', method + ', OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (request.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (request.method !== method) return reply(405, {error:'method_not_allowed'});
  if (!env.FIREBASE_PROJECT_ID || !hasStripeTestKey(env.STRIPE_SECRET_KEY)) {
    return reply(503, {error:'billing_not_configured'});
  }
  const bearer = /^Bearer ([A-Za-z0-9._-]{10,8192})$/.exec(request.headers.get('Authorization') ?? '');
  if (!bearer) return reply(401, {error:'sign_in_required'});
  let uid: string;
  try {
    uid = await identity(bearer[1], env.FIREBASE_PROJECT_ID);
  } catch {
    return reply(401, {error:'invalid_identity'});
  }
  const fields: Record<string, unknown> = {};
  if (method === 'POST') {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) {
      return reply(415, {error:'json_required'});
    }
    try {
      const input = JSON.parse(await readBody(request, 2048));
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('expected_object');
      if (action === 'checkout') {
        if (input.consentVersion !== BILLING_CONSENT_VERSION) return reply(400, {error:'consent_required'});
        fields.consentVersion = input.consentVersion;
        fields.returnOrigin = returnOrigin;
      }
      if (action === 'refresh') {
        if (typeof input.sessionId !== 'string' || !/^cs_test_[A-Za-z0-9_]{1,180}$/.test(input.sessionId)) {
          return reply(400, {error:'invalid_session'});
        }
        fields.sessionId = input.sessionId;
      }
    } catch {
      return reply(400, {error:'invalid_request'});
    }
  }
  try {
    const result = await dispatch(env, action, uid, fields);
    const data = await result.json() as { checkoutUrl?:string };
    if (action === 'checkout' && result.ok) {
      if (!data.checkoutUrl) return reply(409, {error:'checkout_unavailable'});
      return reply(200, {url:data.checkoutUrl});
    }
    return reply(result.status, data);
  } catch {
    return reply(503, {error:'billing_unavailable'});
  }
}
