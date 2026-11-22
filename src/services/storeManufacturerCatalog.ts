import type { FoodItem, MeasurementBasis, NutrientQualifier, NutrientValue, NutritionDatasheet, Species } from '../types';

interface StoreRow {
  handle: string;
  name: string;
  brand: string;
  species: Species;
  storePackagesKg: number[];
}

export interface OfficialFormula {
  name: string;
  brand: string;
  species: Species;
  handles: string[];
  url: string;
  verifiedOn: string;
  complete?: boolean;
  ingredients?: string;
  feedingGuide?: FoodItem['feedingGuide'];
  registration?: string;
  sourceName?: string;
  nutrientSourceUrl?: string;
  nutrientSourceName?: string;
  packageSources?: Record<string,string>;
  basis?: MeasurementBasis;
  protein?: number;
  proteinMin?: number;
  fat?: number;
  fatMin?: number;
  fiber?: number;
  fiberMax?: number;
  moisture?: number;
  moistureMax?: number;
  ash?: number;
  ashMax?: number;
  carbs?: number;
  kcalKg?: number;
  kcalSourceUrl?: string;
  kcalSourceName?: string;
  discrepancies?: NutritionDatasheet['discrepancies'];
  kcalQualifier?: NutrientQualifier;
  packagesKg?: number[];
}

export interface StoreManufacturerFood extends StoreRow {
  packagesKg: number[];
  officialPackagesKg?: number[];
  storeUrl: string;
  houseUrl: string;
  house: string;
  officialUrl?: string;
  verifiedOn?: string;
  formula?: OfficialFormula;
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function words(s: string) {
  return fold(s).replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
}
const ignore = new Set(['alimento','alimentos','comida','concentrado','para','de','del','el','la','los','las','en','seco','seca','perro','perros','gato','gatos']);
function identity(s:string) {
  return words(s).filter(w => !ignore.has(w)).join(' ');
}
function distinctSizes(values: number[]) {
  return [...new Set(values.filter(v => Number.isFinite(v) && v > 0))].sort((a,b) => a-b);
}
async function loadStore() {
  const [inventory, houses, domestic, international, other, specialty] = await Promise.all([
    import('../data/manufacturers/store.json'), import('../data/manufacturers/houses.json'),
    import('../data/manufacturers/colombia.json'), import('../data/manufacturers/internacional.json'),
    import('../data/manufacturers/otras.json'), import('../data/manufacturers/especialidades.json'),
  ]);
  const contacts = new Map(houses.default.map(row => [row.brand,row]));
  const formulas = new Map<string,OfficialFormula>();
  for (const group of [domestic, international, other, specialty]) {
    for (const formula of group.default as OfficialFormula[]) {
      for (const handle of formula.handles) {
        if (formulas.has(handle)) throw new Error('Duplicate manufacturer sheet for ' + handle);
        formulas.set(handle, formula);
      }
    }
  }
  return (inventory.default as StoreRow[]).map((row): StoreManufacturerFood => {
    const contact = contacts.get(row.brand)!;
    const candidate = formulas.get(row.handle);
    const formula = candidate?.species === row.species ? candidate : undefined;
    return {...row, house:contact.house, houseUrl:contact.url,
      storeUrl:'https://cultivacenter.com/products/' + row.handle,
      officialUrl:formula?.url, verifiedOn:formula?.verifiedOn, formula,
      officialPackagesKg:formula?.packagesKg,
      packagesKg:distinctSizes([...row.storePackagesKg, ...(formula?.packagesKg ?? [])]),
    };
  });
}

let snapshot: ReturnType<typeof loadStore> | undefined;
export function getStoreManufacturerCatalog() {
  return snapshot ??= loadStore().catch(error => { snapshot = undefined; throw error; });
}

export function storeSheetStatus(row: StoreManufacturerFood): 'complete' | 'partial' | 'pending' {
  const formula = row.formula;
  if (!formula) return 'pending';
  const percentages = [formula.proteinMin ?? formula.protein, formula.fatMin ?? formula.fat, formula.fiberMax ?? formula.fiber];
  const hasAnalysis = percentages.every(value => value !== undefined && Number.isFinite(value) && value >= 0 && value <= 100);
  return hasAnalysis && Number.isFinite(formula.kcalKg) && (formula.kcalKg ?? 0) > 0 && row.packagesKg.length > 0
    ? 'complete' : 'partial';
}

export async function getStoreSheetCoverage() {
  const rows = await getStoreManufacturerCatalog();
  const counts = { complete: 0, partial: 0, pending: 0, total: rows.length };
  for (const row of rows) counts[storeSheetStatus(row)]++;
  return counts;
}

export async function searchStoreManufacturerFoods(query: string, species: Species): Promise<StoreManufacturerFood[]> {
  const terms = words(query).filter(w => !ignore.has(w));
  if (!terms.length) return [];
  const needle = terms.join(' ');
  return (await getStoreManufacturerCatalog()).filter(row => row.species === species)
    .map(row => {
      const full = words(row.brand + ' ' + row.name + ' ' + (row.formula?.name ?? '')).join(' ');
      const exact = identity(row.name) === needle || (!!row.formula && identity(row.formula.name) === needle);
      const score = terms.every(t => full.includes(t)) ? Number(exact)*4 + Number(full.includes(needle))*2 + Number(!!row.formula) : -1;
      return {row,score};
    }).filter(hit => hit.score >= 0).sort((a,b) => b.score-a.score || a.row.name.localeCompare(b.row.name,'es')).map(hit => hit.row);
}

const fields = [
  ['proteina','proteinMin','protein','minimo','proteinPct'], ['grasa','fatMin','fat','minimo','fatPct'],
  ['fibra','fiberMax','fiber','maximo','fiberPct'], ['humedad','moistureMax','moisture','maximo','moisturePct'],
  ['cenizas','ashMax','ash','maximo','ashPct'],
] as const;
function withFormula(food: FoodItem, row:StoreManufacturerFood): FoodItem {
  const formula = row.formula;
  if (!formula || food.labelStatus === 'user_confirmed_label') return food;
  const source = {name:formula.sourceName ?? row.house, url:formula.url, observedAt:formula.verifiedOn};
  const analysisSource = formula.nutrientSourceUrl
    ? {...source, name: formula.nutrientSourceName ?? source.name, url: formula.nutrientSourceUrl}
    : source;
  const data: NutritionDatasheet = { ...food.fichaNutricional, fuenteNombre:source.name, fuenteUrl:formula.url,
    fechaConsulta:formula.verifiedOn, coincidenciaEstado:'verificado' };
  if (formula.discrepancies?.length) {
    const conflicts = new Map((data.discrepancies ?? []).map(entry => [entry.field + ' ' + entry.sourceUrl,entry]));
    for (const entry of formula.discrepancies) conflicts.set(entry.field + ' ' + entry.sourceUrl,entry);
    data.discrepancies = [...conflicts.values()];
  }
  const result = {...food};
  const basis = formula.basis ?? 'tal_como_se_vende';
  for (const [key,bound,typical,qualifier,flat] of fields) {
    const valor = formula[bound] ?? formula[typical];
    if (valor === undefined) continue;
    data[key] = {valor, unidadOriginal:'%', baseMedicion:basis, calificador:formula[bound] === undefined ? 'tipico' : qualifier, source:analysisSource};
    if (basis === 'tal_como_se_vende') result[flat] = valor;
    else if (flat === 'ashPct') result.ashPct = undefined;
    else result[flat] = 0;
  }
  if (formula.carbs !== undefined) {
    data.carbohidratos = {valor:formula.carbs, unidadOriginal:'%',baseMedicion:basis,calificador:'tipico',source:analysisSource};
    result.carbsPct = basis === 'tal_como_se_vende' ? formula.carbs : undefined;
  }
  if (formula.kcalKg !== undefined) {
    data.kcalPerKg = {valor:formula.kcalKg, unidadOriginal:'kcal/kg', baseMedicion:'tal_como_se_vende',
      calificador:formula.kcalQualifier ?? 'tipico', source:formula.kcalSourceUrl ? {...source,name:formula.kcalSourceName ?? source.name,url:formula.kcalSourceUrl} : source};
    result.kcalPerKg = formula.kcalKg;
  }
  const nutritionalFields = ['proteina','grasa','fibra','humedad','cenizas','carbohidratos','kcalPerKg'] as const;
  const values = nutritionalFields.map(key => data[key]).filter((v): v is NutrientValue => !!v);
  const onlyOfficial = values.length > 0 && (food.labelStatus === 'verified_manufacturer' ||
    values.every(v => v.source?.url === formula.url || v.source?.url === analysisSource.url || (formula.kcalSourceUrl && v.source?.url === formula.kcalSourceUrl)));
  data.coincidenciaEstado = onlyOfficial ? 'verificado' : values.length ? 'revision_requerida' : 'pendiente';
  data.notasRevision = onlyOfficial ? 'Ficha oficial de la fórmula seleccionada.' : 'Revisa la procedencia de cada valor y completa los campos pendientes con el empaque.';
  return {...result, fichaNutricional:data, dataSource:source.name,
    declaredIcaRegistration:formula.registration || food.declaredIcaRegistration,
    feedingGuide:food.feedingGuide ?? formula.feedingGuide,
    ingredientsSummary:formula.ingredients ?? food.ingredientsSummary,
    labelStatus:onlyOfficial ? 'verified_manufacturer' : 'unconfirmed',
    nutritionalUse:formula.complete ? 'complete' : food.nutritionalUse,
    isCompleteAndBalanced:formula.complete || food.isCompleteAndBalanced };
}

export function selectStoreManufacturerFood(row:StoreManufacturerFood, packageKg?:number): FoodItem {
  const title=fold([row.formula?.name, row.name].filter(Boolean).join(' '));
  const stage = /\b(gatitos?|gaticos?|filhotes?|kittens?|cachorros?|pupp(?:y|ies))\b/.test(title) ? (row.species === 'dog' ? 'puppy' : 'kitten')
    : /\b(senior|mature)\b/.test(title) ? 'senior' : /\b(adultos?|adults?)\b/.test(title) ? 'adult' : 'all';
  const id = 'agrocentro-' + row.handle;
  return withFormula({id,sourceFoodId:id,brand:row.brand,name:row.name,species:row.species,type:'dry',lifeStage:stage,lifeStageKnown:stage!=='all',
    storeName:'Agrocentro Pets',storeProductUrl:row.storeUrl,buyUrl:row.storeUrl,country:'Colombia',
    availableSizesKg:row.packagesKg, bagSizeKg:packageKg !== undefined && row.packagesKg.includes(packageKg) ? packageKg : undefined,
    kcalPerKg:0,proteinPct:0,fatPct:0,fiberPct:0,moisturePct:0,labelStatus:'unconfirmed',
    fichaNutricional:{coincidenciaEstado:'pendiente',mercado:'Colombia'}}, row);
}

/** Merge only on an exact formula or an identified store listing. Choosing another
 * retailer must keep its price, pack, barcode, stock source and serving guide. */
export async function enrichFoodFromStoreManufacturer(food:FoodItem): Promise<FoodItem> {
  if (food.type !== 'dry' || food.labelStatus === 'user_confirmed_label') return food;
  const catalog = await getStoreManufacturerCatalog();
  const listing = food.storeProductUrl?.split(/[?#]/)[0].replace(/\/$/,'');
  const direct = catalog.find(row => row.species === food.species &&
    (row.storeUrl === listing || (!listing && food.sourceFoodId === 'agrocentro-' + row.handle)));
  if (direct) {
    const availableSizesKg = distinctSizes([...(food.availableSizesKg ?? []), ...direct.packagesKg]);
    return withFormula({...food, availableSizesKg}, direct);
  }
  const brand = identity(food.brand);
  if (!brand) return food;
  const equivalents = (name:string) => {
    const key = identity(name);
    return key.startsWith(brand + ' ') ? key : brand + ' ' + key;
  };
  const key = equivalents(food.name);
  const matches = catalog.filter(row => row.species === food.species && identity(row.brand) === brand &&
    (equivalents(row.name) === key || (row.formula && equivalents(row.formula.name) === key)));
  const formulas = new Set(matches.map(row => row.formula));
  if (!matches.length || formulas.size !== 1 || !matches[0].formula) return food;
  const formula = matches[0].formula;
  if (food.declaredIcaRegistration && formula.registration && food.declaredIcaRegistration !== formula.registration) return food;
  const hasRetailOffer = !!(food.storeProductUrl || food.buyUrl || food.priceBasis || food.packagePrices?.length);
  const base = hasRetailOffer ? food : {...food,
    availableSizesKg:distinctSizes([...(food.availableSizesKg ?? []), ...(formula.packagesKg ?? [])])};
  return withFormula(base,matches[0]);
}
