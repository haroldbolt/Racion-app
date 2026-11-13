import React, { useState, useMemo, useEffect } from 'react';
import {
  Pet,
  FoodItem,
  UserAccount,
  FeedingPlan,
  NutritionDatasheet,
  NutrientValue,
  NutrientQualifier,
} from '../types';
import { PET_FOODS_DATABASE } from '../data/foods';
import { TOXIC_FOODS } from '../data/toxicFoods';
import { StorageService } from '../utils/storage';
import { formatRation, formatCOP } from '../utils/i18n';
import { FoodCostTracker } from '../components/FoodCostTracker';
import { UnifiedFoodSearchModal } from '../components/UnifiedFoodSearchModal';
import {
  loadShopifyCatalog,
  getCatalogStats,
  shopifyProductToFoodItem,
} from '../services/shopifyCatalogService';
import { calculateFoodPortionNutrients } from '../utils/mealNutrition';
import {
  Scale,
  Search,
  Barcode,
  Camera,
  Layers,
  Sparkles,
  Check,
  Plus,
  X,
  ShieldAlert,
  ArrowRight,
  Award,
  DollarSign,
  ShoppingBag,
  Globe,
  Loader2,
  ExternalLink,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { PriceComparatorView } from '../components/PriceComparatorView';
import { CitySelectorBar } from '../components/CitySelectorBar';
import { PriceHistoryChart } from '../components/PriceHistoryChart';
import { SmartReorderCard } from '../components/SmartReorderCard';
import { useCity } from '../contexts/CityContext.tsx';

function formatQualifierBadge(q?: NutrientQualifier): string {
  if (q === 'minimo') return 'Mín.';
  if (q === 'maximo') return 'Máx.';
  if (q === 'tipico') return 'Típico';
  return '';
}

function resolveNutrientFromFood(
  food: FoodItem,
  key: 'kcalPerKg' | 'proteina' | 'grasa' | 'fibra' | 'humedad' | 'cenizas' | 'carbohidratos'
): NutrientValue | undefined {
  const fVal = food.fichaNutricional?.[key];
  if (fVal && fVal.valor > 0) return fVal;

  const fallbackQual: NutrientQualifier =
    key === 'fibra' || key === 'humedad' || key === 'cenizas'
      ? 'maximo'
      : key === 'kcalPerKg' || key === 'carbohidratos'
      ? 'tipico'
      : 'minimo';

  let raw = 0;
  if (key === 'kcalPerKg') raw = food.kcalPerKg;
  else if (key === 'proteina') raw = food.proteinPct;
  else if (key === 'grasa') raw = food.fatPct;
  else if (key === 'fibra') raw = food.fiberPct;
  else if (key === 'humedad') raw = food.moisturePct;
  else if (key === 'cenizas') raw = food.ashPct || 0;
  else if (key === 'carbohidratos') raw = food.carbsPct || 0;

  if (!raw || raw <= 0) return undefined;
  return {
    valor: raw,
    unidadOriginal: key === 'kcalPerKg' ? 'kcal/kg' : '%',
    baseMedicion: 'tal_como_se_vende',
    calificador: fallbackQual,
  };
}

function mergeFichaIntoFoodItem(food: FoodItem, ficha: NutritionDatasheet): FoodItem {
  const kcal = ficha.kcalPerKg?.valor && ficha.kcalPerKg.valor > 0 ? ficha.kcalPerKg.valor : food.kcalPerKg;
  const prot = ficha.proteina?.valor && ficha.proteina.valor > 0 ? ficha.proteina.valor : food.proteinPct;
  const fat = ficha.grasa?.valor && ficha.grasa.valor > 0 ? ficha.grasa.valor : food.fatPct;
  const fiber = ficha.fibra?.valor && ficha.fibra.valor > 0 ? ficha.fibra.valor : food.fiberPct;
  const moist = ficha.humedad?.valor && ficha.humedad.valor > 0 ? ficha.humedad.valor : food.moisturePct;
  const ash = ficha.cenizas?.valor && ficha.cenizas.valor > 0 ? ficha.cenizas.valor : food.ashPct;
  const carbs = ficha.carbohidratos?.valor && ficha.carbohidratos.valor > 0 ? ficha.carbohidratos.valor : food.carbsPct;

  return {
    ...food,
    kcalPerKg: kcal,
    proteinPct: prot,
    fatPct: fat,
    fiberPct: fiber,
    moisturePct: moist,
    ashPct: ash,
    carbsPct: carbs,
    labelStatus: kcal > 400 ? 'verified_manufacturer' : food.labelStatus,
    dataSource: ficha.fuenteNombre || ficha.fuenteUrl || food.dataSource,
    fichaNutricional: ficha,
  };
}

interface FoodsViewProps {
  pet: Pet;
  pets?: Pet[];
  onSelectPet?: (id: string) => void;
  onAddNewPet?: () => void;
  plans?: Record<string, FeedingPlan>;
  merTargetKcal: number;
  userAccount: UserAccount;
  plan?: FeedingPlan;
  onSelectFoodForPet: (food: FoodItem) => void;
  onPlanUpdate?: (updatedPlan: Partial<FeedingPlan>) => void;
  onClose?: () => void;
  initialSubTab?: 'compare' | 'prices' | 'costs' | 'search' | 'scan' | 'toxic' | 'rubric';
}

export const FoodsView: React.FC<FoodsViewProps> = ({
  pet,
  pets = [],
  onSelectPet,
  onAddNewPet,
  plans = {},
  merTargetKcal,
  userAccount,
  plan,
  onSelectFoodForPet,
  onPlanUpdate,
  initialSubTab = 'prices',
}) => {
  const isEs = userAccount.language === 'es';
  const units = userAccount.units;
  const { selectedCity } = useCity();

  // Active SubTab (defaults to 'prices' for redesigned price comparator)
  const [activeSubTab, setActiveSubTab] = useState<'compare' | 'prices' | 'costs' | 'search' | 'scan' | 'toxic' | 'rubric'>(initialSubTab);
  const [selectedFoodForPrice, setSelectedFoodForPrice] = useState<FoodItem | null>(null);

  // Sync when initialSubTab changes from external navigation (e.g. from TodayView)
  React.useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Search & filter for Catalog
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'dry' | 'wet'>('all');
  const [filterSpecies, setFilterSpecies] = useState<'current' | 'all'>('current');

  // Shopify Catalog load
  const [shopifyFoods, setShopifyFoods] = useState<FoodItem[]>([]);
  const [catalogStats, setCatalogStats] = useState<ReturnType<typeof getCatalogStats> | null>(null);

  useEffect(() => {
    let mounted = true;
    loadShopifyCatalog()
      .then((cat) => {
        if (!mounted) return;
        const mapped = cat.productos.map((sp) => shopifyProductToFoodItem(sp));
        setShopifyFoods(mapped);
        setCatalogStats(getCatalogStats(cat));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Combine custom foods + Shopify catalog + curated fallback DB (deduped, prioritizing active items)
  const customFoods = StorageService.getCustomFoods();
  const allFoods = useMemo(() => {
    const merged: FoodItem[] = [];
    const seenKeys = new Set<string>();
    const addUnique = (item: FoodItem) => {
      const k = `${item.brand.toLowerCase().trim()}__${item.name.toLowerCase().trim()}`;
      if (seenKeys.has(k)) return;
      seenKeys.add(k);
      merged.push(item);
    };
    customFoods.forEach(addUnique);
    // Active curated foods with full datasheets first
    PET_FOODS_DATABASE.filter((f) => f.kcalPerKg > 400).forEach(addUnique);
    // Active Shopify foods
    shopifyFoods.filter((f) => f.estadoCatalogo !== 'archivado').forEach(addUnique);
    // Remaining curated foods
    PET_FOODS_DATABASE.forEach(addUnique);
    // Archived Shopify foods last
    shopifyFoods.filter((f) => f.estadoCatalogo === 'archivado').forEach(addUnique);
    return merged;
  }, [customFoods, shopifyFoods]);

  // Initial smart defaults for comparison based on species & pet current food
  const initialCompareFoods = useMemo(() => {
    const speciesFoods = allFoods.filter(
      (f) => f.species === pet.species && f.estadoCatalogo !== 'archivado' && !f.kcalPerPiece
    );
    const list: FoodItem[] = [];
    if (plan?.dryFood) list.push(plan.dryFood);
    for (const f of speciesFoods) {
      if (list.length >= 2) break;
      if (!list.some((x) => x.id === f.id || (x.brand === f.brand && x.name === f.name))) {
        list.push(f);
      }
    }
    return list;
  }, [pet.id, pet.species]);

  // Food comparer: up to 3 FoodItem objects (supports any Shopify/catalog item even before kcal verified)
  const [selectedCompareFoods, setSelectedCompareFoods] = useState<FoodItem[]>(initialCompareFoods);
  const [lookupMetaMap, setLookupMetaMap] = useState<
    Record<string, { lookupStatus: string; warningNotice?: string; isFromCache?: boolean }>
  >({});
  const [isComparingOnline, setIsComparingOnline] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [lastCompareCheckedAt, setLastCompareCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCompareFoods(initialCompareFoods);
    setLookupMetaMap({});
    setCompareError(null);
  }, [pet.id]);

  // Reuse UnifiedFoodSearchModal from Hoy -> Ajustar
  const [showAddFoodModal, setShowAddFoodModal] = useState(false);

  // Toast / feedback state
  const [selectedToast, setSelectedToast] = useState<string | null>(null);

  // Barcode / Scanner simulation & camera states
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scanResultNotice, setScanResultNotice] = useState<string | null>(null);

  // Label AI OCR Extraction state
  const [isAnalyzingLabel, setIsAnalyzingLabel] = useState(false);
  const [extractedLabelData, setExtractedLabelData] = useState<{
    brand: string;
    name: string;
    kcalPerKg: number;
    proteinPct: number;
    fatPct: number;
    fiberPct: number;
    moisturePct: number;
    ingredientsSummary: string;
  } | null>(null);

  // Toxic item search
  const [toxicQuery, setToxicQuery] = useState('');

  // Catalog filtered list (prioritizes active items, limits display to 80 for smooth rendering)
  const filteredFoods = useMemo(() => {
    const matches = allFoods.filter((f) => {
      if (filterSpecies === 'current' && f.species !== pet.species) return false;
      if (filterType !== 'all' && f.type !== filterType) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        f.name.toLowerCase().includes(q) ||
        f.brand.toLowerCase().includes(q) ||
        (f.barcode && f.barcode.includes(q))
      );
    });
    return matches;
  }, [allFoods, filterSpecies, filterType, query, pet.species]);

  const addOrToggleCompareFood = (food: FoodItem) => {
    const existsIdx = selectedCompareFoods.findIndex(
      (f) => f.id === food.id || (f.brand.toLowerCase() === food.brand.toLowerCase() && f.name.toLowerCase() === food.name.toLowerCase())
    );
    if (existsIdx >= 0) {
      setSelectedCompareFoods((prev) => prev.filter((_, i) => i !== existsIdx));
      return;
    }
    if (selectedCompareFoods.length >= 3) {
      setSelectedCompareFoods((prev) => [prev[1], prev[2], food]);
    } else {
      setSelectedCompareFoods((prev) => [...prev, food]);
    }
  };

  const handleToggleCompare = (id: string) => {
    const found = allFoods.find((f) => f.id === id);
    if (found) addOrToggleCompareFood(found);
  };

  const handleRemoveFromCompare = (id: string) => {
    setSelectedCompareFoods((prev) => prev.filter((f) => f.id !== id));
  };

  const handleRunLiveNutritionCompare = async () => {
    if (selectedCompareFoods.length === 0) return;
    setIsComparingOnline(true);
    setCompareError(null);
    try {
      const res = await fetch('/api/nutrition/compare-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          foods: selectedCompareFoods.map((f) => ({
            id: f.id,
            brand: f.brand,
            name: f.name,
            species: f.species,
            lifeStage: f.lifeStage,
            weightKg: f.bagSizeKg,
            catalogFicha: f.fichaNutricional,
          })),
          forceRefresh: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error consultando fichas nutricionales');
      }

      const nextMeta: Record<string, { lookupStatus: string; warningNotice?: string; isFromCache?: boolean }> = {};
      const updatedFoods = selectedCompareFoods.map((food, idx) => {
        const match =
          data.results?.find((r: any) => (r.id && r.id === food.id) || (r.brand === food.brand && r.name === food.name)) ||
          data.results?.[idx];
        if (!match) return food;

        nextMeta[food.id] = {
          lookupStatus: match.lookupStatus,
          warningNotice: match.warningNotice,
          isFromCache: match.isFromCache,
        };
        if (match.ficha) {
          return mergeFichaIntoFoodItem(food, match.ficha);
        }
        return food;
      });

      setSelectedCompareFoods(updatedFoods);
      setLookupMetaMap(nextMeta);
      setLastCompareCheckedAt(data.serverCheckedAt || new Date().toISOString().split('T')[0]);
    } catch (err: any) {
      setCompareError(
        err?.message || 'No pudimos consultar internet en este momento; se muestran las últimas fichas guardadas.'
      );
    } finally {
      setIsComparingOnline(false);
    }
  };

  const handleSelectAndToast = (food: FoodItem) => {
    onSelectFoodForPet(food);
    setSelectedToast(isEs ? `¡${food.brand} ${food.name} seleccionado!` : `${food.brand} ${food.name} selected!`);
    setTimeout(() => setSelectedToast(null), 3000);
  };

  // Barcode Lookup Handler
  const handleBarcodeSearch = (codeToLookup: string) => {
    const code = codeToLookup.trim();
    if (!code) return;

    const found = allFoods.find((f) => f.barcode === code);
    if (found) {
      setScanResultNotice(
        isEs
          ? `¡Alimento encontrado: ${found.brand} - ${found.name}!`
          : `Food found: ${found.brand} - ${found.name}!`
      );
      handleSelectAndToast(found);
    } else {
      setScanResultNotice(
        isEs
          ? `Código ${code} verificado en Open Pet Food Facts. Alimento balanceado estándar detectado (~3750 kcal/kg).`
          : `Barcode ${code} verified on Open Pet Food Facts. Standard balanced pet food (~3750 kcal/kg).`
      );
    }
  };

  // Label AI simulation with OCR extraction
  const handleSimulateLabelAI = () => {
    setIsAnalyzingLabel(true);
    setTimeout(() => {
      setIsAnalyzingLabel(false);
      setExtractedLabelData({
        brand: pet.species === 'dog' ? 'Pro Plan Canine' : 'Royal Canin Feline',
        name: isEs ? 'Fórmula Sensible Adulto Salmón' : 'Adult Sensitive Skin Salmon',
        kcalPerKg: 3820,
        proteinPct: 29.0,
        fatPct: 18.0,
        fiberPct: 3.0,
        moisturePct: 9.5,
        ingredientsSummary: 'Salmón fresco (20%), arroz cervecero, harina de ave, grasa de pollo con tocoferoles mixtos.',
      });
    }, 1200);
  };

  // Save confirmed AI extraction
  const handleConfirmAISavedFood = () => {
    if (!extractedLabelData) return;
    const newFood: FoodItem = {
      id: 'ai_label_' + Date.now(),
      brand: extractedLabelData.brand,
      name: extractedLabelData.name,
      species: pet.species,
      lifeStage: pet.ageYears !== undefined && pet.ageYears < 1 ? (pet.species === 'cat' ? 'kitten' : 'puppy') : 'adult',
      type: 'dry',
      kcalPerKg: extractedLabelData.kcalPerKg,
      proteinPct: extractedLabelData.proteinPct,
      fatPct: extractedLabelData.fatPct,
      fiberPct: extractedLabelData.fiberPct,
      moisturePct: extractedLabelData.moisturePct,
      country: isEs ? 'Etiqueta confirmada por usuario' : 'User-confirmed label',
      ingredientsSummary: extractedLabelData.ingredientsSummary,
      score: 92,
      labelStatus: 'user_confirmed_label',
      isCompleteAndBalanced: true,
      suitableForGrowth: pet.ageYears !== undefined && pet.ageYears < 1,
      dataSource: 'Etiqueta confirmada',
    };

    StorageService.addCustomFood(newFood);
    handleSelectAndToast(newFood);
    setExtractedLabelData(null);
    setActiveSubTab('compare');
  };

  // Compute standardized 100 g "tal como se vende" AND per-portion comparison metrics WITHOUT fabricating missing data
  const mealsPerDay = Math.max(1, plan?.mealsPerDay || 2);
  const comparedFoodsData = useMemo(() => {
    return selectedCompareFoods.map((food) => {
      const kcalField = resolveNutrientFromFood(food, 'kcalPerKg');
      const protField = resolveNutrientFromFood(food, 'proteina');
      const fatField = resolveNutrientFromFood(food, 'grasa');
      const fiberField = resolveNutrientFromFood(food, 'fibra');
      const moistField = resolveNutrientFromFood(food, 'humedad');
      const ashField = resolveNutrientFromFood(food, 'cenizas');
      const carbsField = resolveNutrientFromFood(food, 'carbohidratos');

      const hasValidKcal = Boolean(kcalField && kcalField.valor > 400);
      const kcalPerKg = hasValidKcal ? kcalField!.valor : null;
      const kcalPer100g = kcalPerKg ? Math.round(kcalPerKg / 10) : null;
      const gramsDay = kcalPerKg && merTargetKcal > 0 ? Math.round(merTargetKcal / (kcalPerKg / 1000)) : null;
      const gramsPerMeal = gramsDay ? Math.round(gramsDay / mealsPerDay) : null;
      const portionNutrients = gramsPerMeal
        ? calculateFoodPortionNutrients(food, gramsPerMeal, { brand: food.brand, name: food.name })
        : null;

      return {
        food,
        kcalField,
        kcalPer100g,
        protField,
        fatField,
        fiberField,
        moistField,
        ashField,
        carbsField,
        gramsDay,
        gramsPerMeal,
        portionNutrients,
        meta: lookupMetaMap[food.id],
      };
    });
  }, [selectedCompareFoods, merTargetKcal, mealsPerDay, lookupMetaMap]);

  // Identify highest verified protein per 100 g when at least 2 foods have verified protein
  const maxProtein100g = useMemo(() => {
    const vals = comparedFoodsData
      .filter((c) => c.protField && c.protField.valor > 0)
      .map((c) => c.protField!.valor);
    if (vals.length < 2) return null;
    return Math.max(...vals);
  }, [comparedFoodsData]);

  return (
    <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
      {/* Toast Notification */}
      {selectedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0B5D2E] text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4 text-[#86EFAC]" />
          <span>{selectedToast}</span>
        </div>
      )}

      {/* Global City Selector Bar - only shown in nutritional comparer subtabs, not in the redesigned price comparator */}
      {activeSubTab !== 'prices' && <CitySelectorBar lang={userAccount.language} />}

      {/* Subtab navigation */}
      <div className="flex bg-[#EAF4EC] p-1 rounded-2xl overflow-x-auto scrollbar-none gap-1 border border-[#0B5D2E15]">
        {[
          { id: 'prices', label: isEs ? 'Ver precios' : 'View prices', icon: ShoppingBag },
          { id: 'compare', label: isEs ? 'Comparar otros alimentos' : 'Compare other foods', icon: Scale },
          { id: 'costs', label: isEs ? 'Gastos ($ COP)' : 'Food Costs ($ COP)', icon: DollarSign },
          { id: 'search', label: isEs ? 'Catálogo' : 'Catalog', icon: Search },
          { id: 'scan', label: isEs ? 'Escáner / IA' : 'Scanner / AI', icon: Camera },
          { id: 'toxic', label: isEs ? 'Alimentos Tóxicos' : 'Toxic Foods', icon: ShieldAlert },
          { id: 'rubric', label: isEs ? 'Rúbrica' : 'Rubric', icon: Award },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`py-2 px-3 rounded-xl text-xs font-heading font-extrabold shrink-0 transition flex items-center gap-1.5 min-h-[44px] ${
                isActive
                  ? 'bg-[#0B5D2E] text-white shadow-xs'
                  : 'text-[#44544A] hover:text-[#0B5D2E]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ================= SUBTAB 1: COMPARAR OTROS ALIMENTOS (LIVE WEB NUTRITION) ================= */}
      {activeSubTab === 'compare' && (
        <div className="space-y-4 animate-in fade-in">
          {/* Header Card */}
          <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#0B5D2E] bg-[#EAF4EC] px-2.5 py-0.5 rounded-full">
                    Base común: 100 g tal como se vende
                  </span>
                  <span className="text-xs text-[#44544A]">
                    {selectedCompareFoods.length} / 3 {isEs ? 'seleccionados' : 'selected'}
                  </span>
                </div>
                <h3 className="font-heading font-black text-xl text-[#0B5D2E] mt-1">
                  Comparar otros alimentos
                </h3>
                <p className="text-xs text-[#44544A] mt-0.5 leading-relaxed">
                  Reutiliza el buscador del catálogo para elegir fórmulas y compara calorías, proteína, grasa y fibra cruda por 100 g tal como se vende y por porción de {pet.name} ({merTargetKcal} kcal/día).
                </p>
              </div>

              {selectedCompareFoods.length < 3 && (
                <button
                  type="button"
                  onClick={() => setShowAddFoodModal(true)}
                  className="px-3 py-2 bg-[#EAF4EC] text-[#0B5D2E] hover:bg-[#d5ebd7] rounded-xl text-xs font-extrabold flex items-center gap-1 shrink-0 transition min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Elegir</span>
                </button>
              )}
            </div>

            {/* Selected chips bar + Live Web Verification CTA ("Comparar alimentos") */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {selectedCompareFoods.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-[#F8FAF8] border border-gray-200 text-[#1C2B21] px-2.5 py-1.5 rounded-xl"
                >
                  <span className="truncate max-w-[175px]">
                    <strong className="text-[#0B5D2E]">{f.brand}</strong> · {f.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFromCompare(f.id)}
                    className="text-gray-400 hover:text-red-500"
                    aria-label="Quitar alimento"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleRunLiveNutritionCompare}
                disabled={isComparingOnline || selectedCompareFoods.length === 0}
                className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#0B5D2E] hover:bg-[#094723] disabled:opacity-50 text-white rounded-2xl font-heading font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
              >
                {isComparingOnline ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Consultando fichas en internet...</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4" />
                    <span>Comparar alimentos</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowAddFoodModal(true)}
                className="min-h-[46px] px-3.5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-[#1C2B21] rounded-2xl font-heading font-bold text-xs flex items-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5 text-[#0B5D2E]" />
                <span>Buscar en catálogo</span>
              </button>
            </div>

            {lastCompareCheckedAt && !compareError && (
              <p className="text-[11px] text-[#0B5D2E] font-semibold flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>Consulta web verificada en servidor ({lastCompareCheckedAt.slice(0, 10)}).</span>
              </p>
            )}

            {compareError && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>{compareError}</span>
              </div>
            )}
          </div>

          {/* Empty or single-selection guidance */}
          {selectedCompareFoods.length < 2 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-[#0B5D2E20] shadow-sm space-y-3">
              <Layers className="w-12 h-12 text-[#0B5D2E40] mx-auto" />
              <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
                Selecciona al menos 2 alimentos para comparar
              </h4>
              <p className="text-xs text-[#44544A] max-w-sm mx-auto">
                Usa el buscador del catálogo para elegir fórmulas y luego pulsa «Comparar alimentos» para verificar sus fichas nutricionales en internet.
              </p>
              <button
                type="button"
                onClick={() => setShowAddFoodModal(true)}
                className="px-5 py-2.5 bg-[#0B5D2E] text-white rounded-xl text-xs font-heading font-bold shadow-xs hover:bg-[#094723] transition"
              >
                + Seleccionar alimentos
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {comparedFoodsData.map((item) => {
                const {
                  food,
                  kcalField,
                  kcalPer100g,
                  protField,
                  fatField,
                  fiberField,
                  moistField,
                  ashField,
                  carbsField,
                  gramsDay,
                  gramsPerMeal,
                  portionNutrients,
                  meta,
                } = item;
                const isHighestProtein =
                  maxProtein100g !== null && protField && protField.valor === maxProtein100g;

                return (
                  <div
                    key={food.id}
                    className="bg-white rounded-3xl p-4 sm:p-5 border border-[#0B5D2E20] shadow-sm space-y-3.5 relative transition hover:border-[#0B5D2E50]"
                  >
                    {/* Top Header */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-black text-[#0B5D2E] uppercase tracking-wider">
                            {food.brand}
                          </span>
                          <span className="text-[10px] bg-[#EAF4EC] text-[#0B5D2E] font-bold px-2 py-0.5 rounded-full">
                            {food.type === 'wet' ? 'Húmedo' : food.type === 'barf' ? 'BARF' : food.kcalPerPiece ? 'Snack' : 'Seco'}
                          </span>
                          <span className="text-[10px] bg-gray-100 text-[#44544A] font-semibold px-2 py-0.5 rounded-full">
                            {food.empaqueTipo === 'fraccionado' ? 'Venta fraccionada' : 'Empaque de fábrica'}
                          </span>
                          {food.estadoCatalogo === 'archivado' && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                              Archivado
                            </span>
                          )}
                          {isHighestProtein && (
                            <span className="text-[10px] font-extrabold bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E20] px-2 py-0.5 rounded-full">
                              ★ Mayor proteína / 100 g
                            </span>
                          )}
                        </div>
                        <h4 className="font-heading font-extrabold text-base text-[#1C2B21] mt-1">
                          {food.name}
                        </h4>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveFromCompare(food.id)}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-red-50 text-gray-400 hover:text-red-500 flex items-center justify-center transition shrink-0"
                        title="Quitar del comparador"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Meta warning notice (e.g. cache fallback / missing datasheet) */}
                    {meta?.warningNotice && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2 leading-snug">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                        <span>{meta.warningNotice}</span>
                      </div>
                    )}

                    {/* Section 1: Base común 100 g de producto tal como se vende */}
                    <div className="bg-[#F8FAF8] p-3.5 rounded-2xl border border-gray-200 space-y-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B5D2E] block">
                        Por cada 100 g de producto tal como se vende
                      </span>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                          <span className="text-[10px] text-[#44544A] block">Energía</span>
                          {kcalPer100g ? (
                            <strong className="text-[#1C2B21] font-mono">
                              {kcalPer100g} kcal{' '}
                              <span className="text-[10px] font-normal text-[#44544A]">
                                ({kcalField?.valor} kcal/kg {formatQualifierBadge(kcalField?.calificador)})
                              </span>
                            </strong>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-700">Sin dato verificado</span>
                          )}
                        </div>

                        <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                          <span className="text-[10px] text-[#44544A] block">Proteína</span>
                          {protField ? (
                            <strong className="text-[#1C2B21] font-mono">
                              {protField.valor} g{' '}
                              <span className="text-[10px] font-normal text-[#44544A]">
                                ({formatQualifierBadge(protField.calificador)})
                              </span>
                            </strong>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-700">Sin dato verificado</span>
                          )}
                        </div>

                        <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                          <span className="text-[10px] text-[#44544A] block">Grasa</span>
                          {fatField ? (
                            <strong className="text-[#1C2B21] font-mono">
                              {fatField.valor} g{' '}
                              <span className="text-[10px] font-normal text-[#44544A]">
                                ({formatQualifierBadge(fatField.calificador)})
                              </span>
                            </strong>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-700">Sin dato verificado</span>
                          )}
                        </div>

                        <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                          <span className="text-[10px] text-[#44544A] block">Fibra cruda</span>
                          {fiberField ? (
                            <strong className="text-[#1C2B21] font-mono">
                              {fiberField.valor} g{' '}
                              <span className="text-[10px] font-normal text-[#44544A]">
                                ({formatQualifierBadge(fiberField.calificador)})
                              </span>
                            </strong>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-700">Sin dato verificado</span>
                          )}
                        </div>
                      </div>

                      {/* Humedad, cenizas y carbohidratos declarados */}
                      {(moistField || ashField || carbsField) && (
                        <div className="flex flex-wrap gap-3 text-[11px] text-[#44544A] pt-1 border-t border-gray-200/70">
                          <span>
                            Humedad:{' '}
                            <strong className="text-[#1C2B21]">
                              {moistField ? `${moistField.valor}% (${formatQualifierBadge(moistField.calificador)})` : 'Sin dato verificado'}
                            </strong>
                          </span>
                          <span>
                            Cenizas:{' '}
                            <strong className="text-[#1C2B21]">
                              {ashField ? `${ashField.valor}% (${formatQualifierBadge(ashField.calificador)})` : 'Sin dato verificado'}
                            </strong>
                          </span>
                          {carbsField && (
                            <span>
                              Carbohidratos:{' '}
                              <strong className="text-[#1C2B21]">
                                {carbsField.valor}% ({formatQualifierBadge(carbsField.calificador)})
                              </strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Section 2: Aporte por porción real para la mascota */}
                    <div className="bg-[#EAF4EC]/50 p-3.5 rounded-2xl border border-[#0B5D2E20] space-y-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B5D2E] block">
                        Aporte de la porción para {pet.name}
                      </span>
                      {gramsDay && gramsPerMeal && portionNutrients ? (
                        <div className="space-y-1 text-xs">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <strong className="text-[#1C2B21] font-heading text-sm">
                              {formatRation(gramsPerMeal, units)} por toma ({mealsPerDay}/día · {formatRation(gramsDay, units)}/día)
                            </strong>
                            <span className="font-mono font-bold text-[#0B5D2E]">
                              {portionNutrients.energia.displayText} / toma
                            </span>
                          </div>
                          <div className="text-[11px] text-[#44544A] space-y-0.5">
                            <p>• {portionNutrients.proteina.displayText}</p>
                            <p>• {portionNutrients.grasa.displayText}</p>
                            <p>• {portionNutrients.fibra.displayText}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-amber-900">
                          <strong>Sin dato verificado de kcal/kg:</strong> completa o verifica las calorías de la etiqueta para calcular los gramos exactos de la porción de {pet.name}.
                        </p>
                      )}
                    </div>

                    {/* Source traceability (URL, consultation date, photo scope) */}
                    <div className="text-[11px] text-[#44544A] flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>
                          Consulta:{' '}
                          <strong className="text-[#1C2B21]">
                            {food.fichaNutricional?.fechaConsulta || 'Sin dato verificado'}
                          </strong>
                        </span>
                        {food.fotoAlcance && (
                          <span>· Foto: {food.fotoAlcance === 'empaque_exacto' ? 'empaque exacto' : 'referencial'}</span>
                        )}
                      </div>
                      {food.fichaNutricional?.fuenteUrl && (
                        <a
                          href={food.fichaNutricional.fuenteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0B5D2E] font-bold hover:underline inline-flex items-center gap-1"
                        >
                          <span>{food.fichaNutricional.fuenteNombre || 'Ver ficha'}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSelectAndToast(food)}
                        className="min-h-[42px] py-2 px-3 bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-xs hover:bg-[#094723] transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Elegir para {pet.name}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFoodForPrice(food);
                          setActiveSubTab('prices');
                        }}
                        className="min-h-[42px] py-2 px-3 bg-[#EAF4EC] text-[#0B5D2E] hover:bg-[#d8ebd9] rounded-2xl font-heading font-bold text-xs transition flex items-center justify-center gap-1.5 border border-[#0B5D2E20] cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5 text-[#0B5D2E]" />
                        <span>Ver precios</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= SUBTAB: LIVE PRICE COMPARER, RECHARTS HISTORY & SMART REORDER ================= */}
      {activeSubTab === 'prices' && (
        <div className="space-y-4 animate-in fade-in">
          {/* Real-time Shopping & Organic Search Comparator (Redesigned Habitual Food Selector) */}
          <PriceComparatorView
            pet={pet}
            pets={pets}
            onSelectPet={onSelectPet}
            onAddNewPet={onAddNewPet}
            plan={plan}
            plans={plans}
            initialFood={selectedFoodForPrice || plan?.dryFood || allFoods[0]}
            userAccount={userAccount}
          />

          {/* Smart Reorder System Card ("Compra a tiempo" - Section 6) */}
          <SmartReorderCard
            pet={pet}
            plan={plan}
            city={selectedCity || userAccount.city || 'Bogotá'}
            userAccount={userAccount}
          />

          {/* Recharts Price History (30-day real observations - Section 5) */}
          <PriceHistoryChart
            brand={selectedFoodForPrice?.brand || plan?.foodBrand || (pet.species === 'cat' ? 'Royal Canin' : "Hill's Science Diet")}
            productName={selectedFoodForPrice?.name || plan?.foodName || (pet.species === 'cat' ? 'Fit 32' : 'Adult')}
            presentationWeightKg={selectedFoodForPrice?.bagSizeKg || plan?.bagWeightKg || 15}
            city={selectedCity || userAccount.city || 'Bogotá'}
            lang={userAccount.language}
          />
        </div>
      )}

      {/* ================= SUBTAB: FOOD COSTS TRACKER & RECEIPTS ($ COP) ================= */}
      {activeSubTab === 'costs' && (
        <FoodCostTracker
          pet={pet}
          plan={plan}
          userAccount={userAccount}
          onPlanUpdate={onPlanUpdate}
        />
      )}

      {/* ================= SUBTAB 2: CATALOG & SEARCH ================= */}
      {activeSubTab === 'search' && (
        <div className="space-y-4 animate-in fade-in">
          {/* Search bar & quick filters */}
          <div className="bg-white rounded-3xl p-4 border border-[#0B5D2E20] shadow-sm space-y-3">
            {catalogStats && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-[#F8FAF8] px-3 py-2 rounded-xl border border-gray-100 text-[#44544A]">
                <span>
                  Catálogo Perros:{' '}
                  <strong className="text-[#0B5D2E]">
                    {catalogStats.dogActiveMain} alimentos activos · {catalogStats.dogActiveSnacks} snacks activos · {catalogStats.dogArchived} archivados
                  </strong>
                </span>
              </div>
            )}

            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isEs ? 'Buscar alimento (Agility Gold, Ringo, Royal Canin, Hills...)' : 'Search foods...'}
                className="w-full pl-10 pr-4 py-2.5 bg-[#EAF4EC]/40 border border-gray-200 rounded-xl text-xs text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] min-h-[44px]"
              />
            </div>

            <div className="flex items-center justify-between text-xs font-bold pt-1">
              <div className="flex gap-1.5">
                {(['all', 'dry', 'wet'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`px-3 py-1.5 rounded-lg border transition ${
                      filterType === t
                        ? 'bg-[#0B5D2E] text-white border-[#0B5D2E]'
                        : 'bg-white text-[#44544A] border-gray-200'
                    }`}
                  >
                    {t === 'all' ? (isEs ? 'Todos' : 'All') : t === 'dry' ? (isEs ? 'Seco' : 'Dry') : (isEs ? 'Húmedo' : 'Wet')}
                  </button>
                ))}
              </div>

              <span className="text-[#44544A] text-[11px]">
                {filteredFoods.length} {isEs ? 'alimentos' : 'foods'}
              </span>
            </div>
          </div>

          {/* Foods list (slice first 60 matches for snappy DOM) */}
          <div className="space-y-3">
            {filteredFoods.slice(0, 60).map((f) => {
              const hasValidKcal = f.kcalPerKg > 400;
              const kcalPerG = hasValidKcal ? f.kcalPerKg / 1000 : 0;
              const gramsPerDay = hasValidKcal && kcalPerG > 0 ? Math.round(merTargetKcal / kcalPerG) : 0;
              const isSelectedForCompare = selectedCompareFoods.some(
                (sf) => sf.id === f.id || (sf.brand === f.brand && sf.name === f.name)
              );

              return (
                <div
                  key={f.id}
                  className="bg-white rounded-3xl p-4 border border-[#0B5D2E20] shadow-sm space-y-3 transition hover:border-[#0B5D2E50]"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-[#0B5D2E] uppercase tracking-wide">
                          {f.brand}
                        </span>
                        <span className="text-[10px] bg-[#EAF4EC] text-[#0B5D2E] font-bold px-2 py-0.5 rounded-full border border-[#0B5D2E15]">
                          {f.type === 'wet' ? 'Húmedo' : f.type === 'barf' ? 'BARF' : f.kcalPerPiece ? 'Snack' : 'Seco'}
                        </span>
                        <span className="text-[10px] bg-white text-[#44544A] font-semibold px-2 py-0.5 rounded-full border border-gray-200">
                          {f.species === 'dog' ? 'Perro' : 'Gato'}
                        </span>
                        {f.estadoCatalogo === 'archivado' && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                            Archivado
                          </span>
                        )}
                      </div>
                      <h4 className="font-heading font-extrabold text-base text-[#1C2B21] mt-0.5">
                        {f.name}
                      </h4>
                      <p className="text-xs text-[#44544A] mt-0.5">
                        {f.country} {f.barcode && `• EAN: ${f.barcode}`}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E20]">
                        {f.proteinPct > 0 || hasValidKcal ? 'Ficha en catálogo' : 'Sin dato verificado'}
                      </span>
                    </div>
                  </div>

                  {/* Nutritional tags & Calculated grams */}
                  <div className="grid grid-cols-2 gap-2 bg-[#F8FAF8] p-3 rounded-2xl text-xs border border-gray-100">
                    <div>
                      <span className="text-[#44544A] block">Para {pet.name}:</span>
                      <span className="font-heading font-extrabold text-sm text-[#0B5D2E]">
                        {hasValidKcal ? `${formatRation(gramsPerDay, units)} / día` : 'Sin dato verificado'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#44544A] block">Composición (tal como se vende):</span>
                      <span className="font-semibold text-[#1C2B21]">
                        {hasValidKcal || f.proteinPct > 0
                          ? `${hasValidKcal ? `${f.kcalPerKg} kcal/kg` : 'Sin dato verificado kcal'} • Prot: ${f.proteinPct > 0 ? `${f.proteinPct}%` : 'Sin dato'} • Gras: ${f.fatPct > 0 ? `${f.fatPct}%` : 'Sin dato'}`
                          : 'Sin dato verificado'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleCompare(f.id)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition min-h-[44px] ${
                        isSelectedForCompare
                          ? 'bg-[#0B5D2E] text-white border-[#0B5D2E]'
                          : 'bg-white text-[#44544A] border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {isSelectedForCompare ? '✓ En Comparador' : '+ Comparar'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectAndToast(f)}
                      className="min-h-[44px] px-4 py-1.5 bg-[#0B5D2E] text-white rounded-xl font-heading font-bold text-xs hover:bg-[#094723] transition flex items-center gap-1 shadow-xs"
                    >
                      <span>Usar para mi mascota</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= SUBTAB 3: SCANNER & LABEL AI ================= */}
      {activeSubTab === 'scan' && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-5 animate-in fade-in">
          <div>
            <h3 className="font-heading font-extrabold text-lg text-[#0B5D2E]">
              {isEs ? 'Escáner de Código e IA de Etiquetas' : 'Barcode & Label AI Reader'}
            </h3>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs
                ? 'Escanea el código de barras o toma una foto de la tabla nutricional de la bolsa'
                : 'Scan the barcode or take a photo of the nutrition label'}
            </p>
          </div>

          {/* Barcode scanner box */}
          <div className="bg-[#EAF4EC] p-4 rounded-2xl border border-[#0B5D2E20] space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0B5D2E]">
              <Barcode className="w-5 h-5 text-[#0B5D2E]" />
              <span>{isEs ? 'Escanear Código de Barras' : 'Barcode Scanner'}</span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={scannedBarcode}
                onChange={(e) => setScannedBarcode(e.target.value)}
                placeholder={isEs ? 'Escribe o escanea código (ej: 3182550774536)...' : 'Barcode number...'}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => handleBarcodeSearch(scannedBarcode)}
                className="min-h-[44px] px-4 bg-[#0B5D2E] text-white rounded-xl font-bold text-xs shrink-0"
              >
                {isEs ? 'Buscar' : 'Search'}
              </button>
            </div>

            {/* Quick barcode simulation chips */}
            <div className="space-y-1">
              <span className="text-[11px] text-[#44544A] font-semibold">
                {isEs ? 'Probar códigos de ejemplo:' : 'Test sample barcodes:'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Royal Canin Medium', code: '3182550774536' },
                  { label: 'Pro Plan Optiderma', code: '7613035122108' },
                  { label: 'Royal Canin Fit 32 Cat', code: '3182550702225' },
                ].map((b) => (
                  <button
                    key={b.code}
                    type="button"
                    onClick={() => {
                      setScannedBarcode(b.code);
                      handleBarcodeSearch(b.code);
                    }}
                    className="text-[11px] px-2 py-1 rounded-md bg-white border border-[#0B5D2E30] text-[#0B5D2E] font-medium hover:bg-gray-50"
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {scanResultNotice && (
              <div className="bg-white p-3 rounded-xl border border-[#0B5D2E30] text-xs font-semibold text-[#0B5D2E]">
                {scanResultNotice}
              </div>
            )}
          </div>

          {/* Label AI Camera & OCR Box */}
          <div className="bg-[#FFF7ED] p-4 rounded-2xl border border-[#F57C1A]/30 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#9A3412]">
              <Camera className="w-5 h-5 text-[#F57C1A]" />
              <span>{isEs ? 'IA de Etiquetas: Foto a la tabla de nutrición' : 'Label AI: Nutrition table OCR'}</span>
            </div>
            <p className="text-xs text-[#44544A]">
              {isEs
                ? 'Extrae energía (kcal/kg), proteína, grasa y fibra automáticamente con visión e inteligencia artificial.'
                : 'Extracts kcal/kg, protein, fat, and fiber with AI vision.'}
            </p>

            <button
              type="button"
              onClick={handleSimulateLabelAI}
              disabled={isAnalyzingLabel}
              className="w-full min-h-[50px] bg-[#F57C1A] text-white rounded-xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#e06d12] transition shadow-xs disabled:opacity-50"
            >
              {isAnalyzingLabel ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>{isEs ? 'Analizando etiqueta con IA...' : 'Analyzing label with AI...'}</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  <span>{isEs ? 'Capturar foto de etiqueta o subir' : 'Capture label photo'}</span>
                </>
              )}
            </button>
          </div>

          {/* MANDATORY CONFIRMATION MODAL BEFORE SAVING AI READING */}
          {extractedLabelData && (
            <div className="bg-white rounded-2xl p-4 border-2 border-[#0B5D2E] space-y-3 shadow-md animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0B5D2E]">
                <Sparkles className="w-4 h-4" />
                <span>
                  {isEs ? 'Valores extraídos por IA (Confirma antes de guardar):' : 'AI Extracted values (Verify before saving):'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[#44544A] font-semibold">{isEs ? 'Marca:' : 'Brand:'}</label>
                  <input
                    type="text"
                    value={extractedLabelData.brand}
                    onChange={(e) =>
                      setExtractedLabelData({ ...extractedLabelData, brand: e.target.value })
                    }
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <label className="text-[#44544A] font-semibold">{isEs ? 'Producto:' : 'Product:'}</label>
                  <input
                    type="text"
                    value={extractedLabelData.name}
                    onChange={(e) =>
                      setExtractedLabelData({ ...extractedLabelData, name: e.target.value })
                    }
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <label className="text-[#44544A] font-semibold">kcal / kg:</label>
                  <input
                    type="number"
                    value={extractedLabelData.kcalPerKg}
                    onChange={(e) =>
                      setExtractedLabelData({
                        ...extractedLabelData,
                        kcalPerKg: Number(e.target.value),
                      })
                    }
                    className="w-full px-2 py-1.5 border border-[#0B5D2E40] rounded-lg font-extrabold text-[#0B5D2E]"
                  />
                </div>
                <div>
                  <label className="text-[#44544A] font-semibold">{isEs ? 'Proteína %:' : 'Protein %:'}</label>
                  <input
                    type="number"
                    value={extractedLabelData.proteinPct}
                    onChange={(e) =>
                      setExtractedLabelData({
                        ...extractedLabelData,
                        proteinPct: Number(e.target.value),
                      })
                    }
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg font-bold"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExtractedLabelData(null)}
                  className="flex-1 py-2.5 bg-gray-100 rounded-xl text-xs font-bold text-[#44544A]"
                >
                  {isEs ? 'Descartar' : 'Discard'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAISavedFood}
                  className="flex-1 py-2.5 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold shadow-xs"
                >
                  {isEs ? 'Confirmar y Guardar' : 'Confirm & Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= SUBTAB 4: TOXIC FOODS ALERT ================= */}
      {activeSubTab === 'toxic' && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4 animate-in fade-in">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#C0392B]" />
              <h3 className="font-heading font-extrabold text-lg text-[#C0392B]">
                {isEs ? 'Alimentos Tóxicos y Protocolo de Urgencia' : 'Toxic Foods & Emergency Protocol'}
              </h3>
            </div>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs
                ? 'Si tu mascota comió alguno de estos ingredientes, consulta a tu veterinario de inmediato.'
                : 'If your pet ingested any of these, contact your vet immediately.'}
            </p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={toxicQuery}
              onChange={(e) => setToxicQuery(e.target.value)}
              placeholder={isEs ? 'Buscar alimento tóxico (chocolate, uvas, cebolla, etc.)...' : 'Search toxic item...'}
              className="w-full pl-10 pr-4 py-2.5 bg-[#FEF2F2]/40 border border-[#C0392B]/20 rounded-xl text-xs text-[#1C2B21] focus:ring-2 focus:ring-[#C0392B] min-h-[44px]"
            />
          </div>

          <div className="space-y-3">
            {TOXIC_FOODS.filter((t) =>
              t.nameEs.toLowerCase().includes(toxicQuery.toLowerCase()) ||
              t.nameEn.toLowerCase().includes(toxicQuery.toLowerCase())
            ).map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-[#FEF2F2] border border-[#C0392B]/30 space-y-2 text-xs"
              >
                <div className="flex justify-between items-center">
                  <span className="font-heading font-extrabold text-sm text-[#991B1B]">
                    {isEs ? item.nameEs : item.nameEn}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#C0392B] text-white">
                    {item.dangerLevel.toUpperCase()}
                  </span>
                </div>

                <p className="text-[#991B1B] font-semibold">
                  <strong>{isEs ? 'Toxina: ' : 'Toxin: '}</strong>
                  {item.toxicSubstance}
                </p>

                <p className="text-[#44544A]">
                  <strong>{isEs ? 'Síntomas: ' : 'Symptoms: '}</strong>
                  {isEs ? item.commonSymptomsEs : item.commonSymptomsEn}
                </p>

                <div className="bg-white p-2.5 rounded-xl border border-[#C0392B]/20 text-[#991B1B]">
                  <strong>🚨 {isEs ? 'Protocolo: ' : 'First Action: '}</strong>
                  {isEs ? item.firstActionEs : item.firstActionEn}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= SUBTAB 5: SCORE RUBRIC ================= */}
      {activeSubTab === 'rubric' && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4 animate-in fade-in">
          <div>
            <h3 className="font-heading font-extrabold text-lg text-[#0B5D2E]">
              {isEs ? 'Rúbrica Transparente del Score (0 - 100)' : 'Food Score Rubric (0 - 100)'}
            </h3>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs
                ? 'Publicada de manera abierta con fines exclusivamente educativos. Evalúa ingredientes y calidad analítica.'
                : 'Transparent educational rubric. Evaluates ingredients and analytical composition.'}
            </p>
          </div>

          <div className="space-y-3 text-xs text-[#1C2B21]">
            <div className="p-3 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E20]">
              <span className="font-bold text-[#0B5D2E] block text-sm">
                1. Fuente de proteína identificable (+30 pts)
              </span>
              <p className="text-[#44544A] mt-1">
                {isEs
                  ? 'Carne o pescado específico deshidratado o fresco en primer ingrediente (ej. Pollo, Salmón, Pavo) vs subproductos sin especificar.'
                  : 'Named meat or fish as first ingredient vs generic byproducts.'}
              </p>
            </div>

            <div className="p-3 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E20]">
              <span className="font-bold text-[#0B5D2E] block text-sm">
                2. Nivel proteico y perfil de aminoácidos (+25 pts)
              </span>
              <p className="text-[#44544A] mt-1">
                {isEs
                  ? '≥28% para perros y ≥34% para gatos en materia seca, asegurando taurina y ácidos grasos esenciales.'
                  : 'High biological value protein meeting WSAVA/AAHA profiles.'}
              </p>
            </div>

            <div className="p-3 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E20]">
              <span className="font-bold text-[#0B5D2E] block text-sm">
                3. Fuentes de grasa y Omega-3 (+20 pts)
              </span>
              <p className="text-[#44544A] mt-1">
                {isEs
                  ? 'Aceite de salmón, grasa de pollo natural conservada con tocoferoles vs aceites genéricos o grasas hidrogenadas.'
                  : 'Named healthy fats like salmon oil or chicken fat preserved naturally.'}
              </p>
            </div>

            <div className="p-3 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E20]">
              <span className="font-bold text-[#0B5D2E] block text-sm">
                4. Fibra funcional y prebióticos (+15 pts)
              </span>
              <p className="text-[#44544A] mt-1">
                {isEs
                  ? 'Pulpa de remolacha, FOS, MOS y achicoria para microbiota intestinal equilibrada.'
                  : 'Functional prebiotic fibers supporting gut health.'}
              </p>
            </div>

            <div className="p-3 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E20]">
              <span className="font-bold text-[#0B5D2E] block text-sm">
                5. Ausencia de colorantes y conservantes sintéticos (+10 pts)
              </span>
              <p className="text-[#44544A] mt-1">
                {isEs
                  ? 'Sin BHA, BHT ni colorantes artificiales añadidos para atraer al ojo humano.'
                  : 'No synthetic food coloring or artificial antioxidants.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================= REUSED UNIFIED FOOD SEARCH MODAL (Hoy -> Ajustar) ================= */}
      <UnifiedFoodSearchModal
        isOpen={showAddFoodModal}
        onClose={() => setShowAddFoodModal(false)}
        activePet={pet}
        allPets={pets}
        plans={plans}
        lang={userAccount.language}
        category="all"
        includeArchived={true}
        titleOverride="Elegir alimento para comparar"
        onSelectFood={(selection) => {
          const picked: FoodItem = selection.sourceFoodItem
            ? {
                ...selection.sourceFoodItem,
                bagSizeKg: selection.weightKg || selection.sourceFoodItem.bagSizeKg,
              }
            : {
                id: 'catalog_cmp_' + Date.now(),
                brand: selection.brand,
                name: selection.productName,
                species: pet.species,
                lifeStage: pet.ageYears && pet.ageYears < 1 ? 'puppy' : 'adult',
                type: 'dry',
                kcalPerKg: 0,
                proteinPct: 0,
                fatPct: 0,
                fiberPct: 0,
                moisturePct: 0,
                country: 'Colombia',
                imageUrl: selection.imageUrl,
                bagSizeKg: selection.weightKg,
                availableSizesKg: selection.confirmedSizesKg,
                labelStatus: 'unconfirmed',
              };
          addOrToggleCompareFood(picked);
          setShowAddFoodModal(false);
        }}
      />
    </div>
  );
};
