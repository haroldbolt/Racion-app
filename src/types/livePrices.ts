export const LIVE_PRICE_MIN_GRAMS = 10;
export const LIVE_PRICE_MAX_GRAMS = 50000;

export const LIVE_PRICE_CITIES = [
  'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga', 'Pereira', 'Cartagena',
] as const;

export type LivePriceCity = (typeof LIVE_PRICE_CITIES)[number];

export interface LivePriceProduct {
  brand: string;
  name: string;
  grams: number;
  barcode?: string;
}

export interface LivePriceRequest {
  product: LivePriceProduct;
  city: string;
}

export interface LivePriceOffer {
  id: string;
  title: string;
  retailer: string;
  grams: number;
  productPriceCop: number;
  shippingCop: number | null;
  totalCop: number | null;
  pricePerKgCop: number;
  productUrl: string;
  linkSource?: 'retailer' | 'google_shopping';
  stock: 'available' | 'unknown';
}

export type PriceUnavailableReason =
  | 'not_configured'
  | 'quota_exhausted'
  | 'rate_limited'
  | 'upstream_unavailable';

export interface LivePriceResponse {
  status: 'current' | 'stale' | 'unavailable';
  city: string;
  queriedAt: string | null;
  offers: LivePriceOffer[];
  /** Winner among the requested package size and quoted delivery totals. */
  cheapestOfferId: string | null;
  reason?: PriceUnavailableReason;
}

const colombiaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function colombiaPriceDay(date = new Date()): string {
  return colombiaDate.format(date);
}
