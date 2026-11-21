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
  proteina: 'proteinas?|crude protein', grasa: 'grasas?|lipidos?|crude fat',
  fibra: 'fibras?|crude fib(?:er|re)', humedad: 'humedad|moisture',
  cenizas: 'cenizas?|minerales totales|ash', carbohidratos: 'carbohidratos?|carbohydrates?',
};
const declarations = '(minim[oa]|min|at least|maxim[oa]|max|at most|tipic[oa]|typical|[≥≤])';
const numberPct = '(\\d{1,3}(?:[.,]\\d+)?)\\s*%';
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

/** Only values explicitly associated with a unit and label declaration are imported. */
export function parseLabelValues(raw: string, requireAnalysisHeading: boolean): LabelValues {
  const text = folded(labelText(raw));
  const sections = text.split(/\b(?:analisis (?:nutricional|garantizado|tipico)|composicion (?:garantizada|analitica)|constituyentes analiticos|guaranteed analysis|typical analysis)\s*:?/);
  const values: LabelValues = {};
  // Mixed measurement bases, e.g. solids and dry-matter values on one sheet, need human review.
  const dry = /materia seca|dry matter/.test(text);
  if (dry && /tal como se (?:vende|ofrece)|as[ -]fed|base humeda/.test(text)) return values;
  const basis: MeasurementBasis = dry ? 'materia_seca' : 'tal_como_se_vende';
  const hasAnalysis = sections.length === 2;
  const body = hasAnalysis ? sections[1].split(/racion diaria|registro ica|ingredientes|instrucciones de alimentacion|cantidades de suministro|guia de alimentacion/)[0] : text;
  if ((!requireAnalysisHeading && sections.length <= 2) || hasAnalysis) {
    for (const [key, name] of Object.entries(nutrientNames)) {
      const attribute = '\\b(?:' + name + ')(?:\\s+(?:crud[oa]s?|brut[oa]s?|total(?:es)?|cruda))?\\s*:?[\\s(]*';
      const prefix = new RegExp(attribute + declarations + '[.)\\s:]*' + numberPct, 'g');
      const suffix = new RegExp(attribute + numberPct + '\\s*\\(?'+ declarations +'\\b', 'g');
      const matches = [
        ...Array.from(body.matchAll(prefix), m => [m[2], m[1]]),
        ...Array.from(body.matchAll(suffix), m => [m[1], m[2]]),
      ];
      // A declared average/typical analysis can omit individual qualifiers.
      if (!matches.length && /analisis tipico|typical analysis/.test(text)) {
        const typical = new RegExp(attribute + numberPct, 'g');
        matches.push(...Array.from(body.matchAll(typical), m => [m[1], 'tipico']));
      }
      const distinct = new Map(matches.map(([rawValue, declaration]) => {
        const value = Number(rawValue.replace(',', '.'));
        const q = qualifier(declaration);
        return [value + ':' + q, {valor:value, unidadOriginal:'%', calificador:q, baseMedicion:basis}];
      }));
      if (distinct.size !== 1) continue;
      const nutrient = distinct.values().next().value;
      if (nutrient && nutrient.calificador && nutrient.valor >= 0 && nutrient.valor <= 100) {
        values[key as LabelField] = {...nutrient, calificador:nutrient.calificador};
      }
    }
  }
  // A kcal/cup, kcal/can or kcal/100g figure must never become kcal/kg.
  const energies = [...text.matchAll(/(?:energia metabolizable|metabolizable energy|contenido calorico|calorie content|\bem\b)\s*[:=(]?\s*(?:calculad[oa]\)?\s*)?(\d[\d.,]{1,8})\s*kcal\s*\/\s*kg\b/g)]
    .map(m => energyNumber(m[1])).filter((v):v is number => v !== undefined && v > 0 && v <= 10000);
  if (new Set(energies).size === 1 && basis === 'tal_como_se_vende') {
    values.kcalPerKg = {valor:energies[0], unidadOriginal:'kcal/kg', calificador:'tipico', baseMedicion:basis};
  }
  return values;
}

export function foodRegistration(raw: string): string | undefined {
  return /\b(?:registro\s+)?ica\s*[:.#-]?\s*(\d{3,7})\s*(al|sl)\b/i.exec(labelText(raw))?.slice(1).join('').toUpperCase();
}

export function declaredIngredients(raw: string): string | undefined {
  const list = /\b(?:lista de )?ingredientes\s*:\s*(.{4,2600}?)(?=\b(?:instrucciones de alimentaci[oó]n|an[aá]lisis garantizado|registro ica|gu[ií]a de alimentaci[oó]n|presentaciones|cantidad diaria)\b|$)/i.exec(labelText(raw))?.[1]?.trim();
  return list && list.includes(',') && list.length < 2200 ? list : undefined;
}

export function declaredUse(raw: string): FoodItem['nutritionalUse'] {
  const text = folded(labelText(raw));
  if (/\balimento (?:complementario|suplementario)\b|\buso (?:complementario|intermitente)\b/.test(text)) return 'complementary';
  if (/\balimento completo\b|\bcomplete and balanced\b/.test(text)) return 'complete';
  return undefined;
}

/** Read only an explicit body-weight vs daily-grams table; an age/BCS/multiple-column chart is different. */
export function readFeedingGuide(html: string, sourceUrl: string, sourceName: string): FoodItem['feedingGuide'] {
  for (const [table] of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const rows = Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi),
      row => Array.from(row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi), cell => folded(labelText(cell[1]))));
    if (rows[0]?.length !== 2 || !/peso.*\bkg\b/.test(rows[0][0]) || !/racion diaria|cantidad diaria/.test(rows[0][1])) continue;
    const ranges: NonNullable<FoodItem['feedingGuide']>['ranges'] = [];
    for (const cells of rows.slice(1)) {
      if (cells.length !== 2) continue;
      const weight = /^(\d+(?:[.,]\d+)?)\s*[-–—a]\s*(\d+(?:[.,]\d+)?)\s*(?:kg)?$/.exec(cells[0]);
      const grams = /^(\d+)\s*[-–—a]\s*(\d+)\s*(?:gramos|g)$/.exec(cells[1]);
      if (!weight || !grams) continue;
      const minWeightKg = Number(weight[1].replace(',', '.')), maxWeightKg = Number(weight[2].replace(',', '.'));
      const minGrams = Number(grams[1]), maxGrams = Number(grams[2]);
      if (minWeightKg > 0 && maxWeightKg >= minWeightKg && minGrams > 0 && maxGrams >= minGrams) {
        ranges.push({minWeightKg, maxWeightKg, minGrams, maxGrams});
      }
    }
    if (ranges.length) return {sourceUrl, sourceName, ranges};
  }
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
