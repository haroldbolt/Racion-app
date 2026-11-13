import React, { useState, useRef, useEffect } from 'react';
import { FoodItem, FeedingPlan, Pet, BreedSize } from '../types';
import { X, Camera, Check, AlertCircle, Trash2 } from 'lucide-react';
import { isPetPuppy } from '../utils/feedingGuide';

interface LabelReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pet: Pet;
  plan?: FeedingPlan;
  onSaveLabel: (updatedFood: FoodItem) => void;
  lang?: 'es' | 'en';
}

export const LabelReviewModal: React.FC<LabelReviewModalProps> = ({
  isOpen,
  onClose,
  pet,
  plan,
  onSaveLabel,
  lang = 'es',
}) => {
  const isEs = lang === 'es';
  const puppy = isPetPuppy(pet);
  const currentFood = plan?.foodType === 'wet' ? plan.wetFood || plan.dryFood : plan?.dryFood;

  const [brand, setBrand] = useState(currentFood?.brand || plan?.foodBrand || '');
  const [formulaName, setFormulaName] = useState(currentFood?.name || plan?.foodName || '');
  const [kcalPerKg, setKcalPerKg] = useState(
    currentFood?.kcalPerKg && currentFood.kcalPerKg > 400 ? String(currentFood.kcalPerKg) : ''
  );
  const [bagSizeKg, setBagSizeKg] = useState(
    String(currentFood?.bagSizeKg || plan?.bagWeightKg || 2)
  );
  const [isComplete, setIsComplete] = useState(currentFood?.isCompleteAndBalanced ?? true);
  const [suitableForGrowth, setSuitableForGrowth] = useState(
    currentFood?.suitableForGrowth ?? (puppy || currentFood?.lifeStage === 'puppy')
  );
  const [dataSource, setDataSource] = useState(
    currentFood?.dataSource && !currentFood.dataSource.includes('pendiente')
      ? currentFood.dataSource
      : 'Etiqueta del empaque (foto/reverso)'
  );
  const [labelPhotoUrl, setLabelPhotoUrl] = useState(currentFood?.labelPhotoUrl || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const f = plan?.foodType === 'wet' ? plan.wetFood || plan.dryFood : plan?.dryFood;
    setBrand(f?.brand || plan?.foodBrand || '');
    setFormulaName(f?.name || plan?.foodName || '');
    setKcalPerKg(f?.kcalPerKg && f.kcalPerKg > 400 ? String(f.kcalPerKg) : '');
    setBagSizeKg(String(f?.bagSizeKg || plan?.bagWeightKg || 2));
    setIsComplete(f?.isCompleteAndBalanced ?? true);
    setSuitableForGrowth(f?.suitableForGrowth ?? (puppy || f?.lifeStage === 'puppy'));
    setDataSource(
      f?.dataSource && !f.dataSource.includes('pendiente')
        ? f.dataSource
        : 'Etiqueta del empaque (foto/reverso)'
    );
    setLabelPhotoUrl(f?.labelPhotoUrl || '');
    setErrorMsg(null);
  }, [isOpen, plan, puppy]);

  if (!isOpen) return null;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const raw = ev.target?.result as string;
      if (!raw) return;
      const img = new Image();
      img.onload = () => {
        const maxSide = 960;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setLabelPhotoUrl(canvas.toDataURL('image/jpeg', 0.82));
        } else {
          setLabelPhotoUrl(raw);
        }
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsedKcal = parseFloat(kcalPerKg);
    if (!Number.isFinite(parsedKcal) || parsedKcal < 400 || parsedKcal > 6500) {
      setErrorMsg(
        isEs
          ? 'Ingresa la densidad calórica exacta de la etiqueta (kcal/kg entre 400 y 6500) para poder calcular la ración.'
          : 'Enter valid label kcal/kg (400 to 6500).'
      );
      return;
    }

    if (!formulaName.trim()) {
      setErrorMsg(isEs ? 'Confirma el nombre exacto de la fórmula.' : 'Confirm formula name.');
      return;
    }

    const normalizedBag = bagSizeKg.trim().replace(',', '.');
    const parsedBag = parseFloat(normalizedBag);
    const inferredSizes: BreedSize[] = currentFood?.kibbleSizeSuitability ||
      (pet.breedSize ? [pet.breedSize] : ['small', 'medium', 'large']);

    const updatedFood: FoodItem = {
      id: currentFood?.id || 'label_' + Date.now(),
      brand: brand.trim() || 'Marca confirmada',
      name: formulaName.trim(),
      species: pet.species,
      lifeStage: suitableForGrowth ? (pet.species === 'cat' ? 'kitten' : 'puppy') : 'adult',
      type: currentFood?.type === 'wet' ? 'wet' : 'dry',
      kcalPerKg: Math.round(parsedKcal),
      kcalPerCup: currentFood?.kcalPerCup,
      kcalPerCan: currentFood?.kcalPerCan,
      proteinPct: currentFood?.proteinPct || 26,
      fatPct: currentFood?.fatPct || 14,
      fiberPct: currentFood?.fiberPct || 3.5,
      moisturePct: currentFood?.moisturePct || 10,
      country: currentFood?.country || 'Colombia',
      bagSizeKg: normalizedBag === ''
        ? undefined
        : Number.isFinite(parsedBag) && parsedBag > 0
        ? parsedBag
        : currentFood?.bagSizeKg,
      availableSizesKg: currentFood?.availableSizesKg,
      imageUrl: currentFood?.imageUrl,
      labelStatus: 'user_confirmed_label',
      labelPhotoUrl: labelPhotoUrl || undefined,
      isCompleteAndBalanced: isComplete,
      suitableForGrowth,
      kibbleSizeSuitability: inferredSizes,
      dataSource: dataSource.trim() || 'Etiqueta confirmada por el usuario',
    };

    onSaveLabel(updatedFood);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full max-h-[92dvh] flex flex-col shadow-2xl border border-[#0B5D2E20] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2 shrink-0">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B5D2E] block">
              {isEs ? 'Validación de producto' : 'Product validation'}
            </span>
            <h2 className="font-heading font-extrabold text-lg text-[#1C2B21]">
              {isEs ? 'Revisar etiqueta' : 'Review label'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="bg-[#F8FAF8] p-3.5 rounded-2xl border border-gray-200 text-xs text-[#44544A] leading-relaxed">
            {isEs
              ? 'El catálogo aporta nombre e imagen. Confirma la fórmula exacta y los datos impresos en el reverso de la bolsa o ficha del fabricante para evaluar compatibilidad y calcular gramos sin suposiciones.'
              : 'Confirm the exact formula and back-of-bag nutrition data.'}
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Photo of the back of the bag */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#1C2B21] block">
              {isEs ? 'Foto del reverso / etiqueta (opcional)' : 'Back-of-bag photo (optional)'}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            {labelPhotoUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
                <img src={labelPhotoUrl} alt="Etiqueta" className="w-full max-h-44 object-contain" />
                <button
                  type="button"
                  onClick={() => setLabelPhotoUrl('')}
                  className="absolute top-2 right-2 p-2 rounded-xl bg-white/90 text-red-600 shadow-xs hover:bg-white"
                  aria-label="Quitar foto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[48px] px-4 py-2.5 bg-[#EAF4EC] hover:bg-[#dceee0] text-[#0B5D2E] rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border border-[#0B5D2E25] transition"
              >
                <Camera className="w-4 h-4" />
                <span>{isEs ? 'Adjuntar foto del reverso de la bolsa' : 'Attach back-of-bag photo'}</span>
              </button>
            )}
          </div>

          {/* Exact Formula Name & Brand */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Marca *' : 'Brand *'}
              </label>
              <input
                type="text"
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ej. Ringo"
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#1C2B21] min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Fórmula exacta del empaque *' : 'Exact formula *'}
              </label>
              <input
                type="text"
                required
                value={formulaName}
                onChange={(e) => setFormulaName(e.target.value)}
                placeholder="Ej. Ringo Original Cachorros"
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#1C2B21] min-h-[44px]"
              />
            </div>
          </div>

          {/* Caloric Density & Bag Size */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Energía metabolizable (kcal/kg) *' : 'Kcal / kg *'}
              </label>
              <input
                type="number"
                required
                min="400"
                max="6500"
                value={kcalPerKg}
                onChange={(e) => setKcalPerKg(e.target.value)}
                placeholder="Ej. 3650"
                className="w-full px-3 py-2.5 bg-[#EAF4EC]/60 border border-[#0B5D2E30] rounded-xl text-sm font-extrabold text-[#0B5D2E] tabular-nums min-h-[46px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Tamaño bolsa (kg)' : 'Bag weight (kg)'}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={bagSizeKg}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^[0-9]*([.,][0-9]*)?$/.test(val)) {
                    setBagSizeKg(val);
                  }
                }}
                placeholder="Ej. 1.5 o 2.25"
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-[#1C2B21] tabular-nums min-h-[46px]"
              />
            </div>
          </div>

          {/* Label Declarations */}
          <div className="space-y-2 bg-[#F8FAF8] p-3.5 rounded-2xl border border-gray-200">
            <span className="text-xs font-extrabold text-[#1C2B21] block">
              {isEs ? 'Declaraciones en la etiqueta' : 'Label declarations'}
            </span>

            <label className="flex items-start gap-2.5 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={isComplete}
                onChange={(e) => setIsComplete(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#0B5D2E]"
              />
              <span className="text-xs text-[#1C2B21] font-semibold">
                {isEs
                  ? 'Declara ser un alimento completo y balanceado'
                  : 'Declares complete & balanced nutrition'}
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={suitableForGrowth}
                onChange={(e) => setSuitableForGrowth(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#0B5D2E]"
              />
              <span className="text-xs text-[#1C2B21] font-semibold">
                {isEs
                  ? 'Declara ser adecuado para crecimiento (cachorros / todas las etapas)'
                  : 'Suitable for puppy growth'}
              </span>
            </label>
          </div>

          {/* Source */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#1C2B21]">
              {isEs ? 'Fuente de los datos' : 'Data source'}
            </label>
            <select
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-[#1C2B21] min-h-[44px]"
            >
              <option value="Etiqueta del empaque (foto/reverso)">
                Etiqueta del empaque (reverso confirmado)
              </option>
              <option value="Ficha técnica oficial del fabricante">
                Ficha técnica oficial del fabricante
              </option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full min-h-[50px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#094723] transition shadow-md"
          >
            <Check className="w-4 h-4" />
            <span>{isEs ? 'Guardar etiqueta y calcular ración' : 'Save label & calculate'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
