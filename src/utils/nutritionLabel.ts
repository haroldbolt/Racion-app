import type { FoodItem, MeasurementBasis, NutrientValue, NutritionDatasheet } from '../types';

export const labelFields = ['proteina', 'grasa', 'fibra', 'humedad', 'cenizas', 'carbohidratos', 'kcalPerKg'] as const;
export type LabelField = typeof labelFields[number];
export type LabelValues = Partial<Record<LabelField, NutrientValue>>;

export function labelText(html: string): string {
  return html.slice(0, 450000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(aacute|eacute|iacute|oacute|uacute|ntilde|uuml|amp|nbsp|quot|ndash|mdash);/gi, (_, key: string) => ({
      aacute:'á', eacute:'é', iacute:'í', oacute:'ó', uacute:'ú', ntilde:'ñ', uuml:'ü',
      amp:'&', nbsp:' ', quot:'"', ndash:'–', mdash:'—',
    }[key.toLowerCase()] ?? ' '))
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, digits: string) => {
      const code = digits[0].toLowerCase() === 'x' ? parseInt(digits.slice(1),16) : Number(digits);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    }).replace(/\s+/g, ' ').trim();
}

export const folded = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const nutrientNames: Record<Exclude<LabelField,'kcalPerKg'>, string> = {
  proteina: 'proteinas?|crude protein', grasa: 'grasas?|lipidos?|extracto etereo|crude fat',
  fibra: 'fibras?|materia fibrosa|crude fib(?:er|re)', humedad: 'humedad|moisture',
  cenizas: 'cenizas?|materia(?:s)? mineral(?:es)?|minerales totales|crude ash|ash', carbohidratos: 'carbohidratos?|carbohydrates?',
};
const declarations = '(minim[oa]|minimum|min|at least|maxim[oa]|maximum|max|at most|tipic[oa]|typical|[≥≤])';
const quantity = '(\\d{1,4}(?:[.,]\\d+)?)\\s*(%|g\\s*\\/\\s*(?:kg|100\\s*g)\\b)';
const analysisHeading = /\b(?:analisis (?:nutricional|garantizado|tipico|proximal)|composicion (?:nutricional|garantizada|analitica)|(?:informacion|tabla) nutricional|constituyentes analiticos|niveles (?:de garantia|garantizados)|guaranteed analysis|typical analysis|analytical constituents|nutrition(?:al)? (?:information|analysis))\s*:?/;
function qualifier(value: string): NutrientValue['calificador'] | undefined {
  if (/^(?:min|at least|≥)/.test(value)) return 'minimo';
  if (/^(?:max|at most|≤)/.test(value)) return 'maximo';
  if (/^(tipic|typical)/.test(value)) return 'tipico';
  return undefined;
}

function energyNumber(raw: string): number | undefined {
  if (/^\d[.,]\d{3}$/.test(raw)) return Number(raw.replace(/[.,]/g, ''));
  if (/^\d{2,5}(?:[.,]\d{1,2})?$/.test(raw)) return Number(raw.replace(',', '.'));
}

function readDeclaredNutrients(body: string, basis: MeasurementBasis, typical: boolean): LabelValues {
  const values: LabelValues = {};
  for (const [key, name] of Object.entries(nutrientNames)) {
    const attribute = '\\b(?:' + name + ')(?:\\s+(?:crud[oa]s?|brut[oa]s?|total(?:es)?))?\\s*:?[\\s(]*';
    const quantities = quantity + '(?:\\s*\\(\\s*' + quantity + '\\s*\\))?';
    const prefix = new RegExp(attribute + declarations + '[.)\\s:|]*' + quantities, 'g');
    const suffix = new RegExp(attribute + quantity + '\\s*\\(?'+ declarations + '(?![a-z])', 'g');
    const matches = [
      ...Array.from(body.matchAll(prefix)).flatMap(m => {
        const paired = [{raw:m[2],unit:m[3],declaration:m[1]}];
        if (m[4]) paired.push({raw:m[4],unit:m[5],declaration:m[1]});
        return paired;
      }),
      ...Array.from(body.matchAll(suffix), m => ({raw:m[1],unit:m[2],declaration:m[3]})),
    ];
    if (!matches.length && typical) {
      const amount = new RegExp(attribute + quantity, 'g');
      matches.push(...Array.from(body.matchAll(amount), m => ({raw:m[1],unit:m[2],declaration:'tipico'})));
    }
    const distinct = new Map<string, NutrientValue>();
    for (const match of matches) {
      const unit = match.unit.replace(/\s+/g, '');
      // g/100 g is already a percent; ten g/kg are one percent by weight.
      const value = Number(match.raw.replace(',', '.')) / (unit === 'g/kg' ? 10 : 1);
      const declaration = qualifier(match.declaration);
      if (!declaration || value > 100) continue;
      const field: NutrientValue = {valor:value, unidadOriginal:'%', calificador:declaration, baseMedicion:basis};
      if (unit !== '%') field.declaracionOriginal = match.raw + ' ' + match.unit;
      const identity = value + ':' + declaration;
      if (!distinct.has(identity)) distinct.set(identity,field);
    }
    if (distinct.size === 1) values[key as LabelField] = distinct.values().next().value;
  }
  return values;
}

/** Import amounts and their declarations from a matched SKU's analysis or package label.
 * Marketing claims, serving sizes, and units per volume cannot supply concentration. */
export function parseLabelValues(raw: string, requireAnalysisHeading: boolean): LabelValues {
  const text = folded(labelText(raw));
  const dry = /materia seca|dry matter/.test(text);
  if (dry && /tal como se (?:vende|ofrece|sirve)|as[ -]fed|base humeda/.test(text)) return {};
  const basis: MeasurementBasis = dry ? 'materia_seca' : 'tal_como_se_vende';
  const headingParts = text.split(analysisHeading);
  const typical = /analisis tipico|typical analysis/.test(text);
  const blocks = headingParts.slice(1)
    .map(part => part.split(/racion diaria|registro ica|ingredientes|instrucciones de alimentacion|cantidades de suministro|guia de alimentacion|feeding guide/)[0])
    .filter(part => /\d\s*(?:%|g\s*\/)/.test(part));
  // A single SKU can repeat a section heading. Distinct analyses need manual matching.
  if (new Set(blocks.map(part => part.trim())).size > 1) return {};
  let values: LabelValues = {};
  if (blocks.length || !requireAnalysisHeading) {
    values = readDeclaredNutrients(blocks[0] ?? text,basis,typical);
  } else if (headingParts.length === 1) {
    // Some retailers expose a structured analysis table without a section title.
    // Require at least two independently qualified rows and only one eligible table.
    const tables = Array.from(raw.slice(0,450000).matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi), match => {
      const rows = Array.from(match[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), row => folded(labelText(row[1])));
      if (rows.filter(row => /^(?:proteina|grasa|lipido|fibra|materia |humedad|ceniza|carbohidrato|crude |moisture|ash)/.test(row)).length < 2) return {};
      return readDeclaredNutrients(rows.join('; '),basis,false);
    }).filter(fields => Object.keys(fields).length >= 2);
    if (tables.length === 1) values = tables[0];
  }

  // The unit may precede the number in a table. Convert only explicit mass units.
  const energyName = '(?:energia metabolizable|metabolizable energy|contenido calorico|calorie content|\\bem\\b)';
  const unit = '(kcal\\s*\\/\\s*(?:kg|100\\s*g))\\b';
  const amount = '(\\d[\\d.,]{0,8})';
  const before = new RegExp(energyName + '\\s*[:=(]?\\s*(?:calculad[oa]\\)?\\s*)?' + amount + '\\s*' + unit, 'g');
  const after = new RegExp(energyName + '\\s*\\(?' + unit + '\\s*\\)?\\s*[:|]?\\s*' + amount, 'g');
  const entries = [
    ...Array.from(text.matchAll(before), match => [match[1],match[2]]),
    ...Array.from(text.matchAll(after), match => [match[2],match[1]]),
  ];
  const energies = new Map<number,NutrientValue>();
  for (const [rawValue,rawUnit] of entries) {
    const v = energyNumber(rawValue);
    const per100g = /100/.test(rawUnit);
    const kcal = v === undefined ? 0 : v * (per100g ? 10 : 1);
    if (kcal <= 0 || kcal > 10000) continue;
    const value: NutrientValue = {valor:kcal, unidadOriginal:'kcal/kg', calificador:'tipico', baseMedicion:basis};
    if (per100g) value.declaracionOriginal = rawValue + ' ' + rawUnit;
    energies.set(kcal,value);
  }
  if (energies.size === 1 && basis === 'tal_como_se_vende') values.kcalPerKg = energies.values().next().value;
  return values;
}

export function foodRegistration(raw: string): string | undefined {
  const matches = labelText(raw).matchAll(/\b(?:registro\s+)?ica\s*[:.#-]?\s*(\d{3,7})[\s-]*(al|sl)\b/gi);
  const registrations = new Set(Array.from(matches, match => (match[1] + match[2]).toUpperCase()));
  return registrations.size === 1 ? [...registrations][0] : undefined;
}

export function declaredIngredients(raw: string): string | undefined {
  const sections = raw.slice(0,450000).replace(/<(h[1-6]|strong|b)\b[^>]*>\s*(?:lista de )?(?:ingredientes|ingredients)(?:\s+(?:del?|para)\s+[^<]{1,100})?\s*:?\s*<\/\1>/gi, ' Ingredientes: ')
    .replace(/<(?:h[1-6]|table)\b[^>]*>/gi, ' § ');
  const list = /\b(?:lista de )?(?:ingredientes|ingredients)\s*:\s*(.{2,4500}?)(?=§|\b(?:instrucciones de alimentaci[oó]n|an[aá]lisis (?:garantizado|nutricional)|informaci[oó]n nutricional|composici[oó]n nutricional|guaranteed analysis|registro ica|gu[ií]a de alimentaci[oó]n|presentaciones|cantidad diaria)\b|$)/i.exec(labelText(sections))?.[1]?.trim();
  if (!list || list.length >= 4200 || !/[a-záéíóúñ]/i.test(list)) return;
  return list;

}

export function declaredUse(raw: string): FoodItem['nutritionalUse'] {
  const text = folded(labelText(raw));
  if (/\balimento (?:complementario|suplementario)\b|\buso (?:complementario|intermitente)\b/.test(text)) return 'complementary';
  if (/\balimento completo\b|\bcomplete and balanced\b/.test(text)) return 'complete';
  return undefined;
}

/** Read only an explicit body-weight vs daily-grams table; an age/BCS/multiple-column chart is different. */
export function readFeedingGuide(html: string, sourceUrl: string, sourceName: string): FoodItem['feedingGuide'] {
  const guides = [];
  for (const [table] of html.slice(0,450000).matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const rows = Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi),
      row => Array.from(row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi), cell => folded(labelText(cell[1]))));
    if (rows[0]?.length !== 2) continue;
    const [weights, portions] = rows[0];
    if (!/(?:peso|weight).*\bkg\b/.test(weights) ||
        !/racion diaria|cantidad diaria|por dia|al dia|g\s*\/\s*dia|gramos diarios|daily|per day|g\s*\/\s*day/.test(portions)) continue;
    const gramHeader = /\b(?:g|gr|gramos|grams)\b/.test(portions);
    const ranges: NonNullable<FoodItem['feedingGuide']>['ranges'] = [];
    for (const cells of rows.slice(1)) {
      if (cells.length !== 2) continue;
      const weight = /^(\d+(?:[.,]\d+)?)(?:\s*(?:[-–—]|a|to)\s*(\d+(?:[.,]\d+)?))?\s*(?:kg)?$/.exec(cells[0]);
      const grams = /^(\d+)(?:\s*(?:[-–—]|a|to)\s*(\d+))?\s*(gramos|grams|gr|g)?$/.exec(cells[1]);
      if (!weight || !grams || (!grams[3] && !gramHeader)) continue;
      const minWeightKg = Number(weight[1].replace(',', '.')), maxWeightKg = Number((weight[2] ?? weight[1]).replace(',', '.'));
      const minGrams = Number(grams[1]), maxGrams = Number(grams[2] ?? grams[1]);
      if (minWeightKg > 0 && maxWeightKg >= minWeightKg && minGrams > 0 && maxGrams >= minGrams) {
        ranges.push({minWeightKg, maxWeightKg, minGrams, maxGrams});
      }
    }
    if (ranges.length) guides.push(ranges);
  }
  // Separate guides can describe different ages, activity levels, or mixed feeding.
  if (guides.length === 1) return {sourceUrl, sourceName, ranges:guides[0]};
}

/** Preserve field-level attribution after confirming one missing value from a different source. */
export function labelValueSources(values: LabelValues, source: NonNullable<NutrientValue['source']>): LabelValues {
  return Object.fromEntries(Object.entries(values).map(([key, field]) => [key, {...field, source}]));
}

export function labelDiscrepancies(official: LabelValues, store: LabelValues, storeUrl: string): NutritionDatasheet['discrepancies'] {
  return labelFields.flatMap(key => {
    const first = official[key], second = store[key];
    if (!first || !second || (first.valor === second.valor && first.baseMedicion === second.baseMedicion && first.calificador === second.calificador)) return [];
    return [{field:key, other:second, sourceUrl:storeUrl}];
  });
}
