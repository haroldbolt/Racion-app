import { roundNutrientGrams } from '../utils/mealNutrition';
import type { NutrientQualifier } from '../types';
import type { DailyMealNutritionSummary } from '../utils/mealNutrition';

const nutrients = [
  { key: 'proteina', es: 'Proteína', en: 'Protein' },
  { key: 'grasa', es: 'Grasa', en: 'Fat' },
  { key: 'fibra', es: 'Fibra cruda', en: 'Crude fiber' },
  { key: 'carbohidratos', es: 'Carbohidratos', en: 'Carbohydrates' },
] as const;

type Nutrition = DailyMealNutritionSummary['plannedNutrients'];
type NutritionAmount = Nutrition[keyof Nutrition];

type NutritionSummaryProps = {
  summary: DailyMealNutritionSummary;
  language: 'es' | 'en';
  planOnly?: boolean;
};

function formatAmount(
  amount: { grams: number; qualifier?: NutrientQualifier },
  formatGrams: (grams: number) => string
) {
  const grams = roundNutrientGrams(amount.grams, amount.qualifier);
  const sign = amount.qualifier === 'minimo' ? '≥ ' : amount.qualifier === 'maximo' ? '≤ ' : '≈ ';
  return `${sign}${formatGrams(grams)} g`;
}

export function NutritionSummary({ summary, language, planOnly = false }: NutritionSummaryProps) {
  const isEs = language === 'es';
  const title = planOnly
    ? (isEs ? 'Nutrientes del plan' : 'Nutrients in the plan')
    : (isEs ? 'Nutrientes de hoy' : 'Nutrients today');
  const formatGrams = new Intl.NumberFormat(isEs ? 'es-CO' : 'en-US', {
    maximumFractionDigits: 1,
    useGrouping: false,
  }).format;
  const columns = [
    {
      name: isEs ? 'Plan del día' : 'Daily plan',
      totals: summary.plannedNutrients,
      foods: summary.plannedPerFoodBreakdown,
    },
  ];
  if (!planOnly) {
    columns.push({
      name: isEs ? 'Servido' : 'Served',
      totals: summary.servedNutrients,
      foods: summary.perFoodBreakdown,
    });
  }
  const showBreakdown = columns.some(({ foods, totals }) =>
    foods.length > 1 || Object.values(totals).some((value) => value.mixedQualifiers)
  );

  const describeAmount = (amount: NutritionAmount) => {
    if (amount.mixedQualifiers) return isEs ? 'Ver por alimento' : 'See by food';
    if (amount.coverage === 'empty') return '—';
    if (amount.grams === null) return isEs ? 'Sin dato' : 'No data';
    return formatAmount({ grams: amount.grams, qualifier: amount.qualifier }, formatGrams);
  };

  return (
    <section className="rounded-2xl border border-[#0B5D2E20] bg-[#F8FAF8] p-3.5">
      <h3 className="font-heading text-sm font-extrabold text-[#1C2B21]">{title}</h3>
      <p className="mt-1 text-xs text-[#44544A]">
        {planOnly
          ? (isEs ? 'Según la etiqueta y los gramos del plan.' : 'Based on the label and planned portions.')
          : (isEs ? 'Según la etiqueta y los gramos de las tomas de hoy.' : 'Based on the label and today’s meal portions.')}
      </p>

      <table aria-label={title} className="mt-3 w-full table-fixed text-left text-xs">
        <thead>
          <tr className="border-b border-[#0B5D2E25] text-[#44544A]">
            <th scope="col" className="w-[43%] pb-2 pr-2 font-semibold">
              {isEs ? 'Nutriente' : 'Nutrient'}
            </th>
            {columns.map(({ name }) => (
              <th key={name} scope="col" className="pb-2 text-right font-semibold">{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nutrients.map(({ key, es, en }) => (
            <tr key={key} className="border-b border-[#0B5D2E15]">
              <th scope="row" className="break-words py-2.5 pr-2 font-bold text-[#1C2B21]">{isEs ? es : en}</th>
              {columns.map(({ name, totals }) => (
                <td key={name} className="py-2.5 pl-2 text-right align-top tabular-nums">
                  <span className="font-bold text-[#0B5D2E]">{describeAmount(totals[key])}</span>
                  {totals[key].coverage === 'partial' && (
                    <span className="block text-[11px] text-amber-800">{isEs ? 'Parcial' : 'Partial'}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 text-[11px] text-[#44544A]">
        {isEs ? '≥ mínimo · ≤ máximo · ≈ valor de referencia' : '≥ minimum · ≤ maximum · ≈ reference value'}
      </p>
      {!planOnly && summary.completedMealsCount > 0 && (
        <p className="mt-1 text-xs text-[#44544A]">
          {isEs ? 'Alimento servido' : 'Food served'} · {formatGrams(summary.totalServedGrams)} g
          {summary.kcalServedTotal !== null && (
            ` · ${summary.kcalServedTotal} kcal${summary.kcalServedPartial ? (isEs ? ' (parcial)' : ' (partial)') : ''}`
          )}
        </p>
      )}
      {!planOnly && summary.completedMealsCount === 0 && (
        <p className="mt-1 text-xs text-[#44544A]">
          {isEs ? 'Registra una toma para ver el aporte servido.' : 'Log a meal to see the nutrients you served.'}
        </p>
      )}
      {!planOnly && summary.usesCurrentPlanForLegacyLogs && (
        <p className="mt-1 text-xs text-[#44544A]">
          {isEs ? 'Algunas tomas antiguas se calculan con el alimento del plan actual.' : 'Some older meals use the food in the current plan.'}
        </p>
      )}

      {showBreakdown && (
        <details className="mt-3 text-xs text-[#44544A]">
          <summary className="cursor-pointer font-bold text-[#0B5D2E]">{isEs ? 'Desglose por alimento' : 'Breakdown by food'}</summary>
          {columns.map(({ name, foods }) => foods.length > 0 && (
            <div key={name} className="mt-2">
              <h4 className="font-bold text-[#1C2B21]">{name}</h4>
              <ul className="space-y-2">
                {foods.map((food, index) => (
                  <li key={index} className="rounded-xl bg-white px-2.5 py-2">
                    <p className="font-bold text-[#1C2B21]">{food.foodName} · {formatGrams(food.gramsServed)} g</p>
                    <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                      {nutrients.map(({ key, es, en }) => {
                        const amount = food[key];
                        return (
                          <div key={key}>
                            <dt>{isEs ? es : en}</dt>
                            <dd className="font-bold text-[#0B5D2E]">
                              {amount?.available && amount.grams !== undefined
                                ? formatAmount({ grams: amount.grams, qualifier: amount.qualifier }, formatGrams)
                                : (isEs ? 'Sin dato' : 'No data')}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
