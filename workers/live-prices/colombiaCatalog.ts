import { normalizePriceWords, packageGrams, withoutPackageWeight } from './offers';

type Species = 'cat' | 'dog';
type FoodType = 'dry' | 'wet' | 'barf';
type JsonRecord = Record<string, unknown>;

export interface ColombiaCatalogFood {
  id: string;
  retailer: string;
  brand: string;
  name: string;
  species: Species;
  type: FoodType;
  nutritionalUse?: 'treat' | 'complementary';
  description: string;
  productUrl: string;
  imageUrl?: string;
  presentations: Array<{ packageKg: number; priceCop?: number; sourceUrl: string; barcode?: string }>;
  observedAt: string;
}

interface Retailer { id: string; name: string; origin: string }

const retailers: Retailer[] = [
  { id: 'puppis', name: 'Puppis', origin: 'https://www.puppis.com.co' },
  { id: 'jumbo', name: 'Jumbo Colombia', origin: 'https://www.jumbocolombia.com' },
  { id: 'olimpica', name: 'Olímpica', origin: 'https://www.olimpica.com' },
  { id: 'mercacentro', name: 'Mercacentro', origin: 'https://www.mercacentro.com' },
];
const perRetailer = 12;
const jsonLimit = 2 * 1024 * 1024;
const nonFormulaWords = new Set(['de', 'del', 'para', 'con', 'el', 'la', 'y', 'las', 'los', 'por', 'perro',
  'perros', 'gato', 'gatos', 'alimentos', 'alimento', 'comida', 'adulto', 'adultos', 'seca', 'seco', 'húmedo', 'humedo']);

function object(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : typeof value === 'string' ? [value] : [];
}

function id(value: unknown): string {
  return /^(?:[1-9]\d{0,16})$/.test(String(value)) ? String(value) : '';
}

function publicUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port) return url;
  } catch { /* invalid retailer link */ }
}

function productDetails(product: JsonRecord): string {
  const descriptions = [...strings(product['Descripción']), ...strings(product.description)];
  const primary = descriptions.sort((a, b) => b.length - a.length)[0] ?? '';
  const fields = Object.keys(product).filter(key =>
    /^(?:analisis (?:garantizado|nutricional)|ingredientes|composicion (?:analitica|nutricional)|informacion nutricional|energia metabolizable)$/.test(normalizePriceWords(key)));
  const html = [primary, ...fields.map(key => '<h3>' + key + '</h3>' + strings(product[key]).join(' '))].join('\n').slice(0, 20000);
  // Puppis publishes a structured two-column composition using "|" and ";".
  // Preserve exactly what its rows say. A generic "Contenido" block may be marketing.
  return html
    .replace(/<div\s+class=["']ingredientes["'][^>]*>/gi, '<h3>Ingredientes</h3><div>')
    .replace(/<div\s+class=["']contenido["'][^>]*>\s*\{\s*Composición\s*\|\s*(Cantidad|Análisis garantizado)\s*\}\s*;([^<]*)<\/div>/gi,
      (_, header: string, body: string) => {
        const rows = body.trim().split(';').map((row) => row.split('|')).filter(cells => cells.length === 2);
        return '<h3>' + (/garantizado/i.test(header) ? 'Análisis garantizado' : 'Composición nutricional') + '</h3><table>' +
          rows.map(([key, value]) => '<tr><td>' + key + '</td><td>' + value + '</td></tr>').join('') + '</table>';
      })
    .replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi, (_, slash: string, tag: string) =>
      /^(?:div|p|h[1-6]|table|tr|th|td|li|ul|ol|br)$/i.test(tag) ? '<' + slash + tag.toLowerCase() + '>' : ' ')
    .trim();
}

function category(product: JsonRecord, title: string, species: Species): FoodType | undefined {
  const categories = strings(product.categories).join(' ');
  const evidence = normalizePriceWords([title, categories, ...strings(product['Mascota recomendada']),
    ...strings(product['Tipo Mascota']), ...strings(product['Tipo de Producto']),
    ...strings(product['Tipo de alimento']), ...strings(product['Tipo de comida para mascotas'])].join(' '));
  if (/\b(?:juguetes?|accesorios?|higiene|arenas?|areneros?|champ[uú]|shampoo|aseo|medicamentos?|farmacia|antiparasitarios?|suplementos?|comedero[s]?|bebederos?|dispensadores?|contenedores?|ropa|correas?|collares?|bolsas para|portaalimentos?)\b/.test(evidence)) return;
  if (!/\b(?:alimentos?|comidas?|nutricion|croquetas?|concentrados?|barf|snacks?|premios?)\b/.test(evidence)) return;
  const cat = /\b(?:gatos?|gatitos?|felinos?|cats?|kittens?|feline)\b/.test(evidence);
  const dog = /\b(?:perros?|caninos?|dogs?|puppy|puppies|canine)\b/.test(evidence);
  if (cat === dog || (species === 'cat') !== cat) return;
  const wet = /\b(?:humed[oa]s?|mojad[oa]s?|wet|pate|pouch)\b/.test(evidence);
  const dry = /\b(?:sec[oa]s?|concentrad[oa]s?|croquetas?|kibble|dry)\b/.test(evidence);
  const raw = /\b(?:barf|alimentos? crud[oa]s?)\b/.test(evidence);
  if (Number(wet) + Number(dry) + Number(raw) !== 1) return;
  return raw ? 'barf' : wet ? 'wet' : 'dry';
}

function mixedRecipes(items: JsonRecord[]): boolean {
  if (items.length < 2) return false;
  const names = new Set(items.map(sku => normalizePriceWords(withoutPackageWeight(String(sku.name ?? '')))
    .replace(/\b(?:bolsa|bulto|paquete|unidad|peso|gramaje|de|x)\b/g, '').trim()));
  if (names.size > 1 && [...names].some(name => /\b(?:pollo|pavo|salmon|cordero|atun|res|ternera|pescado|adulto|cachorro|puppy|kitten|senior)\b/.test(name))) return true;
  const recipes = new Set(items.map(sku => strings(sku.variations)
    .filter(key => /sabor|formula|receta|proteina|etapa/.test(normalizePriceWords(key)))
    .sort().flatMap(key => strings(sku[key]).map(normalizePriceWords)).join('|')));
  return recipes.size > 1;
}

function presentations(product: JsonRecord, productUrl: URL): ColombiaCatalogFood['presentations'] {
  const byWeight = new Map<number, ColombiaCatalogFood['presentations']>();
  for (const entry of Array.isArray(product.items) ? product.items.slice(0, 40) : []) {
    const sku = object(entry);
    if (!id(sku.itemId) || sku.isKit === true) continue;
    // Some VTEX stores encode variant weight in a dimension, others in the SKU name.
    const packageText = [sku.name, product.productName, ...strings(sku['Presentación/Talla/Tamaño'])].join(' ');
    if (/\b\d+\s*\/\s*\d+\s*(?:kg|g|gr)\b|(?:kg|gr?|lbs?)\s*[x×]\s*(?:[2-9]|\d{2,})\b/i.test(packageText)) continue;
    const grams = packageGrams(packageText);
    if (!grams) continue;
    const sellers = (Array.isArray(sku.sellers) ? sku.sellers : []).map(object);
    const primary = sellers.find(seller => seller.sellerDefault === true) ?? (sellers.length === 1 ? sellers[0] : undefined);
    const offer = object(primary?.commertialOffer);
    if (offer.IsAvailable !== true || (typeof offer.AvailableQuantity === 'number' && offer.AvailableQuantity <= 0)) continue;
    const priceCop = typeof offer.Price === 'number' && Number.isFinite(offer.Price) && offer.Price > 0 && offer.Price <= 100000000
      ? Math.round(offer.Price) : undefined;
    const url = new URL(productUrl);
    url.searchParams.set('skuId', id(sku.itemId));
    const packageKg = grams / 1000;
    const barcode = typeof sku.ean === 'string' && /^(?:\d{8}|\d{12,14})$/.test(sku.ean) ? sku.ean : undefined;
    const options = byWeight.get(packageKg) ?? [];
    options.push({ packageKg, priceCop, sourceUrl: url.href, barcode });
    byWeight.set(packageKg, options);
  }
  // Two SKUs of the same weight may be different flavours. Don't transfer one
  // variant's price/barcode if the retailer hasn't identified an unambiguous SKU.
  return [...byWeight].sort(([a], [b]) => a - b)
    .map(([packageKg, options]) => options.length === 1 ? options[0] : { packageKg, sourceUrl: productUrl.href });
}

function catalogFood(product: JsonRecord, retailer: Retailer, query: string, species: Species, filter: FoodType | undefined, observedAt: string): ColombiaCatalogFood | undefined {
  const productId = id(product.productId);
  const url = publicUrl(product.link);
  const title = typeof product.productName === 'string' ? product.productName.trim() : '';
  const brand = typeof product.brand === 'string' ? product.brand.trim() : '';
  if (!productId || !url || url.origin !== retailer.origin || !/^\/[^/]+\/p\/?$/.test(url.pathname) || !title || title.length > 250 || !brand || brand.length > 120) return;
  const type = category(product, title, species);
  if (!type || (filter && type !== filter)) return;
  if (mixedRecipes((Array.isArray(product.items) ? product.items : []).slice(0, 40).map(object))) return;
  const sizes = presentations(product, url);
  const card = normalizePriceWords([title, brand, ...strings(product.categories)].join(' '));
  const queryTerms = normalizePriceWords(withoutPackageWeight(query)).split(' ').filter(Boolean);
  const nameTerms = queryTerms.filter(t => !nonFormulaWords.has(t));
  const terms = new Set(card.split(' '));
  // Search results from VTEX can be fuzzy. Do not return another numbered
  // formula as the requested one, or rows unrelated to every meaningful word.
  if (queryTerms.some(t => /^\d+$/.test(t) && !terms.has(t)) || !(nameTerms.length ? nameTerms : queryTerms).some(t => terms.has(t))) return;
  const image = object((object((product.items as unknown[])?.[0]).images as unknown[])?.[0]).imageUrl;
  const cleanTitle = title.replace(/^alimento\s+(?:(?:seco|h[uú]medo)\s+)?(?:para\s+)?(?:perros?|gatos?)\s+/i, '').trim();
  const name = withoutPackageWeight(cleanTitle).replace(/^[-–·\s]+/, '').replace(/(?:\s+[xX]|\s+por|[-–,])\s*$/, '').trim() || title;
  return {
    id: retailer.id + ':' + productId, retailer: retailer.name, brand, name, species, type,
    nutritionalUse: /\b(?:snacks?|golosinas?|premios?|galle(tas?|tones?))\b/.test(card) ? 'treat'
      : /\bcomplementari[oa]\b/.test(card) ? 'complementary' : undefined,
    description: productDetails(product), productUrl: url.href, imageUrl: publicUrl(image)?.href,
    presentations: sizes, observedAt,
  };
}

async function readProducts(response: Response): Promise<unknown[]> {
  if (!response.ok || !response.body || !response.headers.get('Content-Type')?.includes('application/json')) throw new Error('Invalid catalogue response');
  if (Number(response.headers.get('Content-Length')) > jsonLimit) throw new Error('Catalogue response too large');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > jsonLimit) {
        await reader.cancel();
        throw new Error('Catalogue response too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(data)) throw new Error('Unknown catalogue response');
  return data.slice(0, perRetailer);
}

export async function searchColombiaCatalog(query: string, species: Species, type?: FoodType, signal?: AbortSignal): Promise<{
  foods: ColombiaCatalogFood[]; unavailableSources: string[];
}> {
  const timeout = AbortSignal.timeout(8000);
  const lookupSignal = signal ? AbortSignal.any([timeout, signal]) : timeout;
  const observedAt = new Date().toISOString();
  const results = await Promise.allSettled(retailers.map(async retailer => {
    const url = new URL('/api/catalog_system/pub/products/search/', retailer.origin);
    // VTEX's public full-text parameter requires percent-encoded spaces.
    url.search = new URLSearchParams({ ft: query, _from: '0', _to: String(perRetailer - 1), sc: '1' }).toString().replace(/\+/g, '%20');
    const response = await fetch(url, { signal: lookupSignal, credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' } });
    const products = await readProducts(response);
    return products.flatMap(product => {
      const food = catalogFood(object(product), retailer, query, species, type, observedAt);
      return food ? [food] : [];
    });
  }));
  if (signal?.aborted) throw signal.reason;
  const unavailableSources = retailers.filter((_, i) => results[i].status === 'rejected').map(retailer => retailer.name);
  if (unavailableSources.length === retailers.length) throw new Error('Colombian catalogues unavailable');
  // Interleave stores so that one provider cannot hide the rest for a broad search.
  const available = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const foods: ColombiaCatalogFood[] = [];
  for (let i = 0; i < perRetailer; i++) for (const rows of available) if (rows[i]) foods.push(rows[i]);
  return { foods, unavailableSources };
}
