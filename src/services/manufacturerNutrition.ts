import type { FoodItem, NutritionDatasheet, NutrientValue } from '../types';
import {
  declaredIngredients, declaredUse, folded, foodRegistration, labelDiscrepancies,
  labelText, labelValueSources, parseLabelValues, readFeedingGuide,
} from '../utils/nutritionLabel';

const italcol = 'https://www.italcolmascotas.com';
const exactName = (value: string) => folded(labelText(value)).replace(/[^a-z0-9+]+/g, ' ').trim();

function formulaTitle(storeTitle: string): string {
  // Keep the full formula identity. Only strip a separated, generic sales description.
  return storeTitle.replace(/\s+[–—|-]\s+(?:alimento|concentrado|croquetas)\b.*$/i, '').trim();
}

interface OfficialPage { html: string; title: string; url: string; sourceName: string }

const trustedBrands: Array<[RegExp, string[]]> = [
  [/\broyal canin\b/i, ['royalcanin.com']],
  [/\bpurina\b/i, ['purina.com.co']],
  [/\bhill.s\b/i, ['hillspet.com.co','hillspet.com']],
  [/\bsolla\b/i, ['solla.com']],
  [/\bfarmina\b/i, ['farmina.com']],
];

async function fetchSource(input: URL, signal: AbortSignal, json: boolean) {
  const response = await fetch(input, {
    credentials: 'omit', redirect: 'error', signal,
    headers: {Accept: json ? 'application/json' : 'text/html'},
  });
  if (!response.ok) throw new Error('Ficha no disponible');
  return response;
}

async function manufacturerPage(title: string, description: string, signal: AbortSignal): Promise<OfficialPage | undefined> {
  const formula = formulaTitle(title);
  if (/^(?:agility gold|chunky|italcan|7vidas)\b/i.test(formula)) {
    // The official WP catalogue supports CORS. Never use search snippets as nutrition evidence.
    const directory = new URL('/wp-json/wp/v2/search', italcol);
    directory.search = new URLSearchParams({search:formula, per_page:'6', _fields:'id,title,url,subtype'}).toString();
    const items:unknown = await (await fetchSource(directory, signal, true)).json();
    if (!Array.isArray(items)) return;
    const candidates = items.filter(item => item && Number.isSafeInteger(item.id) && item.id > 0 &&
      item.subtype === 'post' && typeof item.title === 'string' && exactName(item.title) === exactName(formula));
    if (candidates.length !== 1) return;
    const postUrl = new URL('/wp-json/wp/v2/posts/' + candidates[0].id, italcol);
    postUrl.searchParams.set('_fields','id,title,link,content');
    const post = await (await fetchSource(postUrl, signal, true)).json();
    if (post?.id !== candidates[0].id || typeof post.title?.rendered !== 'string' ||
        exactName(post.title.rendered) !== exactName(formula) || typeof post.link !== 'string' ||
        new URL(post.link).origin !== italcol || post.link !== candidates[0].url || typeof post.content?.rendered !== 'string') return;
    return {html:post.content.rendered, title:labelText(post.title.rendered), url:post.link, sourceName:'Italcol Mascotas'};
  }

  // A retail page can explicitly link a datasheet from its brand. Accept that page only
  // when its product heading or Colombian registration independently confirms the identity.
  const brand = trustedBrands.find(([pattern]) => pattern.test(title));
  if (!brand) return;
  for (const match of description.matchAll(/href\s*=\s*["'](https:\/\/[^"'\s]+)["']/gi)) {
    let url: URL;
    try {url = new URL(match[1]);} catch {continue;}
    if (url.username || url.password || url.port || !brand[1].some(domain => url.hostname === domain || url.hostname === 'www.' + domain)) continue;
    const html = await (await fetchSource(url,signal,false)).text();
    const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
    const registration = foodRegistration(description);
    if (!heading || (exactName(heading) !== exactName(formula) && (!registration || registration !== foodRegistration(html)))) return;
    // A full page can include recommendations for other products. Only one analysis is eligible.
    return {html, title:labelText(heading), url:url.href, sourceName:url.hostname.replace(/^www\./,'')};
  }
}

/** Marketing prose is never substituted for a declared analysis. Incomplete
 * and conflicting fields remain separately reviewable on the same formula. */
export async function enrichOnlineNutrition(food: FoodItem, title: string, description: string, signal: AbortSignal): Promise<FoodItem> {
  const storeUrl = food.storeProductUrl || food.fichaNutricional?.fuenteUrl;
  if (!storeUrl || !/^https:\/\//i.test(storeUrl)) return food;
  let storeHost: URL;
  try {storeHost = new URL(storeUrl);} catch {return food;}
  if (storeHost.username || storeHost.password) return food;
  const time = food.fichaNutricional?.fechaConsulta || new Date().toISOString();
  const storeSource = {
    name: food.fichaNutricional?.fuenteNombre || food.priceBasis?.storeName || storeHost.hostname.replace(/^www\./, ''),
    url:storeUrl, observedAt:time,
  };
  const store = labelValueSources(parseLabelValues(description,true),storeSource);
  let page: OfficialPage | undefined;
  try {page = await manufacturerPage(title, description, AbortSignal.any([signal, AbortSignal.timeout(5500)]));}
  catch {if (signal.aborted) throw signal.reason;}
  const registration = foodRegistration(description);
  if (page && registration && foodRegistration(page.html) !== registration) page = undefined;
  const source: NonNullable<NutrientValue['source']> = page ?
    {name:page.sourceName, url:page.url, observedAt:time} : storeSource;
  const official = page ? labelValueSources(parseLabelValues(page.html,true),source) : {};
  const hasOfficial = Object.keys(official).length > 0;
  const fields = {...store, ...official};
  const hasSupplementaryStoreFields = Object.keys(store).some(key => !(key in official));
  const manufacturerVerified = hasOfficial && !hasSupplementaryStoreFields;
  const hasFields = Object.keys(fields).length > 0;
  const productSource = hasOfficial ? source : storeSource;
  const ficha: NutritionDatasheet = {
    ...food.fichaNutricional, ...fields, fechaConsulta:time,
    coincidenciaEstado:manufacturerVerified ? 'verificado' : hasFields ? 'revision_requerida' : 'pendiente',
    fuenteNombre:productSource.name, fuenteUrl:productSource.url,
    notasRevision:manufacturerVerified ? 'Datos publicados por el fabricante para esta fórmula.'
      : hasFields ? 'Contrasta con tu empaque los valores publicados por la tienda antes de aplicar la ficha.' : 'Análisis pendiente de la etiqueta.',
    discrepancies:page ? labelDiscrepancies(official, store, storeUrl) : undefined,
  };
  const use = (page && declaredUse(page.html)) || declaredUse(description) || food.nutritionalUse;
  return {
    ...food, fichaNutricional:ficha, declaredIcaRegistration:registration,
    labelStatus:manufacturerVerified ? 'verified_manufacturer' : 'unconfirmed',
    dataSource:productSource.name,
    ingredientsSummary:(page && declaredIngredients(page.html)) || declaredIngredients(description),
    feedingGuide:(page && readFeedingGuide(page.html,page.url,page.sourceName)) || readFeedingGuide(description,storeUrl,storeSource.name),
    nutritionalUse:use,
    isCompleteAndBalanced:use === 'complete' ? true : undefined,
    kcalPerKg:manufacturerVerified ? (official.kcalPerKg?.valor ?? 0) : 0,
    proteinPct:fields.proteina?.baseMedicion === 'tal_como_se_vende' ? fields.proteina.valor : 0,
    fatPct:fields.grasa?.baseMedicion === 'tal_como_se_vende' ? fields.grasa.valor : 0,
    fiberPct:fields.fibra?.baseMedicion === 'tal_como_se_vende' ? fields.fibra.valor : 0,
    moisturePct:fields.humedad?.baseMedicion === 'tal_como_se_vende' ? fields.humedad.valor : 0,
    ashPct:fields.cenizas?.baseMedicion === 'tal_como_se_vende' ? fields.cenizas.valor : undefined,
    carbsPct:fields.carbohidratos?.baseMedicion === 'tal_como_se_vende' ? fields.carbohidratos.valor : undefined,
  };
}
