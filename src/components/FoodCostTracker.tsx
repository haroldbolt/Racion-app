import React, { useState, useMemo } from 'react';
import { Pet, FeedingPlan, FoodCostEntry, UserAccount } from '../types';
import { StorageService } from '../utils/storage';
import { formatCOP } from '../utils/i18n';
import { CloudSqlService } from '../services/cloudSqlService';
import { useAuth } from '../contexts/AuthContext';
import {
  DollarSign,
  Plus,
  Receipt,
  Calendar,
  Store,
  Camera,
  Trash2,
  Check,
  TrendingDown,
  Clock,
  Sparkles,
  ShoppingBag,
  Maximize2,
  X,
  FileText,
  AlertCircle,
  Search,
  Package,
} from 'lucide-react';
import { InventoryFoodSearchModal } from './InventoryFoodSearchModal';

interface FoodCostTrackerProps {
  pet: Pet;
  plan?: FeedingPlan;
  userAccount: UserAccount;
  onPlanUpdate?: (updatedPlan: Partial<FeedingPlan>) => void;
}

export const FoodCostTracker: React.FC<FoodCostTrackerProps> = ({
  pet,
  plan,
  userAccount,
  onPlanUpdate,
}) => {
  const isEs = userAccount.language === 'es';
  const { user } = useAuth();

  // Purchases list
  const [purchases, setPurchases] = useState<FoodCostEntry[]>(() =>
    StorageService.getFoodPurchases(pet.id)
  );

  // Catalog search & purchase modal
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  // Form visibility (for manual fallback)
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [foodBrand, setFoodBrand] = useState(plan?.foodBrand || 'Royal Canin');
  const [foodName, setFoodName] = useState(plan?.foodName || 'Medium Adult Dog Dry');
  const [foodType, setFoodType] = useState<'dry' | 'wet' | 'mixed'>(
    plan?.foodType && plan.foodType !== 'barf' ? plan.foodType : 'dry'
  );
  const [bagSizeKg, setBagSizeKg] = useState<number>(plan?.bagWeightKg || 15);
  const [pricePaidCop, setPricePaidCop] = useState<string>('295000');
  const [purchaseDate, setPurchaseDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [storeName, setStoreName] = useState<string>('Agrocampo Bogotá');
  const [receiptPhotoUrl, setReceiptPhotoUrl] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Toast / Status state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Receipt image modal preview
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Live calculations based on current plan & form inputs
  const numericPrice = parseFloat(pricePaidCop) || 0;
  const numericBagSize = bagSizeKg > 0 ? bagSizeKg : 1;
  const calculatedCostPerKg = numericPrice > 0 ? Math.round(numericPrice / numericBagSize) : 0;
  const petGramsDay = plan?.gramsPerDay || 200;
  const calculatedCostPerDay = Math.round((calculatedCostPerKg * petGramsDay) / 1000);
  const calculatedCostPerMonth = Math.round(calculatedCostPerDay * 30.5);
  const estimatedBagDays = Math.round((numericBagSize * 1000) / (petGramsDay || 200));

  // Summary Metrics over all registered purchases for this pet
  const totalSpentCop = useMemo(() => {
    return purchases.reduce((sum, p) => sum + (p.pricePaidCop || 0), 0);
  }, [purchases]);

  const latestPurchase = purchases[0] || null;

  const currentDailyCostCop = useMemo(() => {
    if (latestPurchase && latestPurchase.bagSizeKg > 0) {
      const costPerG = latestPurchase.pricePaidCop / (latestPurchase.bagSizeKg * 1000);
      return Math.round(costPerG * petGramsDay);
    }
    return plan?.dailyCostCop || 0;
  }, [latestPurchase, petGramsDay, plan?.dailyCostCop]);

  const currentMonthlyCostCop = useMemo(() => {
    return Math.round(currentDailyCostCop * 30.5);
  }, [currentDailyCostCop]);

  // Handle Photo upload / camera snap
  const handleReceiptPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read image as base64 data URL
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReceiptPhotoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit new purchase entry
  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!numericPrice || numericPrice <= 0) {
      alert(isEs ? 'Por favor ingresa un precio válido en Pesos Colombianos ($ COP).' : 'Please enter a valid price in COP.');
      return;
    }

    const newEntry: FoodCostEntry = {
      id: `fp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      petId: pet.id,
      date: purchaseDate,
      foodBrand: foodBrand.trim() || 'Alimento',
      foodName: foodName.trim() || 'Balanceado',
      foodType,
      bagSizeKg: numericBagSize,
      pricePaidCop: numericPrice,
      costPerKgCop: calculatedCostPerKg,
      costPerDayCop: calculatedCostPerDay,
      costPerMonthCop: calculatedCostPerMonth,
      estimatedDaysDuration: estimatedBagDays,
      storeName: storeName.trim() || undefined,
      receiptPhotoUrl: receiptPhotoUrl || undefined,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    // 1. Save to local storage
    StorageService.addFoodPurchase(newEntry);
    setPurchases((prev) => [newEntry, ...prev]);

    // 2. Optionally sync with Cloud SQL if authenticated
    if (user) {
      try {
        const token = await user.getIdToken();
        await CloudSqlService.savePurchase(newEntry, token);
      } catch (err) {
        console.warn('Could not sync purchase to Cloud SQL:', err);
      }
    }

    // 3. Update FeedingPlan bag days & price if current food matches
    if (onPlanUpdate && plan) {
      onPlanUpdate({
        bagWeightKg: numericBagSize,
        bagDaysRemaining: estimatedBagDays,
        bagPriceCop: numericPrice,
        dailyCostCop: calculatedCostPerDay,
        monthlyCostCop: calculatedCostPerMonth,
      });
    }

    // Reset form & notify
    setShowAddForm(false);
    setReceiptPhotoUrl('');
    setNotes('');
    setToastMessage(
      isEs
        ? `¡Gasto de ${formatCOP(numericPrice, true)} registrado para ${pet.name}!`
        : `Recorded ${formatCOP(numericPrice, true)} for ${pet.name}!`
    );
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Delete purchase
  const handleDeletePurchase = async (id: string) => {
    const confirmDelete = window.confirm(
      isEs ? '¿Deseas eliminar este registro de gasto?' : 'Delete this cost record?'
    );
    if (!confirmDelete) return;

    StorageService.deleteFoodPurchase(id);
    setPurchases((prev) => prev.filter((p) => p.id !== id));

    if (user) {
      try {
        const token = await user.getIdToken();
        await CloudSqlService.deletePurchase(id, token);
      } catch (err) {
        console.warn('Could not delete purchase from Cloud SQL:', err);
      }
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3 bg-[#0B5D2E] text-white text-xs font-bold rounded-2xl flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#86EFAC]" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Header Card */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#0B5D2E] bg-[#EAF4EC] px-2.5 py-0.5 rounded-full">
                {isEs ? 'Pesos Colombianos (COP - $)' : 'Colombian Pesos (COP - $)'}
              </span>
              <span className="text-xs text-[#44544A]">
                {purchases.length} {isEs ? 'compras registradas' : 'purchases logged'}
              </span>
            </div>
            <h3 className="font-heading font-black text-xl text-[#0B5D2E] mt-1">
              {isEs ? `Control de Gastos en Comida para ${pet.name}` : `Food Cost Tracker for ${pet.name}`}
            </h3>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs
                ? 'Sube cuánto te costó la comida (con foto de recibo o empaque) para calcular tu gasto real por día, por mes y vigilar cuánto rinde el bulto.'
                : 'Upload how much you paid for food (with receipt or bag photo) to track daily & monthly cost.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowCatalogModal(true)}
              className="px-3.5 py-2.5 bg-[#0B5D2E] hover:bg-[#094723] text-white rounded-2xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition min-h-[44px] active:scale-98"
            >
              <Search className="w-4 h-4" />
              <span>{isEs ? '+ Registrar con Catálogo' : '+ Log with Catalog'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="p-2.5 bg-[#EAF4EC] hover:bg-[#d6ecd9] text-[#0B5D2E] rounded-2xl text-xs font-bold transition min-h-[44px] min-w-[44px] flex items-center justify-center border border-[#0B5D2E20]"
              title={isEs ? 'Entrada manual' : 'Manual entry'}
            >
              {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Financial KPI Summary Cards in COP */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          {/* Daily Food Cost */}
          <div className="bg-[#F8FAF8] p-3 rounded-2xl border border-gray-100 space-y-1">
            <span className="text-[10px] uppercase font-bold text-gray-500 block">
              {isEs ? 'Costo Diario' : 'Daily Cost'}
            </span>
            <div className="font-heading font-black text-base text-[#0B5D2E] font-mono tabular-nums">
              {currentDailyCostCop > 0 ? formatCOP(currentDailyCostCop) : '$ 0'}
            </div>
            <span className="text-[10px] text-[#44544A]">
              {isEs ? `Por ${petGramsDay}g diarios` : `For ${petGramsDay}g/day`}
            </span>
          </div>

          {/* Monthly Budget */}
          <div className="bg-[#FFF7ED] p-3 rounded-2xl border border-[#F57C1A]/20 space-y-1">
            <span className="text-[10px] uppercase font-bold text-[#9A3412] block">
              {isEs ? 'Presupuesto Mensual' : 'Monthly Budget'}
            </span>
            <div className="font-heading font-black text-base text-[#F57C1A] font-mono tabular-nums">
              {currentMonthlyCostCop > 0 ? formatCOP(currentMonthlyCostCop) : '$ 0'}
            </div>
            <span className="text-[10px] text-[#9A3412]">
              {isEs ? 'Proyección 30.5 días' : '30.5-day projection'}
            </span>
          </div>

          {/* Total Recorded Spend */}
          <div className="bg-[#F8FAF8] p-3 rounded-2xl border border-gray-100 space-y-1">
            <span className="text-[10px] uppercase font-bold text-gray-500 block">
              {isEs ? 'Gasto Total Log' : 'Total Spent'}
            </span>
            <div className="font-heading font-black text-base text-[#1C2B21] font-mono tabular-nums">
              {formatCOP(totalSpentCop)}
            </div>
            <span className="text-[10px] text-[#44544A]">
              {purchases.length} {isEs ? 'recibos' : 'entries'}
            </span>
          </div>

          {/* Bag Duration */}
          <div className="bg-[#EAF4EC] p-3 rounded-2xl border border-[#0B5D2E20] space-y-1">
            <span className="text-[10px] uppercase font-bold text-[#0B5D2E] block">
              {isEs ? 'Rendimiento Bulto' : 'Bag Duration'}
            </span>
            <div className="font-heading font-black text-base text-[#0B5D2E] font-mono tabular-nums">
              {latestPurchase ? `~${latestPurchase.estimatedDaysDuration || estimatedBagDays} d` : `${plan?.bagDaysRemaining || 40} d`}
            </div>
            <span className="text-[10px] text-[#0B5D2E]">
              {isEs ? 'Días de alimento' : 'Days of feeding'}
            </span>
          </div>
        </div>
      </div>

      {/* ================= FORM TO UPLOAD / REGISTER FOOD COST ================= */}
      {showAddForm && (
        <form
          onSubmit={handleSubmitPurchase}
          className="bg-white rounded-3xl p-5 border-2 border-[#0B5D2E] shadow-xl space-y-4 animate-in fade-in slide-in-from-top-3"
        >
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#0B5D2E]" />
              <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
                {isEs ? 'Subir costo de comida en Pesos Colombianos' : 'Log Food Cost in Colombian Pesos'}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Food Brand */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 block">
                {isEs ? 'Marca del alimento' : 'Food Brand'}
              </label>
              <input
                type="text"
                required
                value={foodBrand}
                onChange={(e) => setFoodBrand(e.target.value)}
                placeholder="Ej. Royal Canin, Pro Plan, Hill's, Monello"
                className="w-full px-3 py-2 bg-[#F8FAF8] border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#0B5D2E]"
              />
            </div>

            {/* Food Product Name */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 block">
                {isEs ? 'Variedad o Nombre del Producto' : 'Product Name'}
              </label>
              <input
                type="text"
                required
                value={foodName}
                onChange={(e) => setFoodName(e.target.value)}
                placeholder="Ej. Adult Medium, Sensitive Skin, Urinary"
                className="w-full px-3 py-2 bg-[#F8FAF8] border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#0B5D2E]"
              />
            </div>

            {/* Presentation / Bag Weight in Kg */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 block">
                {isEs ? 'Tamaño del bulto o empaque (kg)' : 'Bag or Pack Weight (kg)'}
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                required
                value={bagSizeKg}
                onChange={(e) => setBagSizeKg(parseFloat(e.target.value) || 0)}
                placeholder="15"
                className="w-full px-3 py-2 bg-[#F8FAF8] border border-gray-200 rounded-xl text-xs font-semibold font-mono focus:outline-none focus:border-[#0B5D2E]"
              />
              <span className="text-[10px] text-gray-500">
                {isEs ? 'Ej. 15 kg (bulto grande), 3 kg, 1 kg o 0.35 kg (lata)' : 'e.g. 15 kg, 3 kg, or 0.35 kg (can)'}
              </span>
            </div>

            {/* Total Price Paid in Colombian Pesos */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#0B5D2E] block">
                {isEs ? 'Precio total pagado ($ Pesos Colombianos - COP)' : 'Total Price Paid ($ COP)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-gray-500">$</span>
                <input
                  type="number"
                  step="500"
                  min="1000"
                  required
                  value={pricePaidCop}
                  onChange={(e) => setPricePaidCop(e.target.value)}
                  placeholder="295000"
                  className="w-full pl-7 pr-3 py-2 bg-[#F8FAF8] border-2 border-[#0B5D2E] rounded-xl text-xs font-bold font-mono focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-[#0B5D2E] font-semibold">
                {formatCOP(numericPrice, true)}
              </span>
            </div>

            {/* Purchase Date */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 block">
                {isEs ? 'Fecha de compra' : 'Purchase Date'}
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 bg-[#F8FAF8] border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#0B5D2E]"
              />
            </div>

            {/* Store / Clinic */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 block">
                {isEs ? 'Lugar de compra (Tienda o Veterinaria)' : 'Store or Vet Clinic'}
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ej. Agrocampo, Laika, Puppy Shop, Éxito"
                className="w-full px-3 py-2 bg-[#F8FAF8] border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#0B5D2E]"
              />
            </div>
          </div>

          {/* Receipt or Bag Photo Upload */}
          <div className="space-y-2 pt-1 border-t border-gray-100">
            <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-[#0B5D2E]" />
                {isEs ? 'Foto del recibo o factura de compra (Opcional)' : 'Receipt or Bag Photo (Optional)'}
              </span>
              {receiptPhotoUrl && (
                <button
                  type="button"
                  onClick={() => setReceiptPhotoUrl('')}
                  className="text-[10px] text-red-500 font-bold hover:underline"
                >
                  {isEs ? 'Eliminar foto' : 'Remove photo'}
                </button>
              )}
            </label>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2.5 bg-[#EAF4EC] hover:bg-[#d5ebd7] text-[#0B5D2E] rounded-xl text-xs font-bold cursor-pointer transition border border-[#0B5D2E20]">
                <Camera className="w-4 h-4" />
                <span>{receiptPhotoUrl ? (isEs ? 'Cambiar foto' : 'Change photo') : (isEs ? 'Tomar foto o subir archivo' : 'Take photo or upload')}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleReceiptPhotoUpload}
                  className="hidden"
                />
              </label>

              {receiptPhotoUrl && (
                <div className="relative group">
                  <img
                    src={receiptPhotoUrl}
                    alt="Receipt preview"
                    className="w-12 h-12 rounded-xl object-cover border border-[#0B5D2E] shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => setPreviewPhotoUrl(receiptPhotoUrl)}
                    className="absolute inset-0 bg-black/40 text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-gray-700 block">
              {isEs ? 'Notas adicionales' : 'Notes'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Promoción con 15% de descuento, incluyó snack"
              className="w-full px-3 py-2 bg-[#F8FAF8] border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#0B5D2E]"
            />
          </div>

          {/* Live Automatic Calculated Preview */}
          <div className="bg-[#F8FAF8] rounded-2xl p-3 border border-[#0B5D2E20] space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-[#0B5D2E]">
              <Sparkles className="w-4 h-4 text-[#F57C1A]" />
              <span>{isEs ? 'Cálculo Automático de Rendimiento:' : 'Automatic Performance Calculation:'}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-white p-2 rounded-xl border border-gray-100">
                <span className="text-[10px] text-gray-500 block">{isEs ? 'Costo por Kilogramo:' : 'Cost per Kg:'}</span>
                <strong className="text-[#0B5D2E] font-mono">{formatCOP(calculatedCostPerKg)} / kg</strong>
              </div>

              <div className="bg-white p-2 rounded-xl border border-gray-100">
                <span className="text-[10px] text-gray-500 block">{isEs ? `Ración de ${pet.name}:` : `${pet.name}'s Ration:`}</span>
                <strong className="text-[#F57C1A] font-mono">{formatCOP(calculatedCostPerDay)} / {isEs ? 'día' : 'day'}</strong>
              </div>

              <div className="bg-white p-2 rounded-xl border border-gray-100 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-gray-500 block">{isEs ? 'Duración estimada:' : 'Estimated Duration:'}</span>
                <strong className="text-[#1C2B21] font-mono">~{estimatedBagDays} {isEs ? 'días de comida' : 'days'}</strong>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
            >
              {isEs ? 'Cancelar' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#0B5D2E] hover:bg-[#094723] text-white rounded-xl text-xs font-heading font-extrabold shadow-sm transition"
            >
              {isEs ? 'Guardar Gasto en COP' : 'Save Food Cost (COP)'}
            </button>
          </div>
        </form>
      )}

      {/* ================= PURCHASES HISTORY LIST ================= */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#0B5D2E]" />
            <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
              {isEs ? 'Historial de Compras de Comida' : 'Food Purchase History'}
            </h4>
          </div>
          <span className="text-xs font-bold text-[#44544A]">
            {purchases.length} {isEs ? 'registros' : 'records'}
          </span>
        </div>

        {purchases.length === 0 ? (
          <div className="p-8 text-center bg-[#F8FAF8] rounded-2xl border border-gray-100 space-y-2">
            <Receipt className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-xs font-bold text-gray-600">
              {isEs ? 'Aún no has registrado compras de comida' : 'No food purchases recorded yet'}
            </p>
            <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
              {isEs
                ? 'Toca en "+ Registrar con Catálogo" para buscar entre 1.528 alimentos y registrar tu compra con su presentación exacta.'
                : 'Tap "+ Log with Catalog" to search 1,528 foods and log your purchase.'}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCatalogModal(true)}
                className="px-4 py-2.5 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold hover:bg-[#094723] transition flex items-center gap-1.5 shadow-xs"
              >
                <Search className="w-4 h-4" />
                <span>{isEs ? 'Buscar en Catálogo Oficial' : 'Search in Official Catalog'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {purchases.map((p) => {
              const costPerKg = p.costPerKgCop || Math.round((p.pricePaidCop || 0) / (p.bagSizeKg || 1));
              const daysDuration = p.estimatedDaysDuration || Math.round(((p.bagSizeKg || 15) * 1000) / petGramsDay);
              const costPerDay = p.costPerDayCop || Math.round((costPerKg * petGramsDay) / 1000);

              return (
                <div
                  key={p.id}
                  className="bg-[#F8FAF8] rounded-2xl p-4 border border-gray-200 space-y-3 hover:border-[#0B5D2E40] transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {/* Product Thumbnail if available */}
                      <div className="w-11 h-11 rounded-xl bg-white border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.foodName}
                            className="w-full h-full object-contain p-0.5"
                            loading="lazy"
                            onError={(e) => {
                              // Neutral fallback icon on error
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Package className="w-5 h-5 text-[#0B5D2E]" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-[#0B5D2E] uppercase tracking-wide">
                            {p.foodBrand}
                          </span>
                          <span className="text-[10px] bg-[#EAF4EC] text-[#0B5D2E] font-bold px-2 py-0.5 rounded-full">
                            {p.bagSizeKg} kg
                          </span>
                          {p.presentationName && (
                            <span className="text-[10px] bg-white text-gray-700 font-semibold px-1.5 py-0.2 rounded-md border border-gray-200">
                              {p.presentationName}
                            </span>
                          )}
                          {p.quantity && p.quantity > 1 && (
                            <span className="text-[10px] bg-[#F57C1A]/10 text-[#F57C1A] font-bold px-1.5 py-0.2 rounded-md">
                              x{p.quantity}
                            </span>
                          )}
                          {p.storeName && (
                            <span className="text-[10px] text-gray-500 font-semibold flex items-center gap-1">
                              <Store className="w-3 h-3 text-gray-400" />
                              {p.storeName}
                            </span>
                          )}
                        </div>
                        <h5 className="font-heading font-extrabold text-sm text-[#1C2B21] mt-0.5">
                          {p.foodName}
                        </h5>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-heading font-black text-base text-[#0B5D2E] font-mono tabular-nums">
                        {formatCOP(p.pricePaidCop, true)}
                      </div>
                      <span className="text-[10px] text-gray-400 block font-medium">
                        {p.date}
                      </span>
                    </div>
                  </div>

                  {/* Metrics bar */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs bg-white p-2.5 rounded-xl border border-gray-100">
                    <div>
                      <span className="text-[10px] text-gray-400 block">{isEs ? 'Precio / kg:' : 'Price / kg:'}</span>
                      <strong className="text-[#1C2B21] font-mono">{formatCOP(costPerKg)}</strong>
                    </div>
                    <div className="border-x border-gray-100">
                      <span className="text-[10px] text-gray-400 block">{isEs ? 'Costo / día:' : 'Cost / day:'}</span>
                      <strong className="text-[#F57C1A] font-mono">{formatCOP(costPerDay)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block">{isEs ? 'Rinde aprox:' : 'Lasts approx:'}</span>
                      <strong className="text-[#0B5D2E] font-mono">~{daysDuration} {isEs ? 'días' : 'days'}</strong>
                    </div>
                  </div>

                  {/* Notes & Receipt Photo thumbnail */}
                  {(p.notes || p.receiptPhotoUrl) && (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
                      {p.notes ? (
                        <p className="text-[11px] text-gray-600 italic">
                          "{p.notes}"
                        </p>
                      ) : <span />}

                      {p.receiptPhotoUrl && (
                        <button
                          type="button"
                          onClick={() => setPreviewPhotoUrl(p.receiptPhotoUrl!)}
                          className="flex items-center gap-1 text-[11px] font-bold text-[#0B5D2E] bg-[#EAF4EC] px-2 py-1 rounded-lg hover:bg-[#d5ebd7] transition shrink-0"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>{isEs ? 'Ver recibo' : 'View receipt'}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Delete Button */}
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => handleDeletePurchase(p.id)}
                      className="text-[10px] text-gray-400 hover:text-red-500 font-bold flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{isEs ? 'Eliminar' : 'Delete'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= RECEIPT PHOTO FULLSCREEN MODAL ================= */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-4 space-y-3 relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#0B5D2E]" />
                <h5 className="font-heading font-extrabold text-sm text-[#1C2B21]">
                  {isEs ? 'Recibo o Comprobante de Compra' : 'Purchase Receipt'}
                </h5>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhotoUrl(null)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto rounded-2xl border border-gray-100">
              <img
                src={previewPhotoUrl}
                alt="Receipt full"
                className="w-full h-auto object-contain rounded-xl"
              />
            </div>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setPreviewPhotoUrl(null)}
                className="px-4 py-2 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold hover:bg-[#094723]"
              >
                {isEs ? 'Cerrar' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= INVENTORY FOOD SEARCH & PURCHASE MODAL (SHOPIFY CATALOG) ================= */}
      <InventoryFoodSearchModal
        isOpen={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        pet={pet}
        plan={plan}
        lang={userAccount.language}
        onPurchaseLogged={(entry) => {
          setPurchases((prev) => [entry, ...prev]);
          setToastMessage(
            isEs
              ? `¡Compra de ${entry.foodBrand} registrada para ${pet.name}!`
              : `Purchase of ${entry.foodBrand} logged for ${pet.name}!`
          );
          setTimeout(() => setToastMessage(null), 3500);
        }}
        onPlanUpdate={onPlanUpdate}
      />
    </div>
  );
};
