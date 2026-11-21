import type { FoodItem, FoodPriceBasis, Species } from '../types';
import { enrichOnlineNutrition } from './manufacturerNutrition';
import { parseVariantWeight } from './shopifyCatalogService';

const storeId = 5624899;
const storefront = `https://storefront-api.tiendanube.com/2026-11/stores/${storeId}`;
const merchantOrigin = 'https://www.laiapets.com.co';
const detailFields = 'id,name,handle,description,images,variants,categories,tags,brand';
const maximumProducts = 8;
const cacheLifetimeMs = 5 * 60 * 1000;
export interface FoodCatalogResult {
  foods: FoodItem[];
  unavailableSources: string[];
}
const cache = new Map<string, { expiresAt: number; result: FoodCatalogResult }>();

interface Presentation {
  packageKg: number;
  priceCop?: number;
  sourceUrl: string;
}

interface CatalogListing {
  id: string;
  title: string;
  brand: string;
  retailer: string;
  productUrl: string;
  species: Species;
  type: FoodItem['type'];
  observedAt: string;
  presentations: Presentation[];
  imageUrl?: string;
  nutritionalUse?: FoodItem['nutritionalUse'];
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function plainText(value: unknown): string {
  return text(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(aacute|eacute|iacute|oacute|uacute|ntilde|uuml|amp|nbsp);/gi, (entity) => ({
      '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó',
      '&uacute;': 'ú', '&ntilde;': 'ñ', '&uuml;': 'ü', '&amp;': '&', '&nbsp;': ' ',
    }[entity.toLowerCase()] ?? ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalized(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function numericId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function positivePrice(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value))) return undefined;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

/** A package change must never carry the previous package's price or barcode. */
export function selectFoodPackage(food: FoodItem, packageKg?: number): FoodItem {
  const packageQuote = food.packagePrices?.find((price) => price.packageKg === packageKg);
  const priceBasis = packageKg === undefined ? undefined
    : food.priceBasis?.packageKg === packageKg ? food.priceBasis
    : packageQuote;
  return {
    ...food,
    bagSizeKg: packageKg,
    barcode: food.bagSizeKg === packageKg ? food.barcode : undefined,
    priceBasis,
    buyUrl: priceBasis?.sourceUrl || packageQuote?.sourceUrl || food.storeProductUrl || food.fichaNutricional?.fuenteUrl || food.buyUrl,
  };
}

function speciesIn(value: string): Set<Species> {
  const found = new Set<Species>();
  if (/\b(?:gatos?|gatas?|gatitos?|gaticos?|felinos?|feline|cats?|kittens?)\b/.test(value)) found.add('cat');
  if (/\b(?:perros?|perras?|caninos?|canine|dogs?|pupp(?:y|ies))\b/.test(value)) found.add('dog');
  return found;
}

function foodFromDetail(
  detail: JsonRecord,
  species: Species,
  queryNumbers: string[],
  expectedType?: FoodItem['type'],
): FoodItem | null {
  if (!numericId(detail.id)) return null;
  const title = plainText(detail.name);
  const handle = text(detail.handle);
  if (!title || title.length > 250 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(handle)) return null;
  const titleNumbers = new Set(normalized(title).match(/\d+(?:[.,]\d+)?/g) ?? []);
  if (queryNumbers.some((number) => !titleNumbers.has(number))) return null;

  const categories = Array.isArray(detail.categories) ? detail.categories.map((value) => {
    const category = record(value);
    return `${text(category.name)} ${text(category.google_shopping_category)}`;
  }).join(' ') : '';
  const tags = Array.isArray(detail.tags) ? detail.tags.map(text).join(' ') : text(detail.tags);
  const identity = normalized(`${title} ${categories} ${tags}`);
  if (/\b(?:juguet\w*|collar\w*|correas?|camas?|arener\w*|arenas?|palas?|pipetas?|desparas\w*|shamp\w*|champ\w*|medicamentos?|antiparas\w*|comeder\w*|bebeder\w*|platos?|contenedor\w*|transportador\w*|suplement\w*|vitaminas?)\b/.test(
    normalized(`${title} ${categories}`),
  )) return null;

  const foundSpecies = speciesIn(identity);
  if (foundSpecies.size !== 1 || !foundSpecies.has(species)) return null;

  const wet = /\b(?:humed[oa]s?|wet)\b/.test(identity);
  const dry = /\b(?:sec[oa]s?|dry|concentrad[oa]s?|croquetas?|kibbles?)\b/.test(identity);
  const raw = /\b(?:barf|aliment[oa]s? crud[oa]s?)\b/.test(identity);
  if (Number(wet) + Number(dry) + Number(raw) !== 1) return null;
  const type: FoodItem['type'] = wet ? 'wet' : raw ? 'barf' : 'dry';
  if (expectedType && expectedType !== type) return null;

  const productUrl = `${merchantOrigin}/productos/${handle}/`;
  const observedAt = new Date().toISOString();
  const variants = Array.isArray(detail.variants) ? detail.variants.map(record) : [];
  const presentations = variants.flatMap((variant): Array<{ packageKg: number; priceCop?: number; sourceUrl: string }> => {
    if (variant.visible === false || (variant.stock_management === true && typeof variant.stock === 'number' && variant.stock <= 0) || !Array.isArray(variant.values)) return [];
    const values = variant.values.map(text).filter(Boolean);
    // A gift, combo or multipack is a distinct presentation, not a single bag.
    if (/\b(?:packs?|combos?|gratis|regalos?|unidades?|units?)\b|\+|\bx\s*\d+\b|\d+\s*x\b/i.test(values.join(' '))) return [];
    const parsed = values.map(parseVariantWeight).filter((weight) => !weight.isAmbiguous && weight.kg !== null);
    if (parsed.length !== 1 || parsed[0].kg! <= 0 || parsed[0].kg! > 100) return [];
    const regular = positivePrice(variant.price);
    const promotional = positivePrice(variant.promotional_price);
    const priceCop = promotional && (!regular || promotional < regular) ? promotional : regular;
    const sourceUrl = numericId(variant.id) ? `${productUrl}?variant=${variant.id}` : productUrl;
    return [{ packageKg: parsed[0].kg!, priceCop, sourceUrl }];
  });
  const brand = /^agility gold\b/i.test(title) ? 'Agility Gold' : plainText(detail.brand);
  const images = Array.isArray(detail.images) ? detail.images.map(record) : [];
  const imageUrl = images.map((image) => httpsUrl(image.src)).find(Boolean);
  return fromListing({
    id: `online_laia_${detail.id}`, retailer: 'Laia Pets', brand, title, productUrl, species, type,
    observedAt, presentations, imageUrl,
  }, identity);
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function fromListing(listing: CatalogListing, identity: string): FoodItem {
  const {id, retailer, brand, title, productUrl, species, type, observedAt, presentations, imageUrl} = listing;
  const availableSizesKg = [...new Set(presentations.map(({ packageKg }) => packageKg))].sort((a, b) => a - b);
  const packagePrices: FoodPriceBasis[] = availableSizesKg.flatMap((packageKg) => {
    const matching = presentations.filter((pack) => pack.packageKg === packageKg);
    const prices = matching.map((pack) => pack.priceCop);
    if (prices.some((price) => price === undefined) || new Set(prices).size !== 1) return [];
    return [{ packageKg, priceCop: prices[0]!, source: 'online', observedAt, storeName: retailer, sourceUrl: matching[0].sourceUrl, shippingCop: null }];
  });
  const formula = title.replace(/\s+[–—|-]\s+(?:alimento|concentrado|croquetas)\b.*$/i, '').trim();
  const name = brand && normalized(formula).startsWith(normalized(brand) + ' ') ? formula.slice(brand.length).trim() : formula;
  const lifeStage = /\b(?:gatitos?|gaticos?|kittens?)\b/.test(identity) ? 'kitten'
    : /\b(?:cachorros?|pupp(?:y|ies))\b/.test(identity) ? (species === 'cat' ? 'kitten' : 'puppy')
    : /\b(?:senior|mature)\b/.test(identity) ? 'senior'
    : /\b(?:adult[oa]s?|adults?)\b/.test(normalized(title)) ? 'adult' : 'all';
  const priceBasis = packagePrices.find((price) => price.packageKg === availableSizesKg[0]);
  return {
    id, sourceFoodId: id, storeName: retailer, storeProductUrl: productUrl, brand, name, species, type, lifeStage,
    lifeStageKnown: lifeStage !== 'all' || /todas las etapas|all life stages/.test(normalized(title)),
    nutritionalUse: listing.nutritionalUse ?? (/\b(?:snacks?|premios?|golosinas?|galletas?)\b/.test(normalized(title)) ? 'treat' : undefined),
    kcalPerKg: 0, proteinPct: 0, fatPct: 0, fiberPct: 0, moisturePct: 0, country: 'Colombia',
    bagSizeKg: availableSizesKg[0], availableSizesKg, packagePrices, priceBasis, imageUrl,
    buyUrl: priceBasis?.sourceUrl || productUrl,
    labelStatus: 'unconfirmed', dataSource: retailer, fichaNutricional: {
      coincidenciaEstado: 'pendiente', fuenteNombre: retailer, fuenteUrl: productUrl,
      fechaConsulta: observedAt, mercado: 'Colombia', notasRevision: 'Presentaciones publicadas por la tienda.',
    },
  };
}

async function storefrontJson(url: URL | string, signal: AbortSignal): Promise<JsonRecord> {
  const response = await fetch(url, {
    signal,
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    redirect: 'error',
  });
  if (!response.ok) throw new Error('No pudimos consultar el catálogo en internet. Inténtalo de nuevo.');
  return record(await response.json());
}

async function searchLaia(searchable: string, species: Species, foodType: FoodItem['type'] | undefined, combined: AbortSignal): Promise<FoodCatalogResult> {
  const searchUrl = new URL(`${storefront}/search/products`);
  searchUrl.search = new URLSearchParams({ q: searchable, fields: 'id', per_page: String(maximumProducts) }).toString();
  const [metadata, result] = await Promise.all([
    storefrontJson(`${storefront}?fields=id,country,currency`, combined),
    storefrontJson(searchUrl, combined),
  ]);
  if (metadata.id !== storeId || metadata.country !== 'CO' || metadata.currency !== 'COP' || !Array.isArray(result.data)) {
    throw new Error('No pudimos validar el catálogo en internet. Inténtalo de nuevo.');
  }

  const ids = [...new Set(result.data.map((item) => record(item).id).filter(numericId))].slice(0, maximumProducts);
  const queryNumbers = normalized(searchable).match(/\d+(?:[.,]\d+)?/g) ?? [];
  const foods: FoodItem[] = [];
  let incomplete = false;
  for (let offset = 0; offset < ids.length; offset += 3) {
    const products = await Promise.allSettled(ids.slice(offset, offset + 3).map(async (id) => {
      const detailUrl = new URL(`${storefront}/products/${id}`);
      detailUrl.searchParams.set('fields', detailFields);
      const detail = await storefrontJson(detailUrl, combined);
      const food = detail.id === id ? foodFromDetail(detail, species, queryNumbers, foodType) : null;
      return food ? enrichOnlineNutrition(food, plainText(detail.name), text(detail.description), combined) : null;
    }));
    for (const result of products) {
      if (result.status === 'rejected') incomplete = true;
      else if (result.value) foods.push(result.value);
    }
    if (combined.aborted) break;
  }

  return {foods, unavailableSources: incomplete ? ['Laia Pets'] : []};
}

export function getColombiaCatalogUrl(): string | undefined {
  const env = import.meta.env;
  if (!env) return undefined;
  if (env.VITE_PRICE_API_URL?.trim()) return new URL('/api/colombia-foods', new URL(env.VITE_PRICE_API_URL.trim(), window.location.origin)).href;
  return env.DEV ? new URL('/api/colombia-foods', window.location.origin).href
    : 'https://racion-live-prices.jumer4.workers.dev/api/colombia-foods';
}

async function searchColombianStores(endpoint: string, searchable: string, species: Species, foodType: FoodItem['type'] | undefined, signal: AbortSignal): Promise<FoodCatalogResult> {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({q: searchable, species, ...(foodType ? {type:foodType} : {})}).toString();
  const body = await storefrontJson(url, signal);
  if (!Array.isArray(body.foods) || !Array.isArray(body.unavailableSources)) throw new Error('Respuesta de tiendas incompleta.');
  const unavailableSources = body.unavailableSources.map(text).filter(Boolean);
  const queryNumbers = normalized(searchable).match(/\d+(?:[.,]\d+)?/g) ?? [];
  const listings = new Map<string, {food: FoodItem; title: string; description: string}>();
  for (const raw of body.foods.slice(0, 32)) {
    const row = record(raw);
    const productUrl = httpsUrl(row.productUrl);
    const title = plainText(row.name);
    const brand = plainText(row.brand);
    const retailer = plainText(row.retailer);
    const type = row.type;
    if (row.species !== species || (type !== 'dry' && type !== 'wet' && type !== 'barf') || (foodType && type !== foodType) ||
        !/^[\w.:-]{1,180}$/.test(text(row.id)) || !retailer || !title || !productUrl || !Array.isArray(row.presentations) ||
        !Number.isFinite(Date.parse(text(row.observedAt)))) continue;
    const titleNumbers = new Set(normalized(title + ' ' + brand).match(/\d+(?:[.,]\d+)?/g) ?? []);
    if (queryNumbers.some(n => !titleNumbers.has(n))) continue;
    const presentations: Presentation[] = [];
    for (const value of row.presentations) {
      const variant = record(value);
      const sourceUrl = httpsUrl(variant.sourceUrl);
      if (typeof variant.packageKg !== 'number' || !Number.isFinite(variant.packageKg) || variant.packageKg <= 0 || variant.packageKg > 100 ||
          !sourceUrl || new URL(sourceUrl).origin !== new URL(productUrl).origin) continue;
      presentations.push({packageKg:variant.packageKg, priceCop:positivePrice(variant.priceCop), sourceUrl});
    }
    const id = 'online_co_' + row.id;
    if (listings.has(id)) continue;
    const food = fromListing({
      id, species, type, title, brand, retailer, productUrl, presentations,
      nutritionalUse: row.nutritionalUse === 'treat' || row.nutritionalUse === 'complementary' ? row.nutritionalUse : undefined,
      observedAt: text(row.observedAt), imageUrl: httpsUrl(row.imageUrl),
    }, normalized(title));
    const fullTitle = normalized(title).includes(normalized(brand)) ? title : `${brand} ${title}`.trim();
    listings.set(id, {food, title:fullTitle, description:text(row.description)});
  }
  const foods: FoodItem[] = [];
  const entries = [...listings.values()];
  for (let i = 0; i < entries.length; i += 4) {
    foods.push(...await Promise.all(entries.slice(i, i + 4).map(({food, title, description}) =>
      enrichOnlineNutrition(food, title, description, signal))));
  }
  return {foods, unavailableSources};
}

/** Independent offers keep their own product IDs, labels, weights and shopping links. */
export async function searchFoodCatalog(
  query: string, species: Species, foodType?: FoodItem['type'], signal?: AbortSignal,
  endpoint = getColombiaCatalogUrl(),
): Promise<FoodCatalogResult> {
  const entered = query.trim().replace(/\s+/g, ' ');
  if (!entered || entered.length > 100) throw new Error('Escribe el nombre del alimento, hasta 100 caracteres.');
  if (signal?.aborted) throw signal.reason ?? new DOMException('Búsqueda cancelada', 'AbortError');
  const searchable = entered.replace(/^rc\b/i, 'Royal Canin').replace(/^ppp\b/i, 'Purina Pro Plan')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kilos?|g|gr|gramos?|lb|lbs|oz)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  if ((species !== 'dog' && species !== 'cat') || searchable.length < 2) return {foods:[], unavailableSources:[]};
  const key = JSON.stringify([normalized(searchable), species, foodType, endpoint]);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.result);
  cache.delete(key);

  const timeout = AbortSignal.timeout(19000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const lookups = [searchLaia(searchable, species, foodType, combined)];
  if (endpoint) lookups.push(searchColombianStores(endpoint, searchable, species, foodType, combined));
  const responses = await Promise.allSettled(lookups);
  if (signal?.aborted) throw signal.reason ?? new DOMException('Búsqueda cancelada', 'AbortError');
  if (responses.every(response => response.status === 'rejected')) {
    if (!endpoint && responses[0].status === 'rejected') throw responses[0].reason;
    throw new Error('No se pudieron consultar las tiendas. Vuelve a intentarlo o usa la etiqueta de tu alimento.');
  }
  const result: FoodCatalogResult = {foods:[], unavailableSources:[]};
  responses.forEach((response, index) => {
    if (response.status === 'fulfilled') {
      result.foods.push(...response.value.foods);
      result.unavailableSources.push(...response.value.unavailableSources);
    } else {
      result.unavailableSources.push(index === 0 ? 'Laia Pets' : 'tiendas colombianas');
    }
  });
  if (!result.unavailableSources.length) {
    if (cache.size >= 20) cache.delete(cache.keys().next().value!);
    cache.set(key, {expiresAt: Date.now() + cacheLifetimeMs, result});
    return structuredClone(result);
  }
  return result;
}

export async function searchOnlineFoods(query: string, species: Species, foodType?: FoodItem['type'], signal?: AbortSignal): Promise<FoodItem[]> {
  return (await searchFoodCatalog(query, species, foodType, signal)).foods;
}
