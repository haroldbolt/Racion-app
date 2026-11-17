import { DurableObject } from 'cloudflare:workers';
import { LivePriceService, hashValue, parseLivePriceRequest, unavailablePriceResult, type PriceStorageTransactions } from './service';

interface LivePriceWorkerEnv {
  SERPAPI_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
  LIVE_PRICE_BUDGET: {
    getByName(name: string): { fetch(request: Request): Promise<Response> };
  };
}

interface PriceDurableState {
  storage: PriceStorageTransactions;
}

const ROUTE = '/api/live-prices';
const MAX_BODY_BYTES = 1024;
const budgetObjectName = 'racion-app-shopping';

async function readLimitedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let data = '';
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(data + decoder.decode());
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      data += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export class PriceSearchBudget extends DurableObject<LivePriceWorkerEnv> {
  private readonly service: LivePriceService;

  constructor(state: PriceDurableState, env: LivePriceWorkerEnv) {
    super(state, env);
    this.service = new LivePriceService(state.storage, env.SERPAPI_API_KEY);
  }

  async fetch(request: Request): Promise<Response> {
    const query = parseLivePriceRequest(await readLimitedJson(request));
    if (!query) return Response.json({ error: 'invalid_request' }, { status: 400 });
    const caller = request.headers.get('X-Racion-Visitor') ?? 'anonymous';
    try {
      return Response.json(await this.service.search(query, caller));
    } catch {
      return Response.json(unavailablePriceResult(query.city, 'upstream_unavailable'));
    }
  }
}

export default {
  async fetch(request: Request, env: LivePriceWorkerEnv): Promise<Response> {
    if (new URL(request.url).pathname !== ROUTE) return new Response(null, { status: 404 });
    const origin = request.headers.get('Origin');
    const allowedOrigins = (env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim());
    if (!origin || !allowedOrigins.includes(origin)) return new Response(null, { status: 403 });
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers });
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') ?? '')) {
      return Response.json({ error: 'invalid_content_type' }, { status: 415, headers });
    }
    if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) {
      return Response.json({ error: 'invalid_request' }, { status: 413, headers });
    }
    const query = parseLivePriceRequest(await readLimitedJson(request));
    if (!query) return Response.json({ error: 'invalid_request' }, { status: 400, headers });
    try {
      // Budget reservations store a keyed digest rather than the client's IP address.
      const visitor = env.SERPAPI_API_KEY
        ? await hashValue(JSON.stringify([env.SERPAPI_API_KEY, request.headers.get('CF-Connecting-IP')]))
        : 'anonymous';
      const internal = new Request('https://racion.internal/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Racion-Visitor': visitor },
        body: JSON.stringify(query),
      });
      const result = await env.LIVE_PRICE_BUDGET.getByName(budgetObjectName).fetch(internal);
      return new Response(result.body, {
        status: result.status,
        headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
      });
    } catch {
      return Response.json(unavailablePriceResult(query.city, 'upstream_unavailable'), { headers });
    }
  },
};
