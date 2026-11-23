import { DurableObject } from 'cloudflare:workers';
import { BillingEngine, BillingError, type BillingAction, type BillingRecord } from './engine';
import { createBillingGateway, type GatewayEnv } from './gateway';

interface AccountStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: BillingRecord): Promise<void>;
  setAlarm(time: number): Promise<void>;
  deleteAlarm(): Promise<void>;
  transaction<T>(operation: () => Promise<T>): Promise<T>;
}

const httpActions = new Set<BillingAction>(['status', 'checkout', 'cancel', 'refresh', 'notify']);

// One object per verified account, selected by the public Worker's router.
export class BillingAccount extends DurableObject<GatewayEnv> {
  private readonly engine: BillingEngine;

  constructor(state: { storage: AccountStorage }, env: GatewayEnv) {
    super(state, env);
    this.engine = new BillingEngine({
      read: () => state.storage.get<BillingRecord>('account'),
      save: (record, alarm) => state.storage.transaction(async () => {
        await state.storage.put('account', record);
        if (alarm === null) await state.storage.deleteAlarm();
        else await state.storage.setAlarm(alarm);
      }),
    }, createBillingGateway(env));
  }

  async fetch(request: Request): Promise<Response> {
    const action = new URL(request.url).pathname.slice(1) as BillingAction;
    if (request.method !== 'POST' || !httpActions.has(action)) return new Response(null, { status: 404 });
    const input = await request.json().catch(() => undefined);
    if (!input || typeof input.uid !== 'string' || !input.uid) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }
    try {
      return Response.json(await this.engine.run(action, input), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof BillingError) return Response.json({ error: error.code }, { status: error.httpStatus });
      // Stripe errors may contain payment/customer information. Keep them out of client responses.
      return Response.json({ error: 'billing_temporarily_unavailable' }, { status: 503 });
    }
  }

  async alarm() {
    await this.engine.run('alarm');
  }
}
