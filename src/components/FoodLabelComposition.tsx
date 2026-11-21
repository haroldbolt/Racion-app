import React from 'react';
import type { FoodItem } from '../types';
import { getEffectiveNutrientField } from '../utils/mealNutrition';

const fields = [
  { key:'proteina', es:'Proteína', en:'Protein' }, { key:'grasa', es:'Grasa', en:'Fat' },
  { key:'fibra', es:'Fibra cruda', en:'Crude fiber' }, { key:'carbohidratos', es:'Carbohidratos', en:'Carbohydrates' },
  { key:'humedad', es:'Humedad', en:'Moisture' }, { key:'cenizas', es:'Cenizas', en:'Ash' },
  { key:'kcalPerKg', es:'Energía', en:'Energy' },
] as const;

export function FoodLabelComposition({ food, language, previewPending = false }: {food: FoodItem; language: 'es' | 'en'; previewPending?: boolean}) {
  const isEs = language === 'es';
  const format = new Intl.NumberFormat(isEs ? 'es-CO' : 'en', {maximumFractionDigits:3});
  const qualifiers = isEs ? {minimo:'Mín.', maximo:'Máx.', tipico:'Típico'} : {minimo:'Min.', maximo:'Max.', tipico:'Typical'};
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4">
      {fields.map(({ key, es, en }) => {
        const nutrient = getEffectiveNutrientField(food, key) ?? (previewPending && food.fichaNutricional?.coincidenciaEstado === 'revision_requerida' ? food.fichaNutricional[key] : undefined);
        const source = nutrient?.source;
        const url = source ? source.url : food.fichaNutricional?.fuenteUrl;
        const sourceName = source?.name ?? food.fichaNutricional?.fuenteNombre;
        const date = source?.observedAt ?? food.fichaNutricional?.fechaConsulta;
        const conflicts = food.fichaNutricional?.discrepancies?.filter(item => item.field === key) ?? [];
        const display = nutrient && <>{qualifiers[nutrient.calificador]} {format.format(nutrient.valor)} {nutrient.unidadOriginal}
          {nutrient.baseMedicion === 'materia_seca' && <span className="block font-normal">{isEs ? 'Materia seca' : 'Dry matter'}</span>}</>;
        return <div key={key}>
          <dt className="text-[#44544A]">{isEs ? es : en}</dt>
          <dd className="font-bold text-[#1C2B21]">
            {display && sourceName ? <details>
              <summary className="cursor-pointer">{display}</summary>
              <span className="block font-normal">
                {url && /^https:\/\//i.test(url) ? <a className="text-green-800 underline" href={url} target="_blank" rel="noopener noreferrer">{sourceName}</a> : sourceName}
                {nutrient?.declaracionOriginal && <span className="block">{nutrient.declaracionOriginal}</span>}
                {date && !Number.isNaN(Date.parse(date)) && <> · {new Date(date).toLocaleDateString(isEs ? 'es-CO' : 'en')}</>}
              </span>
            </details> : display || (isEs ? 'Sin dato' : 'No data')}
            {conflicts.map(item => <span key={item.sourceUrl} className="block font-normal text-amber-900">
              {isEs ? 'La tienda publica' : 'Store lists'} {qualifiers[item.other.calificador]} {format.format(item.other.valor)} {item.other.unidadOriginal}.{' '}
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{isEs ? 'Contrastar con el empaque' : 'Compare with the label'}</a>
            </span>)}
          </dd>
        </div>;
      })}
    </dl>
  );
}
