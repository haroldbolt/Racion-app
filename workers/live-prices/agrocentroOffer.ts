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

interface StoreProduct {
  handle?: string;
  title?: string;
  variants?: {pageInfo?: {hasNextPage?: boolean}; nodes?: Variant[]};
}

async function readStorefront(listing: Listing, fetcher: typeof fetch): Promise<StoreProduct | undefined> {
  try {
    const response = await fetcher(shop + '/api/2026-10/graphql.json', {
      method:'POST', headers:{'content-type':'application/json', Accept:'application/json'},
      body:JSON.stringify({query:document, variables:{handle:listing.handle}}),
      signal:AbortSignal.timeout(5000), redirect:'manual',
    });
    if (!response.ok) return;
    const result = await response.json() as {errors?: unknown; data?: {product?: StoreProduct}};
    if (!result.errors) return result.data?.product ?? undefined;
  } catch {
    // The public Ajax product and cart can still confirm the variant and currency.
  }
}

async function readAjaxProduct(listing: Listing, brand: string, fetcher: typeof fetch): Promise<StoreProduct | undefined> {
  const init = {headers:{Accept:'application/json'}, signal:AbortSignal.timeout(5000), redirect:'manual'} as const;
  const [detail, cart] = await Promise.all([
    fetcher(shop + '/products/' + listing.handle + '.js', init), fetcher(shop + '/cart.js', init),
  ]);
  if (!detail.ok || !cart.ok) return;
  const [item, market] = await Promise.all([detail.json(), cart.json()]) as [
    {handle?: string; title?: string; vendor?: string; variants?: Array<{
      id?: number; title?: string; available?: boolean; barcode?: string | null; price?: number;
    }>}, {currency?: string},
  ];
  if (market.currency !== 'COP' || typeof item.vendor !== 'string' || words(item.vendor) !== brand ||
      !Array.isArray(item.variants) || item.variants.length >= 250) return;
  const nodes: Variant[] = item.variants.map(sku => ({
    id: typeof sku?.id === 'number' && Number.isSafeInteger(sku.id) && sku.id > 0
      ? 'gid://shopify/ProductVariant/' + sku.id : undefined,
    title:sku?.title, availableForSale:sku?.available, barcode:sku?.barcode,
    // Ajax returns integer hundredths of the cart's presentment currency.
    price:typeof sku?.price === 'number' && Number.isSafeInteger(sku.price) && sku.price > 0 && sku.price % 100 === 0
      ? {amount:String(sku.price / 100), currencyCode:market.currency} : undefined,
  }));
  return {handle:item.handle, title:item.title, variants:{nodes, pageInfo:{hasNextPage:false}}};
}

function offerFromProduct(item: StoreProduct | undefined, listing: Listing, brand: string, product: LivePriceProduct): LivePriceOffer | null {
  const variants = item?.variants;
  if (item?.handle !== listing.handle || typeof item.title !== 'string' ||
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
}

export async function findAgrocentroOffer(product: LivePriceProduct, fetcher: typeof fetch): Promise<LivePriceOffer | null> {
  const brand = words(product.brand);
  const plainName = withoutPackageWeight(product.name).trim();
  if (plainName !== product.name.trim() && packageGrams(product.name) !== product.grams) return null;
  const listings = byBrand.get(brand)?.filter(row => row.keys.has(formulaKey(plainName, brand, row.species)));
  if (listings?.length !== 1) return null;
  const listing = listings[0];

  const fromStorefront = offerFromProduct(await readStorefront(listing, fetcher), listing, brand, product);
  if (fromStorefront) return fromStorefront;
  const fromAjax = await readAjaxProduct(listing, brand, fetcher).catch(() => undefined);
  return offerFromProduct(fromAjax, listing, brand, product);
}
