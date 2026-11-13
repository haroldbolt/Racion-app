import React, { useState, useEffect } from 'react';
import { Pet, FeedingPlan, FoodItem, PriceOffer, PriceComparisonResult, PriceHistorySummary, TrackedProductAlert, UserAccount } from '../types';
import { formatCOP } from '../utils/i18n';
import { useAuth } from '../contexts/AuthContext';
import {
  Clock,
  ShoppingBag,
  Bell,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  DollarSign,
  Tag,
  X,
  Sparkles,
} from 'lucide-react';

interface SmartReorderCardProps {
  pet: Pet;
  plan?: FeedingPlan;
  city: string;
  userAccount?: UserAccount;
  onOpenComparator?: () => void;
  onOpenOffer?: (url: string) => void;
}

export const SmartReorderCard: React.FC<SmartReorderCardProps> = ({
  pet,
  plan,
  city,
  userAccount,
  onOpenComparator,
  onOpenOffer,
}) => {
  const isEs = userAccount?.language !== 'en';
  const { idToken, user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [bestOffer, setBestOffer] = useState<PriceOffer | null>(null);
  const [historySummary, setHistorySummary] = useState<PriceHistorySummary | null>(null);
  const [trackedAlert, setTrackedAlert] = useState<TrackedProductAlert | null>(null);

  // Modal to set target price
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [targetPriceInput, setTargetPriceInput] = useState('');
  const [includesShipping, setIncludesShipping] = useState(false);
  const [savingAlert, setSavingAlert] = useState(false);
  const [alertFeedback, setAlertFeedback] = useState<string | null>(null);

  const brand = plan?.foodBrand || 'Royal Canin';
  const productName = plan?.foodName || (pet.species === 'cat' ? 'Fit 32' : 'Adult');
  const bagWeightKg = plan?.bagWeightKg || 15;
  const daysRemaining = plan?.bagDaysRemaining !== undefined ? plan.bagDaysRemaining : 25;

  const isReorderUrgent = daysRemaining <= 7;
  const isReorderRecommended = daysRemaining <= 14;

  useEffect(() => {
    // 1. Fetch latest verified price for this food and city
    const fetchLatestData = async () => {
      setLoading(true);
      try {
        // Query comparator
        const compRes = await fetch('/api/price-comparator/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand,
            productName,
            presentationWeightKg: bagWeightKg,
            city,
            species: pet.species,
          }),
        });
        if (compRes.ok) {
          const compData: PriceComparisonResult = await compRes.json();
          if (compData.bestOffer) {
            setBestOffer(compData.bestOffer);
          }
        }

        // Query price history
        const histRes = await fetch(
          `/api/price-history?brand=${encodeURIComponent(brand)}&product=${encodeURIComponent(
            productName
          )}&weight=${bagWeightKg}&city=${encodeURIComponent(city)}&days=30`
        );
        if (histRes.ok) {
          const histData: PriceHistorySummary = await histRes.json();
          setHistorySummary(histData);
        }

        // Query user price alert if logged in
        if (idToken) {
          const alertRes = await fetch('/api/price-alerts', {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (alertRes.ok) {
            const alerts: TrackedProductAlert[] = await alertRes.json();
            const matching = alerts.find(
              (a) =>
                a.foodBrand.toLowerCase() === brand.toLowerCase() &&
                Math.abs(a.bagSizeKg - bagWeightKg) < 0.5
            );
            if (matching) {
              setTrackedAlert(matching);
              setTargetPriceInput(String(matching.targetPriceCop));
              setIncludesShipping(matching.targetIncludesShipping);
            }
          }
        }
      } catch (e) {
        console.warn('Smart reorder data fetch note:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchLatestData();
  }, [brand, productName, bagWeightKg, city, idToken]);

  const handleSaveAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken) {
      setAlertFeedback(
        isEs
          ? 'Inicia sesión para guardar tus alertas de precio en la nube.'
          : 'Please sign in to save price alerts in your cloud account.'
      );
      return;
    }
    const val = parseFloat(targetPriceInput.replace(/[^0-9]/g, ''));
    if (!val || val <= 0) {
      setAlertFeedback(isEs ? 'Ingresa un precio objetivo válido en COP.' : 'Enter a valid target price in COP.');
      return;
    }

    setSavingAlert(true);
    setAlertFeedback(null);
    try {
      const res = await fetch('/api/price-alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          petId: pet.id,
          foodBrand: brand,
          foodName: productName,
          bagSizeKg: bagWeightKg,
          targetPriceCop: val,
          targetIncludesShipping: includesShipping,
          alertEnabled: true,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setTrackedAlert(json.alert);
        setAlertFeedback(
          isEs ? '¡Alerta de precio guardada con éxito!' : 'Price alert saved successfully!'
        );
        setTimeout(() => {
          setShowAlertModal(false);
          setAlertFeedback(null);
        }, 1500);
      } else {
        setAlertFeedback(isEs ? 'No se pudo guardar la alerta.' : 'Failed saving alert.');
      }
    } catch {
      setAlertFeedback(isEs ? 'Error de conexión.' : 'Connection error.');
    } finally {
      setSavingAlert(false);
    }
  };

  // Compare best offer against historical median
  const medianDiffPct =
    bestOffer && historySummary?.medianPrice
      ? Math.round(((bestOffer.priceCop - historySummary.medianPrice) / historySummary.medianPrice) * 100)
      : null;

  // Compare against user's last recorded purchase for this pet
  const lastPurchaseCop = plan?.bagPriceCop;
  const savingsVsLastPurchase =
    bestOffer && lastPurchaseCop && lastPurchaseCop > 0 ? lastPurchaseCop - bestOffer.priceCop : null;

  return (
    <div className="bg-gradient-to-br from-white to-[#F8FAF8] rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
      {/* Header: Status & Bag duration */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              isReorderUrgent
                ? 'bg-red-50 text-red-600 border border-red-200'
                : isReorderRecommended
                ? 'bg-amber-50 text-amber-600 border border-amber-200'
                : 'bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E20]'
            }`}
          >
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#44544A] block">
              {isEs ? 'Función Compra a Tiempo' : 'Smart Reorder System'}
            </span>
            <h3 className="font-heading font-extrabold text-base text-[#1C2B21] leading-tight">
              {daysRemaining <= 0
                ? isEs
                  ? '¡Bulto agotado o por reponer!'
                  : 'Bag empty or due today!'
                : isEs
                ? `Te quedan ~${daysRemaining} días de comida`
                : `~${daysRemaining} days of food remaining`}
            </h3>
          </div>
        </div>

        <span
          className={`text-[11px] font-black px-2.5 py-1 rounded-full border shrink-0 ${
            isReorderUrgent
              ? 'bg-red-50 text-red-700 border-red-200'
              : isReorderRecommended
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-[#EAF4EC] text-[#0B5D2E] border-[#0B5D2E30]'
          }`}
        >
          {isReorderUrgent
            ? isEs
              ? 'Reponer Ya'
              : 'Reorder Now'
            : isReorderRecommended
            ? isEs
              ? 'Comprar Pronto'
              : 'Order Soon'
            : isEs
            ? 'Abastecido'
            : 'Sufficient'}
        </span>
      </div>

      {/* Best Verified Offer Card */}
      {bestOffer ? (
        <div className="bg-white p-4 rounded-2xl border border-[#0B5D2E18] shadow-xs space-y-2.5">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold text-[#0B5D2E] uppercase block">
                {isEs ? 'Mejor oferta verificada para' : 'Best verified offer for'} {city}:
              </span>
              <h4 className="font-heading font-extrabold text-base text-[#1C2B21] truncate max-w-[220px]">
                {bestOffer.merchantName}
              </h4>
            </div>
            <div className="text-right">
              <span className="font-heading font-black text-lg text-[#0B5D2E]">
                {formatCOP(bestOffer.priceCop)}
              </span>
              <span className="text-[10px] text-gray-400 block">
                {bestOffer.shippingCostCop === 0
                  ? isEs
                    ? 'Envío Gratis'
                    : 'Free Shipping'
                  : bestOffer.shippingCostCop
                  ? `+ ${formatCOP(bestOffer.shippingCostCop)} envío`
                  : isEs
                  ? 'Envío por confirmar'
                  : 'Shipping unconfirmed'}
              </span>
            </div>
          </div>

          {/* Comparisons: Median & Last Purchase */}
          <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center gap-2 text-xs">
            {medianDiffPct !== null && (
              <span
                className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md ${
                  medianDiffPct < 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : medianDiffPct > 0
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                <TrendingDown className="w-3 h-3" />
                <span>
                  {medianDiffPct < 0
                    ? `${Math.abs(medianDiffPct)}% ${isEs ? 'por debajo de la mediana' : 'below median'}`
                    : medianDiffPct > 0
                    ? `${medianDiffPct}% ${isEs ? 'sobre la mediana' : 'above median'}`
                    : isEs
                    ? 'Igual a la mediana'
                    : 'Equal to median'}
                </span>
              </span>
            )}

            {savingsVsLastPurchase !== null && savingsVsLastPurchase > 0 && (
              <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md bg-[#EAF4EC] text-[#0B5D2E]">
                <Tag className="w-3 h-3" />
                <span>
                  {isEs
                    ? `Ahorras ${formatCOP(savingsVsLastPurchase)} vs tu última compra`
                    : `Save ${formatCOP(savingsVsLastPurchase)} vs last purchase`}
                </span>
              </span>
            )}

            {trackedAlert && trackedAlert.alertEnabled && (
              <span className="text-[11px] text-[#44544A] ml-auto">
                🎯 {isEs ? 'Meta:' : 'Target:'} <strong>{formatCOP(trackedAlert.targetPriceCop)}</strong>
              </span>
            )}
          </div>

          {/* Action buttons: Ver oferta & Avisarme si baja */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <a
              href={bestOffer.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onOpenOffer?.(bestOffer.productUrl)}
              className="py-2.5 px-3 bg-[#0B5D2E] text-white rounded-xl font-heading font-extrabold text-xs flex items-center justify-center gap-1.5 hover:bg-[#094723] transition active:scale-98 shadow-xs"
            >
              <span>{isEs ? 'Ver Oferta' : 'View Offer'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={() => setShowAlertModal(true)}
              className="py-2.5 px-3 bg-white border border-[#0B5D2E30] text-[#0B5D2E] rounded-xl font-heading font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#EAF4EC] transition active:scale-98"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>
                {trackedAlert
                  ? isEs
                    ? 'Alerta configurada'
                    : 'Alert set'
                  : isEs
                  ? 'Avisarme si baja'
                  : 'Notify price drop'}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200 text-xs text-gray-500 flex items-center justify-between">
          <span>{isEs ? 'Consultando disponibilidad en tiendas...' : 'Checking store availability...'}</span>
          <button
            type="button"
            onClick={onOpenComparator}
            className="font-bold text-[#0B5D2E] hover:underline"
          >
            {isEs ? 'Abrir comparador' : 'Open comparator'}
          </button>
        </div>
      )}

      {/* Target Price Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-[#0B5D2E20] space-y-4 relative">
            <button
              type="button"
              onClick={() => setShowAlertModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-[#0B5D2E]" />
                <h3 className="font-heading font-extrabold text-lg text-[#1C2B21]">
                  {isEs ? 'Avisarme si baja de precio' : 'Price Drop Alert'}
                </h3>
              </div>
              <p className="text-xs text-[#44544A]">
                {brand} {productName} ({bagWeightKg} kg) en {city}
              </p>
            </div>

            {alertFeedback && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs">
                {alertFeedback}
              </div>
            )}

            <form onSubmit={handleSaveAlert} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#1C2B21] mb-1">
                  {isEs ? 'Precio objetivo en Pesos Colombianos ($ COP):' : 'Target price in COP:'}
                </label>
                <input
                  type="text"
                  required
                  value={targetPriceInput}
                  onChange={(e) => setTargetPriceInput(e.target.value)}
                  placeholder={bestOffer ? String(Math.round(bestOffer.priceCop * 0.95)) : '240000'}
                  className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl font-bold font-mono outline-none focus:border-[#0B5D2E]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="incShipping"
                  checked={includesShipping}
                  onChange={(e) => setIncludesShipping(e.target.checked)}
                  className="w-4 h-4 text-[#0B5D2E] rounded"
                />
                <label htmlFor="incShipping" className="text-xs text-[#44544A] cursor-pointer">
                  {isEs
                    ? 'El precio objetivo incluye costo de envío'
                    : 'Target price includes shipping'}
                </label>
              </div>

              <p className="text-[11px] text-gray-400 leading-tight">
                {isEs
                  ? 'La alerta se activará únicamente cuando una consulta detecte una oferta válida en tiendas con sede o entrega en tu ciudad.'
                  : 'Alerts only trigger when a verified offer matches your target price and location.'}
              </p>

              <button
                type="submit"
                disabled={savingAlert}
                className="w-full py-3 bg-[#0B5D2E] text-white rounded-xl font-heading font-extrabold text-xs hover:bg-[#094723] transition shadow-xs disabled:opacity-50"
              >
                {savingAlert
                  ? isEs
                    ? 'Guardando alerta...'
                    : 'Saving...'
                  : isEs
                  ? 'Guardar Alerta de Precio'
                  : 'Save Price Alert'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
