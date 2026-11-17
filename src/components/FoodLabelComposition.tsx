import React from 'react';
import type { FoodItem } from '../types';
import { getEffectiveNutrientField } from '../utils/mealNutrition';

const fields = [
  { key: 'proteina', es: 'Proteína', en: 'Protein' },
  { key: 'grasa', es: 'Grasa', en: 'Fat' },
  { key: 'fibra', es: 'Fibra cruda', en: 'Crude fiber' },
  { key: 'carbohidratos', es: 'Carbohidratos', en: 'Carbohydrates' },
] as const;

interface FoodLabelCompositionProps {
  food: FoodItem;
  language: 'es' | 'en';
}

export function FoodLabelComposition({ food, language }: FoodLabelCompositionProps) {
  const isEs = language === 'es';
  const format = new Intl.NumberFormat(isEs ? 'es-CO' : 'en', { maximumFractionDigits: 3 });
  const qualifiers = isEs ? { minimo: 'Mín.', maximo: 'Máx.', tipico: 'Típico' } : { minimo: 'Min.', maximo: 'Max.', tipico: 'Typical' };
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
      {fields.map(({ key, es, en }) => {
        const nutrient = getEffectiveNutrientField(food, key);
        return (
          <div key={key}>
            <dt className="text-[#44544A]">{isEs ? es : en}</dt>
            <dd className="font-bold text-[#1C2B21]">
              {nutrient ? (
                <>
                  {qualifiers[nutrient.calificador]} {format.format(nutrient.valor)} %
                  {nutrient.baseMedicion === 'materia_seca' && (
                    <span className="block font-normal">{isEs ? 'Materia seca' : 'Dry matter'}</span>
                  )}
                </>
              ) : (isEs ? 'Sin dato' : 'No data')}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
