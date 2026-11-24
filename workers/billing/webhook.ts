import { hotmartCheckoutUrl, purchaseTerms } from '../../src/utils/hotmart.mjs';
import { buyerKey, normalizedEmail, type PurchaseNotice, type PurchaseState } from './engine';

export interface HotmartEnv {
  HOTMART_PRODUCT_ID?: string;
  HOTMART_OFFER_CODE?: string;
  HOTMART_CHECKOUT_URL?: string;
  HOTMART_HOTTOK?: string;
}

export function checkoutUrl(env: HotmartEnv): string | null {
  const href = hotmartCheckoutUrl(env.HOTMART_CHECKOUT_URL);
  if (!href) return null;
  const url = new URL(href);
  const offers = url.searchParams.getAll('off');
  if (offers.length && (offers.length !== 1 || offers[0] !== env.HOTMART_OFFER_CODE)) return null;
  return url.href;
}

export function productConfigured(env: HotmartEnv): boolean {
  return /^[1-9]\d*$/.test(env.HOTMART_PRODUCT_ID || '') && Boolean(env.HOTMART_OFFER_CODE?.trim());
}

export async function validHottok(received: string | null, configured: string): Promise<boolean> {
  if (!received || received.length > 1024) return false;
  const encoder = new TextEncoder();
  const [presented, expected] = await Promise.all([received, configured].map(value =>
    crypto.subtle.digest('SHA-256', encoder.encode(value)).then(result => new Uint8Array(result))));
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ presented[i];
  return difference === 0;
}

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const events: Record<string, {state: PurchaseState; statuses: string[]}> = {
  PURCHASE_APPROVED: {state:'paid', statuses:['APPROVED', 'COMPLETE']},
  PURCHASE_COMPLETE: {state:'paid', statuses:['COMPLETE', 'APPROVED']},
  PURCHASE_BILLET_PRINTED: {state:'pending', statuses:['PRINTED_BILLET', 'WAITING_PAYMENT', 'STARTED']},
  PURCHASE_DELAYED: {state:'pending', statuses:['OVERDUE', 'DELAYED', 'WAITING_PAYMENT']},
  PURCHASE_REFUNDED: {state:'revoked', statuses:['REFUNDED']},
  PURCHASE_CHARGEBACK: {state:'revoked', statuses:['CHARGEBACK']},
  PURCHASE_CANCELED: {state:'revoked', statuses:['CANCELLED', 'CANCELED']},
  PURCHASE_EXPIRED: {state:'revoked', statuses:['EXPIRED']},
  PURCHASE_PROTEST: {state:'revoked', statuses:['PROTESTED', 'DISPUTE']},
};

const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(value);
const priceIs25 = (p: Record<string, unknown>) => p.currency_value === purchaseTerms.currency && p.value === purchaseTerms.amountCents / 100;

// Hotmart Webhook 2.0: original_offer_price is the listed currency while
// full_price may include exchange, taxes and local payment processing fees.
export async function purchaseNotice(event: unknown, env: HotmartEnv): Promise<PurchaseNotice | null> {
  const envelope = fields(event);
  if (envelope.version !== '2.0.0' || !identifier(envelope.id) || typeof envelope.event !== 'string') {
    throw new Error('invalid_webhook');
  }
  if (!Object.hasOwn(events, envelope.event)) return null;
  const data = fields(envelope.data);
  if (String(fields(data.product).id) !== env.HOTMART_PRODUCT_ID) return null;
  const type = events[envelope.event];
  const purchase = fields(data.purchase);
  if (!identifier(purchase.transaction) || !type.statuses.includes(String(purchase.status))) throw new Error('invalid_purchase');
  const email = normalizedEmail(fields(data.buyer).email);
  // Revoke by transaction ID even if a refund omits the original offer or email.
  if (type.state !== 'revoked') {
    const offer = fields(purchase.offer);
    if (offer.code !== env.HOTMART_OFFER_CODE || data.subscription != null ||
        Number(purchase.recurrence_number ?? 0) > 0 || purchase.subscription_anticipation_purchase === true) return null;
    if (type.state === 'paid') {
      const price = fields(purchase.price);
      const original = purchase.original_offer_price == null ? price : fields(purchase.original_offer_price);
      if (!priceIs25(original) || (price.currency_value === 'USD' && !priceIs25(price)) || offer.coupon_code) return null;
    }
    if (!email) throw new Error('missing_buyer');
  }
  return {eventId:envelope.id, transaction:purchase.transaction, buyerKey:email ? await buyerKey(email) : null, state:type.state};
}
