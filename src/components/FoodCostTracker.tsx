import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Camera, Check, Plus, Receipt, Trash2, X } from 'lucide-react';
import type { FeedingPlan, FoodCostEntry, FoodItem, UserAccount, Pet } from '../types';
import { StorageService } from '../utils/storage';
import { formatCOP } from '../utils/i18n';
import { localDateKey } from '../utils/localDate';
import { getPlanCostSummary, sameFoodIdentity } from '../utils/foodCosts';
import { parsePurchasedPriceCop } from '../utils/purchaseInput';
import { OnlineFoodSearch } from './OnlineFoodSearch';

interface FoodCostTrackerProps {
  pet: Pet;
  plan?: FeedingPlan;
  userAccount: UserAccount;
  onPlanUpdate?: (updatedPlan: Partial<FeedingPlan>) => void;
  onPurchasesChange?: () => void;
  startWithForm?: boolean;
}

type ComponentRole = 'dry' | 'wet' | 'main';
type SelectedFood = { food: FoodItem; role: ComponentRole };
const inputClass = 'w-full min-h-11 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)]';

function decimal(value: FormDataEntryValue | null): number {
  const entered = String(value ?? '').trim();
  return /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(entered) ? Number(entered.replace(',', '.')) : NaN;
}

function weightLabel(kg: number, language: 'es' | 'en'): string {
  const format = new Intl.NumberFormat(language === 'es' ? 'es-CO' : 'en', { maximumFractionDigits: 3 });
  return kg < 1 ? `${format.format(kg * 1000)} g` : `${format.format(kg)} kg`;
}

export function FoodCostTracker({ pet, plan, userAccount, onPurchasesChange, startWithForm = false }: FoodCostTrackerProps) {
  const isEs = userAccount.language === 'es';
  const [purchases, setPurchases] = useState(() => StorageService.getFoodPurchases(pet.id));
  const [showForm, setShowForm] = useState(false);
  const [source, setSource] = useState<'plan' | 'internet'>('plan');
  const [selected, setSelected] = useState<SelectedFood>();
  const [receiptPhotoUrl, setReceiptPhotoUrl] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const summary = useMemo(() => getPlanCostSummary(plan, purchases), [plan, purchases]);
  const formatNumber = new Intl.NumberFormat(isEs ? 'es-CO' : 'en', { maximumFractionDigits: 1 });

  useEffect(() => {
    setPurchases(StorageService.getFoodPurchases(pet.id));
    setShowForm(startWithForm);
    const first = getPlanCostSummary(plan, StorageService.getFoodPurchases(pet.id)).components[0];
    setSelected(first ? { food: first.food, role: first.role } : undefined);
    setSource(first ? 'plan' : 'internet');
    setReceiptPhotoUrl('');
    setError('');
    setNotice('');
  }, [pet.id]);

  function openForm() {
    const first = summary.components[0];
    setSelected(first ? { food: first.food, role: first.role } : undefined);
    setSource(first ? 'plan' : 'internet');
    setReceiptPhotoUrl('');
    setError('');
    setNotice('');
    setShowForm(true);
  }

  function refreshPurchases() {
    setPurchases(StorageService.getFoodPurchases(pet.id));
    onPurchasesChange?.();
  }

  function uploadPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(isEs ? 'Adjunta una imagen de la factura o del recibo.' : 'Attach a receipt image.');
      return;
    }
    setPhotoLoading(true);
    const reader = new FileReader();
    reader.onerror = () => {
      setPhotoLoading(false);
      setError(isEs ? 'No pudimos abrir la imagen.' : 'Could not open the image.');
    };
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setPhotoLoading(false);
        return;
      }
      const image = new Image();
      image.onerror = () => {
        setPhotoLoading(false);
        setError(isEs ? 'No pudimos abrir la imagen.' : 'Could not open the image.');
      };
      image.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        if (context) {
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          setReceiptPhotoUrl(canvas.toDataURL('image/jpeg', 0.85));
          setError('');
        } else {
          setError(isEs ? 'No pudimos preparar la imagen.' : 'Could not prepare the image.');
        }
        setPhotoLoading(false);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function savePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const packageWeight = decimal(data.get('packageWeight'));
    const packageKg = data.get('weightUnit') === 'g' ? packageWeight / 1000 : packageWeight;
    const quantity = decimal(data.get('quantity'));
    const price = parsePurchasedPriceCop(data.get('price'));
    const date = String(data.get('purchaseDate') ?? '');
    const massKg = packageKg * quantity;
    if (!selected || !Number.isFinite(packageKg) || packageKg <= 0 || packageKg > 100 ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000 ||
      !Number.isFinite(massKg) || price === undefined ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > localDateKey() || !data.has('confirmed')) {
      setError(isEs ? 'Confirma el alimento, el peso, la cantidad, la fecha y el importe pagado.' : 'Confirm the food, package weight, quantity, date and amount paid.');
      return;
    }

    const component = summary.components.find(({ food, role }) => sameFoodIdentity(food, selected.food) && role === selected.role);
    const grams = massKg * 1000;
    const costPerGram = price / grams;
    const gramsPerDay = component?.gramsPerDay;
    const dailyCost = gramsPerDay && gramsPerDay > 0 ? costPerGram * gramsPerDay : undefined;
    const store = String(data.get('store') ?? '').trim();
    const entry: FoodCostEntry = {
      id: `fp_${crypto.randomUUID()}`,
      petId: pet.id,
      foodId: selected.food.id,
      sourceFoodId: selected.food.sourceFoodId,
      foodSourceUrl: selected.food.buyUrl || selected.food.fichaNutricional?.fuenteUrl,
      componentRole: selected.role,
      date,
      foodBrand: selected.food.brand,
      foodName: selected.food.name,
      foodType: selected.food.type,
      bagSizeKg: massKg,
      pricePaidCop: price,
      costPerKgCop: costPerGram * 1000,
      costPerDayCop: dailyCost,
      costPerMonthCop: dailyCost === undefined ? undefined : dailyCost * 30.5,
      estimatedDaysDuration: gramsPerDay && gramsPerDay > 0 ? grams / gramsPerDay : undefined,
      quantity,
      weightInGrams: grams,
      presentationName: weightLabel(packageKg, userAccount.language),
      currency: 'COP',
      storeName: store || undefined,
      receiptPhotoUrl: receiptPhotoUrl || undefined,
      notes: String(data.get('notes') ?? '').trim() || undefined,
      imageUrl: selected.food.imageUrl,
      createdAt: new Date().toISOString(),
    };

    try {
      StorageService.addFoodPurchase(entry);
      refreshPurchases();
    } catch {
      setError(isEs ? 'No pudimos guardar la compra en este navegador. Prueba con una imagen más pequeña.' : 'Could not save the purchase in this browser. Try a smaller image.');
      return;
    }
    setShowForm(false);
    setReceiptPhotoUrl('');
    const differentPackage = component?.packageKg !== undefined &&
      Math.abs(component.packageKg - packageKg) > 0.000001;
    setNotice(differentPackage
      ? (isEs
        ? `Compra guardada. El costo de la ración sigue usando el empaque de ${weightLabel(component.packageKg!, userAccount.language)}. Para usar otro tamaño, vuelve a elegir la presentación del alimento en Ajustar.`
        : `Purchase saved. The feeding cost still uses the ${weightLabel(component.packageKg!, userAccount.language)} package. To use another size, choose that package again when adjusting the food.`)
      : (isEs ? 'Compra guardada para este alimento y esta mascota.' : 'Purchase saved for this food and pet.'));
  }

  function removePurchase(id: string) {
    if (!window.confirm(isEs ? '¿Eliminar esta compra y su recibo?' : 'Delete this purchase and receipt?')) return;
    StorageService.deleteFoodPurchase(id);
    refreshPurchases();
  }

  const totalSpent = purchases.reduce((total, entry) =>
    total + (Number.isFinite(entry.pricePaidCop) && entry.pricePaidCop > 0 ? entry.pricePaidCop : 0), 0);
  const cost = (value?: number) => value === undefined
    ? (isEs ? 'Por definir' : 'To confirm')
    : formatCOP(value, true);

  return (
    <section aria-label={isEs ? 'Gastos de alimentación' : 'Food expenses'} className="space-y-4">
      <div role="region" aria-label={isEs ? 'Costo de la ración' : 'Feeding cost'} className="space-y-4 rounded-3xl border border-[var(--border-color)] bg-[var(--surface-card)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-extrabold text-[var(--text-primary)]">
              {isEs ? 'Costo de la ración' : 'Feeding cost'}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{pet.name} · COP</p>
          </div>
          <button type="button" onClick={openForm} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0B5D2E] px-3 text-xs font-bold text-white">
            <Plus className="size-4" />
            {isEs ? 'Registrar compra o factura' : 'Log purchase or receipt'}
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-[var(--surface-inner)] p-3">
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">{isEs ? 'Por día' : 'Per day'}</dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{cost(summary.costPerDayCop)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">{isEs ? 'Por mes estimado' : 'Estimated month'}</dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{cost(summary.costPerMonthCop)}</dd>
          </div>
        </dl>
        {!plan?.rationConfirmed || !plan.gramsPerDay ? (
          <p className="text-xs text-[var(--text-secondary)]">{isEs ? 'Guarda una ración para calcular su costo por toma y por día.' : 'Save a feeding plan to calculate cost per meal and day.'}</p>
        ) : summary.partial && (
          <p className="text-xs font-bold text-amber-800 dark:text-amber-200">{isEs ? 'Costo parcial. Falta precio de una parte de la ración.' : 'Partial cost. A food in this ration has no price yet.'}</p>
        )}
        {summary.estimated && <p className="text-xs text-[var(--text-secondary)]">{isEs ? 'Incluye una referencia de precio consultada en internet.' : 'Includes an online price reference.'}</p>}
        {summary.meals.length > 0 && (
          <ul className="space-y-2">
            {summary.meals.map((meal) => (
              <li key={meal.index} className="flex flex-wrap justify-between gap-2 text-xs text-[var(--text-primary)]">
                <span>{isEs ? 'Toma' : 'Meal'} {meal.index + 1} · {meal.time} · {formatNumber.format(meal.grams)} g</span>
                <strong className="tabular-nums">{cost(meal.costCop)}{meal.partial && meal.costCop !== undefined ? (isEs ? ' · parcial' : ' · partial') : ''}</strong>
              </li>
            ))}
          </ul>
        )}
        {summary.components.map((component) => (
          <div key={`${component.role}-${component.food.id}`} className="rounded-xl border border-[var(--border-color)] p-3 text-xs">
            <p className="font-bold text-[var(--text-primary)]">{component.food.brand} {component.food.name}</p>
            <p className="mt-1 text-[var(--text-secondary)]">
              {component.costPerGramCop === undefined ? (isEs ? 'Sin precio asociado' : 'No linked price')
                : `${formatCOP(component.costPerGramCop * 1000, true)} / kg`}
              {component.packageKg && component.gramsPerDay > 0 && ` · ${isEs ? 'Un empaque rinde' : 'One package lasts'} ~${formatNumber.format(component.packageKg * 1000 / component.gramsPerDay)} ${isEs ? 'días' : 'days'}`}
            </p>
            {component.basis && <p className="mt-1 text-[var(--text-secondary)]">
              {component.basis.source === 'online' ? (isEs ? 'Referencia de internet' : 'Online reference')
                : component.basis.source === 'receipt' ? (isEs ? 'Compra con recibo' : 'Purchase with receipt') : (isEs ? 'Importe ingresado por ti' : 'Amount entered by you')}
              {component.basis.storeName && ` · ${component.basis.storeName}`}
            </p>}
          </div>
        ))}
        {notice && <p role="status" className="flex gap-2 text-xs font-bold text-[#0B5D2E] dark:text-green-300"><Check className="size-4" />{notice}</p>}
      </div>

      {showForm && (
        <div className="space-y-4 rounded-3xl border border-[#0B5D2E55] bg-[var(--surface-card)] p-5">
          <div className="flex justify-between gap-3">
            <h3 className="font-heading text-lg font-extrabold text-[var(--text-primary)]">{isEs ? 'Registrar compra o factura' : 'Log purchase or receipt'}</h3>
            <button type="button" onClick={() => setShowForm(false)} aria-label={isEs ? 'Cerrar formulario de compra' : 'Close purchase form'} className="flex size-10 items-center justify-center rounded-full"><X className="size-5" /></button>
          </div>
          <div className="flex gap-2">
            {summary.components.length > 0 && (
              <button type="button" onClick={() => {
                setSource('plan');
                const first = summary.components[0];
                setSelected({ food: first.food, role: first.role });
              }} aria-pressed={source === 'plan'} className="min-h-11 rounded-xl border border-[var(--border-color)] px-3 text-xs font-bold text-[var(--text-primary)]">
                {isEs ? 'Alimento del plan' : 'Plan food'}
              </button>
            )}
            <button type="button" onClick={() => { setSource('internet'); setSelected(undefined); }} aria-pressed={source === 'internet'} className="min-h-11 rounded-xl border border-[var(--border-color)] px-3 text-xs font-bold text-[var(--text-primary)]">
              {isEs ? 'Buscar en internet' : 'Search online'}
            </button>
          </div>
          {source === 'internet' && (
            <OnlineFoodSearch species={pet.species} lang={userAccount.language} onSelect={(food) => {
              const component = summary.components.find((item) => sameFoodIdentity(item.food, food));
              setSelected({
                food: component ? { ...component.food, bagSizeKg: food.bagSizeKg, availableSizesKg: food.availableSizesKg } : food,
                role: component?.role ?? (food.type === 'wet' ? 'wet' : 'dry'),
              });
              setError('');
            }} />
          )}
          {source === 'plan' && (
            <label className="block space-y-1 text-xs font-bold text-[var(--text-primary)]">
              <span>{isEs ? 'Alimento de la compra' : 'Purchased food'}</span>
              <select aria-label={isEs ? 'Alimento de la compra' : 'Purchased food'} className={inputClass} value={selected ? `${selected.role}:${selected.food.id}` : ''} onChange={(event) => {
                const component = summary.components.find((item) => `${item.role}:${item.food.id}` === event.target.value);
                setSelected(component ? { food: component.food, role: component.role } : undefined);
                setError('');
              }}>
                {summary.components.map((component) => <option key={component.role} value={`${component.role}:${component.food.id}`}>{component.food.brand} {component.food.name}</option>)}
              </select>
            </label>
          )}
          {selected && (
            <form key={`${selected.role}-${selected.food.id}-${selected.food.bagSizeKg ?? ''}`} onSubmit={savePurchase} className="space-y-4">
              <p className="rounded-xl bg-[var(--surface-inner)] p-3 text-xs font-bold text-[var(--text-primary)]">{selected.food.brand} {selected.food.name}</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs font-bold text-[var(--text-primary)]">
                  <span>{isEs ? 'Peso de cada empaque' : 'Weight per package'}</span>
                  <input className={inputClass} name="packageWeight" inputMode="decimal" required defaultValue={selected.food.bagSizeKg} />
                </label>
                <label className="space-y-1 text-xs font-bold text-[var(--text-primary)]">
                  <span>{isEs ? 'Unidad del peso' : 'Weight unit'}</span>
                  <select aria-label={isEs ? 'Unidad del peso' : 'Weight unit'} className={inputClass} name="weightUnit"><option value="kg">kg</option><option value="g">g</option></select>
                </label>
                <label className="space-y-1 text-xs font-bold text-[var(--text-primary)]">
                  <span>{isEs ? 'Cantidad de empaques' : 'Number of packages'}</span>
                  <input className={inputClass} name="quantity" type="number" min="1" max="1000" step="1" required defaultValue="1" />
                </label>
                <label className="space-y-1 text-xs font-bold text-[var(--text-primary)]">
                  <span>{isEs ? 'Importe total de este alimento (COP)' : 'Total amount for this food (COP)'}</span>
                  <input className={inputClass} name="price" inputMode="decimal" placeholder={isEs ? 'Ej. 140.000' : 'E.g. 140000'} required />
                </label>
                <label className="space-y-1 text-xs font-bold text-[var(--text-primary)]">
                  <span>{isEs ? 'Fecha de compra' : 'Purchase date'}</span>
                  <input className={inputClass} name="purchaseDate" type="date" required max={localDateKey()} defaultValue={localDateKey()} />
                </label>
                <label className="space-y-1 text-xs font-bold text-[var(--text-primary)]">
                  <span>{isEs ? 'Tienda (opcional)' : 'Store (optional)'}</span>
                  <input className={inputClass} name="store" />
                </label>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">{isEs ? 'Ingresa el total pagado por todos estos empaques. Si la factura incluye otros productos, usa solo el importe de este alimento.' : 'Enter the total paid for these packages. If the receipt includes other products, use only this food’s amount.'}</p>
              <div className="space-y-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--border-color)] px-3 text-xs font-bold text-[var(--text-primary)]">
                  <Camera className="size-4" />
                  {isEs ? 'Foto de factura o recibo (opcional)' : 'Receipt photo (optional)'}
                  <input type="file" accept="image/*" capture="environment" onChange={uploadPhoto} className="sr-only" />
                </label>
                <p className="text-xs text-[var(--text-secondary)]">{isEs ? 'La foto queda adjunta a esta compra. Revisa e ingresa el importe y el peso.' : 'The photo is attached to this purchase. Review and enter the amount and weight.'}</p>
                {receiptPhotoUrl && (
                  <div className="relative overflow-hidden rounded-xl border border-[var(--border-color)]">
                    <a href={receiptPhotoUrl} target="_blank" rel="noopener noreferrer"><img src={receiptPhotoUrl} alt={isEs ? 'Factura adjunta' : 'Attached receipt'} className="max-h-48 w-full object-contain" /></a>
                    <button type="button" onClick={() => setReceiptPhotoUrl('')} aria-label={isEs ? 'Quitar foto de factura' : 'Remove receipt photo'} className="absolute right-2 top-2 rounded-lg bg-white p-2 text-red-700"><Trash2 className="size-4" /></button>
                  </div>
                )}
              </div>
              <label className="block space-y-1 text-xs font-bold text-[var(--text-primary)]">
                <span>{isEs ? 'Notas (opcional)' : 'Notes (optional)'}</span>
                <textarea className={inputClass} name="notes" rows={2} />
              </label>
              <label className="flex items-start gap-2 text-xs text-[var(--text-primary)]">
                <input name="confirmed" type="checkbox" required className="mt-0.5 accent-[#0B5D2E]" />
                <span>{isEs ? 'Confirmo el importe y el peso de este alimento' : 'I confirm the amount and weight for this food'}</span>
              </label>
              {error && <p role="alert" className="flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800"><AlertCircle className="size-4 shrink-0" />{error}</p>}
              <button type="submit" disabled={photoLoading} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0B5D2E] px-3 text-sm font-extrabold text-white disabled:opacity-50"><Receipt className="size-4" />{photoLoading ? (isEs ? 'Preparando imagen…' : 'Preparing image…') : (isEs ? 'Guardar compra' : 'Save purchase')}</button>
            </form>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-3xl border border-[var(--border-color)] bg-[var(--surface-card)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-lg font-extrabold text-[var(--text-primary)]">{isEs ? 'Compras registradas' : 'Saved purchases'}</h3>
          <span className="text-xs font-bold text-[var(--text-secondary)]">{cost(totalSpent)} {isEs ? 'en total' : 'total'}</span>
        </div>
        {purchases.length === 0 && <p className="text-sm text-[var(--text-secondary)]">{isEs ? 'Aún no hay compras registradas para esta mascota.' : 'No purchases saved for this pet yet.'}</p>}
        {purchases.map((purchase) => (
          <article key={purchase.id} className="space-y-2 rounded-2xl border border-[var(--border-color)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-extrabold text-[var(--text-primary)]">{purchase.foodBrand} {purchase.foodName}</h4>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{purchase.date}{purchase.storeName && ` · ${purchase.storeName}`}</p>
              </div>
              <button type="button" onClick={() => removePurchase(purchase.id)} aria-label={isEs ? 'Eliminar compra' : 'Delete purchase'} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-red-700 hover:bg-red-50"><Trash2 className="size-4" /></button>
            </div>
            <p className="text-xs text-[var(--text-primary)]">
              {purchase.quantity && purchase.quantity > 1 ? `${purchase.quantity} × ${weightLabel(purchase.bagSizeKg / purchase.quantity, userAccount.language)}` : weightLabel(purchase.bagSizeKg, userAccount.language)}
              {' · '}{cost(purchase.pricePaidCop)}
              {purchase.bagSizeKg > 0 && ` · ${cost(purchase.pricePaidCop / purchase.bagSizeKg)} / kg`}
            </p>
            {purchase.notes && <p className="text-xs text-[var(--text-secondary)]">{purchase.notes}</p>}
            {purchase.receiptPhotoUrl && <a href={purchase.receiptPhotoUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-bold text-[#0B5D2E] dark:text-green-300"><img src={purchase.receiptPhotoUrl} alt={isEs ? 'Factura de esta compra' : 'Receipt for this purchase'} className="mb-1 max-h-32 rounded-xl border border-[var(--border-color)] object-contain" />{isEs ? 'Ver recibo' : 'View receipt'}</a>}
          </article>
        ))}
      </div>
    </section>
  );
}
