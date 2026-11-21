import type { FoodItem } from '../../src/types';
import { folded, labelText, labelValueSources, parseLabelValues } from '../../src/utils/nutritionLabel';
import { limitedBytes } from './colombiaRegistry';

export const registryNutritionPath = '/api/registry-nutrition';
const labelUrl = 'https://www.mirringo.com.co/nuestros-productos/mirringo-gaticos';
export const guideUrl = 'https://www.mizooco.com/cdn/shop/files/Tabla-de-suministros-mirringo-gaticos-1000x1000_800x800.jpg?v=1690497284';
const guideDigest = 'e4516114b1c49e26753764d30b7c08745cde3d4b24804c352956f818a4729a4d';

// The manufacturer publishes this feeding table as an image. Never reuse its
// transcription for a replacement document, even when the CDN keeps the URL.
export function guideForDigest(digest: string): FoodItem['feedingGuide'] {
  if (digest !== guideDigest) return;
  return {
    sourceName:'MizooCo · Mirringo Gaticos', sourceUrl:guideUrl, lifeStage:'kitten',
    ranges:[
      {minWeightKg:0.25, maxWeightKg:1, minGrams:10, maxGrams:25},
      {minWeightKg:1, maxWeightKg:3, minGrams:25, maxGrams:55},
      {minWeightKg:3, maxWeightKg:6, minGrams:55, maxGrams:85},
    ],
    aboveWeight:{afterKg:6,startGrams:85,gramsPerKg:7},
  };
}

async function liveGuide(init: RequestInit) {
  const bytes = await limitedBytes(await fetch(guideUrl, init), 1024 * 1024);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return guideForDigest(Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join(''));
}

export function readGaticosLabel(html: string, time: string): FoodItem | undefined {
  const headings = Array.from(html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi), m => folded(labelText(m[1])));
  if (headings.length !== 1 || headings[0] !== 'mirringo gaticos') return;
  // Scope interpretation to the product's own analysis, excluding related products and site navigation.
  const article = folded(labelText(html)).split('informacion nutricional');
  if (article.length !== 2) return;
  const section = article[1].split('los mejores beneficios')[0];
  if (!/mirringo gaticos\b/.test(section) || !/todos los requerimientos nutricionales para el crecimiento/.test(section)) return;
  const source = {name:'Mirringo Colombia',url:labelUrl,observedAt:time};
  const fields = labelValueSources(parseLabelValues(section, false),source);
  if (!Object.keys(fields).length) return;
  return {
    id:'co-ica-11705al', brand:'Mirringo', name:'Mirringo Gaticos', country:'Colombia', species:'cat',
    declaredIcaRegistration:'11705AL', type:'dry', lifeStage:'kitten', lifeStageKnown:true,
    nutritionalUse:'complete', isCompleteAndBalanced:true, suitableForGrowth:true,
    labelStatus:'verified_manufacturer', dataSource:source.name, kcalPerKg:fields.kcalPerKg?.valor ?? 0,
    proteinPct:fields.proteina?.valor ?? 0, fatPct:fields.grasa?.valor ?? 0,
    fiberPct:fields.fibra?.valor ?? 0, moisturePct:fields.humedad?.valor ?? 0, ashPct:fields.cenizas?.valor,
    fichaNutricional:{...fields, fuenteUrl:source.url, fuenteNombre:source.name, fechaConsulta:time, mercado:'Colombia',
      coincidenciaEstado:'verificado', notasRevision:'Análisis publicado para Mirringo Gaticos en Colombia.'},
  };
}

export async function registryNutritionResponse(url: URL, signal: AbortSignal, cache?: Cache): Promise<Response> {
  const params = url.searchParams;
  if (folded((params.get('q') ?? '').trim()).replace(/\s+/g,' ') !== 'mirringo gaticos' ||
      params.get('registration')?.replace(/[\s-]/g,'').toUpperCase() !== '11705AL' || params.get('species') !== 'cat') {
    return Response.json({food:null});
  }
  // Cache a single corroborated formula, independent of user-controlled query strings.
  const cacheKey = new URL(registryNutritionPath + '?registration=11705AL', url.origin).href;
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;
  const init = {signal:AbortSignal.any([signal,AbortSignal.timeout(8500)]),redirect:'manual' as const};
  try {
    const [html, guide] = await Promise.all([
      fetch(labelUrl,init).then(response => limitedBytes(response,450000)).then(bytes => new TextDecoder().decode(bytes)),
      liveGuide(init).catch(() => undefined),
    ]);
    const food = readGaticosLabel(html, new Date().toISOString());
    if (!food) throw new Error('Manufacturer analysis unavailable');
    if (guide) food.feedingGuide = guide;
    const response = Response.json({food},{headers:{'Cache-Control':guide ? 'public, max-age=21600' : 'no-store'}});
    if (cache && guide) await cache.put(cacheKey,response.clone()).catch(() => {});
    return response;
  } catch {
    return Response.json({food:null}, {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
