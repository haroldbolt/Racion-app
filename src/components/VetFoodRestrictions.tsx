import { useState } from 'react';
import type { VetNutrient, VetNutrientLimit } from '../types';
import { isValidLimit, limitUnits, nutrientNames } from '../utils/foodSafety';

export function VetFoodRestrictions({ ingredients, onIngredients, limits, onLimits, lang }: {
  ingredients: string; onIngredients: (value: string) => void;
  limits: VetNutrientLimit[]; onLimits: (limits: VetNutrientLimit[]) => void; lang: 'es' | 'en';
}) {
  const es = lang === 'es';
  const [nutrient,setNutrient] = useState<VetNutrient>('grasa');
  const [unit,setUnit] = useState<VetNutrientLimit['unit']>('pct_as_fed');
  const [maximum,setMaximum] = useState('');
  const [error,setError] = useState('');
  const field = 'min-h-11 w-full rounded-xl border border-gray-200 bg-white px-2 text-sm';
  function addLimit() {
    const entered = maximum.trim().replace(',', '.');
    const candidate = { nutrient, unit, maximum: Number(entered) };
    if (!/^\d+(?:\.\d+)?$/.test(entered) || !isValidLimit(candidate)) {
      setError(es ? 'Escribe un máximo válido en la unidad indicada.' : 'Enter a valid maximum in the selected unit.');
      return;
    }
    onLimits([...limits.filter((limit) => limit.nutrient !== nutrient || limit.unit !== unit), candidate]);
    setMaximum(''); setError('');
  }
  return <details open={ingredients || limits.length ? true : undefined} className="space-y-3 rounded-xl border border-[#d4ddd5] p-3">
    <summary className="cursor-pointer text-sm font-bold">{es ? 'Ingredientes a evitar y límites veterinarios' : 'Ingredients to avoid and veterinary limits'}</summary>
    <label className="block text-xs font-semibold">{es ? 'Ingredientes a evitar, separados por coma' : 'Ingredients to avoid, separated by commas'}
      <input value={ingredients} onChange={(e) => onIngredients(e.target.value)} placeholder={es ? 'Ej. pollo, trigo' : 'e.g. chicken, wheat'} className={field} />
    </label>
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold">{es ? 'Máximo indicado por su veterinario' : 'Maximum specified by their veterinarian'}</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">{es ? 'Nutriente' : 'Nutrient'}
          <select value={nutrient} onChange={(e) => setNutrient(e.target.value as VetNutrient)} className={field}>{Object.entries(nutrientNames).map(([key, names]) => <option value={key} key={key}>{names[es ? 0 : 1]}</option>)}</select>
        </label>
        <label className="text-xs">{es ? 'Máximo' : 'Maximum'}
          <input type="text" inputMode="decimal" value={maximum} onChange={(e) => setMaximum(e.target.value)} className={field} />
        </label>
        <label className="col-span-2 text-xs">{es ? 'Unidad del límite' : 'Limit unit'}
          <select value={unit} onChange={(e) => setUnit(e.target.value as VetNutrientLimit['unit'])} className={field}>{Object.entries(limitUnits).map(([key,names]) => <option value={key} key={key}>{names[es ? 0 : 1]}</option>)}</select>
        </label>
      </div>
      <button type="button" onClick={addLimit} className="min-h-11 rounded-xl border border-[#0B5D2E40] px-3 text-xs font-bold text-[#0B5D2E]">{es ? 'Añadir límite' : 'Add limit'}</button>
      {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
      <ul className="space-y-1">{limits.map((limit,i) => <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-[#f4f7f4] px-2 py-1 text-xs">
        <span>{nutrientNames[limit.nutrient][es ? 0 : 1]} ≤ {limit.maximum} {limitUnits[limit.unit][es ? 0 : 1]}</span>
        <button type="button" onClick={() => onLimits(limits.filter((_,j) => i !== j))} className="min-h-9 text-red-800">{es ? 'Quitar' : 'Remove'}</button>
      </li>)}</ul>
    </fieldset>
  </details>;
}
