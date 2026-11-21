import type { FoodItem, FoodPriceBasis, Species } from '../types';
import { enrichOnlineNutrition } from './manufacturerNutrition';
import { parseVariantWeight } from './shopifyCatalogService';

const storeId = 5624899;
const storefront = `https://storefront-api.tiendanube.com/2026-11/stores/${storeId}`;
const merchantOrigin = 'https://www.laiapets.com.co';
const detailFields = 'id,name,handle,description,images,variants,categories,tags,brand';
const maximumProducts = 8;
const cacheLifetimeMs = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; foods: FoodItem[] }>();

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
  if (/\b(?:gatos?|gatas?|gatitos?|felinos?|feline|cats?|kittens?)\b/.test(value)) found.add('cat');
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
  const availableSizesKg = [...new Set(presentations.map(({ packageKg }) => packageKg))].sort((a, b) => a - b);
  const packagePrices: FoodPriceBasis[] = availableSizesKg.flatMap((packageKg) => {
    const matching = presentations.filter((pack) => pack.packageKg === packageKg);
    const prices = matching.map((pack) => pack.priceCop);
    // Conflicting or missing prices for the same weight need confirmation, not a guessed offer.
    if (prices.some((price) => price === undefined) || new Set(prices).size !== 1) return [];
    return [{ packageKg, priceCop: prices[0]!, source: 'online', observedAt, storeName: 'Laia Pets', sourceUrl: matching[0].sourceUrl, shippingCop: null }];
  });
  const brand = /^agility gold\b/i.test(title) ? 'Agility Gold' : plainText(detail.brand);
  const formula = title.replace(/\s+[–—|-]\s+(?:alimento|concentrado|croquetas)\b.*$/i, '').trim();
  const name = brand && normalized(formula).startsWith(normalized(brand) + ' ')
    ? formula.slice(brand.length).trim()
    : formula;
  const images = Array.isArray(detail.images) ? detail.images.map(record) : [];
  const imageUrl = images.map((image) => text(image.src)).find((source) => {
    try {
      const url = new URL(source);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  });
  const lifeStage = /\b(?:gatitos?|kittens?)\b/.test(identity) ? 'kitten'
    : /\b(?:cachorros?|pupp(?:y|ies))\b/.test(identity) ? (species === 'cat' ? 'kitten' : 'puppy')
    : /\b(?:senior|mature)\b/.test(identity) ? 'senior'
    : /\b(?:adult[oa]s?|adults?)\b/.test(normalized(title)) ? 'adult' : 'all';

  return {
    id: `online_laia_${detail.id}`,
    sourceFoodId: `online_laia_${detail.id}`,
    brand,
    name,
    species,
    lifeStage,
    lifeStageKnown: lifeStage !== 'all' || /todas las etapas|all life stages/.test(normalized(title)),
    nutritionalUse: /\b(?:snacks?|premios?|golosinas?|galletas?)\b/.test(normalized(title)) ? 'treat' : undefined,
    storeProductUrl: productUrl,
    type,
    kcalPerKg: 0,
    proteinPct: 0,
    fatPct: 0,
    fiberPct: 0,
    moisturePct: 0,
    country: 'Colombia',
    bagSizeKg: availableSizesKg[0],
    availableSizesKg,
    packagePrices,
    priceBasis: packagePrices.find((price) => price.packageKg === availableSizesKg[0]),
    imageUrl,
    buyUrl: packagePrices.find((price) => price.packageKg === availableSizesKg[0])?.sourceUrl || productUrl,
    labelStatus: 'unconfirmed',
    dataSource: 'Laia Pets · catálogo público consultado en internet',
    fichaNutricional: {
      coincidenciaEstado: 'pendiente',
      fuenteNombre: 'Laia Pets',
      fuenteUrl: productUrl,
      fechaConsulta: observedAt,
      mercado: 'Colombia',
      notasRevision: 'Presentaciones publicadas por la tienda. Confirma la etiqueta para guardar la composición nutricional.',
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

/** Looks up explicit food and presentation metadata in the public merchant catalog. */
export async function searchOnlineFoods(
  query: string,
  species: Species,
  foodType?: FoodItem['type'],
  signal?: AbortSignal,
): Promise<FoodItem[]> {
  const entered = query.trim().replace(/\s+/g, ' ');
  if (!entered || entered.length > 100) throw new Error('Escribe el nombre del alimento, hasta 100 caracteres.');
  if (species !== 'cat' && species !== 'dog') return [];
  if (signal?.aborted) throw signal.reason ?? new DOMException('Búsqueda cancelada', 'AbortError');

  const searchable = entered
    .replace(/^rc\b/i, 'Royal Canin')
    .replace(/^ppp\b/i, 'Purina Pro Plan')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kilos?|g|gr|gramos?|lb|lbs|oz)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (searchable.length < 2) return [];
  const key = JSON.stringify([normalized(searchable), species, foodType]);
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return structuredClone(existing.foods);
  cache.delete(key);

  const timeout = AbortSignal.timeout(19000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
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
  for (let offset = 0; offset < ids.length; offset += 3) {
    const products = await Promise.all(ids.slice(offset, offset + 3).map(async (id) => {
      const detailUrl = new URL(`${storefront}/products/${id}`);
      detailUrl.searchParams.set('fields', detailFields);
      const detail = await storefrontJson(detailUrl, combined);
      const food = detail.id === id ? foodFromDetail(detail, species, queryNumbers, foodType) : null;
      return food ? enrichOnlineNutrition(food, plainText(detail.name), text(detail.description), combined) : null;
    }));
    foods.push(...products.filter((food): food is FoodItem => food !== null));
  }

  if (signal?.aborted) throw signal.reason ?? new DOMException('Búsqueda cancelada', 'AbortError');
  if (cache.size >= 20) cache.delete(cache.keys().next().value!);
  cache.set(key, { expiresAt: Date.now() + cacheLifetimeMs, foods });
  return structuredClone(foods);
}
