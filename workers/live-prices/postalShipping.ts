import type { LivePriceOffer, LivePriceProduct, LivePriceResponse } from '../../src/types/livePrices';
import { findAgrocentroOffer } from './agrocentroOffer';
import { formulaSearchName, matchesFormula, normalizePriceWords, packageGrams, rankShoppingOffers, withoutPackageWeight } from './offers';

const storeId = 5624899;
const storefront = `https://storefront-api.tiendanube.com/2026-11/stores/${storeId}`;
const variantFields = 'id,name,handle,variants.id,variants.values,variants.barcode,variants.visible,variants.price,variants.promotional_price,variants.stock,variants.stock_management';
const productsPerPage = 8;
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function numericId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function decimalCop(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,9}\.00$/.test(value)) return null;
  return Number(value);
}

async function storefrontJson(fetcher: typeof fetch, url: string | URL, init?: RequestInit): Promise<JsonRecord> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(4000), redirect: 'manual',
    ...init, headers: { Accept: 'application/json', ...init?.headers },
  });
  return response.ok ? record(await response.json()) : {};
}

function postalShippingAmount(options: unknown): number | null {
  if (!Array.isArray(options)) return null;
  const amounts = options.flatMap((item): number[] => {
    const option = record(item);
    if (typeof option.code !== 'string' || !option.code.trim() || typeof option.name !== 'string' || !option.name.trim()) return [];
    const label = normalizePriceWords([option.code, option.name, option.detail].join(' '));
    if (/\b(?:retir[oa]\w*|recog\w*|recib\w* en tienda|pick\s*up|local pickup)\b/.test(label)) return [];
    const amount = decimalCop(option.price);
    return amount === null ? [] : [amount];
  });
  return amounts.length > 0 ? Math.min(...amounts) : null;
}

function laiaVariants(detail: JsonRecord, productId: number, product: LivePriceProduct): LivePriceOffer[] {
  if (detail.id !== productId || typeof detail.handle !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(detail.handle) ||
      typeof detail.name !== 'string' || !matchesFormula(detail.name, product) || !Array.isArray(detail.variants)) return [];
  const title = detail.name;
  if (withoutPackageWeight(title) !== title && packageGrams(title) !== product.grams) return [];
  // Some stores attach a single barcode to every size. Such a code does not identify a particular bag.
  const variants = detail.variants.map(record);
  return variants.flatMap((variant): LivePriceOffer[] => {
    if (!numericId(variant.id) || variant.visible !== true || !Array.isArray(variant.values)) return [];
    const labels = variant.values.map(value => typeof value === 'string' ? value : '').join(' ');
    if (packageGrams(labels) !== product.grams || /\b(?:gratis|regalo)\b/i.test(labels)) return [];
    if (product.barcode && typeof variant.barcode === 'string' && /^\d{8,14}$/.test(variant.barcode) &&
        variant.barcode !== product.barcode && variants.filter(item => item.barcode === variant.barcode).length === 1) return [];
    const regular = decimalCop(variant.price);
    const promo = decimalCop(variant.promotional_price);
    const productPriceCop = promo !== null && promo > 0 && (regular === null || promo < regular) ? promo : regular;
    if (productPriceCop === null || productPriceCop <= 0) return [];
    let stock: LivePriceOffer['stock'] = 'unknown';
    if (variant.stock_management === false && variant.stock === null) stock = 'available';
    if (variant.stock_management === true && typeof variant.stock === 'number' && Number.isSafeInteger(variant.stock)) {
      stock = variant.stock > 0 ? 'available' : 'out_of_stock';
    }
    return [{
      id: 'laia-' + variant.id, title, retailer:'Laia Pets', grams:product.grams, productPriceCop, stock,
      shippingCop:null, totalCop:null, pricePerKgCop:Math.round(productPriceCop * 1000 / product.grams),
      productUrl:`https://www.laiapets.com.co/productos/${detail.handle}/?variant=${variant.id}`, linkSource:'retailer',
    }];
  });
}

async function findLaiaOffer(product: LivePriceProduct, postalCode: string, fetcher: typeof fetch): Promise<LivePriceOffer | null> {
  // The search index omits variant labels. Fetch the candidate's actual detail to confirm formula and presentation.
  const query = normalizePriceWords(withoutPackageWeight(formulaSearchName(product))).split(' ').slice(0, 4).join(' ');
  const search = new URL(`${storefront}/search/products`);
  search.search = new URLSearchParams({ q: query, fields:'id', per_page:String(productsPerPage) }).toString();
  const [store, result] = await Promise.all([
    storefrontJson(fetcher, `${storefront}?fields=id,country,currency`), storefrontJson(fetcher, search),
  ]);
  if (store.id !== storeId || store.country !== 'CO' || store.currency !== 'COP' || !Array.isArray(result.data)) return null;
  const ids = [...new Set(result.data.slice(0, productsPerPage).map(item => record(item).id).filter(numericId))];
  const details = await Promise.all(ids.map(id => storefrontJson(fetcher, `${storefront}/products/${id}?fields=${variantFields}`)));
  const matches = details.flatMap((detail, index) => laiaVariants(detail, ids[index], product));
  if (matches.length !== 1) return null;
  const offer = matches[0];
  if (offer.stock !== 'available') return offer;
  const variantId = Number(new URL(offer.productUrl).searchParams.get('variant'));
  const quote = await storefrontJson(fetcher, `${storefront}/shipping-options`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({zip_code:postalCode, variant_id:variantId, quantity:1}),
  }).catch(() => ({} as JsonRecord));
  const shippingCop = postalShippingAmount(quote.shipping_options);
  return shippingCop === null ? offer : {...offer, shippingCop, shippingPostalCode:postalCode, totalCop:offer.productPriceCop + shippingCop};
}

export async function quotePostalOffers(
  baseline: LivePriceResponse | Promise<LivePriceResponse>, product: LivePriceProduct, postalCode: string, fetcher: typeof fetch,
  now: () => Date = () => new Date(),
): Promise<LivePriceResponse> {
  // Merchant lookups need neither Google Shopping results nor a SerpApi key. Run them concurrently.
  const [city, laia, agrocentro] = await Promise.all([
    baseline, findLaiaOffer(product, postalCode, fetcher).catch(() => null),
    findAgrocentroOffer(product, fetcher).catch(() => null),
  ]);
  const indexOffers = city.offers.map(offer => ({...offer, shippingCop:null, shippingPostalCode:undefined, totalCop:null}));
  const direct = [laia, agrocentro].filter((offer): offer is LivePriceOffer => offer !== null);
  if (!direct.length) return {...city, offers:indexOffers, cheapestOfferId:null};
  const retailers = new Set(direct.map(offer => normalizePriceWords(offer.retailer)));
  const remaining = city.status === 'current' ? indexOffers.filter(offer =>
    offer.grams !== product.grams || !retailers.has(normalizePriceWords(offer.retailer))) : [];
  return {
    status:'current', city:city.city, queriedAt:now().toISOString(),
    ...rankShoppingOffers([...direct, ...remaining], product.grams),
  };
}
