import { useMemo } from 'react';
import type { FeedingPlan, Pet } from '../types';
import { getPlanCostSummary } from '../utils/foodCosts';
import { getPreviewMeals, getPlanFoodKcalForGrams } from '../utils/mealPortions';
import { formatRation } from '../utils/i18n';
import { RationSourceNote } from './ManufacturerRationInput';
import { StorageService } from '../utils/storage';
import { PlanSafetyAlerts } from './FoodSafetyAlerts';

export function PlanChangePreview({pet, current, proposed, lang = 'es'}: {pet: Pet; current?: FeedingPlan; proposed: FeedingPlan; lang?: 'es' | 'en'}) {
  const es = lang === 'es';
  const purchases = useMemo(() => StorageService.getFoodPurchases(pet.id), [pet.id]);
  const number = new Intl.NumberFormat(es ? 'es-CO' : 'en-US', { maximumFractionDigits: 1 });
  const cop = new Intl.NumberFormat(es ? 'es-CO' : 'en-US', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  return <div className="space-y-3" data-testid="plan-change-preview">
    <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
      {[{plan: current, label: es ? 'Plan actual' : 'Current plan'}, {plan: proposed, label: es ? 'Plan propuesto' : 'Proposed plan'}].map(({plan,label}) => {
        const costs = getPlanCostSummary(plan, purchases);
        return <section key={label} aria-label={label} className="min-w-0 rounded-xl border border-[#0B5D2E25] bg-white p-3">
          <h3 className="text-xs font-extrabold text-[#0B5D2E]">{label} · {pet.name}</h3>
          {plan ? <>
            <p className="mt-1 break-words text-xs font-bold">{plan.foodType === 'mixed' ? [plan.dryFood?.name, plan.wetFood?.name].filter(Boolean).join(' + ') : plan.foodName}</p>
            <RationSourceNote plan={plan} lang={lang} />
            {getPreviewMeals(plan).map((portion,i) => {
              const kcal = getPlanFoodKcalForGrams(plan, portion.grams);
              const meal = costs.meals[i];
              return <div key={i} className="mt-2 border-t border-[#e2ebe4] pt-1 text-xs leading-relaxed">
                <strong>{plan.mealTimes[i] || (es ? `Toma ${i+1}` : `Meal ${i+1}`)}</strong>
                <div>{plan.rationConfirmed || plan.rationSource === 'manual' ? formatRation(portion.grams, 'metric', lang) : (es ? 'Gramos pendientes' : 'Grams pending')} · {kcal > 0 ? number.format(kcal) + ' kcal' : (es ? 'kcal pendientes' : 'kcal pending')}</div>
                <div>{meal?.costCop !== undefined ? cop.format(meal.costCop) + ' COP' + (meal.partial ? (es ? ' (parcial)' : ' (partial)') : '') : (es ? 'Costo pendiente' : 'Cost pending')}</div>
              </div>;
            })}
          </> : <p className="mt-2 text-xs text-[#44544A]">{es ? 'Aún sin plan' : 'No plan yet'}</p>}
        </section>;
      })}
    </div>
    <PlanSafetyAlerts pet={pet} plan={proposed} lang={lang} />
  </div>;
}
