import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Plus, Receipt, Trash2, X } from 'lucide-react';
import type { FeedingPlan, FoodCostEntry, FoodItem, UserAccount, Pet } from '../types';
import { StorageService } from '../utils/storage';
import { formatCOP, formatRation } from '../utils/i18n';
import { localDateKey } from '../utils/localDate';
import { getPlanCostSummary, sameFoodIdentity, withPurchasedPackage } from '../utils/foodCosts';
import { parsePurchasedPriceCop, reviewReceiptPackage } from '../utils/purchaseInput';
import { getConfirmedPresentations } from '../data/foodPresentations';
import { getManufacturerPackageGuide } from '../services/storeManufacturerCatalog';
import { OnlineFoodSearch } from './OnlineFoodSearch';
import { StockSummary, OpenPurchase } from './FoodInventory';
import { SavedReceipt } from './ReceiptViewer';
import { currentStorageSession } from '../utils/accountStorage';
import { removeReceiptPdfs, saveReceiptPdf } from '../services/receiptDocuments';
import { ReceiptReview } from './ReceiptReview';
import type { ReceiptReadResult } from '../services/receiptReader';
import type { ReceiptExtraction, ReceiptItemCandidate } from '../utils/receiptExtraction';

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
type PurchaseDraft = { packageWeight: string; weightUnit: 'kg' | 'g'; quantity: string; price: string; purchaseDate: string; store: string; notes: string };
const emptyDraft = (food?: FoodItem): PurchaseDraft => ({ packageWeight: food?.bagSizeKg ? String(food.bagSizeKg) : '', weightUnit: 'kg', quantity: '1', price: '', purchaseDate: localDateKey(), store: '', notes: '' });
const inputClass = 'w-full min-h-11 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)]';

function decimal(value: FormDataEntryValue | null): number {
  const entered = String(value ?? '').trim();
  return /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(entered) ? Number(entered.replace(',', '.')) : NaN;
}

function weightLabel(kg: number, language: 'es' | 'en'): string {
  const format = new Intl.NumberFormat(language === 'es' ? 'es-CO' : 'en', { maximumFractionDigits: 3 });
  return kg < 1 ? `${format.format(kg * 1000)} g` : `${format.format(kg)} kg`;
}

export function FoodCostTracker({ pet, plan, userAccount, onPlanUpdate, onPurchasesChange, startWithForm = false }: FoodCostTrackerProps) {
  const isEs = userAccount.language === 'es';
  const [purchases, setPurchases] = useState(() => StorageService.getFoodPurchases(pet.id));
  const [showForm, setShowForm] = useState(false);
  const [source, setSource] = useState<'plan' | 'internet'>('plan');
  const [selected, setSelected] = useState<SelectedFood>();
  const [attachment, setAttachment] = useState<{ image: string; pdf?: File }>();
  const saving = useRef<AbortController | null>(null);
  const [savingPdf, setSavingPdf] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<PurchaseDraft>(() => emptyDraft());
  const [confirmed, setConfirmed] = useState(false);
  const [receiptFoodConfirmed, setReceiptFoodConfirmed] = useState(false);
  const [receiptPresent, setReceiptPresent] = useState(false);
  const [weightConfirmed, setWeightConfirmed] = useState(false);
  const [packageGuide, setPackageGuide] = useState<{ food: FoodItem; sizes: number[]; sourceName?: string; sourceUrl?: string }>();
  const receiptFood = receiptPresent ? selected?.food : undefined;
  useEffect(() => {
    if (!receiptFood) return;
    let current = true;
    const food = receiptFood;
    void getManufacturerPackageGuide(food).catch(() => undefined).then(guide => {
      if (current) setPackageGuide({ food, ...(guide ?? { sizes: getConfirmedPresentations(food) ?? [] }) });
    });
    return () => { current = false; };
  }, [receiptFood]);
  const [receiptSelectionRequired, setReceiptSelectionRequired] = useState(false);
  const [receiptItemDescription, setReceiptItemDescription] = useState<string>();
  const [receiptReadMethod, setReceiptReadMethod] = useState<ReceiptReadResult['method']>();
  const [usePurchasedPackage, setUsePurchasedPackage] = useState(false);
  const [receiptFormKey, setReceiptFormKey] = useState(0);
  const summary = useMemo(() => getPlanCostSummary(plan, purchases), [plan, purchases]);
  const formatNumber = new Intl.NumberFormat(isEs ? 'es-CO' : 'en', { maximumFractionDigits: 1 });

  useEffect(() => {
    const visiblePurchases = StorageService.getFoodPurchases(pet.id);
    setPurchases(visiblePurchases);
    setShowForm(startWithForm);
    const first = getPlanCostSummary(plan, visiblePurchases).components[0];
    setSelected(first ? { food: first.food, role: first.role } : undefined);
    setSource(first ? 'plan' : 'internet');
    resetForm(first?.food);
    setAttachment(undefined);
    setError('');
    setNotice('');
    setSavingPdf(false);
    return () => { saving.current?.abort(); saving.current = null; };
  }, [pet.id]);

  function openForm() {
    const first = summary.components[0];
    setSelected(first ? { food: first.food, role: first.role } : undefined);
    setSource(first ? 'plan' : 'internet');
    resetForm(first?.food);
    setAttachment(undefined);
    setError('');
    setNotice('');
    setShowForm(true);
  }

  function refreshPurchases() {
    setPurchases(StorageService.getFoodPurchases(pet.id));
    onPurchasesChange?.();
  }

  function resetConfirmation() {
    setConfirmed(false);
    setReceiptFoodConfirmed(false);
    setWeightConfirmed(false);
  }

  function resetForm(food?: FoodItem) {
    setDraft(emptyDraft(food));
    resetConfirmation();
    setReceiptPresent(false);
    setReceiptSelectionRequired(false);
    setReceiptItemDescription(undefined);
    setReceiptReadMethod(undefined);
    setPhotoLoading(false);
    setUsePurchasedPackage(false);
    setReceiptFormKey((key) => key + 1);
  }

  function changeField<K extends keyof PurchaseDraft>(key: K, value: PurchaseDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    resetConfirmation();
    setUsePurchasedPackage(false);
    setError('');
  }

  function chooseFood(next: SelectedFood | undefined) {
    setSelected(next);
    resetConfirmation();
    setUsePurchasedPackage(false);
    if (!receiptPresent) setDraft(emptyDraft(next?.food));
    setError('');
  }

  function applyReceiptItem(item: ReceiptItemCandidate, extraction: ReceiptExtraction, method: ReceiptReadResult['method']) {
    const kg = item.packageKg;
    setDraft({
      packageWeight: kg === undefined ? '' : String(kg < 1 ? Math.round(kg * 1_000_000) / 1000 : kg),
      weightUnit: kg !== undefined && kg < 1 ? 'g' : 'kg',
      quantity: item.quantity === undefined ? '' : String(item.quantity),
      price: item.totalPaidCop === undefined ? '' : String(item.totalPaidCop),
      purchaseDate: extraction.purchaseDate ?? '',
      store: extraction.merchantName ?? '',
      notes: '',
    });
    setReceiptItemDescription(item.description);
    setReceiptReadMethod(method);
    setUsePurchasedPackage(false);
    resetConfirmation();
    setError('');
  }

  const draftWeight = decimal(draft.packageWeight);
  const draftPackageKg = draft.weightUnit === 'g' ? draftWeight / 1000 : draftWeight;
  const draftQuantity = decimal(draft.quantity);
  const draftPrice = parsePurchasedPriceCop(draft.price);
  const draftComponent = selected && summary.components.find(({ food, role }) => sameFoodIdentity(food, selected.food) && role === selected.role);
  const reference = receiptFood && packageGuide?.food === receiptFood ? packageGuide : undefined;
  const checkingPackages = Boolean(receiptFood && !reference);
  const selectedPackageKg = source === 'plan' ? draftComponent?.packageKg ?? selected?.food.bagSizeKg : selected?.food.bagSizeKg;
  const { differsFromKnown, smallerSize } = reviewReceiptPackage(draftPackageKg, selectedPackageKg, reference?.sizes ?? []);
  const confirmPackageWeight = receiptPresent && smallerSize !== undefined;
  const validDraftAmounts = Number.isFinite(draftPackageKg) && draftPackageKg > 0 && draftPackageKg <= 100 &&
    Number.isSafeInteger(draftQuantity) && draftQuantity > 0 && draftQuantity <= 1000 && draftPrice !== undefined;
  const draftChangesPackage = Boolean(validDraftAmounts && draftComponent &&
    (draftComponent.packageKg === undefined || Math.abs(draftComponent.packageKg - draftPackageKg) > 0.000001));
  const canUpdatePackage = Boolean(draftChangesPackage && onPlanUpdate && !plan?.isVetLocked && !pet.vetGuideline?.locked);
  const draftSummary = useMemo(() => {
    if (!plan || !selected || !draftComponent || !validDraftAmounts || draftPrice === undefined) return undefined;
    // This is a cost preview only. It never changes the saved formula, ration or package.
    const previewFood = { ...draftComponent.food, bagSizeKg: draftPackageKg };
    const previewPlan = {
      ...plan,
      dryFood: plan.dryFood && sameFoodIdentity(plan.dryFood, draftComponent.food) ? previewFood : plan.dryFood,
      wetFood: plan.wetFood && sameFoodIdentity(plan.wetFood, draftComponent.food) ? previewFood : plan.wetFood,
      bagWeightKg: plan.foodId === draftComponent.food.id ? draftPackageKg : plan.bagWeightKg,
    };
    const previewPurchase: FoodCostEntry = {
      id: 'preview', petId: pet.id, foodId: draftComponent.food.id,
      sourceFoodId: draftComponent.food.sourceFoodId,
      foodSourceUrl: draftComponent.food.buyUrl || draftComponent.food.fichaNutricional?.fuenteUrl,
      componentRole: draftComponent.role, date: draft.purchaseDate,
      foodBrand: draftComponent.food.brand, foodName: draftComponent.food.name, foodType: draftComponent.food.type,
      bagSizeKg: draftPackageKg * draftQuantity, quantity: draftQuantity, pricePaidCop: draftPrice,
      costPerKgCop: draftPrice / (draftPackageKg * draftQuantity), createdAt: new Date().toISOString(),
    };
    return getPlanCostSummary(previewPlan, [...purchases, previewPurchase]);
  }, [plan, selected, draftComponent, validDraftAmounts, draftPrice, draftPackageKg, draftQuantity, draft.purchaseDate, pet.id, purchases]);

  async function savePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    setError('');
    const data = new FormData(event.currentTarget);
    const packageWeight = decimal(data.get('packageWeight'));
    const packageKg = data.get('weightUnit') === 'g' ? packageWeight / 1000 : packageWeight;
    const quantity = decimal(data.get('quantity'));
    const price = parsePurchasedPriceCop(data.get('price'));
    const date = String(data.get('purchaseDate') ?? '');
    const massKg = packageKg * quantity;
    if (checkingPackages || (receiptPresent && reviewReceiptPackage(packageKg, selectedPackageKg, reference?.sizes ?? []).smallerSize !== undefined &&
        (!weightConfirmed || !data.has('receiptWeightConfirmed') || packageKg !== draftPackageKg))) {
      setError(isEs ? 'Verifica el peso de cada empaque en la factura antes de guardar.' : 'Check the weight of each package on your receipt before saving.');
      return;
    }
    if (photoLoading || receiptSelectionRequired || (receiptItemDescription && !receiptFoodConfirmed) || !selected || !Number.isFinite(packageKg) || packageKg <= 0 || packageKg > 100 ||
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
      receiptPhotoUrl: attachment?.image,
      receiptFormat: attachment && (attachment.pdf ? 'pdf' : 'image'),
      receiptReadMethod: receiptReadMethod,
      receiptItemDescription: receiptItemDescription,
      formulaAtPurchase: { name: selected.food.name, analysis: selected.food.fichaNutricional },
      plannedMealCostsAtPurchase: draftSummary?.meals.map(({ time, grams, costCop, partial }) => ({ time, grams, costCop, partial })),
      notes: String(data.get('notes') ?? '').trim() || undefined,
      imageUrl: selected.food.imageUrl,
      createdAt: new Date().toISOString(),
    };

    const pending = new AbortController();
    if (attachment?.pdf) {
      saving.current = pending;
      setSavingPdf(true);
    }
    const isCurrent = currentStorageSession();
    let pdfStored = false;
    try {
      if (attachment?.pdf) {
        await saveReceiptPdf(entry.id, attachment.pdf);
        pdfStored = true;
        if (pending.signal.aborted || !isCurrent()) {
          await removeReceiptPdfs([entry.id]);
          return;
        }
      }
      StorageService.addFoodPurchase(entry);
    } catch {
      if (pdfStored) await removeReceiptPdfs([entry.id]).catch(() => {});
      if (!pending.signal.aborted) setError(isEs ? 'No pudimos guardar la compra y su recibo en este navegador. Revisa el espacio disponible o usa un archivo más pequeño.' : 'Could not save the purchase and receipt in this browser. Check available storage or use a smaller file.');
      return;
    } finally {
      if (saving.current === pending) {
        saving.current = null;
        setSavingPdf(false);
      }
    }
    let packageUpdateFailed = false;
    if (canUpdatePackage && usePurchasedPackage && plan && onPlanUpdate) {
      try { onPlanUpdate(withPurchasedPackage(plan, selected.food, packageKg)); }
      catch { packageUpdateFailed = true; }
    }
    refreshPurchases();
    setShowForm(false);
    setPhotoLoading(false);
    resetConfirmation();
    setAttachment(undefined);
    if (packageUpdateFailed) {
      setNotice(isEs ? 'Compra guardada. Vuelve a Ajustar para actualizar el empaque de tu plan.' : 'Purchase saved. Open Adjust to update the package in your plan.');
      return;
    }
    const differentPackage = component && (component.packageKg === undefined || Math.abs(component.packageKg - packageKg) > 0.000001);
    setNotice(differentPackage && !(canUpdatePackage && usePurchasedPackage)
      ? (isEs
        ? `Compra guardada. ${component.packageKg ? `El costo de la ración sigue usando el empaque de ${weightLabel(component.packageKg, userAccount.language)}.` : 'El empaque de la ración sigue pendiente de confirmar.'} Para usar el empaque de esta compra, vuelve a elegir su presentación en Ajustar.`
        : `Purchase saved. ${component.packageKg ? `The feeding cost still uses the ${weightLabel(component.packageKg, userAccount.language)} package.` : 'The feeding plan package still needs confirmation.'} To use the purchased package, choose that package when adjusting the food.`)
      : (isEs ? 'Compra guardada para este alimento y esta mascota.' : 'Purchase saved for this food and pet.'));
  }

  async function removePurchase(id: string) {
    if (!window.confirm(isEs ? '¿Eliminar esta compra y su recibo?' : 'Delete this purchase and receipt?')) return;
    try {
      await StorageService.deleteFoodPurchase(id);
      refreshPurchases();
    } catch {
      setNotice(isEs ? 'No pudimos eliminar la compra y su recibo. Inténtalo de nuevo.' : 'Could not delete the purchase and its receipt. Please retry.');
    }
  }

  const pets = StorageService.getPets();
  const ownPurchases = purchases.filter(purchase => purchase.petId === pet.id);
  const totalPaid = ownPurchases.reduce((total, entry) =>
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
                <span>{isEs ? 'Toma' : 'Meal'} {meal.index + 1} · {meal.time} · {formatRation(meal.grams, 'metric', userAccount.language)}</span>
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
                : component.basis.source === 'receipt' ? (isEs ? 'Compra con recibo' : 'Purchase with receipt') : (isEs ? 'Precio de compra' : 'Purchase price')}
              {component.basis.storeName && ` · ${component.basis.storeName}`}
            </p>}
          </div>
        ))}
        {notice && <p role="status" className="flex gap-2 text-xs font-bold text-[#0B5D2E] dark:text-green-300"><Check className="size-4" />{notice}</p>}
      </div>

      {showForm && (
        <div inert={savingPdf} aria-busy={savingPdf} className="space-y-4 rounded-3xl border border-[#0B5D2E55] bg-[var(--surface-card)] p-5">
          <div className="flex justify-between gap-3">
            <h3 className="font-heading text-lg font-extrabold text-[var(--text-primary)]">{isEs ? 'Registrar compra o factura' : 'Log purchase or receipt'}</h3>
            <button type="button" onClick={() => { setShowForm(false); setPhotoLoading(false); resetConfirmation(); }} aria-label={isEs ? 'Cerrar formulario de compra' : 'Close purchase form'} className="flex size-10 items-center justify-center rounded-full"><X className="size-5" /></button>
          </div>
          <ReceiptReview key={`${pet.id}-${receiptFormKey}`} language={userAccount.language}
            onReadingChange={setPhotoLoading}
            onSelectionRequiredChange={setReceiptSelectionRequired}
            onNewFile={() => {
              setReceiptPresent(true);
              setAttachment(undefined);
              setReceiptItemDescription(undefined);
              setReceiptReadMethod(undefined);
              setDraft({ packageWeight: '', weightUnit: 'kg', quantity: '', price: '', purchaseDate: '', store: '', notes: '' });
              setUsePurchasedPackage(false);
              resetConfirmation();
              setError('');
            }}
            onPreview={(image, pdf) => setAttachment({ image, pdf })}
            onSelect={applyReceiptItem}
            onManual={() => { setReceiptItemDescription(undefined); setReceiptReadMethod(undefined); resetConfirmation(); }}
            onRemove={() => { setDraft(emptyDraft(selected?.food)); setUsePurchasedPackage(false); setAttachment(undefined); setReceiptPresent(false); setReceiptItemDescription(undefined); setReceiptReadMethod(undefined); resetConfirmation(); }}
          />
          <div className="flex gap-2">
            {summary.components.length > 0 && (
              <button type="button" onClick={() => {
                setSource('plan');
                const first = summary.components[0];
                chooseFood({ food: first.food, role: first.role });
              }} aria-pressed={source === 'plan'} className="min-h-11 rounded-xl border border-[var(--border-color)] px-3 text-xs font-bold text-[var(--text-primary)]">
                {isEs ? 'Alimento del plan' : 'Plan food'}
              </button>
            )}
            <button type="button" onClick={() => { setSource('internet'); chooseFood(undefined); }} aria-pressed={source === 'internet'} className="min-h-11 rounded-xl border border-[var(--border-color)] px-3 text-xs font-bold text-[var(--text-primary)]">
              {isEs ? 'Buscar en internet' : 'Search online'}
            </button>
          </div>
          {source === 'internet' && (
            <OnlineFoodSearch species={pet.species} lang={userAccount.language} onSelect={(food) => {
              const component = summary.components.find((item) => sameFoodIdentity(item.food, food));
              const keepPlanLabel = component && (component.food.labelStatus === 'user_confirmed_label' || food.labelStatus !== 'verified_manufacturer');
              chooseFood({
                food: keepPlanLabel ? { ...component.food, bagSizeKg: food.bagSizeKg, availableSizesKg: food.availableSizesKg } : food,
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
                chooseFood(component ? { food: component.food, role: component.role } : undefined);
                setError('');
              }}>
                {summary.components.map((component) => <option key={component.role} value={`${component.role}:${component.food.id}`}>{component.food.brand} {component.food.name}</option>)}
              </select>
            </label>
          )}
          {selected && (
            <form onSubmit={savePurchase} className="space-y-4">
              <p className="rounded-xl bg-[var(--surface-inner)] p-3 text-xs font-bold text-[var(--text-primary)]">{selected.food.brand} {selected.food.name}</p>
              {receiptPresent && !photoLoading && <h4 className="text-sm font-extrabold text-[var(--text-primary)]">{isEs ? 'Revisa los datos de la factura' : 'Review receipt details'}</h4>}
              <fieldset disabled={photoLoading} className="grid grid-cols-2 gap-3 disabled:opacity-60">
                <legend className="sr-only">{isEs ? 'Datos de la compra para confirmar' : 'Purchase details to confirm'}</legend>
                <label className="space-y-1 text-xs font-bold text-[var(--text-primary)]">
                  <span>{isEs ? 'Peso de cada empaque' : 'Weight per package'}</span>
                  <input className={inputClass} name="packageWeight" inputMode="decimal" required value={draft.packageWeight} onChange={(event) => changeField('packageWeight', event.target.value)} />
                </label>
                <label className="space-y-1 text-xs font-bold text-[var(--text-primary)]">
                  <span>{isEs ? 'Unidad del peso' : 'Weight unit'}</span>
                  <select aria-label={isEs ? 'Unidad del peso' : 'Weight unit'} className={inputClass} name="weightUnit" value={draft.weightUnit} onChange={(event) => changeField('weightUnit', event.target.value as 'kg' | 'g')}><option value="kg">kg</option><option value="g">g</option></select>
                </label>
                <label className="space-y-1 text-xs font-bold text-[var(--text-primary)]">
                  <span>{isEs ? 'Cantidad de empaques' : 'Number of packages'}</span>
                  <input className={inputClass} name="quantity" type="number" min="1" max="1000" step="1" required value={draft.quantity} onChange={(event) => changeField('quantity', event.target.value)} />
                </label>
                <label className="space-y-1 text-xs font-bold text-[var(--text-primary)]">
                  <span>{isEs ? 'Importe total de este alimento (COP)' : 'Total amount for this food (COP)'}</span>
                  <input className={inputClass} name="price" inputMode="decimal" value={draft.price} onChange={(event) => changeField('price', event.target.value)} placeholder={isEs ? 'Ej. 140.000' : 'E.g. 140000'} required />
                </label>
                <label className="space-y-1 text-xs font-bold text-[var(--text-primary)]">
                  <span>{isEs ? 'Fecha de compra' : 'Purchase date'}</span>
                  <input className={inputClass} name="purchaseDate" type="date" required max={localDateKey()} value={draft.purchaseDate} onChange={(event) => changeField('purchaseDate', event.target.value)} />
                </label>
                <label className="space-y-1 text-xs font-bold text-[var(--text-primary)]">
                  <span>{isEs ? 'Tienda (opcional)' : 'Store (optional)'}</span>
                  <input className={inputClass} name="store" value={draft.store} onChange={(event) => changeField('store', event.target.value)} />
                </label>
              </fieldset>
              {receiptPresent && !photoLoading && <div className="space-y-2 text-xs text-[var(--text-secondary)]">
                {checkingPackages ? <p role="status">{isEs ? 'Consultando presentaciones del alimento…' : 'Checking package sizes…'}</p>
                  : reference?.sizes.length ? <p>{reference.sourceUrl
                    ? <a className="font-bold underline" href={reference.sourceUrl} target="_blank" rel="noopener noreferrer">{isEs ? 'Presentaciones de ' : 'Package sizes from '}{reference.sourceName}</a>
                    : (isEs ? 'Presentaciones conocidas del alimento' : 'Known package sizes')}
                    {' · '}{reference.sizes.map(kg => weightLabel(kg, userAccount.language)).join(' · ')}</p>
                  : <p>{isEs ? 'Peso por empaque pendiente de contrastar. Compruébalo en la bolsa.' : 'Package size needs verification. Check the weight on the bag.'}</p>}
                {differsFromKnown && <p role="alert" className="font-bold text-amber-800 dark:text-amber-200">
                  {reference?.sourceUrl && <span className="block">{isEs ? 'No confirmada por el fabricante' : 'Not confirmed by the manufacturer'}</span>}
                  {weightLabel(draftPackageKg, userAccount.language)}{isEs ? ' no coincide con las presentaciones de esta referencia. Comprueba el peso en el empaque.' : ' does not match the listed package sizes. Check the weight on the package.'}
                </p>}
                {smallerSize !== undefined && <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
                  <p role="alert">{isEs ? 'Revisa el separador decimal. Un peso de ' : 'Check the decimal separator. A weight of '}{weightLabel(draftPackageKg, userAccount.language)}
                    {isEs ? ' es al menos diez veces el de la presentación de ' : ' is at least ten times the size of the '}{weightLabel(smallerSize, userAccount.language)}{isEs ? '.' : ' package.'}</p>
                  <label className="flex min-h-11 items-center gap-2 font-bold">
                    <input type="checkbox" name="receiptWeightConfirmed" required checked={weightConfirmed} onChange={(event) => setWeightConfirmed(event.target.checked)} className="accent-[#0B5D2E]" />
                    <span>{isEs ? 'Verifiqué en la factura que cada empaque pesa ' : 'I checked the receipt and each package weighs '}{weightLabel(draftPackageKg, userAccount.language)}</span>
                  </label>
                </div>}
              </div>}
              <p className="text-xs text-[var(--text-secondary)]">{isEs ? 'Ingresa el total pagado por todos estos empaques. Si la factura incluye otros productos, usa solo el importe de este alimento.' : 'Enter the total paid for these packages. If the receipt includes other products, use only this food’s amount.'}</p>
              <label className="block space-y-1 text-xs font-bold text-[var(--text-primary)]">
                <span>{isEs ? 'Notas (opcional)' : 'Notes (optional)'}</span>
                <textarea className={inputClass} name="notes" rows={2} disabled={photoLoading} value={draft.notes} onChange={(event) => changeField('notes', event.target.value)} />
              </label>
              <section role="region" aria-label={isEs ? 'Costo antes de guardar' : 'Cost before saving'} className="space-y-2 rounded-2xl bg-[var(--surface-inner)] p-3 text-xs">
                <h4 className="font-extrabold text-[var(--text-primary)]">{isEs ? 'Costo de esta compra por porción' : 'This purchase’s cost per portion'}</h4>
                {validDraftAmounts && draftPrice !== undefined && <p>{formatCOP(draftPrice / (draftPackageKg * draftQuantity), true)} / kg · {draftQuantity} × {weightLabel(draftPackageKg, userAccount.language)}</p>}
                {draftSummary?.costPerDayCop !== undefined ? <>
                  <dl className="grid grid-cols-2 gap-2"><div><dt>{isEs ? 'Por día' : 'Per day'}</dt><dd className="font-bold">{cost(draftSummary.costPerDayCop)}</dd></div><div><dt>{isEs ? 'Por mes estimado' : 'Estimated month'}</dt><dd className="font-bold">{cost(draftSummary.costPerMonthCop)}</dd></div></dl>
                  <ul className="space-y-1">{draftSummary.meals.map((meal) => <li key={meal.index} className="flex justify-between gap-2"><span>{isEs ? 'Toma' : 'Meal'} {meal.index + 1} · {meal.time} · {formatRation(meal.grams, 'metric', userAccount.language)}</span><strong>{cost(meal.costCop)}{meal.partial ? (isEs ? ' · parcial' : ' · partial') : ''}</strong></li>)}</ul>
                  {draftSummary.partial && <p className="font-bold text-amber-800 dark:text-amber-200">{isEs ? 'Costo parcial: falta precio de otra parte de la ración.' : 'Partial cost: another part of the ration has no price.'}</p>}
                </> : <p className="text-[var(--text-secondary)]">{!draftComponent ? (isEs ? 'Selecciona el alimento de su plan para calcular el costo por porción. La compra de otro alimento se guarda sin cambiar su ración.' : 'Select the plan’s food to calculate cost per portion. A different food purchase does not change the feeding plan.') : (isEs ? 'Completa peso, cantidad e importe, y guarda una ración confirmada para calcular el costo por toma.' : 'Complete weight, quantity and amount, and save a confirmed feeding plan to calculate meal costs.')}</p>}
                {draftChangesPackage && <p className="text-[var(--text-secondary)]">{isEs ? `Este costo corresponde al empaque de la compra. ${draftComponent?.packageKg ? `Tu plan usa ${weightLabel(draftComponent.packageKg, userAccount.language)}.` : 'Tu plan todavía no tiene un empaque confirmado.'}` : `This cost refers to the purchased package. ${draftComponent?.packageKg ? `Your plan uses ${weightLabel(draftComponent.packageKg, userAccount.language)}.` : 'Your plan does not have a confirmed package yet.'}`}</p>}
              </section>
              {canUpdatePackage && <label className="flex items-start gap-2 text-xs text-[var(--text-primary)]"><input type="checkbox" checked={usePurchasedPackage} onChange={(event) => { setUsePurchasedPackage(event.target.checked); resetConfirmation(); }} disabled={photoLoading} className="mt-0.5 accent-[#0B5D2E]" /><span>{isEs ? 'Usar este empaque en mi plan' : 'Use this package in my plan'}</span></label>}
              {receiptItemDescription && <label className="flex items-start gap-2 text-xs text-[var(--text-primary)]"><input name="receiptFoodConfirmed" type="checkbox" required checked={receiptFoodConfirmed} onChange={(event) => setReceiptFoodConfirmed(event.target.checked)} disabled={photoLoading || receiptSelectionRequired} className="mt-0.5 accent-[#0B5D2E]" /><span>{isEs ? 'Este artículo corresponde al alimento seleccionado' : 'This item matches the selected food'}</span></label>}
              {receiptItemDescription && <p className="text-xs text-[var(--text-secondary)]">{isEs ? 'Artículo leído:' : 'Recognized item:'} {receiptItemDescription}<br />{isEs ? 'Se guardará para:' : 'Will be saved for:'} {pet.name} · {selected.food.brand} {selected.food.name}</p>}
              {receiptSelectionRequired && <p className="text-xs font-bold text-amber-800 dark:text-amber-200">{isEs ? 'Elige un artículo de la factura o completa los datos manualmente antes de guardar.' : 'Choose a receipt item or enter the details manually before saving.'}</p>}
              <label className="flex items-start gap-2 text-xs text-[var(--text-primary)]">
                <input name="confirmed" type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={photoLoading || receiptSelectionRequired} className="mt-0.5 accent-[#0B5D2E]" />
                <span>{isEs ? 'Confirmo el importe y el peso de este alimento' : 'I confirm the amount and weight for this food'}</span>
              </label>
              {error && <p role="alert" className="flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800"><AlertCircle className="size-4 shrink-0" />{error}</p>}
              <button type="submit" disabled={savingPdf || photoLoading || receiptSelectionRequired || checkingPackages || (confirmPackageWeight && !weightConfirmed)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0B5D2E] px-3 text-sm font-extrabold text-white disabled:opacity-50"><Receipt className="size-4" />{savingPdf ? (isEs ? 'Guardando PDF…' : 'Saving PDF…') : photoLoading ? (isEs ? 'Leyendo factura…' : 'Reading receipt…') : (isEs ? 'Guardar compra' : 'Save purchase')}</button>
            </form>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-3xl border border-[var(--border-color)] bg-[var(--surface-card)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-lg font-extrabold text-[var(--text-primary)]">{isEs ? 'Compras registradas' : 'Saved purchases'}</h3>
          {totalPaid > 0 && <span className="text-xs font-bold text-[var(--text-secondary)]">
            {cost(totalPaid)} {ownPurchases.length === purchases.length
              ? (isEs ? 'en total' : 'total')
              : (isEs ? 'en compras propias' : 'in own purchases')}
          </span>}
        </div>
        <StockSummary petId={pet.id} language={userAccount.language} />
        {purchases.length === 0 && <p className="text-sm text-[var(--text-secondary)]">{isEs ? 'Aún no hay compras registradas para esta mascota.' : 'No purchases saved for this pet yet.'}</p>}
        {purchases.map((purchase) => {
          const owned = purchase.petId === pet.id;
          const owner = !owned && pets.find(item => item.id === purchase.petId);
          return <article key={purchase.id} className="space-y-2 rounded-2xl border border-[var(--border-color)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-extrabold text-[var(--text-primary)]">{purchase.foodBrand} {purchase.foodName}</h4>
                {!owned && <p className="mt-1 text-xs font-bold text-[var(--text-primary)]">
                  {isEs ? 'Compra compartida' : 'Shared purchase'}
                  {owner && (isEs ? ' · Registrada para ' : ' · Recorded for ') + owner.name}
                </p>}
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{purchase.date}{purchase.storeName && ` · ${purchase.storeName}`}</p>
              </div>
              {owned && <button type="button" onClick={() => removePurchase(purchase.id)} aria-label={isEs ? 'Eliminar compra' : 'Delete purchase'} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-red-700 hover:bg-red-50"><Trash2 className="size-4" /></button>}
            </div>
            <p className="text-xs text-[var(--text-primary)]">
              {purchase.quantity && purchase.quantity > 1 ? `${purchase.quantity} × ${weightLabel(purchase.bagSizeKg / purchase.quantity, userAccount.language)}` : weightLabel(purchase.bagSizeKg, userAccount.language)}
              {' · '}{cost(purchase.pricePaidCop)}
              {purchase.bagSizeKg > 0 && ` · ${cost(purchase.pricePaidCop / purchase.bagSizeKg)} / kg`}
            </p>
            {owned && <OpenPurchase purchase={purchase} pets={pets} language={userAccount.language} onSaved={refreshPurchases} />}
            {owned && Boolean(purchase.plannedMealCostsAtPurchase?.some(meal => meal.costCop !== undefined)) && <details className="text-xs">
              <summary className="cursor-pointer font-bold">{isEs ? 'Ración al comprar' : 'Portions at purchase'}</summary>
              {purchase.plannedMealCostsAtPurchase?.map((meal,index) => <p key={index}>{meal.time} · {formatRation(meal.grams, 'metric', userAccount.language)} · {meal.costCop === undefined ? '—' : cost(meal.costCop)}{meal.partial && (isEs ? ' (parcial)' : ' (partial)')}</p>)}
              {purchase.formulaAtPurchase?.analysis?.fuenteNombre && <p>{purchase.formulaAtPurchase.analysis.fuenteNombre} · {purchase.formulaAtPurchase.analysis.fechaConsulta?.slice(0, 10)}</p>}
            </details>}
            {purchase.notes && <p className="text-xs text-[var(--text-secondary)]">{purchase.notes}</p>}
            <SavedReceipt purchase={purchase} isEs={isEs} />
          </article>;
        })}
      </div>
    </section>
  );
}
