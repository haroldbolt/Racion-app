import React, { useState, useMemo, useEffect } from 'react';
import {
  Pet,
  FoodItem,
  UserAccount,
  FeedingPlan,
  NutrientQualifier,
} from '../types';
import { PET_FOODS_DATABASE } from '../data/foods';
import { TOXIC_FOODS } from '../data/toxicFoods';
import { StorageService } from '../utils/storage';
import { formatRation } from '../utils/i18n';
import { FoodCostTracker } from '../components/FoodCostTracker';
import { FoodLabelComposition } from '../components/FoodLabelComposition';
import { LabelReviewModal } from '../components/LabelReviewModal';
import { OnlineFoodSearch } from '../components/OnlineFoodSearch';
import { mergeFoodCatalog } from '../data/foodPresentations';
import { UnifiedFoodSearchModal } from '../components/UnifiedFoodSearchModal';
import {
  loadShopifyCatalog,
  getCatalogStats,
  shopifyProductToFoodItem,
} from '../services/shopifyCatalogService';
import { calculateFoodPortionNutrients, getEffectiveNutrientField } from '../utils/mealNutrition';
import { getFoodKcalPerKg } from '../utils/mealPortions';
import {
  Scale,
  Search,
  Layers,
  Check,
  Plus,
  X,
  ShieldAlert,
  ArrowRight,
  Award,
  DollarSign,
  ExternalLink,
} from 'lucide-react';

function formatQualifierBadge(q?: NutrientQualifier): string {
  if (q === 'minimo') return 'Mín.';
  if (q === 'maximo') return 'Máx.';
  if (q === 'tipico') return 'Típico';
  return '';
}

function asSoldAmount(nutrient: { grams?: number; qualifier?: NutrientQualifier } | undefined) {
  return nutrient?.grams === undefined
    ? undefined
    : { valor: nutrient.grams, calificador: nutrient.qualifier };
}

type FoodsSubTab = 'compare' | 'costs' | 'search' | 'library' | 'toxic' | 'rubric';

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
  onComparePrices?: (food: FoodItem) => void;
  onPlanUpdate?: (updatedPlan: Partial<FeedingPlan>) => void;
  onClose?: () => void;
  initialSubTab?: FoodsSubTab;
}

export const FoodsView: React.FC<FoodsViewProps> = ({
  pet,
  pets = [],
  plans = {},
  merTargetKcal,
  userAccount,
  plan,
  onSelectFoodForPet,
  onComparePrices,
  onPlanUpdate,
  initialSubTab = 'compare',
}) => {
  const isEs = userAccount.language === 'es';
  const units = userAccount.units;

  const [activeSubTab, setActiveSubTab] = useState<FoodsSubTab>(initialSubTab);
  const [customFoods, setCustomFoods] = useState(() => StorageService.getCustomFoods());
  const [labelDraft, setLabelDraft] = useState<{ food?: FoodItem } | null>(null);
  const showingLibrary = activeSubTab === 'library';

  // Sync when initialSubTab changes from external navigation (e.g. from TodayView)
  React.useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Search & filter for Catalog
  const [query, setQuery] = useState('');
  const [searchSource, setSearchSource] = useState<'catalog' | 'internet'>('catalog');
  const [filterType, setFilterType] = useState<'all' | 'dry' | 'wet'>('all');

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

  // The public catalog keeps its own entries; personal fichas can use the same product name.
  const catalogFoods = useMemo(() => {
    return mergeFoodCatalog([
      ...PET_FOODS_DATABASE,
      ...shopifyFoods.filter((f) => f.estadoCatalogo !== 'archivado'),
      ...shopifyFoods.filter((f) => f.estadoCatalogo === 'archivado'),
    ]);
  }, [shopifyFoods]);
  const allFoods = useMemo(() => [...customFoods, ...catalogFoods], [customFoods, catalogFoods]);

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
  useEffect(() => {
    setSelectedCompareFoods(initialCompareFoods);
  }, [pet.id]);

  // Reuse UnifiedFoodSearchModal from Hoy -> Ajustar
  const [showAddFoodModal, setShowAddFoodModal] = useState(false);

  // Toast / feedback state
  const [selectedToast, setSelectedToast] = useState<string | null>(null);

  // Toxic item search
  const [toxicQuery, setToxicQuery] = useState('');

  // Catalog filtered list (prioritizes active items, limits display to 80 for smooth rendering)
  const filteredFoods = useMemo(() => {
    const source = showingLibrary ? customFoods : catalogFoods;
    const matches = source.filter((f) => {
      if (f.species !== pet.species) return false;
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
  }, [catalogFoods, customFoods, showingLibrary, filterType, query, pet.species]);

  const addOrToggleCompareFood = (food: FoodItem) => {
    const existsIdx = selectedCompareFoods.findIndex((f) => f.id === food.id);
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

  const saveLibraryFood = (food: FoodItem) => {
    setCustomFoods(StorageService.getCustomFoods());
    setSelectedCompareFoods((previous) => previous.map((item) => item.id === food.id ? food : item));
    setQuery('');
    setFilterType('all');
    setActiveSubTab('library');
  };

  const handleSelectAndToast = (food: FoodItem) => {
    onSelectFoodForPet(food);
    setSelectedToast(isEs ? `¡${food.brand} ${food.name} seleccionado!` : `${food.brand} ${food.name} selected!`);
    setTimeout(() => setSelectedToast(null), 3000);
  };

  // Compute standardized 100 g "tal como se vende" AND per-portion comparison metrics WITHOUT fabricating missing data
  const mealsPerDay = Math.max(1, plan?.mealsPerDay || 2);
  const comparedFoodsData = useMemo(() => {
    return selectedCompareFoods.map((food) => {
      const reference = calculateFoodPortionNutrients(food, 100);
      const kcalField = getEffectiveNutrientField(food, 'kcalPerKg');
      const kcalPerKg = getFoodKcalPerKg(food);
      const kcalPer100g = kcalPerKg === undefined ? null : Math.round(kcalPerKg / 10);
      const protField = asSoldAmount(reference.proteina);
      const fatField = asSoldAmount(reference.grasa);
      const fiberField = asSoldAmount(reference.fibra);
      const moistField = asSoldAmount(reference.humedad);
      const ashField = asSoldAmount(reference.cenizas);
      const carbsField = asSoldAmount(reference.carbohidratos);
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
      };
    });
  }, [selectedCompareFoods, merTargetKcal, mealsPerDay]);

  return (
    <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
      {/* Toast Notification */}
      {selectedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0B5D2E] text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4 text-[#86EFAC]" />
          <span>{selectedToast}</span>
        </div>
      )}

      {/* Subtab navigation */}
      <div className="flex bg-[#EAF4EC] p-1 rounded-2xl overflow-x-auto scrollbar-none gap-1 border border-[#0B5D2E15]">
        {([
          { id: 'compare', label: isEs ? 'Comparar otros alimentos' : 'Compare other foods', icon: Scale },
          { id: 'costs', label: isEs ? 'Gastos ($ COP)' : 'Food Costs ($ COP)', icon: DollarSign },
          { id: 'search', label: isEs ? 'Catálogo' : 'Catalog', icon: Search },
          { id: 'library', label: isEs ? 'Mis alimentos' : 'My foods', icon: Layers },
          { id: 'toxic', label: isEs ? 'Alimentos Tóxicos' : 'Toxic Foods', icon: ShieldAlert },
          { id: 'rubric', label: isEs ? 'Rúbrica' : 'Rubric', icon: Award },
        ] satisfies { id: FoodsSubTab; label: string; icon: typeof Scale }[]).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
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

      {/* ================= SUBTAB 1: COMPARAR OTROS ALIMENTOS (LOCAL) ================= */}
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
                  {isEs ? 'Comparar alimentos' : 'Compare foods'}
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

            {/* Selected foods */}
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

          </div>

          {/* Empty or single-selection guidance */}
          {selectedCompareFoods.length < 2 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-[#0B5D2E20] shadow-sm space-y-3">
              <Layers className="w-12 h-12 text-[#0B5D2E40] mx-auto" />
              <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
                Selecciona al menos 2 alimentos para comparar
              </h4>
              <p className="text-xs text-[#44544A] max-w-sm mx-auto">
                Elige dos o tres fórmulas del catálogo. La comparación se actualiza al agregar o quitar un alimento.
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
                } = item;
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
                          {(food.empaqueTipo === 'fraccionado' || food.empaqueTipo === 'fabrica') && (
                            <span className="text-[10px] bg-gray-100 text-[#44544A] font-semibold px-2 py-0.5 rounded-full">
                              {food.empaqueTipo === 'fraccionado' ? 'Venta fraccionada' : 'Empaque de fábrica'}
                            </span>
                          )}
                          {food.estadoCatalogo === 'archivado' && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                              Archivado
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

                    {/* Section 1: Base común 100 g de producto tal como se vende */}
                    <div className="bg-[#F8FAF8] p-3.5 rounded-2xl border border-gray-200 space-y-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B5D2E] block">
                        Por cada 100 g de producto tal como se vende
                      </span>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                          <span className="text-[10px] text-[#44544A] block">Energía</span>
                          {kcalPer100g !== null ? (
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
                            {portionNutrients.carbohidratos?.available && <p>• {portionNutrients.carbohidratos.displayText}</p>}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-amber-900">
                          <strong>Sin dato verificado de kcal/kg:</strong> completa o verifica las calorías de la etiqueta para estimar los gramos por porción para {pet.name}.
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

                    <button
                      type="button"
                      onClick={() => handleSelectAndToast(food)}
                      className="w-full min-h-[42px] py-2 px-3 bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-xs hover:bg-[#094723] transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>{isEs ? `Elegir para ${pet.name}` : `Select for ${pet.name}`}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= SUBTAB: FOOD COSTS TRACKER & RECEIPTS ($ COP) ================= */}
      {activeSubTab === 'costs' && (
        <FoodCostTracker
          key={pet.id}
          pet={pet}
          plan={plan}
          userAccount={userAccount}
          onPlanUpdate={onPlanUpdate}
        />
      )}

      {/* ================= SUBTAB 2: CATALOG & SEARCH ================= */}
      {(activeSubTab === 'search' || showingLibrary) && (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-4 border border-[#0B5D2E20] shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-heading text-base font-extrabold text-[#1C2B21]">
                {showingLibrary ? (isEs ? 'Mis alimentos' : 'My foods') : (isEs ? 'Catálogo' : 'Catalog')}
              </h3>
              <button
                type="button"
                onClick={() => setLabelDraft({})}
                className="flex min-h-11 items-center gap-1 rounded-xl bg-[#EAF4EC] px-3 text-xs font-bold text-[#0B5D2E]"
              >
                <Plus className="size-4" />
                {isEs ? 'Agregar alimento' : 'Add food'}
              </button>
            </div>
            {!showingLibrary && (
              <div role="group" aria-label={isEs ? 'Origen del alimento' : 'Food source'} className="flex gap-1 rounded-xl bg-[#EAF4EC] p-1">
                {(['catalog', 'internet'] as const).map((source) => (
                  <button
                    key={source}
                    type="button"
                    aria-pressed={searchSource === source}
                    onClick={() => setSearchSource(source)}
                    className={`min-h-11 rounded-lg px-3 text-xs font-bold ${searchSource === source ? 'bg-white text-[#0B5D2E] shadow-xs' : 'text-[#44544A]'}`}
                  >
                    {source === 'internet' ? 'Internet' : (isEs ? 'Catálogo guardado' : 'Saved catalog')}
                  </button>
                ))}
              </div>
            )}
            {searchSource === 'internet' && !showingLibrary ? (
              <OnlineFoodSearch
                species={pet.species}
                foodType={filterType === 'all' ? undefined : filterType}
                initialQuery={query}
                lang={userAccount.language}
                onSelect={(food) => setLabelDraft({ food })}
              />
            ) : <>
            {!showingLibrary && catalogStats && (
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
                aria-label={isEs ? 'Buscar alimento' : 'Search foods'}
                placeholder={isEs ? 'Buscar por marca, fórmula o EAN' : 'Search by brand, formula or EAN'}
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
            </>}
            {searchSource === 'internet' && !showingLibrary && (
              <div role="group" aria-label={isEs ? 'Tipo de alimento' : 'Food type'} className="flex gap-1.5">
                {(['all', 'dry', 'wet'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={filterType === type}
                    onClick={() => setFilterType(type)}
                    className={`min-h-11 rounded-lg border px-3 text-xs font-bold ${filterType === type ? 'bg-[#0B5D2E] text-white' : 'bg-white text-[#44544A]'}`}
                  >
                    {type === 'all' ? (isEs ? 'Todos' : 'All') : type === 'dry' ? (isEs ? 'Seco' : 'Dry') : (isEs ? 'Húmedo' : 'Wet')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Foods list (slice first 60 matches for snappy DOM) */}
          {(showingLibrary || searchSource === 'catalog') && <div className="space-y-3">
            {filteredFoods.length === 0 && (
              <p className="rounded-2xl bg-white p-4 text-sm text-[#44544A]">
                {showingLibrary && !query
                  ? (isEs ? 'Guarda una etiqueta para reutilizar su ficha en las raciones.' : 'Save a food label to reuse it in feeding plans.')
                  : (isEs ? 'No hay alimentos que coincidan con la búsqueda.' : 'No foods match your search.')}
              </p>
            )}
            {filteredFoods.slice(0, 60).map((f) => {
              const kcalPerKg = getFoodKcalPerKg(f);
              const gramsPerDay = kcalPerKg && merTargetKcal > 0 ? Math.round(merTargetKcal * 1000 / kcalPerKg) : undefined;
              const isSelectedForCompare = selectedCompareFoods.some((sf) => sf.id === f.id);

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
                      {(f.country || f.barcode) && (
                        <p className="text-xs text-[#44544A] mt-0.5">{f.country} {f.barcode && `EAN: ${f.barcode}`}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E20]">
                        {showingLibrary ? (isEs ? 'Ficha personal' : 'Personal entry') : (isEs ? 'Catálogo' : 'Catalog')}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-gray-100 bg-[#F8FAF8] p-3 text-xs">
                    <div className="flex flex-wrap justify-between gap-2 text-[#44544A]">
                      <span>{kcalPerKg ? `${kcalPerKg} kcal/kg` : (isEs ? 'Energía sin dato' : 'Energy unavailable')}</span>
                      {gramsPerDay !== undefined && (
                        <span>{pet.name} · {formatRation(gramsPerDay, units)} {isEs ? 'al día' : 'per day'}</span>
                      )}
                    </div>
                    <FoodLabelComposition food={f} language={userAccount.language} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {showingLibrary && (
                      <button type="button" onClick={() => setLabelDraft({ food: f })} className="min-h-11 rounded-xl border border-gray-200 px-3 text-xs font-bold text-[#0B5D2E]">
                        {isEs ? 'Editar ficha' : 'Edit food'}
                      </button>
                    )}
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

                    {onComparePrices && f.type !== 'barf' && !f.kcalPerPiece && (
                      <button
                        type="button"
                        onClick={() => onComparePrices(f)}
                        className="min-h-11 rounded-xl border border-[#0B5D2E30] px-3 text-xs font-bold text-[#0B5D2E]"
                      >
                        {isEs ? 'Ver precios' : 'See prices'}
                      </button>
                    )}
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
          </div>}
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

      <LabelReviewModal
        isOpen={labelDraft !== null}
        onClose={() => setLabelDraft(null)}
        pet={pet}
        initialFood={labelDraft?.food}
        mode={labelDraft?.food ? 'review' : 'new'}
        onSaveLabel={saveLibraryFood}
        lang={userAccount.language}
      />

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
