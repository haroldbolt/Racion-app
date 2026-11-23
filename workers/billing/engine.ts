export const BILLING_CONSENT_VERSION = 'trial-72h-usd18-v1';
export const TRIAL_DURATION_MS = 72 * 60 * 60 * 1000;
export const CHARGE_CENTS = 1800;
const PENDING_CHECK_MS = 5 * 60 * 1000;

export type BillingStatus = 'unregistered' | 'setup_pending' | 'trial_active' | 'charge_pending' | 'paid' | 'canceled' | 'payment_failed';
export type BillingAction = 'status' | 'checkout' | 'cancel' | 'refresh' | 'notify' | 'alarm';
export interface BillingInput {
  uid: string;
  returnOrigin?: string;
  consentVersion?: string;
  sessionId?: string;
}

export interface CheckoutInput {
  uid: string;
  attemptId: string;
  returnOrigin: string;
}

export interface ChargeInput {
  uid: string;
  attemptId: string;
  customerId: string;
  paymentMethodId: string;
}

export interface ChargeResult {
  status: 'needs_confirmation' | 'processing' | 'succeeded' | 'failed';
  id: string;
  uid: string;
  amountCents: number;
  currency: string;
  customerId: string;
}

export type CheckoutResult = { status: 'open' | 'expired' } | {
  status: 'complete';
  uid: string;
  customerId: string;
  paymentMethodId: string;
};

export interface BillingGateway {
  createCheckout(input: CheckoutInput): Promise<{ id: string; url: string }>;
  getCheckout(sessionId: string): Promise<CheckoutResult>;
  // This request must create an unconfirmed intent. The engine saves its ID before charging.
  createCharge(input: ChargeInput): Promise<{ id: string }>;
  confirmCharge(intentId: string, attemptId: string): Promise<ChargeResult>;
  getCharge(intentId: string): Promise<ChargeResult>;
}

export interface BillingRecord {
  uid: string;
  status: BillingStatus;
  attemptId: string;
  consentVersion: string;
  consentAt: number;
  amountCents: number;
  currency: 'USD';
  returnOrigin: string;
  checkoutId?: string;
  checkoutUrl?: string;
  customerId?: string;
  paymentMethodId?: string;
  trialStartedAt?: number;
  trialEndsAt?: number;
  intentId?: string;
  canceledAt?: number;
  chargedAt?: number;
}

export interface BillingStore {
  read(): Promise<BillingRecord | undefined>;
  // Replace the record and its alarm atomically.
  save(record: BillingRecord, nextAlarm: number | null): Promise<void>;
}

export class BillingError extends Error {
  constructor(public readonly httpStatus: number, public readonly code: string) { super(code); }
}

function iso(value?: number) { return value === undefined ? null : new Date(value).toISOString(); }

function view(record: BillingRecord | undefined, now: number) {
  const expired = record?.status === 'trial_active' && now >= record.trialEndsAt!;
  const status: BillingStatus = expired ? 'charge_pending' : record?.status ?? 'unregistered';
  return {
    status,
    canAccess: status === 'paid' || status === 'trial_active',
    trialStartedAt: iso(record?.trialStartedAt),
    trialEndsAt: iso(record?.trialEndsAt),
    chargedAt: iso(record?.chargedAt),
    serverTime: iso(now),
    amountCents: CHARGE_CENTS,
    currency: 'USD' as const,
    renewal: false,
  };
}

type BillingResponse = ReturnType<typeof view> & { checkoutUrl?: string };

export class BillingEngine {
  // Serialize callbacks, HTTP requests and alarms for this one customer's Durable Object,
  // including across awaits to Stripe. Another customer's operations remain independent.
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: BillingStore,
    private readonly gateway: BillingGateway,
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  run(action: BillingAction, input?: BillingInput): Promise<BillingResponse> {
    const receivedAt = this.now();
    const work = this.pending.then(() => this.handle(action, input, receivedAt));
    this.pending = work.then(() => {}, () => {});
    return work;
  }

  private async handle(action: BillingAction, input: BillingInput | undefined, receivedAt: number): Promise<BillingResponse> {
    let record = await this.store.read();
    if (action !== 'alarm' && (!input?.uid || (record && input.uid !== record.uid))) {
      throw new BillingError(403, 'account_mismatch');
    }
    if (action === 'status') return view(record, this.now());
    if (action === 'checkout') return this.checkout(record, input!, receivedAt);
    if (action === 'cancel') {
      if (record?.status === 'canceled') return view(record, this.now());
      if (!record || (record.status !== 'setup_pending' && record.status !== 'trial_active') ||
          (record.trialEndsAt !== undefined && receivedAt >= record.trialEndsAt)) {
        throw new BillingError(409, 'cancellation_unavailable');
      }
      record = { ...record, status: 'canceled', canceledAt: receivedAt, checkoutUrl: undefined };
      await this.store.save(record, null);
      return view(record, this.now());
    }
    if (!record) return view(undefined, this.now());
    if (action === 'refresh' && input?.sessionId && input.sessionId !== record.checkoutId) {
      throw new BillingError(409, 'checkout_mismatch');
    }
    if (action === 'alarm' && (record.status === 'setup_pending' || record.status === 'charge_pending')) {
      // An outage can last longer than Cloudflare's built-in sequence of alarm retries.
      await this.store.save(record, this.now() + PENDING_CHECK_MS);
    }
    if (record.status === 'setup_pending') record = await this.resolveCheckout(record);
    if (record.status === 'trial_active' && this.now() >= record.trialEndsAt!) {
      record = { ...record, status: 'charge_pending' };
      await this.store.save(record, this.now() + PENDING_CHECK_MS);
    }
    if (record.status === 'charge_pending' || (action === 'notify' && record.status === 'payment_failed' && record.intentId)) {
      record = await this.resolvePayment(record);
    } else if (action === 'alarm' && record.status === 'trial_active') {
      // A delayed notification from a previous alarm can arrive after a new one was scheduled.
      await this.store.save(record, record.trialEndsAt!);
    }
    return view(record, this.now());
  }

  private async checkout(record: BillingRecord | undefined, input: BillingInput, receivedAt: number): Promise<BillingResponse> {
    if (input.consentVersion !== BILLING_CONSENT_VERSION || !input.returnOrigin) {
      throw new BillingError(400, 'consent_required');
    }
    if (record?.status === 'setup_pending' && record.checkoutId) {
      record = await this.resolveCheckout(record);
    }
    // Abandoning setup before the first trial starts must not permanently lock the account.
    if (!record || record.status === 'unregistered' ||
        (record.status === 'canceled' && record.trialStartedAt === undefined)) {
      record = {
        uid: input.uid, status: 'setup_pending', attemptId: this.newId(),
        consentVersion: BILLING_CONSENT_VERSION, consentAt: receivedAt,
        amountCents: CHARGE_CENTS, currency: 'USD', returnOrigin: input.returnOrigin,
      };
      await this.store.save(record, this.now() + PENDING_CHECK_MS);
    } else if (record.status !== 'setup_pending') {
      throw new BillingError(409, 'checkout_unavailable');
    }
    if (!record.checkoutId) record = await this.prepareCheckout(record);
    return { ...view(record, this.now()), checkoutUrl: record.checkoutUrl };
  }

  private async prepareCheckout(record: BillingRecord): Promise<BillingRecord> {
    const session = await this.gateway.createCheckout({
      uid: record.uid, attemptId: record.attemptId, returnOrigin: record.returnOrigin,
    });
    if (!session.id || !session.url) throw new Error('invalid_gateway_checkout');
    const prepared = { ...record, checkoutId: session.id, checkoutUrl: session.url };
    await this.store.save(prepared, this.now() + PENDING_CHECK_MS);
    return prepared;
  }

  private async resolveCheckout(record: BillingRecord): Promise<BillingRecord> {
    if (!record.checkoutId) record = await this.prepareCheckout(record);
    const checkout = await this.gateway.getCheckout(record.checkoutId!);
    if (checkout.status === 'expired') {
      const expired = { ...record, status: 'unregistered' as const, checkoutUrl: undefined };
      await this.store.save(expired, null);
      return expired;
    }
    if (checkout.status === 'open') {
      await this.store.save(record, this.now() + PENDING_CHECK_MS);
      return record;
    }
    if (checkout.status !== 'complete' || checkout.uid !== record.uid || !checkout.customerId || !checkout.paymentMethodId) {
      throw new Error('invalid_gateway_setup');
    }
    const startedAt = this.now();
    const active: BillingRecord = {
      ...record, status: 'trial_active', trialStartedAt: startedAt, trialEndsAt: startedAt + TRIAL_DURATION_MS,
      customerId: checkout.customerId, paymentMethodId: checkout.paymentMethodId, checkoutUrl: undefined,
    };
    await this.store.save(active, active.trialEndsAt!);
    return active;
  }

  private validateCharge(record: BillingRecord, charge: ChargeResult) {
    if (charge.uid !== record.uid || charge.id !== record.intentId || charge.customerId !== record.customerId ||
        charge.amountCents !== CHARGE_CENTS || charge.currency.toUpperCase() !== 'USD') {
      throw new Error('invalid_gateway_charge');
    }
  }

  private async resolvePayment(record: BillingRecord): Promise<BillingRecord> {
    if (!record.customerId || !record.paymentMethodId) throw new Error('missing_setup_references');
    if (!record.intentId) {
      const charge = await this.gateway.createCharge({
        uid: record.uid, attemptId: record.attemptId,
        customerId: record.customerId, paymentMethodId: record.paymentMethodId,
      });
      if (!charge.id) throw new Error('missing_charge_id');
      record = { ...record, intentId: charge.id };
      await this.store.save(record, this.now() + PENDING_CHECK_MS);
    }
    let charge = await this.gateway.getCharge(record.intentId!);
    this.validateCharge(record, charge);
    if (record.status === 'charge_pending' && charge.status === 'needs_confirmation') {
      charge = await this.gateway.confirmCharge(record.intentId!, record.attemptId);
      this.validateCharge(record, charge);
    }
    if (charge.status === 'succeeded') {
      const paid = { ...record, status: 'paid' as const, chargedAt: this.now() };
      await this.store.save(paid, null);
      return paid;
    }
    if (charge.status === 'failed') {
      const failed = { ...record, status: 'payment_failed' as const };
      await this.store.save(failed, null);
      return failed;
    }
    if (record.status === 'charge_pending') await this.store.save(record, this.now() + PENDING_CHECK_MS);
    return record;
  }
}
