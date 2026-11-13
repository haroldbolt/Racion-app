import fs from 'fs';
import path from 'path';
import {
  NutritionDatasheet,
  NutrientValue,
  NutrientQualifier,
  MeasurementBasis,
} from '../types';

export interface NutritionLookupFoodInput {
  id?: string;
  brand: string;
  name: string;
  species?: 'dog' | 'cat';
  lifeStage?: string;
  weightKg?: number;
  catalogFicha?: NutritionDatasheet;
}

export interface NutritionLookupResultItem {
  key: string;
  id?: string;
  brand: string;
  name: string;
  lookupStatus:
    | 'live_verified'
    | 'fallback_cached'
    | 'quota_exceeded_fallback'
    | 'quota_exceeded_missing'
    | 'missing';
  isFromCache: boolean;
  warningNotice?: string;
  ficha: NutritionDatasheet;
}

interface NutritionCacheEntry {
  cachedAtMs: number;
  ficha: NutritionDatasheet;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const NUTRITION_CACHE = new Map<string, NutritionCacheEntry>();

const PREFERRED_COLOMBIA_DOMAINS = [
  'italcolmascotas.com',
  'ringo.com.co',
  'solla.com',
  'royalcanin.com',
  'hillspet.co',
  'hillspet.com',
  'purina.com.co',
  'farmina.com',
  'monellocolombia.com',
  'braverypetfood.com',
  'tasteofthewildpetfood.com',
  'diamondpet.com',
  'acana.com',
  'orijenpetfoods.com',
  'gabrica.co',
  'agrocampo.com.co',
  'laika.com.co',
  'kanu.pet',
  'tierragro.com',
  'puppis.com.co',
  'depelos.co',
  'vetmasagro.com',
];

function norm(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function detectBasis(text: string): MeasurementBasis {
  return /materia seca|dry matter|\bdm\b/i.test(text)
    ? 'materia_seca'
    : 'tal_como_se_vende';
}

function detectQualifier(context: string, defaultQual: NutrientQualifier): NutrientQualifier {
  if (/m[ií]n\.?|minimo|mínimo|al menos/i.test(context)) return 'minimo';
  if (/m[aá]x\.?|maximo|máximo|no m[aá]s de/i.test(context)) return 'maximo';
  if (/t[ií]pico|promedio|aprox|medio/i.test(context)) return 'tipico';
  return defaultQual;
}

function parsePctMatch(
  text: string,
  patterns: RegExp[],
  defaultQual: NutrientQualifier,
  minBound: number,
  maxBound: number
): NutrientValue | undefined {
  const basis = detectBasis(text);
  for (const rx of patterns) {
    const m = text.match(rx);
    if (m) {
      const ctx = m[0];
      const rawNum = (m[1] || m[2] || '').replace(',', '.');
      const val = parseFloat(rawNum);
      if (Number.isFinite(val) && val >= minBound && val <= maxBound) {
        return {
          valor: Number(val.toFixed(2)),
          unidadOriginal: '%',
          baseMedicion: basis,
          calificador: detectQualifier(ctx, defaultQual),
        };
      }
    }
  }
  return undefined;
}

function parseKcalPerKg(text: string): (NutrientValue & { nota?: string }) | undefined {
  const basis = detectBasis(text);
  // Match "3.850 kcal/kg", "3796 kcal/kg", "3,600 kcal/kg"
  const kgMatches = text.match(
    /(?:energ[ií]a\s*metabolizable|em|calor[ií]as|kcal)[^0-9]{0,30}(\d[\d.,]{2,5})\s*(?:kcal\s*\/\s*kg|kcal\s+por\s+kg)/i
  ) || text.match(/(\d[\d.,]{2,5})\s*(?:kcal\s*\/\s*kg|kcal\/kg)/i);

  if (kgMatches) {
    let raw = kgMatches[1].trim();
    // Normalize Colombian thousands separators like 3.850 vs decimals
    if (/^\d\.\d{3}$/.test(raw) || /^\d,\d{3}$/.test(raw)) {
      raw = raw.replace(/[.,]/g, '');
    } else {
      raw = raw.replace(',', '.');
    }
    const val = parseFloat(raw);
    if (Number.isFinite(val) && val >= 500 && val <= 6500) {
      return {
        valor: Math.round(val),
        unidadOriginal: 'kcal/kg',
        baseMedicion: basis,
        calificador: detectQualifier(kgMatches[0], 'tipico'),
      };
    }
  }

  // Match kcal per 100g -> multiply by 10 to kcal/kg
  const g100Matches = text.match(/(\d+(?:[.,]\d+)?)\s*kcal\s*(?:\/|por)\s*100\s*g/i);
  if (g100Matches) {
    const val100 = parseFloat(g100Matches[1].replace(',', '.'));
    if (Number.isFinite(val100) && val100 >= 40 && val100 <= 650) {
      return {
        valor: Math.round(val100 * 10),
        unidadOriginal: 'kcal/100g',
        baseMedicion: basis,
        calificador: detectQualifier(g100Matches[0], 'tipico'),
      };
    }
  }

  return undefined;
}

export function extractNutritionFromText(text: string): Partial<NutritionDatasheet> {
  const clean = text.replace(/\s+/g, ' ');
  const out: Partial<NutritionDatasheet> = {};

  const kcal = parseKcalPerKg(clean);
  if (kcal) out.kcalPerKg = kcal;

  const prot = parsePctMatch(
    clean,
    [
      /prote[ií]na(?:\s+(?:bruta|cruda|total))?(?:\s*\([^)]{0,25}\))?\s*[:\-]?\s*(?:m[ií]n(?:imo)?\.?\s*)?(\d+(?:[.,]\d+)?)\s*%/i,
      /(?:m[ií]n(?:imo)?\.?\s*)(\d+(?:[.,]\d+)?)\s*%\s*(?:de\s+)?prote[ií]na/i,
    ],
    'minimo',
    4,
    60
  );
  if (prot) out.proteina = prot;

  const fat = parsePctMatch(
    clean,
    [
      /(?:grasa(?:\s+(?:bruta|cruda|total))?|extracto\s+et[eé]reo|l[ií]pidos)(?:\s*\([^)]{0,25}\))?\s*[:\-]?\s*(?:m[ií]n(?:imo)?\.?\s*)?(\d+(?:[.,]\d+)?)\s*%/i,
    ],
    'minimo',
    1,
    45
  );
  if (fat) out.grasa = fat;

  const fiber = parsePctMatch(
    clean,
    [
      /fibra(?:\s+(?:bruta|cruda|diet[eé]tica))?(?:\s*\([^)]{0,25}\))?\s*[:\-]?\s*(?:m[aá]x(?:imo)?\.?\s*)?(\d+(?:[.,]\d+)?)\s*%/i,
    ],
    'maximo',
    0.1,
    30
  );
  if (fiber) out.fibra = fiber;

  const moisture = parsePctMatch(
    clean,
    [
      /humedad(?:\s*\([^)]{0,25}\))?\s*[:\-]?\s*(?:m[aá]x(?:imo)?\.?\s*)?(\d+(?:[.,]\d+)?)\s*%/i,
    ],
    'maximo',
    2,
    90
  );
  if (moisture) out.humedad = moisture;

  const ash = parsePctMatch(
    clean,
    [
      /(?:cenizas|materia\s+mineral)(?:\s*\([^)]{0,25}\))?\s*[:\-]?\s*(?:m[aá]x(?:imo)?\.?\s*)?(\d+(?:[.,]\d+)?)\s*%/i,
    ],
    'maximo',
    0.2,
    20
  );
  if (ash) out.cenizas = ash;

  const carbs = parsePctMatch(
    clean,
    [
      /(?:carbohidratos|el[nN]|extracto\s+libre\s+de\s+nitr[oó]geno)(?:\s*\([^)]{0,25}\))?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,
    ],
    'tipico',
    1,
    70
  );
  if (carbs) out.carbohidratos = carbs;

  return out;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCatalogFallback(input: NutritionLookupFoodInput): NutritionDatasheet | undefined {
  if (input.catalogFicha && (input.catalogFicha.proteina || input.catalogFicha.grasa || input.catalogFicha.kcalPerKg)) {
    return input.catalogFicha;
  }
  try {
    const catPath = path.resolve(
      process.cwd(),
      'public/assets/aistudio/Catalogo_Alimentos_Racion_App_68a4174d.json'
    );
    if (!fs.existsSync(catPath)) return undefined;
    const raw = JSON.parse(fs.readFileSync(catPath, 'utf8'));
    const bNorm = norm(input.brand);
    const nNorm = norm(input.name);
    const match = (raw.productos || []).find((p: any) => {
      if (input.id && p.id === input.id) return true;
      const pb = norm(p.marca || '');
      const pn = norm(p.nombre || '');
      return (pb.includes(bNorm) || bNorm.includes(pb)) && (pn.includes(nNorm) || nNorm.includes(pn));
    });
    if (match?.ficha_nutricional) {
      return match.ficha_nutricional as NutritionDatasheet;
    }
  } catch {
    // ignore catalog read errors
  }
  return undefined;
}

function domainScore(url: string): number {
  const lower = url.toLowerCase();
  for (let i = 0; i < PREFERRED_COLOMBIA_DOMAINS.length; i++) {
    if (lower.includes(PREFERRED_COLOMBIA_DOMAINS[i])) {
      return 100 - i;
    }
  }
  if (lower.includes('.co/') || lower.endsWith('.co')) return 20;
  return 1;
}

export class NutritionLookupBackend {
  public static async lookupAndVerifyFoods(params: {
    foods: NutritionLookupFoodInput[];
    forceRefresh?: boolean;
  }): Promise<{
    results: NutritionLookupResultItem[];
    serverCheckedAt: string;
    provider: 'serpapi_google_search' | 'catalog_fallback' | 'unconfigured';
  }> {
    const { foods, forceRefresh = false } = params;
    const serpApiKey = process.env.SERPAPI_API_KEY;
    const nowIso = new Date().toISOString();
    const results: NutritionLookupResultItem[] = [];

    for (const food of foods.slice(0, 3)) {
      const cacheKey = `${norm(food.brand)}__${norm(food.name)}`;
      const catalogFicha = findCatalogFallback(food);
      const cached = NUTRITION_CACHE.get(cacheKey);

      // Return fresh cache preserving original fechaConsulta when not forcing refresh
      if (!forceRefresh && cached && Date.now() - cached.cachedAtMs < CACHE_TTL_MS) {
        results.push({
          key: cacheKey,
          id: food.id,
          brand: food.brand,
          name: food.name,
          lookupStatus: 'live_verified',
          isFromCache: true,
          ficha: cached.ficha,
        });
        continue;
      }

      if (!serpApiKey) {
        if (catalogFicha) {
          results.push({
            key: cacheKey,
            id: food.id,
            brand: food.brand,
            name: food.name,
            lookupStatus: 'fallback_cached',
            isFromCache: true,
            warningNotice:
              'Buscador web no configurado; mostrando última ficha verificada del catálogo con su fecha original.',
            ficha: catalogFicha,
          });
        } else {
          results.push({
            key: cacheKey,
            id: food.id,
            brand: food.brand,
            name: food.name,
            lookupStatus: 'missing',
            isFromCache: false,
            warningNotice: 'Falta ficha verificada para este alimento.',
            ficha: {
              coincidenciaEstado: 'pendiente',
              mercado: 'Colombia',
              notasRevision: 'Sin dato verificado en catálogo ni consulta web disponible.',
            },
          });
        }
        continue;
      }

      try {
        const cleanProduct = food.name.replace(new RegExp(`^${food.brand}\\s*`, 'i'), '').trim();
        const searchProduct = /adulto\s+raza\s+grande/i.test(cleanProduct)
          ? `${cleanProduct} OR "Grandes Adultos"`
          : cleanProduct;
        const searchUrl = new URL('https://serpapi.com/search.json');
        searchUrl.searchParams.set('engine', 'google');
        searchUrl.searchParams.set(
          'q',
          `${food.brand} ${searchProduct} proteina grasa fibra analisis garantizado Colombia`
        );
        searchUrl.searchParams.set('gl', 'co');
        searchUrl.searchParams.set('hl', 'es');
        searchUrl.searchParams.set('num', '8');
        searchUrl.searchParams.set('api_key', serpApiKey);

        const searchRes = await fetch(searchUrl.toString(), {
          headers: { Accept: 'application/json' },
        });
        const data = await searchRes.json().catch(() => ({}));

        // Quota or SerpApi error check
        const errStr = String(data?.error || '');
        const isQuota =
          searchRes.status === 402 ||
          searchRes.status === 429 ||
          /quota|limit|credit|out of searches|exceeded/i.test(errStr);

        if (!searchRes.ok || data?.error) {
          const fallback = cached?.ficha || catalogFicha;
          if (fallback) {
            results.push({
              key: cacheKey,
              id: food.id,
              brand: food.brand,
              name: food.name,
              lookupStatus: isQuota ? 'quota_exceeded_fallback' : 'fallback_cached',
              isFromCache: true,
              warningNotice: isQuota
                ? 'Cuota de búsqueda en internet agotada; se conserva la última ficha verificada con su fecha original.'
                : 'No fue posible consultar internet ahora; se conserva la última ficha verificada con su fecha original.',
              ficha: fallback,
            });
          } else {
            results.push({
              key: cacheKey,
              id: food.id,
              brand: food.brand,
              name: food.name,
              lookupStatus: isQuota ? 'quota_exceeded_missing' : 'missing',
              isFromCache: false,
              warningNotice: isQuota
                ? 'Cuota de búsqueda en internet agotada y sin ficha previa guardada.'
                : 'No se pudo consultar en internet y falta ficha verificada.',
              ficha: {
                coincidenciaEstado: 'pendiente',
                mercado: 'Colombia',
                notasRevision: errStr || 'Falla temporal al consultar fuentes externas.',
              },
            });
          }
          continue;
        }

        const organic = Array.isArray(data.organic_results) ? data.organic_results : [];
        const sortedResults = [...organic].sort(
          (a: any, b: any) => domainScore(b.link || '') - domainScore(a.link || '')
        );

        let bestExtracted: Partial<NutritionDatasheet> = {};
        let bestSourceUrl: string | undefined;
        let bestSourceTitle: string | undefined;

        // Inspect top 2 official/Colombian pages directly
        for (const candidate of sortedResults.slice(0, 2)) {
          const link = candidate.link;
          if (!link || /\.pdf($|\?)/i.test(link)) continue;
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 4500);
            const pageRes = await fetch(link, {
              signal: ctrl.signal,
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (compatible; RacionAppBot/1.0; +https://racionapp.co)',
                Accept: 'text/html,application/xhtml+xml',
              },
            });
            clearTimeout(t);
            if (pageRes.ok) {
              const html = await pageRes.text();
              const pageText = stripHtmlToText(html);
              const parsed = extractNutritionFromText(pageText);
              const score =
                (parsed.kcalPerKg ? 2 : 0) +
                (parsed.proteina ? 1 : 0) +
                (parsed.grasa ? 1 : 0) +
                (parsed.fibra ? 1 : 0) +
                (parsed.humedad ? 1 : 0);
              const prevScore =
                (bestExtracted.kcalPerKg ? 2 : 0) +
                (bestExtracted.proteina ? 1 : 0) +
                (bestExtracted.grasa ? 1 : 0) +
                (bestExtracted.fibra ? 1 : 0) +
                (bestExtracted.humedad ? 1 : 0);
              if (score > prevScore) {
                bestExtracted = parsed;
                bestSourceUrl = link;
                bestSourceTitle = candidate.displayed_link?.split('/')[0] || candidate.title;
              }
            }
          } catch {
            // Try snippet fallback below if site blocks fetch or times out
          }
        }

        // Also parse snippets from top organic results if page fetch missed nutrients
        if (!bestExtracted.proteina && !bestExtracted.kcalPerKg && sortedResults.length > 0) {
          for (const candidate of sortedResults.slice(0, 3)) {
            const snippetText = `${candidate.title || ''} ${candidate.snippet || ''}`;
            const parsed = extractNutritionFromText(snippetText);
            if (parsed.proteina || parsed.kcalPerKg || parsed.grasa) {
              bestExtracted = { ...parsed, ...bestExtracted };
              bestSourceUrl = bestSourceUrl || candidate.link;
              bestSourceTitle =
                bestSourceTitle || candidate.displayed_link?.split('/')[0] || 'Fuente web';
              break;
            }
          }
        }

        const hasLiveFields = Boolean(
          bestExtracted.kcalPerKg ||
            bestExtracted.proteina ||
            bestExtracted.grasa ||
            bestExtracted.fibra
        );

        if (hasLiveFields) {
          // Merge verified live fields with catalogFicha without overwriting missing fields with guesses
          const mergedFicha: NutritionDatasheet = {
            ...(catalogFicha || {}),
            ...bestExtracted,
            fuenteUrl: bestSourceUrl || catalogFicha?.fuenteUrl,
            fuenteNombre: bestSourceTitle || catalogFicha?.fuenteNombre || 'Web Colombia',
            fechaConsulta: nowIso,
            mercado: 'Colombia',
            coincidenciaEstado:
              bestExtracted.proteina && bestExtracted.grasa
                ? 'verificado'
                : catalogFicha?.coincidenciaEstado || 'revision_requerida',
          };
          NUTRITION_CACHE.set(cacheKey, { cachedAtMs: Date.now(), ficha: mergedFicha });
          results.push({
            key: cacheKey,
            id: food.id,
            brand: food.brand,
            name: food.name,
            lookupStatus: 'live_verified',
            isFromCache: false,
            ficha: mergedFicha,
          });
        } else if (catalogFicha) {
          results.push({
            key: cacheKey,
            id: food.id,
            brand: food.brand,
            name: food.name,
            lookupStatus: 'fallback_cached',
            isFromCache: true,
            warningNotice:
              'La consulta web no extrajo tabla nutricional legible en origen; mostrando última ficha verificada del catálogo con su fecha original.',
            ficha: catalogFicha,
          });
        } else {
          results.push({
            key: cacheKey,
            id: food.id,
            brand: food.brand,
            name: food.name,
            lookupStatus: 'missing',
            isFromCache: false,
            warningNotice: 'Falta ficha verificada en fuente oficial para esta fórmula.',
            ficha: {
              coincidenciaEstado: 'pendiente',
              mercado: 'Colombia',
              fuenteUrl: sortedResults[0]?.link,
              fuenteNombre: sortedResults[0]?.displayed_link?.split('/')[0],
              notasRevision: 'No se encontró análisis garantizado comprobable en las páginas consultadas.',
            },
          });
        }
      } catch (err: any) {
        const fallback = cached?.ficha || catalogFicha;
        results.push({
          key: cacheKey,
          id: food.id,
          brand: food.brand,
          name: food.name,
          lookupStatus: fallback ? 'fallback_cached' : 'missing',
          isFromCache: Boolean(fallback),
          warningNotice: fallback
            ? 'Error consultando fuentes en línea; se conserva última ficha verificada con su fecha original.'
            : 'No se pudo consultar la ficha en internet ni hay copia local.',
          ficha: fallback || {
            coincidenciaEstado: 'pendiente',
            mercado: 'Colombia',
            notasRevision: err?.message || 'Error de conexión.',
          },
        });
      }
    }

    return {
      results,
      serverCheckedAt: nowIso,
      provider: serpApiKey ? 'serpapi_google_search' : 'catalog_fallback',
    };
  }
}
