export const purchaseTerms = Object.freeze({ amountCents: 2500, currency: 'USD', renewal: false });

export function hasPurchaseTerms(value) {
  return value?.amountCents === purchaseTerms.amountCents &&
    value.currency === purchaseTerms.currency && value.renewal === purchaseTerms.renewal;
}

/** Return only a direct offer link on Hotmart's checkout origin. */
export function hotmartCheckoutUrl(value) {
  if (typeof value !== 'string') return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  return url.origin === 'https://pay.hotmart.com' && !url.username && !url.password && !url.hash &&
    /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) ? url.href : null;
}
