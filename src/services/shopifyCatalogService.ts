import { FoodItem, NutritionDatasheet, EmpaqueTipo } from '../types';

export interface ShopifyVariant {
  id: string; // e.g. "gid://shopify/ProductVariant/48869877055768"
  nombre: string; // e.g. "3 kg", "85 g", "0", "Default Title"
  sku: string | null;
  foto_url: string | null;
  empaque_tipo?: EmpaqueTipo;
  unidades?: number | null;
  peso_kg?: number | null;
}

export interface ShopifyProduct {
  id: string; // e.g. "gid://shopify/Product/9398260629784"
  nombre: string;
  marca: string;
  especies: string[]; // ["perro"] | ["gato"] | ["perro", "gato"]
  tipo: string; // "Alimento seco", "Alimento húmedo", "Snacks", "Alimento medicado", etc.
  estado_shopify?: string;
  estado_catalogo?: 'activo' | 'archivado';
  categoria_catalogo?: 'alimento' | 'snack';
  mercado?: string;
  linea?: string;
  etapa_vida?: 'cachorro' | 'adulto' | 'senior' | 'todas';
  foto_url: string | null;
  foto_alcance?: string;
  presentaciones: ShopifyVariant[];
  requiere_revision?: boolean;
  ficha_nutricional?: NutritionDatasheet;
}

export interface ShopifyCatalog {
  version: string;
  extraido_el: string;
  fuente: string;
  uso?: string;
  notas?: string;
  total_productos: number;
  total_presentaciones: number;
  resumen_lotes?: {
    alimentos_activos_perro?: number;
    snacks_activos_perro?: number;
    productos_archivados_perro?: number;
    casas_comerciales_perro?: number;
    fichas_verificadas?: number;
    fichas_revision_requerida?: number;
    fichas_pendientes?: number;
    fecha_actualizacion?: string;
  };
  productos: ShopifyProduct[];
}

export interface ParsedVariantWeight {
  grams: number | null;
  kg: number | null;
  units: number | null;
  isAmbiguous: boolean;
  rawText: string;
  unitDetected?: 'kg' | 'g' | 'lb' | 'oz';
}

// In-memory cache singleton
let cachedCatalog: ShopifyCatalog | null = null;
let activeLoadPromise: Promise<ShopifyCatalog> | null = null;

/**
 * Loads the Shopify food catalog JSON once and caches it in memory.
 */
export async function loadShopifyCatalog(forceReload = false): Promise<ShopifyCatalog> {
  if (cachedCatalog && !forceReload) {
    return cachedCatalog;
  }
  if (activeLoadPromise && !forceReload) {
    return activeLoadPromise;
  }

  activeLoadPromise = (async () => {
    try {
      // Primary location: public/assets/aistudio/...
      const res = await fetch('/assets/aistudio/Catalogo_Alimentos_Racion_App_68a4174d.json');
      if (res.ok) {
        const data: ShopifyCatalog = await res.json();
        cachedCatalog = data;
        return data;
      }

      // Fallback location: root public
      const fallbackRes = await fetch('/Catalogo_Alimentos_Racion_App.json');
      if (fallbackRes.ok) {
        const data: ShopifyCatalog = await fallbackRes.json();
        cachedCatalog = data;
        return data;
      }

      throw new Error(`Failed to load food catalog (HTTP ${res.status})`);
    } catch (err) {
      console.error('Error loading Catalogo_Alimentos_Racion_App.json:', err);
      throw err;
    } finally {
      activeLoadPromise = null;
    }
  })();

  return activeLoadPromise;
}

/**
 * Strips accents, lowercases and trims for accent-insensitive search.
 */
export function normalizeCatalogText(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Parses presentation name and returns weight in grams, kg, and unit count if multipack.
 */
export function parseVariantWeight(rawName: string): ParsedVariantWeight {
  if (!rawName) {
    return { grams: null, kg: null, units: null, isAmbiguous: true, rawText: '' };
  }

  const trimmed = rawName.trim();
  const unitsMatch = trimmed.match(/\bx\s*(\d+)\b|\b(\d+)\s*(?:unidades|unidad|un|u)\b/i);
  const units = unitsMatch ? parseInt(unitsMatch[1] || unitsMatch[2], 10) : null;

  if (
    /^(0|0\s*\/\s*0|0\s*\/\s*0\s*\/\s*0|default title|peso por confirmar|bolsa|unidad|unidades|u|un)$/i.test(
      trimmed
    )
  ) {
    return { grams: null, kg: null, units, isAmbiguous: true, rawText: trimmed };
  }

  // 1. Check kg: e.g. "15 kg", "1.5 kg", "1,5 kg", "3 Kg", "7.5 kilos"
  const kgMatch = trimmed.match(/(?:^|\s|x)(\d+(?:[.,]\d+)?)\s*(?:kg|kilos|kilo)\b/i);
  if (kgMatch) {
    const val = parseFloat(kgMatch[1].replace(',', '.'));
    if (val > 0) {
      const grams = Math.round(val * 1000);
      return { grams, kg: val, units, isAmbiguous: false, rawText: trimmed, unitDetected: 'kg' };
    }
  }

  // 2. Check lb: e.g. "30 LB", "4 lb", "15 Libras"
  const lbMatch = trimmed.match(/(?:^|\s|x)(\d+(?:[.,]\d+)?)\s*(?:lb|lbs|libras|libra)\b/i);
  if (lbMatch) {
    const val = parseFloat(lbMatch[1].replace(',', '.'));
    if (val > 0) {
      const grams = Math.round(val * 453.592);
      const kg = +(grams / 1000).toFixed(2);
      return { grams, kg, units, isAmbiguous: false, rawText: trimmed, unitDetected: 'lb' };
    }
  }

  // 3. Check grams: e.g. "85 g", "100 g", "400 gr", "2.700 g", "500 gramos"
  const gMatch = trimmed.match(/(?:^|\s|x)(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramos|gramo)\b(?!\w)/i);
  if (gMatch && !/kg/i.test(gMatch[0])) {
    const rawNum = gMatch[1].includes('.') && /\.\d{3}$/.test(gMatch[1])
      ? gMatch[1].replace('.', '')
      : gMatch[1].replace(',', '.');
    const val = parseFloat(rawNum);
    if (val > 0) {
      const grams = Math.round(val);
      const kg = +(grams / 1000).toFixed(3);
      return { grams, kg, units, isAmbiguous: false, rawText: trimmed, unitDetected: 'g' };
    }
  }

  // 4. Check oz / onzas: e.g. "3 Onzas", "5.5 oz"
  const ozMatch = trimmed.match(/(?:^|\s|x)(\d+(?:[.,]\d+)?)\s*(?:oz|onzas|onza)\b/i);
  if (ozMatch) {
    const val = parseFloat(ozMatch[1].replace(',', '.'));
    if (val > 0) {
      const grams = Math.round(val * 28.3495);
      const kg = +(grams / 1000).toFixed(3);
      return { grams, kg, units, isAmbiguous: false, rawText: trimmed, unitDetected: 'oz' };
    }
  }

  return { grams: null, kg: null, units, isAmbiguous: true, rawText: trimmed };
}

/**
 * Converts a ShopifyProduct + verified ficha_nutricional into a FoodItem without inventing data.
 */
export function shopifyProductToFoodItem(sp: ShopifyProduct, preferredWeightKg?: number): FoodItem {
  const sizesKg: number[] = [];
  if (Array.isArray(sp.presentaciones)) {
    sp.presentaciones.forEach((pres) => {
      const parsed = parseVariantWeight(pres.nombre);
      if (parsed.kg && parsed.kg > 0 && !sizesKg.includes(parsed.kg)) {
        sizesKg.push(parsed.kg);
      }
    });
  }
  sizesKg.sort((a, b) => a - b);

  const isCat = sp.especies.includes('gato') && !sp.especies.includes('perro');
  const ficha = sp.ficha_nutricional;
  const isArchived =
    sp.estado_catalogo === 'archivado' ||
    String(sp.estado_shopify || '').toUpperCase() === 'ARCHIVED';

  const hasVerifiedMacros = Boolean(
    ficha &&
      ficha.coincidenciaEstado === 'verificado' &&
      (ficha.proteina || ficha.grasa || ficha.kcalPerKg)
  );
  const hasVerifiedKcal = Boolean(
    ficha?.kcalPerKg?.valor && ficha.kcalPerKg.valor > 300 && ficha.coincidenciaEstado === 'verificado'
  );

  const cleanName =
    sp.nombre.replace(new RegExp(`^${sp.marca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '').trim() ||
    sp.nombre;

  return {
    id: sp.id,
    brand: sp.marca,
    name: cleanName,
    species: isCat ? 'cat' : 'dog',
    lifeStage:
      sp.etapa_vida === 'cachorro' || /cachorr|puppy|gatit|kitten|primera fase/i.test(sp.nombre)
        ? isCat
          ? 'kitten'
          : 'puppy'
        : sp.etapa_vida === 'senior' || /senior|mature|7\+|8\+/i.test(sp.nombre)
        ? 'senior'
        : 'adult',
    type: /barf/i.test(sp.tipo || sp.nombre)
      ? 'barf'
      : /h[uú]med/i.test(sp.tipo || sp.nombre)
      ? 'wet'
      : 'dry',
    kcalPerKg: ficha?.kcalPerKg?.valor || 0,
    kcalPerPiece: ficha?.kcalPerUnit?.valor,
    proteinPct: ficha?.proteina?.valor || 0,
    fatPct: ficha?.grasa?.valor || 0,
    fiberPct: ficha?.fibra?.valor || 0,
    moisturePct: ficha?.humedad?.valor || 0,
    ashPct: ficha?.cenizas?.valor,
    carbsPct: ficha?.carbohidratos?.valor,
    country: sp.mercado || 'Colombia',
    bagSizeKg: preferredWeightKg || (sizesKg.length > 0 ? sizesKg[0] : 15),
    availableSizesKg: sizesKg,
    imageUrl: sp.foto_url || undefined,
    labelStatus: hasVerifiedKcal
      ? 'verified_manufacturer'
      : 'unconfirmed',
    dataSource:
      ficha?.fuenteNombre ||
      (hasVerifiedMacros
        ? `Ficha consultada (${sp.marca})`
        : 'Catálogo Agrocentro (etiqueta pendiente)'),
    formulaNotes: ficha?.notasRevision,
    fichaNutricional: ficha,
    estadoCatalogo: isArchived ? 'archivado' : 'activo',
    fotoAlcance: sp.foto_alcance || 'referencial',
    empaqueTipo: sp.presentaciones?.[0]?.empaque_tipo || 'fabrica',
  };
}

export interface CatalogSearchParams {
  query?: string;
  species?: 'dog' | 'cat'; // "perro" or "gato"
  category?: 'all' | 'main' | 'snacks'; // separates snacks from main food
  includeArchived?: boolean; // default true for lookup but prioritizes active
  limit?: number; // default 30 to keep UI ultra responsive
}

/**
 * Searches the Shopify catalog locally:
 * - Multi-token matching (e.g. "agility grandes")
 * - Species filtering (dog -> perro, cat -> gato)
 * - Snacks separated from main food
 * - Prioritizes active products ahead of archived products
 */
export function searchShopifyCatalog(
  catalog: ShopifyCatalog,
  params: CatalogSearchParams
): ShopifyProduct[] {
  const { query = '', species, category = 'main', includeArchived = true, limit = 30 } = params;
  const tokens = normalizeCatalogText(query).split(/\s+/).filter(Boolean);

  const activeMatches: ShopifyProduct[] = [];
  const archivedMatches: ShopifyProduct[] = [];

  for (const product of catalog.productos) {
    const isArchived =
      product.estado_catalogo === 'archivado' ||
      String(product.estado_shopify || '').toUpperCase() === 'ARCHIVED';
    if (!includeArchived && isArchived) continue;

    if (species && product.especies && product.especies.length > 0) {
      const expected = species === 'dog' ? 'perro' : 'gato';
      if (!product.especies.includes(expected)) {
        continue;
      }
    }

    const isSnack = product.tipo === 'Snacks' || product.categoria_catalogo === 'snack';
    if (category === 'main' && isSnack) {
      continue;
    }
    if (category === 'snacks' && !isSnack) {
      continue;
    }

    if (tokens.length > 0) {
      const haystack = normalizeCatalogText(
        `${product.nombre} ${product.marca} ${product.tipo} ${(product.especies || []).join(' ')}`
      );
      const allTokensMatch = tokens.every((token) => haystack.includes(token));
      if (!allTokensMatch) {
        continue;
      }
    }

    if (isArchived) archivedMatches.push(product);
    else activeMatches.push(product);

    if (activeMatches.length >= limit) {
      break;
    }
  }

  return [...activeMatches, ...archivedMatches].slice(0, limit);
}

export function getProductById(
  catalog: ShopifyCatalog,
  productId: string
): ShopifyProduct | undefined {
  return catalog.productos.find((p) => p.id === productId);
}

export function getVariantById(
  product: ShopifyProduct,
  variantId: string
): ShopifyVariant | undefined {
  return product.presentaciones.find((v) => v.id === variantId);
}

export function getCatalogStats(catalog: ShopifyCatalog) {
  let dogCount = 0;
  let dogActiveMain = 0;
  let dogActiveSnacks = 0;
  let dogArchived = 0;
  let catCount = 0;
  let snackCount = 0;
  let mainCount = 0;
  let totalVariants = 0;

  for (const p of catalog.productos) {
    totalVariants += (p.presentaciones || []).length;
    const isArchived =
      p.estado_catalogo === 'archivado' ||
      String(p.estado_shopify || '').toUpperCase() === 'ARCHIVED';
    const isSnack = p.tipo === 'Snacks' || p.categoria_catalogo === 'snack';

    if (p.especies?.includes('perro')) {
      dogCount++;
      if (isArchived) dogArchived++;
      else if (isSnack) dogActiveSnacks++;
      else dogActiveMain++;
    }
    if (p.especies?.includes('gato')) catCount++;
    if (isSnack) snackCount++;
    else mainCount++;
  }

  return {
    totalProducts: catalog.productos.length,
    totalVariants,
    dogCount,
    dogActiveMain,
    dogActiveSnacks,
    dogArchived,
    catCount,
    snackCount,
    mainCount,
    fuente: catalog.fuente,
  };
}

