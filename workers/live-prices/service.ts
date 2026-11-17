import {
  colombiaPriceDay, isBogotaPostalCode, LIVE_PRICE_CITIES, LIVE_PRICE_MAX_GRAMS, LIVE_PRICE_MIN_GRAMS, type LivePriceCity, type LivePriceOffer, type LivePriceRequest,
  type LivePriceResponse, type PriceUnavailableReason,
} from '../../src/types/livePrices';
import { collectShoppingOffers, formulaSearchName, normalizePriceWords, rankShoppingOffers } from './offers';
import { quotePostalOffers } from './postalShipping';

const MAX_PERIOD_SEARCHES = 250;
const MAX_HOURLY_SEARCHES = 50;
const MAX_CALLER_SEARCHES = 6;
const HOUR = 60 * 60 * 1000;
const ROLLING_PERIOD = 31 * 24 * HOUR;
const budgetKey = 'search-budget';

const cityLocations: Record<LivePriceCity, string> = {
  'Bogotá': 'Bogota, Bogota, Colombia',
  'Medellín': 'Medellin, Antioquia, Colombia',
  Cali: 'Cali, Valle del Cauca, Colombia',
  Barranquilla: 'Barranquilla, Atlantico, Colombia',
  Bucaramanga: 'Bucaramanga, Santander, Colombia',
  Pereira: 'Pereira, Risaralda, Colombia',
  Cartagena: 'Cartagena, Bolivar, Colombia',
};

export interface PriceStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export interface PriceStorageTransactions extends PriceStorage {
  transaction<T>(callback: (transaction: PriceStorage) => Promise<T>): Promise<T>;
}

type ValidRequest = LivePriceRequest & { city: LivePriceCity };

interface CachedPrices {
  queriedAt: string;
  offers: LivePriceOffer[];
  cheapestOfferId: string | null;
}

interface LookupRecord {
  attemptedDay: string;
  reason?: PriceUnavailableReason;
  latest?: CachedPrices;
}

interface Reservation {
  at: number;
  caller: string;
  period: string | null;
}

interface Budget {
  reservations: Reservation[];
  providerBalance?: { key: string; remaining: number };
  providerHourly?: { key: string; remaining: number };
}

interface ProviderBudget {
  remaining: number;
  period: string | null;
  hourlyRemaining: number;
}

class ProviderUnavailable extends Error {
  constructor(public readonly reason: PriceUnavailableReason) {
    super(reason);
  }
}

function validProductText(value: unknown, cap: number): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim().replace(/\s+/g, ' ');
  return result.length >= 2 && result.length <= cap && /\p{L}/u.test(result) &&
    /^[\p{L}\p{N} .,'’&+()/%–-]+$/u.test(result) ? result : null;
}

export function parseLivePriceRequest(input: unknown): ValidRequest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const { product, city, postalCode } = input as Partial<LivePriceRequest>;
  if (!product || typeof product !== 'object' || !LIVE_PRICE_CITIES.includes(city as LivePriceCity)) return null;
  const brand = validProductText(product.brand, 65);
  const name = validProductText(product.name, 135);
  if (!brand || !name || !Number.isInteger(product.grams) || product.grams < LIVE_PRICE_MIN_GRAMS || product.grams > LIVE_PRICE_MAX_GRAMS) return null;
  if (product.barcode != null && (typeof product.barcode !== 'string' || !/^\d{8,14}$/.test(product.barcode))) return null;
  if (postalCode !== undefined && (city !== 'Bogotá' || !isBogotaPostalCode(postalCode))) return null;
  return {
    city: city as LivePriceCity,
    product: { brand, name, grams: product.grams, barcode: product.barcode },
    ...(postalCode === undefined ? {} : { postalCode }),
  };
}

export function unavailablePriceResult(
  city: string,
  reason: PriceUnavailableReason,
  previous?: CachedPrices,
): LivePriceResponse {
  if (previous?.offers.length) return { ...previous, status: 'stale', city, cheapestOfferId: null, reason };
  return { status: 'unavailable', city, queriedAt: null, offers: [], cheapestOfferId: null, reason };
}

export async function hashValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function remainingInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function providerJson(url: URL, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
    const value = await res.json().catch(() => null);
    if (res.status === 402 || (res.status === 429 && /month|credits|quota|run out of searches/i.test(String(value?.error ?? '')))) throw new ProviderUnavailable('quota_exhausted');
    if (res.status === 429) throw new ProviderUnavailable('rate_limited');
    if (!res.ok || !value || typeof value !== 'object' || Array.isArray(value) || value.error) {
      throw new ProviderUnavailable('upstream_unavailable');
    }
    return value;
  } catch (error) {
    if (error instanceof ProviderUnavailable) throw error;
    // Provider requests include a private key. Never reflect the URL or upstream error in a response.
    throw new ProviderUnavailable('upstream_unavailable');
  }
}

async function checkIncludedSearches(key: string, fetcher: typeof fetch): Promise<ProviderBudget> {
  const account = new URL('https://serpapi.com/account.json');
  account.searchParams.set('api_key', key);
  const data = await providerJson(account, fetcher);
  const remaining = remainingInteger(data.plan_searches_left);
  const hourlyLimit = remainingInteger(data.account_rate_limit_per_hour);
  const hourUsage = remainingInteger(data.this_hour_searches);
  if (remaining === null || hourlyLimit === null || hourUsage === null) throw new ProviderUnavailable('upstream_unavailable');
  if (remaining === 0) throw new ProviderUnavailable('quota_exhausted');
  if (hourUsage >= hourlyLimit) throw new ProviderUnavailable('rate_limited');
  const period = typeof data.plan_renewal_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.plan_renewal_date)
    ? data.plan_renewal_date : null;
  return { remaining, period, hourlyRemaining: hourlyLimit - hourUsage };
}

function freshResponse(city: LivePriceCity, prices: CachedPrices): LivePriceResponse {
  return { ...prices, city, status: 'current' };
}

function queryPack(grams: number): string {
  return grams < 1000 || grams % 1000 !== 0 ? `${grams} g` : `${grams / 1000} kg`;
}

function providerObservedAt(data: Record<string, unknown>, current: Date): Date {
  const stamp = (data.search_metadata as { processed_at?: string } | undefined)?.processed_at;
  const parsed = typeof stamp === 'string' ? Date.parse(stamp) : NaN;
  return Number.isFinite(parsed) && parsed <= current.getTime() ? new Date(parsed) : current;
}

export class LivePriceService {
  private readonly inFlight = new Map<string, Promise<LivePriceResponse>>();

  constructor(
    private readonly store: PriceStorageTransactions,
    private readonly key: string | undefined,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async search(request: ValidRequest, caller: string): Promise<LivePriceResponse> {
    const { product, city, postalCode } = request;
    // The durable cache and concurrent lookup contain city offers only.
    const baseline = await this.searchCity({ product, city }, caller);
    if (city !== 'Bogotá' || !isBogotaPostalCode(postalCode)) return baseline;
    return quotePostalOffers(baseline, product, postalCode, this.fetcher);
  }

  private async searchCity(request: ValidRequest, caller: string): Promise<LivePriceResponse> {
    const { product, city } = request;
    const lookup = await hashValue(JSON.stringify([
      normalizePriceWords(formulaSearchName(product)), product.grams, product.barcode ?? null, city,
    ]));
    const running = this.inFlight.get(lookup);
    if (running) return running;
    const operation = this.findPrices(request, lookup, caller);
    this.inFlight.set(lookup, operation);
    try {
      return await operation;
    } finally {
      this.inFlight.delete(lookup);
    }
  }

  private async findPrices(request: ValidRequest, lookup: string, caller: string): Promise<LivePriceResponse> {
    const key = this.key?.trim();
    const cacheKey = `lookup:${lookup}`;
    const today = colombiaPriceDay(this.now());
    const record = await this.store.get<LookupRecord>(cacheKey);
    const cached = record?.latest;
    // Revalidate durable snapshots so a parser correction also applies to older cached offers.
    const previous = cached && { queriedAt: cached.queriedAt, ...rankShoppingOffers(cached.offers, request.product.grams) };
    if (previous && colombiaPriceDay(new Date(previous.queriedAt)) === today) return freshResponse(request.city, previous);
    if (!key) return unavailablePriceResult(request.city, 'not_configured', previous);
    if (record?.attemptedDay === today) {
      return unavailablePriceResult(request.city, record.reason ?? 'upstream_unavailable', previous);
    }

    let attemptedDay: string | undefined;
    try {
      const included = await checkIncludedSearches(key, this.fetcher);
      const reservationDate = this.now();
      const refusal = await this.reserve(cacheKey, previous, caller, included, reservationDate);
      if (refusal) return unavailablePriceResult(request.city, refusal, previous);
      attemptedDay = colombiaPriceDay(reservationDate);
      const shopping = new URL('https://serpapi.com/search.json');
      shopping.search = new URLSearchParams({
        engine: 'google_shopping',
        q: `${formulaSearchName(request.product)} ${queryPack(request.product.grams)}`,
        gl: 'co', hl: 'es', location: cityLocations[request.city], no_cache: 'true', api_key: key,
      }).toString();
      const data = await providerJson(shopping, this.fetcher);
      const ended = this.now();
      const queriedAt = providerObservedAt(data, ended).toISOString();
      const items = Array.isArray(data.shopping_results) ? data.shopping_results : [];
      const ranked = rankShoppingOffers(collectShoppingOffers(items, request.product), request.product.grams);
      const latest: CachedPrices = { queriedAt, ...ranked };
      const isPresentDay = colombiaPriceDay(new Date(queriedAt)) === colombiaPriceDay(ended);
      await this.store.put<LookupRecord>(cacheKey, {
        attemptedDay,
        latest: latest.offers.length > 0 || !previous ? latest : previous,
        ...(!latest.offers.length && previous?.offers.length ? { reason: 'upstream_unavailable' as const } : {}),
      });
      if (!isPresentDay || (!latest.offers.length && previous?.offers.length)) {
        return unavailablePriceResult(request.city, 'upstream_unavailable', latest.offers.length ? latest : previous);
      }
      return freshResponse(request.city, latest);
    } catch (error) {
      const reason = error instanceof ProviderUnavailable ? error.reason : 'upstream_unavailable';
      const reserved = await this.store.get<LookupRecord>(cacheKey);
      if (attemptedDay && reserved?.attemptedDay === attemptedDay) {
        await this.store.put<LookupRecord>(cacheKey, { ...reserved, reason });
      }
      return unavailablePriceResult(request.city, reason, previous);
    }
  }

  private async reserve(
    cacheKey: string,
    previous: CachedPrices | undefined,
    caller: string,
    included: ProviderBudget,
    date: Date,
  ): Promise<PriceUnavailableReason | null> {
    return await this.store.transaction(async (transaction) => {
      const now = date.getTime();
      const day = colombiaPriceDay(date);
      const currentRecord = await transaction.get<LookupRecord>(cacheKey);
      if (currentRecord?.attemptedDay === day) return currentRecord.reason ?? 'upstream_unavailable';
      const budget = await transaction.get<Budget>(budgetKey);
      const history = (budget?.reservations ?? []).filter(({ at }) => at > now - ROLLING_PERIOD);
      const inPeriod = included.period ? history.filter(({ period }) => included.period === period || period === null) : history;
      const balanceKey = included.period ?? day;
      const remaining = budget?.providerBalance?.key === balanceKey
        ? Math.min(budget.providerBalance.remaining, included.remaining) : included.remaining;
      if (remaining <= 0 || inPeriod.length >= MAX_PERIOD_SEARCHES) return 'quota_exhausted';
      const recent = history.filter(({ at }) => at > now - HOUR);
      const hourKey = date.toISOString().slice(0, 13);
      const hourlyRemaining = budget?.providerHourly?.key === hourKey
        ? Math.min(budget.providerHourly.remaining, included.hourlyRemaining) : included.hourlyRemaining;
      if (recent.length >= MAX_HOURLY_SEARCHES || hourlyRemaining <= 0 ||
        recent.filter((item) => item.caller === caller).length >= MAX_CALLER_SEARCHES) return 'rate_limited';

      // Reserve before calling the provider. A timeout may have reached Google and remains charged here.
      await transaction.put<Budget>(budgetKey, {
        reservations: [...history, { at: now, caller, period: included.period }],
        providerBalance: { key: balanceKey, remaining: remaining - 1 },
        providerHourly: { key: hourKey, remaining: hourlyRemaining - 1 },
      });
      await transaction.put<LookupRecord>(cacheKey, { attemptedDay: day, latest: previous });
      return null;
    });
  }
}
