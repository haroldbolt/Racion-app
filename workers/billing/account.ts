import { DurableObject } from 'cloudflare:workers';
import { PurchaseLedger, type LedgerStorage } from './engine';

export class BillingAccount extends DurableObject<unknown> {
  private ledger: PurchaseLedger;

  constructor(state: {storage: LedgerStorage}, env: unknown) {
    super(state, env);
    this.ledger = new PurchaseLedger(state.storage);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, {status:405});
    const path = new URL(request.url).pathname;
    if (path === '/event') {
      this.ledger.receive(await request.json());
      return Response.json({received:true});
    }
    if (path === '/status') {
      const {buyer} = await request.json() as {buyer:string};
      return Response.json(this.ledger.status(buyer));
    }
    return new Response(null, {status:404});
  }

  // Timers scheduled by older sandbox versions must finish without an external charge.
  async alarm(): Promise<void> {}
}
