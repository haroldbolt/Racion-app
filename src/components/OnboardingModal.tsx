import React, { useState, useEffect, useMemo } from 'react';
import { Pet, Species, FoodItem, Sex, BreedSize, DietType, SpecialState } from '../types';
import {
  ArrowRight,
  ArrowLeft,
  LogIn,
  Search,
  Loader2,
  X,
  Package,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Edit3,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import {
  loadShopifyCatalog,
  searchShopifyCatalog,
  parseVariantWeight,
} from '../services/shopifyCatalogService.ts';
import {
  getBreedsBySpecies,
  findBreedProfile,
  getIdealWeightForBreedAndSex,
} from '../data/breeds.ts';
import { PET_FOODS_DATABASE } from '../data/foods.ts';

export interface OnboardingPetData extends Partial<Pet> {
  selectedFood?: Partial<FoodItem>;
  foodEntryMode?: 'catalog' | 'manual' | 'barf';
}

interface OnboardingModalProps {
  isOpen: boolean;
  onFinish: (newPet?: OnboardingPetData) => void;
  lang?: 'es' | 'en';
}

interface CatalogSuggestion {
  id: string;
  brand: string;
  productName: string;
  imageUrl?: string;
  sizesKg: number[];
  source: 'verified' | 'catalog';
  foodItem?: FoodItem;
}

const MEDICAL_OPTIONS: Array<{
  id: string;
  label: string;
  specialState: SpecialState;
  isVetDiet?: boolean;
}> = [
  { id: 'none', label: 'Ninguna conocida', specialState: 'none' },
  { id: 'vet_diet', label: 'Dieta veterinaria', specialState: 'none', isVetDiet: true },
  { id: 'allergy', label: 'Alergia / intolerancia', specialState: 'allergy' },
  { id: 'kidney', label: 'Renal / urinaria', specialState: 'kidney', isVetDiet: true },
  { id: 'diabetes', label: 'Diabetes / pancreatitis', specialState: 'diabetes', isVetDiet: true },
  { id: 'other', label: 'Otra restricción', specialState: 'none' },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onFinish,
  lang = 'es',
}) => {
  const isEs = lang === 'es';
  const { user, openAuthModal } = useAuth();

  // 2-step onboarding flow
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 fields
  const [species, setSpecies] = useState<Species>('dog');
  const [petName, setPetName] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [isNeutered, setIsNeutered] = useState<boolean>(false);
  const [breed, setBreed] = useState<string>('Mestizo / No sé');
  const [breedQuery, setBreedQuery] = useState<string>('');
  const [breedSize, setBreedSize] = useState<BreedSize>('medium');
  const [ageValue, setAgeValue] = useState<string>('1');
  const [ageUnit, setAgeUnit] = useState<'years' | 'months'>('years');
  const [currentWeightKg, setCurrentWeightKg] = useState<string>('12');
  const [hasCustomWeight, setHasCustomWeight] = useState<boolean>(false);
  const [selectedMedicalIds, setSelectedMedicalIds] = useState<string[]>(['none']);
  const [restrictionNotes, setRestrictionNotes] = useState<string>('');

  // Step 2 fields: habitual food
  const [foodMode, setFoodMode] = useState<'catalog' | 'manual' | 'barf'>('catalog');
  const [foodQuery, setFoodQuery] = useState('');
  const [isSearchingFood, setIsSearchingFood] = useState(false);
  const [foodSuggestions, setFoodSuggestions] = useState<CatalogSuggestion[]>([]);
  const [selectedFood, setSelectedFood] = useState<{
    id: string;
    brand: string;
    name: string;
    imageUrl?: string;
    bagSizeKg: number;
    availableSizesKg: number[];
    foodItem?: FoodItem;
    isVerified: boolean;
  } | null>(null);

  // Manual food entry
  const [manualBrand, setManualBrand] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualType, setManualType] = useState<'dry' | 'wet'>('dry');
  const [manualBagSizeKg, setManualBagSizeKg] = useState('2');
  const [manualKcalPerKg, setManualKcalPerKg] = useState('');
  const [barfNotes, setBarfNotes] = useState('');

  const availableBreeds = useMemo(() => getBreedsBySpecies(species), [species]);

  const filteredBreeds = useMemo(() => {
    const q = breedQuery.trim().toLowerCase();
    if (!q) return availableBreeds;
    return availableBreeds.filter((b) => b.name.toLowerCase().includes(q));
  }, [availableBreeds, breedQuery]);

  const breedWeightRef = useMemo(
    () => getIdealWeightForBreedAndSex(breed, species, sex, breedSize),
    [breed, species, sex, breedSize]
  );

  // Sync suggested weight only when user hasn't typed their own
  useEffect(() => {
    if (!hasCustomWeight) {
      setCurrentWeightKg(String(breedWeightRef.midpoint));
    }
  }, [breedWeightRef.midpoint, hasCustomWeight]);

  // Search local verified database + Shopify catalog
  useEffect(() => {
    if (step !== 2 || foodMode !== 'catalog') return;
    const trimmed = foodQuery.trim();
    if (!trimmed) {
      // Show top verified options as quick starter
      const starter: CatalogSuggestion[] = PET_FOODS_DATABASE.filter((f) => f.species === species)
        .slice(0, 4)
        .map((f) => ({
          id: f.id,
          brand: f.brand,
          productName: f.name,
          imageUrl: f.imageUrl,
          sizesKg: f.availableSizesKg || (f.bagSizeKg ? [f.bagSizeKg] : [3, 15]),
          source: 'verified',
          foodItem: f,
        }));
      setFoodSuggestions(starter);
      setIsSearchingFood(false);
      return;
    }

    let isMounted = true;
    setIsSearchingFood(true);

    const timer = setTimeout(async () => {
      try {
        const results: CatalogSuggestion[] = [];
        const tokens = trimmed
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean);

        // 1. Verified manufacturer foods first
        for (const f of PET_FOODS_DATABASE) {
          if (f.species !== species) continue;
          const hay = `${f.brand} ${f.name} ${f.lifeStage}`
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
          if (tokens.every((t) => hay.includes(t))) {
            results.push({
              id: f.id,
              brand: f.brand,
              productName: f.name,
              imageUrl: f.imageUrl,
              sizesKg: f.availableSizesKg || (f.bagSizeKg ? [f.bagSizeKg] : [3, 15]),
              source: 'verified',
              foodItem: f,
            });
          }
        }

        // 2. Shopify catalog (name, image, presentation only — unconfirmed kcal/label)
        try {
          const catalog = await loadShopifyCatalog();
          const localMatches = searchShopifyCatalog(catalog, {
            query: trimmed,
            species,
            category: 'main',
            limit: 8,
          });

          for (const item of localMatches) {
            const already = results.some(
              (r) =>
                r.brand.toLowerCase() === item.marca.toLowerCase() &&
                r.productName.toLowerCase() === item.nombre.toLowerCase()
            );
            if (already) continue;

            const sizes: number[] = [];
            for (const v of item.presentaciones) {
              const p = parseVariantWeight(v.nombre);
              if (p.kg && !sizes.includes(p.kg)) {
                sizes.push(p.kg);
              }
            }
            results.push({
              id: item.id,
              brand: item.marca,
              productName: item.nombre,
              imageUrl: item.foto_url || undefined,
              sizesKg: sizes.length > 0 ? sizes.sort((a, b) => a - b) : [1, 2, 15],
              source: 'catalog',
            });
          }
        } catch {
          // ignore catalog load failure
        }

        if (isMounted) {
          setFoodSuggestions(results.slice(0, 8));
          setIsSearchingFood(false);
        }
      } catch {
        if (isMounted) setIsSearchingFood(false);
      }
    }, 180);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [foodQuery, species, step, foodMode]);

  if (!isOpen) return null;

  const handleSpeciesChange = (nextSpecies: Species) => {
    setSpecies(nextSpecies);
    const defaultBreed = nextSpecies === 'dog' ? 'Mestizo / No sé' : 'Mestizo / Criollo / Mixed';
    setBreed(defaultBreed);
    setBreedSize('medium');
    setBreedQuery('');
    setHasCustomWeight(false);
    setSelectedFood(null);
  };

  const handleSelectBreed = (breedName: string) => {
    setBreed(breedName);
    setBreedQuery('');
    const profile = findBreedProfile(breedName, species);
    setBreedSize(profile.size);
    setHasCustomWeight(false);
  };

  const toggleMedicalOption = (id: string) => {
    if (id === 'none') {
      setSelectedMedicalIds(['none']);
      return;
    }
    const withoutNone = selectedMedicalIds.filter((m) => m !== 'none');
    if (withoutNone.includes(id)) {
      const next = withoutNone.filter((m) => m !== id);
      setSelectedMedicalIds(next.length > 0 ? next : ['none']);
    } else {
      setSelectedMedicalIds([...withoutNone, id]);
    }
  };

  const computedAgeYears = useMemo(() => {
    const num = parseFloat(ageValue);
    if (!Number.isFinite(num) || num <= 0) return 1;
    return ageUnit === 'months' ? Number((num / 12).toFixed(2)) : num;
  }, [ageValue, ageUnit]);

  const computedAgeMonths = useMemo(() => {
    const num = parseFloat(ageValue);
    if (!Number.isFinite(num) || num <= 0) return 12;
    return ageUnit === 'months' ? Math.round(num) : Math.round(num * 12);
  }, [ageValue, ageUnit]);

  const handleGoToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!petName.trim()) return;
    setStep(2);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();

    const finalName = petName.trim() || (species === 'dog' ? 'Milo' : 'Luna');
    const parsedWeight = parseFloat(currentWeightKg);
    const finalWeight =
      Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : breedWeightRef.midpoint;
    const finalBreed =
      breed.trim() || (species === 'dog' ? 'Mestizo / No sé' : 'Mestizo / Criollo / Mixed');

    const activeMedical = selectedMedicalIds.filter((m) => m !== 'none');
    const hasVetDiet =
      activeMedical.includes('vet_diet') ||
      activeMedical.includes('kidney') ||
      activeMedical.includes('diabetes');

    let specialState: SpecialState = 'none';
    if (activeMedical.includes('kidney')) specialState = 'kidney';
    else if (activeMedical.includes('diabetes')) specialState = 'diabetes';
    else if (activeMedical.includes('allergy')) specialState = 'allergy';

    const dietType: DietType =
      foodMode === 'barf' ? 'barf' : hasVetDiet ? 'therapeutic' : 'commercial';

    let foodPayload: Partial<FoodItem> | undefined;

    if (foodMode === 'barf') {
      foodPayload = {
        id: 'barf_' + Date.now(),
        brand: 'BARF',
        name: 'Dieta Natural Cruda (BARF)',
        species,
        lifeStage: computedAgeYears < 1 ? 'puppy' : 'adult',
        type: 'barf',
        kcalPerKg: 0,
        labelStatus: 'unconfirmed',
        formulaNotes: barfNotes.trim() || undefined,
      };
    } else if (foodMode === 'manual') {
      const parsedKcal = parseFloat(manualKcalPerKg.replace(',', '.'));
      const hasKcal = Number.isFinite(parsedKcal) && parsedKcal > 400;
      const bagKg = parseFloat(manualBagSizeKg.replace(',', '.')) || undefined;
      foodPayload = {
        id: 'manual_' + Date.now(),
        brand: manualBrand.trim() || 'Manual',
        name: manualName.trim() || 'Alimento habitual',
        species,
        lifeStage: computedAgeYears < 1 ? 'puppy' : 'adult',
        type: manualType,
        kcalPerKg: hasKcal ? parsedKcal : 0,
        bagSizeKg: bagKg,
        labelStatus: hasKcal ? 'user_confirmed_label' : 'unconfirmed',
        dataSource: hasKcal ? 'Etiqueta ingresada por el usuario' : 'Pendiente por confirmar etiqueta',
      };
    } else if (selectedFood) {
      if (selectedFood.foodItem && selectedFood.isVerified) {
        foodPayload = {
          ...selectedFood.foodItem,
          bagSizeKg: selectedFood.bagSizeKg,
          availableSizesKg: selectedFood.availableSizesKg,
          labelStatus: 'verified_manufacturer',
        };
      } else {
        // Catalog item: provides name, image and presentation, but label/kcalPerKg still unconfirmed!
        foodPayload = {
          id: selectedFood.id,
          brand: selectedFood.brand,
          name: selectedFood.name,
          species,
          lifeStage: computedAgeYears < 1 ? 'puppy' : 'adult',
          type: 'dry',
          kcalPerKg: 0,
          bagSizeKg: selectedFood.bagSizeKg,
          availableSizesKg: selectedFood.availableSizesKg,
          imageUrl: selectedFood.imageUrl,
          labelStatus: 'unconfirmed',
          dataSource: 'Catálogo (falta confirmar etiqueta)',
        };
      }
    } else if (foodQuery.trim()) {
      // User typed a food name directly without clicking a card
      foodPayload = {
        id: 'manual_query_' + Date.now(),
        brand: 'Por confirmar',
        name: foodQuery.trim(),
        species,
        lifeStage: computedAgeYears < 1 ? 'puppy' : 'adult',
        type: 'dry',
        kcalPerKg: 0,
        labelStatus: 'unconfirmed',
        dataSource: 'Pendiente por confirmar etiqueta',
      };
    }

    onFinish({
      name: finalName,
      species,
      breed: finalBreed,
      breedSize,
      sex,
      isNeutered,
      ageYears: computedAgeYears,
      ageMonths: computedAgeMonths,
      currentWeightKg: finalWeight,
      idealWeightKg: finalWeight,
      targetWeightKg: finalWeight,
      dietType,
      specialState,
      restrictions: activeMedical,
      restrictionNotes: restrictionNotes.trim() || (foodMode === 'barf' ? barfNotes.trim() : '') || undefined,
      profileRefinementPending: {
        adultWeight: /mestizo|no s[eé]|mixed/i.test(finalBreed) || computedAgeYears < 1,
        activity: true,
        bcs: true,
      },
      selectedFood: foodPayload,
      foodEntryMode: foodMode,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[94dvh] flex flex-col shadow-2xl border border-[#0B5D2E20] overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between gap-2 shrink-0 bg-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#0B5D2E] overflow-hidden flex items-center justify-center shrink-0">
              <img
                src="/assets/aistudio/Racio_n_App__Nutricio_n_con_carin_o_8fb59a2d.png"
                alt="Ración App"
                className="w-full h-full object-cover scale-130"
              />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B5D2E] block">
                {isEs ? `Paso ${step} de 2 · Guía personalizada` : `Step ${step} of 2`}
              </span>
              <h1 className="font-heading font-extrabold text-lg text-[#1C2B21] truncate leading-tight">
                {step === 1
                  ? isEs
                    ? 'Datos de tu perro'
                    : 'Your pet basics'
                  : isEs
                  ? `Alimento habitual de ${petName || 'tu perro'}`
                  : 'Current food'}
              </h1>
            </div>
          </div>

          {!user && (
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="text-xs font-bold text-[#0B5D2E] hover:bg-[#EAF4EC] px-2.5 py-2 rounded-xl border border-[#0B5D2E25] flex items-center gap-1 shrink-0 min-h-[40px]"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{isEs ? 'Entrar' : 'Log in'}</span>
            </button>
          )}
        </div>

        {/* 2-Step Progress Bar */}
        <div className="px-5 pt-2.5 bg-white shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <div className="h-1.5 rounded-full bg-[#0B5D2E]" />
            <div className={`h-1.5 rounded-full transition-colors ${step === 2 ? 'bg-[#0B5D2E]' : 'bg-[#EAF4EC]'}`} />
          </div>
        </div>

        {/* Step 1: Name, Breed or "Mestizo / No sé", Age, Weight, Medical/Vet Diet Question */}
        {step === 1 && (
          <form onSubmit={handleGoToStep2} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Species quick toggle (Perro primary) */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSpeciesChange('dog')}
                className={`min-h-[46px] rounded-xl border-2 font-heading font-extrabold text-sm flex items-center justify-center gap-2 transition ${
                  species === 'dog'
                    ? 'border-[#0B5D2E] bg-[#EAF4EC] text-[#0B5D2E]'
                    : 'border-gray-200 bg-white text-[#44544A]'
                }`}
              >
                <span>🐶</span>
                <span>{isEs ? 'Perro' : 'Dog'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleSpeciesChange('cat')}
                className={`min-h-[46px] rounded-xl border-2 font-heading font-extrabold text-sm flex items-center justify-center gap-2 transition ${
                  species === 'cat'
                    ? 'border-[#0B5D2E] bg-[#EAF4EC] text-[#0B5D2E]'
                    : 'border-gray-200 bg-white text-[#44544A]'
                }`}
              >
                <span>🐱</span>
                <span>{isEs ? 'Gato' : 'Cat'}</span>
              </button>
            </div>

            {/* Name */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Nombre *' : 'Name *'}
              </label>
              <input
                type="text"
                required
                value={petName}
                onChange={(e) => setPetName(e.target.value)}
                placeholder={species === 'dog' ? 'Ej. Milo, Toby, Kira' : 'Ej. Luna, Misi'}
                className="w-full px-3.5 py-2.5 bg-[#F8FAF8] border border-[#0B5D2E30] rounded-xl text-sm font-bold text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] focus:outline-none min-h-[46px]"
              />
            </div>

            {/* Sex & Neutered */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1C2B21]">
                  {isEs ? 'Sexo' : 'Sex'}
                </label>
                <div className="grid grid-cols-2 gap-1 bg-[#EAF4EC] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSex('male')}
                    className={`py-2 rounded-lg text-xs font-bold transition min-h-[38px] ${
                      sex === 'male' ? 'bg-[#0B5D2E] text-white' : 'text-[#44544A]'
                    }`}
                  >
                    {isEs ? '♂ Macho' : '♂ Male'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSex('female')}
                    className={`py-2 rounded-lg text-xs font-bold transition min-h-[38px] ${
                      sex === 'female' ? 'bg-[#0B5D2E] text-white' : 'text-[#44544A]'
                    }`}
                  >
                    {isEs ? '♀ Hembra' : '♀ Female'}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1C2B21]">
                  {isEs ? '¿Esterilizado/a?' : 'Neutered?'}
                </label>
                <div className="grid grid-cols-2 gap-1 bg-[#EAF4EC] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setIsNeutered(true)}
                    className={`py-2 rounded-lg text-xs font-bold transition min-h-[38px] ${
                      isNeutered ? 'bg-[#0B5D2E] text-white' : 'text-[#44544A]'
                    }`}
                  >
                    {isEs ? 'Sí' : 'Yes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNeutered(false)}
                    className={`py-2 rounded-lg text-xs font-bold transition min-h-[38px] ${
                      !isNeutered ? 'bg-[#0B5D2E] text-white' : 'text-[#44544A]'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
            </div>

            {/* Breed or "Mestizo / No sé" */}
            <div className="space-y-2 bg-[#F8FAF8] p-3.5 rounded-2xl border border-[#0B5D2E15]">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-[#1C2B21]">
                  {isEs ? 'Raza o «Mestizo / No sé»' : 'Breed or Mixed / Unknown'}
                </label>
                <span className="text-xs font-extrabold text-[#0B5D2E] truncate max-w-[175px]">
                  {breed}
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={breedQuery}
                  onChange={(e) => {
                    setBreedQuery(e.target.value);
                    if (e.target.value.trim().length > 1) {
                      setBreed(e.target.value);
                    }
                  }}
                  placeholder={isEs ? 'Buscar raza (ej. Pomerania, Labrador...)' : 'Search breed...'}
                  className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] focus:outline-none min-h-[40px]"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {filteredBreeds.slice(0, 8).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectBreed(b.name)}
                    className={`text-xs px-2.5 py-1.5 rounded-xl border transition min-h-[34px] ${
                      breed === b.name
                        ? 'bg-[#0B5D2E] text-white border-[#0B5D2E] font-bold'
                        : 'bg-white text-[#1C2B21] border-gray-200 hover:bg-[#EAF4EC]'
                    }`}
                  >
                    {b.name === 'Mestizo / No sé' ? 'Mestizo / No sé' : b.name.split('/')[0].trim()}
                  </button>
                ))}
              </div>
            </div>

            {/* Age (years or months) + Current Weight */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1C2B21]">
                  {isEs ? 'Edad *' : 'Age *'}
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="300"
                    required
                    value={ageValue}
                    onChange={(e) => setAgeValue(e.target.value)}
                    className="w-20 px-2 py-2.5 bg-white border border-gray-200 rounded-xl text-center font-bold text-sm text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] outline-none min-h-[46px] tabular-nums"
                  />
                  <select
                    value={ageUnit}
                    onChange={(e) => {
                      const nextUnit = e.target.value as 'years' | 'months';
                      setAgeUnit(nextUnit);
                      if (nextUnit === 'months' && parseFloat(ageValue) <= 2) {
                        setAgeValue('4');
                      } else if (nextUnit === 'years' && parseFloat(ageValue) > 20) {
                        setAgeValue('2');
                      }
                    }}
                    className="flex-1 px-2 py-2.5 bg-[#EAF4EC] border border-[#0B5D2E25] rounded-xl text-xs font-bold text-[#0B5D2E] outline-none min-h-[46px]"
                  >
                    <option value="months">{isEs ? 'meses' : 'months'}</option>
                    <option value="years">{isEs ? 'años' : 'years'}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1C2B21]">
                  {isEs ? 'Peso actual (kg) *' : 'Current weight (kg) *'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.4"
                  max="100"
                  required
                  value={currentWeightKg}
                  onChange={(e) => {
                    setHasCustomWeight(true);
                    setCurrentWeightKg(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 bg-white border border-[#0B5D2E30] rounded-xl text-center font-extrabold text-sm text-[#0B5D2E] focus:ring-2 focus:ring-[#0B5D2E] outline-none min-h-[46px] tabular-nums"
                />
              </div>
            </div>

            {/* Brief clinical question: veterinary diet, medical condition, or known restrictions */}
            <div className="space-y-2 bg-[#F8FAF8] p-3.5 rounded-2xl border border-[#0B5D2E15]">
              <label className="text-xs font-bold text-[#1C2B21] block">
                {isEs
                  ? '¿Tiene dieta veterinaria, condición médica o restricciones conocidas?'
                  : 'Veterinary diet, medical condition, or known restrictions?'}
              </label>

              <div className="flex flex-wrap gap-1.5">
                {MEDICAL_OPTIONS.map((opt) => {
                  const active = selectedMedicalIds.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleMedicalOption(opt.id)}
                      className={`text-xs px-2.5 py-1.5 rounded-xl border transition min-h-[36px] ${
                        active
                          ? 'bg-[#0B5D2E] text-white border-[#0B5D2E] font-bold'
                          : 'bg-white text-[#44544A] border-gray-200 hover:bg-[#EAF4EC]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {!selectedMedicalIds.includes('none') && (
                <input
                  type="text"
                  value={restrictionNotes}
                  onChange={(e) => setRestrictionNotes(e.target.value)}
                  placeholder={
                    isEs
                      ? 'Ej. Alergia al pollo, fórmula renal prescrita, sin cereales...'
                      : 'e.g. Chicken allergy, prescribed renal diet...'
                  }
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] outline-none min-h-[42px]"
                />
              )}
            </div>

            <p className="text-[11px] text-[#44544A] leading-relaxed">
              {isEs
                ? 'El peso adulto esperado, el nivel de actividad y la condición corporal los podrás completar después si ayudan a afinar su guía.'
                : 'Expected adult weight, activity level, and body condition can be added later to refine guidance.'}
            </p>

            <button
              type="submit"
              className="w-full min-h-[50px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-base flex items-center justify-center gap-2 hover:bg-[#094723] transition shadow-md"
            >
              <span>{isEs ? 'Continuar al alimento habitual' : 'Continue to habitual food'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        )}

        {/* Step 2: Habitual Food (Catalog Search, Manual Entry, or BARF) */}
        {step === 2 && (
          <form onSubmit={handleSaveProfile} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Compact summary strip */}
            <div className="flex items-center justify-between bg-[#F8FAF8] px-3 py-2 rounded-xl border border-gray-200 text-xs">
              <span className="text-[#44544A] truncate">
                <strong className="text-[#1C2B21]">{petName || 'Mascota'}</strong> · {breed.split('/')[0].trim()} ·{' '}
                {ageUnit === 'months' ? `${computedAgeMonths} meses` : `${computedAgeYears} años`} · {currentWeightKg} kg
              </span>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-[#0B5D2E] font-bold flex items-center gap-1 shrink-0 ml-2 hover:underline"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{isEs ? 'Editar' : 'Back'}</span>
              </button>
            </div>

            {/* Entry mode selector */}
            <div className="grid grid-cols-3 gap-1.5 bg-[#EAF4EC] p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setFoodMode('catalog')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition min-h-[42px] ${
                  foodMode === 'catalog' ? 'bg-[#0B5D2E] text-white shadow-xs' : 'text-[#44544A]'
                }`}
              >
                {isEs ? 'Catálogo' : 'Catalog'}
              </button>
              <button
                type="button"
                onClick={() => setFoodMode('manual')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition min-h-[42px] ${
                  foodMode === 'manual' ? 'bg-[#0B5D2E] text-white shadow-xs' : 'text-[#44544A]'
                }`}
              >
                {isEs ? 'Manual' : 'Manual'}
              </button>
              <button
                type="button"
                onClick={() => setFoodMode('barf')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition min-h-[42px] ${
                  foodMode === 'barf' ? 'bg-[#0B5D2E] text-white shadow-xs' : 'text-[#44544A]'
                }`}
              >
                {isEs ? 'Ya doy BARF' : 'BARF diet'}
              </button>
            </div>

            {/* Mode 1: Search Catalog */}
            {foodMode === 'catalog' && (
              <div className="space-y-3">
                {selectedFood ? (
                  <div className="p-3.5 bg-[#EAF4EC] border-2 border-[#0B5D2E] rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-white p-1 border border-[#0B5D2E20] shrink-0 flex items-center justify-center overflow-hidden">
                          {selectedFood.imageUrl ? (
                            <img
                              src={selectedFood.imageUrl}
                              alt={selectedFood.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <Package className="w-5 h-5 text-[#0B5D2E]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[11px] font-bold text-[#0B5D2E] uppercase block">
                            {selectedFood.brand} · {selectedFood.bagSizeKg} kg
                          </span>
                          <p className="text-sm font-extrabold text-[#1C2B21] truncate">
                            {selectedFood.name}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedFood(null)}
                        className="text-xs font-bold text-[#0B5D2E] px-2.5 py-1.5 bg-white rounded-xl border border-[#0B5D2E30] shrink-0"
                      >
                        {isEs ? 'Cambiar' : 'Change'}
                      </button>
                    </div>

                    {selectedFood.isVerified ? (
                      <div className="text-xs text-[#0B5D2E] flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Ficha técnica verificada ({selectedFood.foodItem?.kcalPerKg} kcal/kg)</span>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <span>
                          El catálogo aporta nombre e imagen. Al abrir su guía te pediremos confirmar la etiqueta del reverso para calcular la ración exacta.
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={foodQuery}
                        onChange={(e) => setFoodQuery(e.target.value)}
                        placeholder={
                          isEs
                            ? 'Buscar (ej. Ringo Cachorros, Royal Canin, Agility Gold...)'
                            : 'Search food...'
                        }
                        className="w-full pl-10 pr-9 py-2.5 text-xs font-semibold bg-[#F8FAF8] border border-gray-200 rounded-xl focus:bg-white focus:border-[#0B5D2E] focus:ring-2 focus:ring-[#0B5D2E]/20 outline-none min-h-[46px]"
                      />
                      {isSearchingFood ? (
                        <Loader2 className="w-4 h-4 text-[#0B5D2E] animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                      ) : foodQuery ? (
                        <button
                          type="button"
                          onClick={() => setFoodQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>

                    <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
                      {foodSuggestions.map((item) => (
                        <div
                          key={item.id}
                          className="p-2.5 bg-white rounded-2xl border border-gray-200 hover:border-[#0B5D2E] transition flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 p-0.5 border border-gray-200 shrink-0 flex items-center justify-center overflow-hidden">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.productName}
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <Package className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="text-[11px] font-bold text-[#0B5D2E] block truncate">
                                {item.brand} ·{' '}
                                {item.source === 'verified' ? 'Ficha verificada' : 'Catálogo (etiqueta pendiente)'}
                              </span>
                              <p className="text-xs font-bold text-[#1C2B21] truncate">
                                {item.productName}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {item.sizesKg.slice(0, 2).map((size) => (
                              <button
                                key={size}
                                type="button"
                                onClick={() => {
                                  setSelectedFood({
                                    id: item.id,
                                    brand: item.brand,
                                    name: item.productName,
                                    imageUrl: item.imageUrl,
                                    bagSizeKg: size,
                                    availableSizesKg: item.sizesKg,
                                    foodItem: item.foodItem,
                                    isVerified: item.source === 'verified',
                                  });
                                }}
                                className="px-2.5 py-1.5 bg-[#EAF4EC] hover:bg-[#0B5D2E] text-[#0B5D2E] hover:text-white rounded-lg text-xs font-bold min-h-[36px]"
                              >
                                {size} kg
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      {foodSuggestions.length === 0 && !isSearchingFood && (
                        <div className="p-3 bg-[#F8FAF8] rounded-xl border border-gray-200 text-xs text-[#44544A] flex items-center justify-between gap-2">
                          <span>¿No aparece en el catálogo?</span>
                          <button
                            type="button"
                            onClick={() => {
                              setManualName(foodQuery);
                              setFoodMode('manual');
                            }}
                            className="text-[#0B5D2E] font-bold hover:underline flex items-center gap-1 shrink-0"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Ingresar manual</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mode 2: Manual Food Entry */}
            {foodMode === 'manual' && (
              <div className="space-y-3 bg-[#F8FAF8] p-3.5 rounded-2xl border border-gray-200">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#1C2B21]">
                    {isEs ? 'Nombre del alimento *' : 'Food name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Ej. Ringo Cachorros, Chunky Adulto..."
                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] outline-none min-h-[44px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1C2B21]">
                      {isEs ? 'Marca (opcional)' : 'Brand (optional)'}
                    </label>
                    <input
                      type="text"
                      value={manualBrand}
                      onChange={(e) => setManualBrand(e.target.value)}
                      placeholder="Ej. Ringo"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-[#1C2B21] min-h-[42px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1C2B21]">
                      {isEs ? 'Formato' : 'Format'}
                    </label>
                    <select
                      value={manualType}
                      onChange={(e) => setManualType(e.target.value as 'dry' | 'wet')}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#1C2B21] min-h-[42px]"
                    >
                      <option value="dry">Seco (croquetas)</option>
                      <option value="wet">Húmedo (lata/sobre)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1C2B21]">
                      {isEs ? 'Presentación (kg)' : 'Bag weight (kg)'}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={manualBagSizeKg}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^[0-9]*([.,][0-9]*)?$/.test(val)) {
                          setManualBagSizeKg(val);
                        }
                      }}
                      placeholder="Ej. 1.5"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#1C2B21] min-h-[42px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1C2B21]">
                      {isEs ? 'Kcal/kg etiqueta (opcional)' : 'Label kcal/kg (optional)'}
                    </label>
                    <input
                      type="number"
                      min="500"
                      max="6000"
                      value={manualKcalPerKg}
                      onChange={(e) => setManualKcalPerKg(e.target.value)}
                      placeholder="Completar después"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-[#1C2B21] min-h-[42px]"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-[#44544A]">
                  Si no tienes el dato de kcal/kg a la mano, déjalo vacío y confirma la etiqueta con foto dentro de su guía.
                </p>
              </div>
            )}

            {/* Mode 3: BARF */}
            {foodMode === 'barf' && (
              <div className="space-y-2.5 bg-[#FFFBEB] p-3.5 rounded-2xl border border-amber-200">
                <div className="flex items-start gap-2 text-xs text-amber-900">
                  <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="font-semibold leading-relaxed">
                    Registraremos dieta BARF. Dentro de la guía verás recomendaciones sobre contaminación, huesos y equilibrio nutricional, con derivación veterinaria para fórmulas y cantidades.
                  </p>
                </div>
                <textarea
                  rows={2}
                  value={barfNotes}
                  onChange={(e) => setBarfNotes(e.target.value)}
                  placeholder="Opcional: marca BARF comercial o indicaciones actuales de tu veterinario..."
                  className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs text-[#1C2B21] outline-none"
                />
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 min-h-[50px] bg-gray-100 hover:bg-gray-200 text-[#1C2B21] rounded-2xl font-bold text-sm"
              >
                {isEs ? 'Atrás' : 'Back'}
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[50px] bg-[#F57C1A] text-white rounded-2xl font-heading font-extrabold text-base flex items-center justify-center gap-2 hover:bg-[#e06d12] transition shadow-md"
              >
                <span>{isEs ? 'Guardar y abrir su guía' : 'Save & open guide'}</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
