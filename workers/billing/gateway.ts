import { CHARGE_CENTS, type BillingGateway, type ChargeResult } from './engine';

export interface GatewayEnv {
  STRIPE_SECRET_KEY?: string;
}

export const hasStripeTestKey = (key?: string) => /^(?:sk|rk|rkcs)_test_[a-zA-Z0-9_-]+$/.test(key ?? '');
const validId = (value: unknown, prefix: string): value is string =>
  typeof value === 'string' && value.startsWith(prefix) && /^[A-Za-z0-9_]{4,200}$/.test(value);

interface StripeIntent {
  id: string;
  object: string;
  livemode: boolean;
  status: string;
  customer: string;
  amount: number;
  amount_received: number;
  currency: string;
  metadata: { racion_uid?: string };
}

interface StripeSession {
  id: string;
  object: string;
  livemode: boolean;
  mode: string;
  url?: string;
  status: string;
  customer: string;
  metadata: { racion_uid?: string };
  setup_intent?: {
    status: string;
    livemode: boolean;
    customer: string;
    payment_method: string;
    usage: string;
    metadata: { racion_uid?: string };
  };
}

function readCharge(intent: StripeIntent, expectedId: string): ChargeResult {
  if (intent.object !== 'payment_intent' || intent.livemode !== false ||
      intent.id !== expectedId || !validId(intent.customer, 'cus_') ||
      !intent.metadata?.racion_uid || intent.amount !== CHARGE_CENTS || intent.currency !== 'usd') {
    throw new Error('unexpected_payment_intent');
  }
  let status: ChargeResult['status'];
  switch (intent.status) {
    case 'succeeded':
      if (intent.amount_received !== CHARGE_CENTS) throw new Error('unexpected_amount_received');
      status = 'succeeded';
      break;
    case 'requires_confirmation': status = 'needs_confirmation'; break;
    case 'processing': status = 'processing'; break;
    case 'requires_action':
    case 'requires_payment_method':
    case 'canceled': status = 'failed'; break;
    default: throw new Error('unexpected_payment_status');
  }
  return {id:intent.id, status, uid:intent.metadata.racion_uid, customerId:intent.customer,
    amountCents:intent.amount, currency:intent.currency};
}

export function createBillingGateway(env: GatewayEnv, send: typeof fetch = fetch): BillingGateway {
  async function stripe<T>(path: string, fields?: Record<string, string>, idempotencyKey?: string): Promise<T> {
    const key = env.STRIPE_SECRET_KEY;
    if (!hasStripeTestKey(key)) throw new Error('stripe_sandbox_not_configured');
    const headers = new Headers({Authorization: 'Bearer ' + key, 'Stripe-Version': '2025-08-27.basil'});
    if (idempotencyKey) headers.set('Idempotency-Key', 'racion/' + idempotencyKey);
    const response = await send('https://api.stripe.com/v1/' + path, {
      method: fields ? 'POST' : 'GET', headers, body: fields && new URLSearchParams(fields),
      redirect:'manual', signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      // Stripe returns HTTP 402 as well as an authoritative PaymentIntent on a card decline.
      if (response.status === 402 && path.endsWith('/confirm')) {
        const body = await response.json() as { error?: { payment_intent?: T } };
        if (body.error?.payment_intent) return body.error.payment_intent;
      }
      throw new Error('stripe_unavailable');
    }
    return await response.json() as T;
  }

  return {
    async createCheckout({uid, attemptId, returnOrigin}) {
      const customer = await stripe<{id:string; livemode:boolean}>('customers', {
        'metadata[racion_uid]': uid,
      }, attemptId + '/customer');
      if (customer.livemode !== false || !validId(customer.id, 'cus_')) throw new Error('unexpected_customer');
      const base = new URL(returnOrigin);
      base.search = '';
      base.hash = '';
      const session = await stripe<StripeSession>('checkout/sessions', {
        mode: 'setup', currency: 'usd', customer: customer.id, 'payment_method_types[0]': 'card',
        'metadata[racion_uid]': uid, 'setup_intent_data[metadata][racion_uid]': uid,
        'custom_text[submit][message]': 'Prueba de 72 horas. Al terminar, un único cobro de 18 USD, sin renovación.',
        success_url: base.href + '?billing_session={CHECKOUT_SESSION_ID}', cancel_url: base.href + '?billing_canceled=1',
      }, attemptId + '/checkout');
      if (session.mode !== 'setup' || session.livemode !== false || !validId(session.id, 'cs_test_') ||
          !session.url || new URL(session.url).origin !== 'https://checkout.stripe.com') {
        throw new Error('unexpected_checkout_session');
      }
      return {id:session.id, url:session.url};
    },
    async getCheckout(sessionId) {
      if (!validId(sessionId, 'cs_test_')) throw new Error('invalid_checkout_id');
      const session = await stripe<StripeSession>('checkout/sessions/' + sessionId + '?expand[]=setup_intent');
      if (session.id !== sessionId || session.object !== 'checkout.session' || session.mode !== 'setup' ||
          session.livemode !== false) throw new Error('unexpected_checkout_session');
      if (session.status === 'open' || session.status === 'expired') return {status:session.status};
      const setup = session.setup_intent;
      const uid = session.metadata?.racion_uid;
      if (session.status !== 'complete' || !uid || !setup || setup.livemode !== false ||
          setup.status !== 'succeeded' || setup.usage !== 'off_session' ||
          setup.metadata?.racion_uid !== uid || setup.customer !== session.customer ||
          !validId(session.customer, 'cus_') || !validId(setup.payment_method, 'pm_')) throw new Error('setup_unverified');
      return {status:'complete', uid, customerId:session.customer, paymentMethodId:setup.payment_method};
    },
    async createCharge({uid, attemptId, customerId, paymentMethodId}) {
      const intent = await stripe<StripeIntent>('payment_intents', {
        amount:String(CHARGE_CENTS), currency:'usd', customer:customerId, payment_method:paymentMethodId,
        'payment_method_types[0]':'card', 'metadata[racion_uid]':uid, description:'Ración App · acceso de pago único',
      }, attemptId + '/intent');
      if (!validId(intent.id, 'pi_') || readCharge(intent, intent.id).uid !== uid || intent.customer !== customerId) {
        throw new Error('unexpected_payment_intent');
      }
      return {id:intent.id};
    },
    async getCharge(intentId) {
      if (!validId(intentId, 'pi_')) throw new Error('invalid_payment_id');
      return readCharge(await stripe<StripeIntent>('payment_intents/' + intentId), intentId);
    },
    async confirmCharge(intentId, attemptId) {
      if (!validId(intentId, 'pi_')) throw new Error('invalid_payment_id');
      const result = await stripe<StripeIntent>('payment_intents/' + intentId + '/confirm', {
        off_session:'true',
      }, attemptId + '/confirm');
      return readCharge(result, intentId);
    },
  };
}
