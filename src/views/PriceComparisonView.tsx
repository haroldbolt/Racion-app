import { ArrowLeft, Clock3, ExternalLink, LoaderCircle, MapPin, Package, Search, Trophy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BogotaPostalCodeField } from '../components/BogotaPostalCodeField';
import { useCity } from '../contexts/CityContext';
import { CONFIRMED_FOOD_PRESENTATIONS, packageConfirmation } from '../data/foodPresentations';
import { FoodSafetyAlerts } from '../components/FoodSafetyAlerts';
import { UnifiedFoodSearchModal } from '../components/UnifiedFoodSearchModal';
import { getOfferCosts, getOfferPortions, type OfferPortions } from '../utils/offerCosts';
import { selectFoodPackage } from '../services/onlineFoodCatalog';
import { useManufacturerPackageSizes } from '../hooks/useManufacturerFoods';
import { StorageService } from '../utils/storage';
import type { FoodItem, FoodPriceBasis, FeedingPlan, Pet } from '../types';
import {
  colombiaPriceDay,
  isBogotaPostalCode,
  LIVE_PRICE_CITIES,
  LIVE_PRICE_MAX_GRAMS,
  LIVE_PRICE_MIN_GRAMS,
  type LivePriceOffer,
  type LivePriceRequest,
  type LivePriceResponse,
} from '../types/livePrices';
import { formatCOP } from '../utils/i18n';
import { publicAssetUrl } from '../utils/publicAssetUrl';

interface PriceComparisonViewProps {
  food: FoodItem;
  pet?: Pet;
  plan?: FeedingPlan;
  onPick?: (food: FoodItem) => void;
  onReviewFood?: (food: FoodItem) => void;
  packageKg?: number;
  language?: 'es' | 'en';
  backTo?: 'plan' | 'foods' | 'more' | 'search';
  onBack: () => void;
  onUsePrice?: (food: FoodItem, basis: FoodPriceBasis) => void;
}

type Lookup =
  | { state: 'idle' }
  | { state: 'loading'; key: string }
  | { state: 'result'; key: string; result: LivePriceResponse };

function isPackageWeight(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    value * 1000 >= LIVE_PRICE_MIN_GRAMS && value * 1000 <= LIVE_PRICE_MAX_GRAMS;
}

function parsePackageGrams(text: string): number | null {
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(text.trim())) return null;
  const kg = Number(text.trim().replace(',', '.'));
  return isPackageWeight(kg) ? Math.round(kg * 1000) : null;
}

function storeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {
    return undefined;
  }
}

function unavailable(city: string, reason: NonNullable<LivePriceResponse['reason']>): LivePriceResponse {
  return { status: 'unavailable', city, queriedAt: null, offers: [], cheapestOfferId: null, reason };
}

function hasOfferDetails(offer: LivePriceOffer) {
  return offer && typeof offer.id === 'string' && typeof offer.retailer === 'string' &&
    typeof offer.title === 'string' && typeof offer.productUrl === 'string' &&
    ['available', 'unknown', 'out_of_stock'].includes(offer.stock) &&
    Number.isSafeInteger(offer.grams) && offer.grams > 0 &&
    Number.isSafeInteger(offer.productPriceCop) && offer.productPriceCop > 0 &&
    Number.isFinite(offer.pricePerKgCop) && offer.pricePerKgCop > 0 &&
    (offer.shippingCop === null ? offer.totalCop === null
      : Number.isSafeInteger(offer.shippingCop) && offer.shippingCop >= 0 &&
        offer.totalCop === offer.productPriceCop + offer.shippingCop);
}

function matchesShippingScope(offer: LivePriceOffer, postalCode?: string) {
  return (offer.shippingPostalCode ?? undefined) === postalCode;
}

async function lookupPrices(body: LivePriceRequest, signal: AbortSignal): Promise<LivePriceResponse> {
  const endpoint = import.meta.env.VITE_PRICE_API_URL?.trim() ||
    (import.meta.env.DEV ? '/api/live-prices' : '');
  if (!endpoint) return unavailable(body.city, 'not_configured');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify(body),
    signal,
  });
  const value: LivePriceResponse | null = await response.json().catch(() => null);
  if (!value || !['current', 'stale', 'unavailable'].includes(value.status) || value.city !== body.city ||
    !Array.isArray(value.offers) || !value.offers.every(hasOfferDetails) ||
    (!response.ok && value.status !== 'unavailable' && value.status !== 'stale')) {
    return unavailable(body.city, response.status === 429 ? 'rate_limited' : 'upstream_unavailable');
  }
  return value;
}

function PriceOfferCard({
  offer,
  manufacturerSizes,
  isEs,
  formatKg,
  postalCode,
  winnerLabel,
  portions,
  locked,
  onUsePrice,
}: {
  offer: LivePriceOffer;
  manufacturerSizes?: number[];
  isEs: boolean;
  formatKg: (grams: number) => string;
  postalCode?: string;
  winnerLabel?: string;
  portions?: OfferPortions;
  locked: boolean;
  onUsePrice?: (includeShipping: boolean) => void;
}) {
  const link = storeUrl(offer.productUrl);
  const isShoppingLink = link && /(^|\.)google\.(com|com\.co)$/.test(new URL(link).hostname);
  const {shippingCop, totalCop, meals} = getOfferCosts(offer, postalCode, portions);
  const amounts = meals?.map(meal => Math.round(meal.costCop)) ?? [];
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  const money = amounts.length
    ? low === high ? formatCOP(low, true) : formatCOP(low) + ' – ' + formatCOP(high, true)
    : undefined;
  const pending = locked
    ? (isEs ? 'Confirma la fórmula prescrita' : 'Confirm the prescribed formula')
    : (isEs ? 'Faltan los gramos' : 'Serving grams needed');
  const gramText = (grams: number) => new Intl.NumberFormat(isEs ? 'es-CO' : 'en', {maximumFractionDigits:3}).format(grams) + ' g';
  const shipping = shippingCop === null
    ? (isEs ? 'Envío desconocido' : 'Delivery unknown')
    : shippingCop === 0
    ? (isEs ? 'Incluido' : 'Included')
    : formatCOP(shippingCop, true);

  return (
    <article aria-label={offer.retailer} className={
      winnerLabel
        ? 'rounded-2xl border border-[#0B5D2E55] bg-[var(--surface-inner)] p-4'
        : 'rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4'
    }>
      {winnerLabel && (
        <p className="mb-2 flex items-center gap-1.5 text-xs font-black text-[#0B5D2E] dark:text-green-300">
          <Trophy aria-hidden="true" className="size-4" />
          {winnerLabel}
        </p>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="min-w-0 break-words font-heading text-lg font-extrabold text-[var(--text-primary)]">{offer.retailer}</h3>
        <span className="text-xs font-bold text-[var(--text-secondary)]">{formatKg(offer.grams)} kg</span>
      </div>
      <p className="break-words text-xs leading-snug text-[var(--text-secondary)]">{offer.title}</p>
      <p className="text-xs text-[var(--text-secondary)]">{packageConfirmation(manufacturerSizes, offer.grams / 1000, isEs)}</p>
      <p className="mt-1.5 text-xs font-semibold text-[var(--text-primary)]">
        {offer.stock === 'available' ? (isEs ? 'En stock' : 'In stock')
          : offer.stock === 'out_of_stock' ? (isEs ? 'Agotada' : 'Out of stock')
          : (isEs ? 'Disponibilidad por confirmar' : 'Availability to confirm')}
      </p>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-2 gap-y-1.5 border-t border-[var(--border-color)] pt-3 text-xs">
        <dt>{isEs ? 'Precio de la bolsa' : 'Package price'}</dt>
        <dd className="text-right tabular-nums">{formatCOP(offer.productPriceCop, true)}</dd>
        <dt>{isEs ? 'Envío' : 'Delivery'}</dt>
        <dd className="text-right tabular-nums">
          {shipping}
          {postalCode && shippingCop !== null && (
            <span className="block text-[11px] text-[var(--text-secondary)]">
              {isEs ? `Cotizado para ${postalCode}` : `Quoted for ${postalCode}`}
            </span>
          )}
        </dd>
        <dt className="font-bold">{isEs ? 'Total con envío' : 'Total with delivery'}</dt>
        <dd className="text-right font-black tabular-nums text-[var(--text-primary)]">
          {totalCop === null ? (isEs ? 'No calculable' : 'Cannot calculate') : formatCOP(totalCop, true)}
        </dd>
        <dt className="font-bold">{isEs ? 'Costo por toma' : 'Cost per serving'}</dt>
        <dd className="text-right tabular-nums">
          <strong className="block text-sm text-[var(--text-primary)]">{money ?? pending}</strong>
          {money && <span className="block text-[11px] text-[var(--text-secondary)]">
            {portions?.mixed && (isEs ? 'Solo este alimento · ' : 'This food only · ')}
            {meals?.every(meal => meal.grams === meals[0].grams) && gramText(meals[0].grams) + ' · '}
            {totalCop === null ? (isEs ? 'Sin envío' : 'Before delivery') : (isEs ? 'Con envío' : 'With delivery')}
          </span>}
        </dd>
        <dt>{isEs ? 'Producto por kilo' : 'Product per kilo'}</dt>
        <dd className="text-right tabular-nums">{formatCOP(offer.pricePerKgCop, true)} / kg</dd>
      </dl>
      {meals?.length && !portions?.manual ? (
        <details className="mt-3 rounded-xl bg-[var(--surface-subtle)] px-3 text-xs">
          <summary className="cursor-pointer py-2.5 font-semibold">{isEs ? 'Ver costo por horario' : 'View cost by feeding time'}</summary>
          <p className="mb-2">{isEs ? 'Este alimento al día' : 'This food per day'} · {formatCOP(meals.reduce((sum, meal) => sum + meal.costCop, 0), true)}</p>
          {portions?.mixed && <p className="mb-2">
            {isEs ? 'Ración mixta al día' : 'Mixed food per day'} · {meals.every(meal => meal.mixedMealCop !== undefined)
              ? formatCOP(meals.reduce((sum, meal) => sum + meal.mixedMealCop!, 0), true)
              : (isEs ? 'Falta el precio del otro alimento' : 'Other food price needed')}
          </p>}
          <ul className="space-y-2 pb-3">
            {meals.map((meal,i) => <li key={i} className="tabular-nums">
              {meal.time || (isEs ? 'Toma ' : 'Serving ') + (i + 1)} · {gramText(meal.grams)} · {formatCOP(meal.costCop, true)}
              {portions?.mixed && <span className="block text-[var(--text-secondary)]">{meal.mixedMealCop === undefined
                ? (isEs ? 'Falta el precio del otro alimento.' : 'Other food price needed.')
                : (isEs ? 'Toma mixta · ' : 'Mixed meal · ') + formatCOP(meal.mixedMealCop, true)}</span>}
            </li>)}
          </ul>
        </details>
      ) : null}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 text-sm font-bold text-[#0B5D2E] focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-green-300">
          {isShoppingLink ? 'Google Shopping' : (isEs ? 'Ver en tienda' : 'View store')}
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </a>
      )}
      {onUsePrice && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => onUsePrice(false)}
            className="min-h-11 rounded-xl bg-[#0B5D2E] px-3 py-2 text-sm font-bold text-white">
            {isEs ? 'Usar precio del producto' : 'Use product price'}
          </button>
          {totalCop !== null && (
            <button type="button" onClick={() => onUsePrice(true)}
              className="min-h-11 rounded-xl border border-[var(--border-color)] px-3 py-2 text-sm font-bold">
              {isEs ? 'Usar total con envío' : 'Use total with delivery'}
            </button>
          )}
          <p className="w-full text-xs text-[var(--text-secondary)]">
            {isEs ? 'Actualiza el costo de las tomas del plan. Precio de referencia; registra el importe pagado en Gastos.' : 'Updates your plan’s meal cost. Reference price; record your actual purchase in Expenses.'}
          </p>
        </div>
      )}
    </article>
  );
}

export function PriceComparisonView({ food, pet, plan, onPick, onReviewFood, packageKg, language = 'es', backTo = 'plan', onBack, onUsePrice }: PriceComparisonViewProps) {
  const [picking, setPicking] = useState(false);
  const isEs = language === 'es';
  const manufacturerSizes = useManufacturerPackageSizes(food);
  const { selectedCity, setCity } = useCity();
  const city = LIVE_PRICE_CITIES.find((candidate) => candidate === selectedCity) ?? LIVE_PRICE_CITIES[0];
  const initialKg = isPackageWeight(packageKg) ? packageKg : isPackageWeight(food.bagSizeKg) ? food.bagSizeKg : undefined;
  const knownPackages = [...new Set([
    ...(CONFIRMED_FOOD_PRESENTATIONS[food.id] ?? []),
    ...(manufacturerSizes ?? []),
    ...(food.availableSizesKg ?? []),
    initialKg,
  ].filter(isPackageWeight).map(kg => Math.round(kg * 1000) / 1000))].sort((a, b) => a - b);
  const [packageInput, setPackageInput] = useState(() => initialKg === undefined ? '' : String(Math.round(initialKg * 1000) / 1000));
  const [inputError, setInputError] = useState(false);
  const [postalCodeInput, setPostalCodeInput] = useState(() => StorageService.getBogotaPostalCode());
  const [postalCodeError, setPostalCodeError] = useState(false);
  const [manualPortion, setManualPortion] = useState({petId:pet?.id, foodId:food.id, value:''});
  const enteredGrams = manualPortion.petId === pet?.id && manualPortion.foodId === food.id ? manualPortion.value : '';
  const parsedGrams = /^\d+(?:[.,]\d{1,3})?$/.test(enteredGrams) ? Number(enteredGrams.replace(',', '.')) : NaN;
  const hasManualGrams = Number.isSafeInteger(Math.ceil(parsedGrams)) && parsedGrams > 0;
  const planPortions = useMemo(() => getOfferPortions(pet, plan, food, pet ? StorageService.getFoodPurchases(pet.id) : []), [food, pet, plan]);
  const locked = Boolean(plan?.isVetLocked || pet?.vetGuideline?.locked);
  const portions = planPortions ?? (!locked && hasManualGrams ? {manual:true, mixed:false, meals:[{grams:parsedGrams}]} : undefined);
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [today, setToday] = useState(colombiaPriceDay);
  const controller = useRef<AbortController>(null);
  const grams = parsePackageGrams(packageInput);
  const postalCode = city === 'Bogotá' ? postalCodeInput.trim() || undefined : undefined;
  const selection = JSON.stringify([food.id, city, grams, postalCode]);
  const activeLookup = lookup.state !== 'idle' && lookup.key === selection ? lookup : undefined;
  const loading = activeLookup?.state === 'loading';
  const result = activeLookup?.state === 'result' ? activeLookup.result : undefined;
  const unconfigured = !import.meta.env.VITE_PRICE_API_URL?.trim() && !import.meta.env.DEV;
  const queriedAt = result?.queriedAt ? new Date(result.queriedAt) : null;
  const validDate = queriedAt !== null && Number.isFinite(queriedAt.getTime());
  const current = result?.status === 'current' && validDate && colombiaPriceDay(queriedAt) === today;

  useEffect(() => () => {
    controller.current?.abort();
    controller.current = null;
  }, []);
  useEffect(() => {
    if (!result) return;
    const refreshDay = () => setToday(colombiaPriceDay());
    refreshDay();
    const timer = window.setInterval(refreshDay, 1000);
    document.addEventListener('visibilitychange', refreshDay);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshDay);
    };
  }, [result]);

  function choosePackage(value: string) {
    setPackageInput(value);
    setInputError(false);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unconfigured || loading) return;
    if (grams === null) {
      setInputError(true);
      return;
    }
    if (postalCode && !isBogotaPostalCode(postalCode)) {
      setPostalCodeError(true);
      return;
    }

    if (city === 'Bogotá') StorageService.setBogotaPostalCode(postalCode ?? '');
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const timeout = window.setTimeout(() => request.abort(), postalCode ? 35000 : 20000);
    setLookup({ state: 'loading', key: selection });
    const showResult = (nextResult: LivePriceResponse) => {
      if (controller.current !== request) return;
      const previous = result?.queriedAt && result.offers.length > 0 ? result : undefined;
      const next = nextResult.status === 'unavailable' && nextResult.reason !== 'not_configured' && previous
        ? { ...previous, status: 'stale' as const, cheapestOfferId: null, reason: nextResult.reason }
        : nextResult;
      setLookup({ state: 'result', key: selection, result: next });
    };
    try {
      const requestBody: LivePriceRequest = {
        city,
        ...(postalCode ? { postalCode } : {}),
        product: {
          brand: food.brand,
          name: food.manufacturerFormulaName || food.name,
          grams,
          ...(food.barcode && food.bagSizeKg !== undefined && Math.round(food.bagSizeKg * 1000) === grams
            ? { barcode: food.barcode }
            : {}),
        },
      };
      showResult(await lookupPrices(requestBody, request.signal));
    } catch {
      showResult(unavailable(city, 'upstream_unavailable'));
    } finally {
      window.clearTimeout(timeout);
      if (controller.current === request) controller.current = null;
    }
  }

  const localizeKg = new Intl.NumberFormat(isEs ? 'es-CO' : 'en', { maximumFractionDigits: 3 });
  const formatKg = (weight: number) => localizeKg.format(weight / 1000);
  const applyOffer = (offer: LivePriceOffer) => current && offer.stock !== 'out_of_stock' && !locked && onUsePrice ? (includeShipping: boolean) => onUsePrice(food, {
    packageKg: offer.grams / 1000,
    priceCop: offer.productPriceCop,
    source: 'online',
    observedAt: result?.queriedAt || new Date().toISOString(),
    selectedAt: new Date().toISOString(),
    storeName: offer.retailer,
    sourceUrl: storeUrl(offer.productUrl),
    shippingCop: matchesShippingScope(offer, postalCode) ? offer.shippingCop : null,
    includeShipping,
    postalCode,
  }) : undefined;
  const exactOffers = result?.offers.filter((offer) => offer.grams === grams) ?? [];
  const otherSizes = (result?.offers.filter((offer) => offer.grams !== grams) ?? [])
    .sort((a, b) => a.pricePerKgCop - b.pricePerKgCop);
  const scopedTotal = (offer: LivePriceOffer) => matchesShippingScope(offer, postalCode) ? offer.totalCop : null;
  const winner = current
    ? exactOffers.find((offer) => offer.id === result?.cheapestOfferId && offer.stock === 'available' && scopedTotal(offer) !== null)
    : undefined;
  const winnerTotal = winner?.totalCop;
  const unresolvedLowerPrice = typeof winnerTotal === 'number' &&
    exactOffers.some((offer) => offer.stock !== 'out_of_stock' && scopedTotal(offer) === null && offer.productPriceCop < winnerTotal);
  const winnerLabel = unresolvedLowerPrice
    ? (isEs ? 'Menor total confirmado' : 'Lowest confirmed total')
    : (isEs ? 'Más barato hoy' : 'Cheapest today');
  const orderedExactOffers = exactOffers
    .filter((offer) => offer.id !== winner?.id)
    .sort((a, b) => (scopedTotal(a) ?? Infinity) - (scopedTotal(b) ?? Infinity) || a.productPriceCop - b.productPriceCop);

  const unavailableMessages = {
    not_configured: isEs ? 'La consulta en vivo todavía no está habilitada.' : 'Live price lookup is not available yet.',
    quota_exhausted: isEs ? 'Se agotaron las consultas disponibles este mes.' : 'This month’s searches have been used.',
    rate_limited: isEs ? 'Alcanzamos el límite temporal de consultas. Inténtalo más tarde.' : 'The search limit was reached. Try again later.',
    upstream_unavailable: isEs ? 'El servicio de precios está temporalmente indisponible.' : 'The price service is temporarily unavailable.',
  };
  const consulted = validDate
    ? new Intl.DateTimeFormat(isEs ? 'es-CO' : 'en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Bogota',
      }).format(queriedAt)
    : undefined;

  return (
    <div className="space-y-4 px-4 pb-28 pt-2">
      <button type="button" onClick={onBack}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-2 text-sm font-bold text-[#0B5D2E] focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-green-300">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {backTo === 'search' ? (isEs ? 'Volver a la búsqueda' : 'Back to search')
          : backTo === 'foods'
          ? (isEs ? 'Volver a Alimentos' : 'Back to Foods')
          : backTo === 'more'
            ? (isEs ? 'Volver a Más' : 'Back to More')
            : (isEs ? 'Volver al plan' : 'Back to the plan')}
      </button>

      <section className="overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--surface-card)] shadow-sm">
        <div className="bg-[#123C2A] px-5 pb-4 pt-5 text-white">
          <h1 className="font-heading text-2xl font-extrabold leading-tight">
            {isEs ? 'Comparar precios' : 'Compare prices'}
          </h1>
          <div className="mt-4 flex items-center gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 p-1.5">
              {food.imageUrl
                ? <img src={publicAssetUrl(food.imageUrl)} alt="" className="size-full rounded-xl bg-white object-contain" />
                : <Package aria-hidden="true" className="size-5 text-white" />}
            </div>
            <div className="min-w-0 break-words">
              <p className="text-xs font-semibold text-green-100">{food.brand}</p>
              <p className="text-sm font-bold leading-tight text-white">{food.name}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2 px-4 pt-3">
          {onPick && <button type="button" className="min-h-11 rounded-xl border px-3 text-sm font-bold" onClick={() => setPicking(true)}>{isEs ? 'Buscar otro alimento' : 'Find another food'}</button>}
          {onReviewFood && <button type="button" className="ml-2 min-h-11 rounded-xl border px-3 text-sm font-bold" onClick={() => onReviewFood(selectFoodPackage(food, grams ? grams / 1000 : undefined))}>{isEs ? 'Revisar para mi plan' : 'Review for my plan'}</button>}
          {pet && <FoodSafetyAlerts pet={pet} food={food} lang={language} />}
        </div>
        {onPick && <UnifiedFoodSearchModal isOpen={picking} onClose={() => setPicking(false)} activePet={pet} lang={language} category="main"
          titleOverride={isEs ? 'Elegir alimento para comparar' : 'Choose food to compare'}
          onSelectFood={({sourceFoodItem}) => { if (sourceFoodItem) { setPicking(false); onPick(sourceFoodItem); } }} />}
        <form onSubmit={search} className="space-y-4 p-4" aria-busy={loading || undefined}>
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0 space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-bold text-[var(--text-primary)]">
                <MapPin aria-hidden="true" className="size-3.5" />
                {isEs ? 'Ciudad' : 'City'}
              </span>
              <select value={city} onChange={(event) => {
                setPostalCodeError(false);
                setCity(event.target.value);
              }}
                disabled={loading}
                className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] px-2.5 text-sm font-semibold focus-visible:outline-2">
                {LIVE_PRICE_CITIES.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>

            <label className="min-w-0 space-y-1.5">
              <span className="block text-xs font-bold text-[var(--text-primary)]">
                {isEs ? 'Presentación (kg)' : 'Package (kg)'}
              </span>
              <input type="text" inputMode="decimal" value={packageInput} onChange={(event) => choosePackage(event.target.value)}
                disabled={loading} aria-invalid={inputError} aria-describedby={inputError ? 'price-package-error' : undefined}
                className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] px-2.5 text-sm font-semibold tabular-nums focus-visible:outline-2"
                placeholder={isEs ? 'Peso en kg' : 'Weight in kg'}
              />
            </label>
          </div>
          {knownPackages.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label={isEs ? 'Tamaños guardados' : 'Saved package sizes'}>
              {knownPackages.map((weight) => {
                const weightGrams = Math.round(weight * 1000);
                const selected = grams === weightGrams;
                return (
                  <div key={weight} className="max-w-32 space-y-1">
                    <button type="button" aria-pressed={selected}
                      onClick={() => choosePackage(weight.toString())} disabled={loading}
                      className={
                        'min-h-11 rounded-xl border px-3 text-xs font-bold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 ' +
                        (selected
                          ? 'border-[#0B5D2E] bg-[#0B5D2E] text-white'
                          : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--text-primary)]')
                      }>
                      {formatKg(weightGrams)} kg
                    </button>
                    <p className="text-[11px] text-[var(--text-secondary)]">{packageConfirmation(manufacturerSizes, weight, isEs)}</p>
                  </div>
                );
              })}
            </div>
          )}
          {grams !== null && !knownPackages.includes(grams / 1000) && (
            <p className="text-xs text-[var(--text-secondary)]">{packageConfirmation(manufacturerSizes, grams / 1000, isEs)}</p>
          )}
          {inputError && (
            <p id="price-package-error" role="alert" className="text-xs font-bold text-red-800 dark:text-red-300">
              {isEs
                ? `Ingresa un peso entre ${formatKg(LIVE_PRICE_MIN_GRAMS)} y ${formatKg(LIVE_PRICE_MAX_GRAMS)} kg.`
                : `Enter a weight between ${formatKg(LIVE_PRICE_MIN_GRAMS)} and ${formatKg(LIVE_PRICE_MAX_GRAMS)} kg.`}
            </p>
          )}
          {city === 'Bogotá' && (
            <BogotaPostalCodeField isEs={isEs} value={postalCodeInput} disabled={loading}
              invalid={postalCodeError} onChange={value => { setPostalCodeInput(value); setPostalCodeError(false); }} />
          )}
          <button type="submit" disabled={loading || unconfigured}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0B5D2E] px-4 text-sm font-extrabold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-55">
            {loading
              ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              : <Search aria-hidden="true" className="size-4" />}
            {loading ? (isEs ? 'Consultando precios…' : 'Looking up prices…') : (isEs ? 'Consultar precios' : 'Look up prices')}
          </button>
          {unconfigured && (
            <p role="status" className="text-sm text-[var(--text-secondary)]">{unavailableMessages.not_configured}</p>
          )}
        </form>
      </section>

      {result && (
        <section aria-label={isEs ? 'Resultado de precios' : 'Price results'} className="space-y-4">
          <div aria-live="polite" className="space-y-2">
            {consulted && (
              <p className="flex items-start gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2.5 text-xs font-bold text-[var(--text-secondary)]">
                <Clock3 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>{current ? (isEs ? 'Consultado hoy' : 'Checked today') : (isEs ? 'Última consulta' : 'Last lookup')}{' · '}
                  <time dateTime={result.queriedAt ?? undefined}>{consulted}</time>{' · '}{isEs ? 'hora de Colombia' : 'Colombia time'}
                  {postalCode && (isEs ? ` · CP ${postalCode}` : ` · Postal code ${postalCode}`)}
                </span>
              </p>
            )}
            {(result.reason || result.status === 'unavailable') && (
              <p className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
                {unavailableMessages[result.reason ?? 'upstream_unavailable']}
              </p>
            )}
            {result.status !== 'unavailable' && result.offers.length === 0 && (
              <p className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
                {isEs ? 'La consulta no encontró ofertas comparables en esta ciudad.' : 'The search returned no comparable offers in this city.'}
              </p>
            )}
          </div>

          {!!result.offers.length && !locked && !planPortions && <label className="block rounded-xl border border-[var(--border-color)] p-3 text-sm">
            <span className="font-bold">{isEs ? 'Gramos de este alimento por toma' : 'Grams of this food per serving'}</span>
            <input type="text" inputMode="decimal" value={enteredGrams}
              aria-label={isEs ? 'Gramos de este alimento por toma' : 'Grams of this food per serving'}
              aria-invalid={Boolean(enteredGrams) && !hasManualGrams}
              onChange={event => setManualPortion({petId:pet?.id, foodId:food.id, value:event.target.value})}
              className="mt-2 block min-h-11 w-full rounded-lg border border-[var(--border-color)] px-3 text-sm" />
            <span className="mt-1 block text-xs text-[var(--text-secondary)]">{enteredGrams && !hasManualGrams
              ? (isEs ? 'Ingresa un peso mayor que cero con hasta tres decimales.' : 'Enter a positive weight with up to three decimals.')
              : (isEs ? 'Usa el peso que sirves para comparar el costo de cada oferta.' : 'Enter the weight you serve to compare meal costs.')}</span>
          </label>}

          {exactOffers.length > 0 && (
            <div>
              <h2 className="px-1 font-heading text-lg font-extrabold text-[var(--text-primary)]">
                {isEs ? 'Misma presentación' : 'Same package'} · {formatKg(exactOffers[0].grams)} kg
              </h2>
              {current && !winner && (
                <p className="mb-2 px-1 text-xs text-[var(--text-secondary)]">
                  {isEs ? 'Ninguna oferta de esta presentación tiene stock y total con envío confirmados.' : 'No offer for this package has confirmed stock and a delivery total.'}
                </p>
              )}
              <div className="mt-2 space-y-2">
                {winner && <PriceOfferCard offer={winner} manufacturerSizes={manufacturerSizes} portions={portions} locked={locked} isEs={isEs} formatKg={formatKg} postalCode={postalCode} winnerLabel={winnerLabel} onUsePrice={applyOffer(winner)} />}
                {orderedExactOffers.map((offer) => <PriceOfferCard key={offer.id} offer={offer} manufacturerSizes={manufacturerSizes} portions={portions} locked={locked} isEs={isEs} formatKg={formatKg} postalCode={postalCode} onUsePrice={applyOffer(offer)} />)}
              </div>
            </div>
          )}

          {otherSizes.length > 0 && (
            <div>
              <h2 className="px-1 font-heading text-lg font-extrabold text-[var(--text-primary)]">
                {isEs ? 'Otros tamaños de la misma fórmula' : 'Other sizes of this formula'}
              </h2>
              <p className="mb-2 px-1 text-xs text-[var(--text-secondary)]">
                {isEs ? 'Ordenados por precio del producto por kilo.' : 'Sorted by product price per kg.'}
              </p>
              <div className="space-y-2">
                {otherSizes.map((offer) => <PriceOfferCard key={offer.id} offer={offer} manufacturerSizes={manufacturerSizes} portions={portions} locked={locked} isEs={isEs} formatKg={formatKg} postalCode={postalCode} onUsePrice={applyOffer(offer)} />)}
              </div>
            </div>
          )}

          {result.offers.length > 0 && (
            <p className="px-1 text-xs text-[var(--text-secondary)]">
              {isEs ? 'Confirma el precio, el envío y la disponibilidad en la tienda.' : 'Confirm price, delivery and availability with the store.'}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
