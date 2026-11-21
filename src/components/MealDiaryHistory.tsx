import { useState } from 'react';
import type { MealLog } from '../types';
import { formatCOP } from '../utils/i18n';
import { calculateDailyMealNutritionSummary } from '../utils/mealNutrition';
import { getLoggedMealEnergy } from '../utils/mealPortions';
import { localDateKey } from '../utils/localDate';

export function MealDiaryHistory({ logs, language }: { logs: MealLog[]; language: 'es' | 'en' }) {
  const es = language === 'es';
  const today = localDateKey();
  const [day, setDay] = useState(today);
  const entries = logs.filter((log) => log.date === day);
  return (
    <details className="rounded-2xl border border-[#0B5D2E20] bg-white p-4 text-sm text-[#1C2B21]">
      <summary className="cursor-pointer font-heading font-extrabold">{es ? 'Historial de comidas' : 'Meal history'}</summary>
      <label className="my-3 flex flex-wrap items-center gap-3 text-xs">
        {es ? 'Ver comidas del día' : 'Show meals for'}
        <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)}
          className="min-h-11 rounded-xl border border-gray-300 px-3" />
      </label>
      {entries.length === 0 && <p className="text-xs">{es ? 'Sin comidas registradas para esta fecha.' : 'No meals logged for this date.'}</p>}
      <ul className="space-y-3">
        {entries.map((log) => {
          const components = log.mixedComponents ?? [];
          const costs = components.filter((item) => item.gramsFed > 0 && item.priceSnapshot?.copPerGram !== undefined);
          const total = costs.reduce((sum, item) => sum + item.gramsFed * item.priceSnapshot!.copPerGram!, 0);
          const partial = costs.length < components.filter((item) => item.gramsFed > 0).length;
          const energy = getLoggedMealEnergy(log);
          const nutrition = calculateDailyMealNutritionSummary({ mealLogs: [log] });
          return <li key={log.id} className="space-y-1 border-t border-gray-200 pt-2 text-xs">
            <strong>{es ? 'Comida' : 'Meal'} {log.mealIndex + 1} · {log.mealTime}</strong>
            <p>{log.gramsFed} g {es ? 'servidos' : 'served'} · {log.gramsEaten ?? log.gramsFed} g {es ? 'consumidos' : 'eaten'}</p>
            <p>{es ? 'Energía consumida' : 'Energy eaten'} · {energy.partial && !energy.kcal ? (es ? 'Pendiente' : 'Pending') : Math.round(energy.kcal) + ' kcal' + (energy.partial ? (es ? ' (parcial)' : ' (partial)') : '')}</p>
            <p>{es ? 'Costo de lo servido al registrar' : 'Cost served when logged'} · {costs.length ? formatCOP(total, true) + (partial ? (es ? ' (parcial)' : ' (partial)') : '') : (es ? 'Sin precio registrado' : 'No recorded price')}</p>
            {nutrition.perFoodBreakdown.map((food, i) => <div key={i}>
              <strong>{food.foodName} · {food.gramsServed} g</strong>
              <p>{[food.proteina, food.grasa, food.fibra, food.carbohidratos].filter((n) => n?.available).map((n) => n!.displayText).join(' · ')}</p>
            </div>)}
          </li>;
        })}
      </ul>
    </details>
  );
}
