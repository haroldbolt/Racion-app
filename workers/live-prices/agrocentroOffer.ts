import type { LivePriceOffer, LivePriceProduct } from '../../src/types/livePrices';
import catalogue from './agrocentroIndex.json';
import { normalizePriceWords, packageGrams, withoutPackageWeight } from './offers';

const shop = 'https://cultivacenter.com';
const document = `query ProductOffer($handle: String!) @inContext(country: CO) {
  product(handle: $handle) {
    handle title
    variants(first: 100) {
      pageInfo { hasNextPage }
      nodes { id title barcode availableForSale price { amount currencyCode } }
    }
  }
}`;

function words(value: string): string {
  return normalizePriceWords(value.replace(/\+/g, ' plus '));
}

function formulaKey(name: string, brand: string, species: string): string {
  let key = words(name);
  if (key.startsWith(brand + ' ')) key = key.slice(brand.length + 1);
  // Strip only redundant descriptions of the matching species. Preserve variant,
  // age, flavour and form discriminators in the formula itself.
  if (species === 'cat') {
    key = key.replace(/\s+(?:(?:alimento seco|concentrado) para )?gatos adultos$/, '');
    if (/\bsterili[sz]ed\b/.test(key)) key = key.replace(/ neutered cat dry$/, '');
  } else {
    key = key.replace(/\s+(?:(?:alimento seco|concentrado) para )?perros adultos$/, '');
  }
  return key;
}

interface Listing { species: string; handle: string; keys: Set<string> }

const byBrand = new Map<string, Listing[]>();
for (const [brandName, species, handle, shopName, officialName] of catalogue) {
  const brand = words(brandName);
  const keys = new Set([shopName, officialName].filter(Boolean).map(name => formulaKey(name, brand, species)));
  const group = byBrand.get(brand) ?? [];
  group.push({species, handle, keys});
  byBrand.set(brand, group);
}

interface Variant {
  id?: string;
  title?: string;
  availableForSale?: boolean;
  barcode?: string | null;
  price?: { amount?: string; currencyCode?: string };
}

export async function findAgrocentroOffer(product: LivePriceProduct, fetcher: typeof fetch): Promise<LivePriceOffer | null> {
  const brand = words(product.brand);
  const plainName = withoutPackageWeight(product.name).trim();
  if (plainName !== product.name.trim() && packageGrams(product.name) !== product.grams) return null;
  const listings = byBrand.get(brand)?.filter(row => row.keys.has(formulaKey(plainName, brand, row.species)));
  if (listings?.length !== 1) return null;
  const listing = listings[0];

  try {
    const response = await fetcher(shop + '/api/2026-10/graphql.json', {
      method:'POST', headers:{'content-type':'application/json', Accept:'application/json'},
      body:JSON.stringify({query:document, variables:{handle:listing.handle}}),
      signal:AbortSignal.timeout(5000), redirect:'error',
    });
    if (!response.ok) return null;
    const result = await response.json() as {errors?: unknown; data?: {product?: {handle?: string; title?: string;
      variants?: {pageInfo?: {hasNextPage?: boolean}; nodes?: Variant[]}}}};
    const item = result.data?.product, variants = item?.variants;
    if (result.errors || item?.handle !== listing.handle || typeof item.title !== 'string' ||
        !listing.keys.has(formulaKey(item.title, brand, listing.species)) ||
        variants?.pageInfo?.hasNextPage !== false || !Array.isArray(variants.nodes) ||
        !variants.nodes.every(sku => typeof sku?.title === 'string' && sku.title.trim())) return null;

    const matches = variants.nodes.filter(sku => typeof sku?.title === 'string' && packageGrams(sku.title) === product.grams);
    if (matches.length !== 1) return null;
    const sku = matches[0];
    if (product.barcode && sku.barcode !== product.barcode) return null;
    const id = typeof sku.id === 'string' && /^gid:\/\/shopify\/ProductVariant\/([1-9]\d*)$/.exec(sku.id)?.[1];
    if (!id || typeof sku.availableForSale !== 'boolean' || sku.price?.currencyCode !== 'COP' ||
        typeof sku.price.amount !== 'string' || !/^\d{1,9}(?:\.0+)?$/.test(sku.price.amount)) return null;
    const price = Number(sku.price.amount);
    if (!Number.isSafeInteger(price) || price <= 0) return null;
    return {
      id:'agrocentro-' + id, title:item.title + ' · ' + sku.title, retailer:'Agrocentro Pets',
      grams:product.grams, productPriceCop:price, pricePerKgCop:Math.round(price * 1000 / product.grams),
      shippingCop:null, totalCop:null, stock:sku.availableForSale ? 'available' : 'out_of_stock',
      productUrl:shop + '/products/' + listing.handle + '?variant=' + id, linkSource:'retailer',
    };
  } catch {
    return null;
  }
}
