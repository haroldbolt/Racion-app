import { useId, useState } from 'react';
import { ChevronDown, Receipt } from 'lucide-react';
import { getPurchaseMealCost, type PlanCostSummary } from '../utils/foodCosts';
import { formatCOP } from '../utils/i18n';
import { parsePurchasedPriceCop } from '../utils/purchaseInput';

type Props = {
  language: 'es' | 'en';
  meal?: PlanCostSummary['meals'][number];
  estimated?: boolean;
  openInitially?: boolean;
};

function mass(value: string) {
  return /^\d+(?:[.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(',', '.')) : NaN;
}

export function HomeMealCost({ language, meal, estimated, openInitially = false }: Props) {
  const es = language === 'es';
  const fieldsId = useId();
  const [open, setOpen] = useState(openInitially);
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [kg, setKg] = useState('');
  const [grams, setGrams] = useState('');
  const portion = getPurchaseMealCost(parsePurchasedPriceCop(price), Number(quantity), mass(kg), mass(grams));
  const complete = [price, quantity, kg, grams].every(value => value.trim() !== '');
  const title = es ? 'Costo por toma' : 'Cost per meal';
  const fieldClass = 'mt-1 block min-h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-inner)] px-3 text-base font-semibold tabular-nums text-[var(--text-primary)]';
  return (
    <section aria-label={title} className="space-y-2 rounded-3xl border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 font-heading text-lg font-extrabold text-[var(--text-primary)]">
          <Receipt aria-hidden="true" className="size-4 shrink-0 text-[#278456]" />{title}
        </h2>
        {meal && meal.costCop !== undefined && <strong className="text-lg tabular-nums text-[var(--text-primary)]">
          {formatCOP(meal.costCop, true)}{meal.partial && (es ? ' · parcial' : ' · partial')}
        </strong>}
      </div>
      {meal && <p className="text-xs text-[var(--text-secondary)]">
        {es ? 'Toma del plan' : 'Planned meal'}{meal.time && ' · ' + meal.time} · {new Intl.NumberFormat(es ? 'es-CO' : 'en').format(meal.grams)} g
        {meal.costCop === undefined ? (es ? ' · Precio pendiente' : ' · Price needed') :
          estimated ? (es ? ' · Precio de internet' : ' · Online price') : ''}
        {meal.partial && meal.costCop !== undefined && (es ? ' · Falta el precio de parte de la ración' : ' · A food price is missing')}
        {' · '}<a className="font-bold text-[var(--text-primary)] underline" href="#today-meal-costs">{es ? 'Ver todas las tomas' : 'See all meals'}</a>
      </p>}
      <button type="button" aria-expanded={open} aria-controls={fieldsId} onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-extrabold text-[var(--text-primary)]">
        {es ? 'Calcular con mi compra' : 'Calculate from my purchase'}
        <ChevronDown aria-hidden="true" className={'size-4 shrink-0 ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && <div id={fieldsId} className="space-y-3 border-t border-[var(--border-color)] pt-3 text-sm">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs font-bold text-[var(--text-secondary)]">
          <label>{es ? 'Importe total pagado (COP)' : 'Total amount paid (COP)'}
            <input className={fieldClass} inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} />
          </label>
          <label>{es ? 'Cantidad de empaques' : 'Number of packages'}
            <input className={fieldClass} type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} />
          </label>
          <label>{es ? 'Peso por empaque (kg)' : 'Weight per package (kg)'}
            <input className={fieldClass} inputMode="decimal" value={kg} onChange={event => setKg(event.target.value)} />
          </label>
          <label>{es ? 'Gramos por toma (g)' : 'Grams per meal (g)'}
            <input className={fieldClass} inputMode="decimal" value={grams} onChange={event => setGrams(event.target.value)} />
          </label>
        </div>
        <output aria-label={es ? 'Costo calculado por toma' : 'Calculated cost per meal'} className="block font-medium text-[var(--text-primary)]">
          {portion !== undefined ? <><strong className="font-heading text-lg tabular-nums">{formatCOP(portion, true)}</strong>{es ? ' por toma' : ' per meal'}</>
            : complete ? (es ? 'Revisa los valores. Usa cantidades positivas y empaques enteros.' : 'Check the values. Use positive amounts and whole packages.')
            : (es ? 'Ingresa los datos de un mismo alimento para ver el costo.' : 'Enter the amounts for one food to see the cost.')}
        </output>
      </div>}
    </section>
  );
}
