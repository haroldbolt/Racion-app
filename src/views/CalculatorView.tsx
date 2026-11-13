import React, { useState, useEffect, useMemo } from 'react';
import { Pet, FoodItem, Goal, FeedingPlan, UserAccount, BreedSize } from '../types';
import { PET_FOODS_DATABASE } from '../data/foods';
import { BCSSelector } from '../components/BCSSelector';
import { FoodsView } from './FoodsView';
import {
  calculateFeedingPlan,
  buildFeedingPlan,
  CalculationInputs,
  CalculationResult,
} from '../utils/calculator';
import {
  getBreedsBySpecies,
  findBreedProfile,
  getIdealWeightForBreedAndSex,
  getBreedSizeLabel,
} from '../data/breeds';
import { formatRation, formatWeight } from '../utils/i18n';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Search,
  Sparkles,
  AlertTriangle,
  Info,
  Sliders,
  ChevronDown,
  ChevronUp,
  Camera,
  Barcode,
  Scale,
  ShieldCheck,
} from 'lucide-react';

interface CalculatorViewProps {
  pet: Pet;
  onSavePlan: (plan: FeedingPlan) => void;
  onUpdatePet?: (pet: Pet) => void;
  userAccount: UserAccount;
  onNavigateHome: () => void;
  onOpenScanner?: () => void;
}

const SIZE_OPTIONS: Array<{ id: BreedSize; es: string; en: string }> = [
  { id: 'toy', es: 'Toy', en: 'Toy' },
  { id: 'small', es: 'Pequeña', en: 'Small' },
  { id: 'medium', es: 'Mediana', en: 'Medium' },
  { id: 'large', es: 'Grande', en: 'Large' },
  { id: 'giant', es: 'Gigante', en: 'Giant' },
];

export const CalculatorView: React.FC<CalculatorViewProps> = ({
  pet,
  onSavePlan,
  onUpdatePet,
  userAccount,
  onNavigateHome,
  onOpenScanner,
}) => {
  const isEs = userAccount.language === 'es';
  const units = userAccount.units;

  // Wizard Step: 1, 2, 3, 4, 5, or 6 (Results screen)
  const [step, setStep] = useState<number>(1);

  // Form states initialized with pet data
  const [editablePet, setEditablePet] = useState<Pet>({
    ...pet,
    breedSize: pet.breedSize || findBreedProfile(pet.breed, pet.species).size,
  });
  const [breedQuery, setBreedQuery] = useState<string>('');
  const [bcs, setBcs] = useState<number>(pet.bcs || 5);
  const [goal, setGoal] = useState<Goal>(() => {
    if (pet.bcs >= 7) return 'lose';
    if (pet.bcs <= 3) return 'gain';
    if (pet.ageYears && pet.ageYears < 1) return 'growth';
    return 'maintain';
  });

  useEffect(() => {
    setEditablePet({
      ...pet,
      breedSize: pet.breedSize || findBreedProfile(pet.breed, pet.species).size,
    });
    setBcs(pet.bcs || 5);
    setBreedQuery('');
  }, [pet.id]);

  const availableBreeds = useMemo(
    () => getBreedsBySpecies(editablePet.species),
    [editablePet.species]
  );

  const filteredBreeds = useMemo(() => {
    const q = breedQuery.trim().toLowerCase();
    if (!q) return availableBreeds;
    return availableBreeds.filter((b) => b.name.toLowerCase().includes(q));
  }, [availableBreeds, breedQuery]);

  const breedWeightRef = useMemo(
    () =>
      getIdealWeightForBreedAndSex(
        editablePet.breed,
        editablePet.species,
        editablePet.sex || 'male',
        editablePet.breedSize
      ),
    [editablePet.breed, editablePet.species, editablePet.sex, editablePet.breedSize]
  );

  // Food selection states
  const [foodType, setFoodType] = useState<'dry' | 'wet' | 'mixed' | 'barf'>(
    editablePet.dietType === 'barf' ? 'barf' : 'dry'
  );
  const [dryFood, setDryFood] = useState<FoodItem | undefined>(() =>
    PET_FOODS_DATABASE.find(f => f.species === pet.species && f.type === 'dry')
  );
  const [wetFood, setWetFood] = useState<FoodItem | undefined>(() =>
    PET_FOODS_DATABASE.find(f => f.species === pet.species && f.type === 'wet')
  );
  const [mixedDryPct, setMixedDryPct] = useState<number>(50); // 50% kcal from dry, 50% from wet

  // Food search & filter
  const [foodSearchQuery, setFoodSearchQuery] = useState('');
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [showComparerModal, setShowComparerModal] = useState(false);

  // Treats mini-calculator
  const [treatsPerDay, setTreatsPerDay] = useState<number>(2);
  const [kcalPerTreat, setKcalPerTreat] = useState<number>(15);

  // Meals per day
  const [mealsPerDay, setMealsPerDay] = useState<number>(2);
  const [mealTimes, setMealTimes] = useState<string[]>(['08:00', '20:00']);

  // Manual +/- 10% adjustment
  const [manualAdjustmentPct, setManualAdjustmentPct] = useState<number>(0);
  const [manualAdjustmentReason, setManualAdjustmentReason] = useState<string>('');
  const [showFormulasDetails, setShowFormulasDetails] = useState<boolean>(false);

  // Custom food manual inputs
  const [customBrand, setCustomBrand] = useState('');
  const [customName, setCustomName] = useState('');
  const [customKcalPerKg, setCustomKcalPerKg] = useState<number>(3700);

  // Filter food database for current pet species
  const matchingFoods = PET_FOODS_DATABASE.filter(f => {
    const speciesMatch = f.species === editablePet.species;
    const searchMatch =
      f.name.toLowerCase().includes(foodSearchQuery.toLowerCase()) ||
      f.brand.toLowerCase().includes(foodSearchQuery.toLowerCase()) ||
      (f.barcode && f.barcode.includes(foodSearchQuery));
    return speciesMatch && searchMatch;
  });

  // Calculate current treats total kcal
  const totalTreatsKcal = treatsPerDay * kcalPerTreat;

  // Prepare calculation inputs
  const calculationInputs: CalculationInputs = {
    pet: editablePet,
    goal,
    bcs,
    foodType,
    dryFood,
    wetFood,
    mixedDryPct,
    mealsPerDay,
    mealTimes,
    treatsKcal: totalTreatsKcal,
    manualAdjustmentPct,
    manualAdjustmentReason,
    scheduleConfigured: true,
  };

  const result: CalculationResult = calculateFeedingPlan(calculationInputs);

  const handleNext = () => {
    if (step < 5) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Go to results step
      setStep(6);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      onNavigateHome();
    }
  };

  const handleSaveAndApply = () => {
    if (onUpdatePet) {
      onUpdatePet({ ...editablePet, bcs });
    }
    const plan = buildFeedingPlan(calculationInputs, result);
    onSavePlan(plan);
    onNavigateHome();
  };

  const handleSaveCustomFood = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    const hasValidKcal = customKcalPerKg > 400;

    const newFood: FoodItem = {
      id: 'custom_' + Date.now(),
      brand: customBrand.trim() || (isEs ? 'Marca personalizada' : 'Custom Brand'),
      name: customName.trim(),
      species: editablePet.species,
      lifeStage: (editablePet.ageYears ?? 2) < 1 ? 'puppy' : 'all',
      type: foodType === 'wet' ? 'wet' : 'dry',
      kcalPerKg: hasValidKcal ? customKcalPerKg : 0,
      proteinPct: 24,
      fatPct: 14,
      fiberPct: 3,
      moisturePct: foodType === 'wet' ? 78 : 10,
      country: isEs ? 'Etiqueta ingresada por el usuario' : 'User label entry',
      labelStatus: hasValidKcal ? 'user_confirmed_label' : 'unconfirmed',
      isCompleteAndBalanced: true,
      suitableForGrowth: (editablePet.ageYears ?? 2) < 1,
      dataSource: hasValidKcal ? 'Etiqueta confirmada por el usuario' : 'Etiqueta pendiente',
    };

    if (foodType === 'wet') {
      setWetFood(newFood);
    } else {
      setDryFood(newFood);
      if (foodType === 'barf') setFoodType('dry');
    }
    setShowAddCustomModal(false);
  };

  return (
    <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
      {/* Wizard Header with Progress Bar */}
      <div className="bg-white rounded-3xl p-4 border border-[#0B5D2E20] shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-sm font-bold text-[#0B5D2E] hover:underline min-h-[44px] px-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isEs ? 'Atrás' : 'Back'}</span>
          </button>

          <span className="font-heading font-extrabold text-sm text-[#0B5D2E]">
            {step <= 5 ? (isEs ? `Paso ${step} de 5` : `Step ${step} of 5`) : (isEs ? 'Resultado Final' : 'Final Results')}
          </span>
        </div>

        {/* Progress track */}
        <div className="w-full bg-[#EAF4EC] h-2 rounded-full overflow-hidden">
          <div
            className="bg-[#0B5D2E] h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (step / 5) * 100)}%` }}
          />
        </div>

        {/* Floating summary of previous step (Rule 3) */}
        {step > 1 && step <= 5 && (
          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-[#44544A]">
            <span>{isEs ? 'Calculando para:' : 'Calculating for:'} <strong className="text-[#1C2B21]">{editablePet.name}</strong></span>
            <span>{formatWeight(editablePet.currentWeightKg, units)} • BCS {bcs}/9</span>
          </div>
        )}
      </div>

      {/* ================= STEP 1: PET BASICS ================= */}
      {step === 1 && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4 animate-in fade-in">
          <div>
            <h2 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
              {isEs ? `1. Datos de ${editablePet.name}` : `1. Pet details for ${editablePet.name}`}
            </h2>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs
                ? 'Confirma raza, sexo, peso y edad para un cálculo metabólico exacto'
                : 'Confirm breed, sex, weight and age for exact metabolic math'}
            </p>
          </div>

          {/* Sexo: Macho / Hembra */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#1C2B21]">
              {isEs ? 'Sexo de la mascota' : 'Pet sex'}
            </label>
            <div className="grid grid-cols-2 gap-2 bg-[#EAF4EC] p-1 rounded-xl">
              <button
                type="button"
                onClick={() =>
                  setEditablePet({
                    ...editablePet,
                    sex: 'male',
                    specialState:
                      editablePet.specialState === 'pregnancy' ||
                      editablePet.specialState === 'lactation'
                        ? 'none'
                        : editablePet.specialState,
                  })
                }
                className={`py-2.5 rounded-lg text-xs font-bold transition ${
                  editablePet.sex !== 'female'
                    ? 'bg-[#0B5D2E] text-white shadow-xs'
                    : 'text-[#44544A] hover:text-[#0B5D2E]'
                }`}
              >
                {isEs ? '♂ Macho' : '♂ Male'}
              </button>
              <button
                type="button"
                onClick={() => setEditablePet({ ...editablePet, sex: 'female' })}
                className={`py-2.5 rounded-lg text-xs font-bold transition ${
                  editablePet.sex === 'female'
                    ? 'bg-[#0B5D2E] text-white shadow-xs'
                    : 'text-[#44544A] hover:text-[#0B5D2E]'
                }`}
              >
                {isEs ? '♀ Hembra' : '♀ Female'}
              </button>
            </div>
          </div>

          {/* Raza y Tamaño */}
          <div className="bg-[#F8FAF8] p-3.5 rounded-2xl border border-[#0B5D2E15] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Raza' : 'Breed'}
              </label>
              <span className="text-xs font-bold text-[#0B5D2E] truncate max-w-[200px]">
                {editablePet.breed || 'Mestizo / Mixed'}
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
                    setEditablePet({ ...editablePet, breed: e.target.value });
                  }
                }}
                placeholder={isEs ? 'Buscar raza (ej. Labrador, Poodle, Mestizo...)' : 'Search breed...'}
                className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-0.5">
              {filteredBreeds.slice(0, 8).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setEditablePet({
                      ...editablePet,
                      breed: b.name,
                      breedSize: b.size,
                    });
                    setBreedQuery('');
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                    editablePet.breed === b.name
                      ? 'bg-[#0B5D2E] text-white border-[#0B5D2E] font-bold'
                      : 'bg-white text-[#1C2B21] border-gray-200 hover:bg-[#EAF4EC]'
                  }`}
                >
                  {b.name.split('/')[0].trim()}
                </button>
              ))}
            </div>

            {editablePet.species === 'dog' && (
              <div className="pt-2 border-t border-gray-200/70 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-[#44544A]">
                    {isEs ? 'Tamaño de raza:' : 'Breed size:'}
                  </span>
                  <span className="font-semibold text-[#0B5D2E]">
                    {getBreedSizeLabel(editablePet.breedSize || 'medium', isEs ? 'es' : 'en')}
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {SIZE_OPTIONS.map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setEditablePet({ ...editablePet, breedSize: sz.id })}
                      className={`py-1.5 rounded-lg text-[10px] font-bold border transition ${
                        (editablePet.breedSize || 'medium') === sz.id
                          ? 'bg-[#0B5D2E] text-white border-[#0B5D2E]'
                          : 'bg-white text-[#44544A] border-gray-200 hover:bg-[#EAF4EC]'
                      }`}
                    >
                      {isEs ? sz.es : sz.en}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reference ideal weight for breed + sex */}
            <div className="pt-1.5 flex items-center justify-between gap-2 text-[11px] text-[#44544A]">
              <span>
                {isEs
                  ? `Peso estándar ${editablePet.breed.split('/')[0].trim()} (${editablePet.sex === 'female' ? 'Hembra' : 'Macho'}): `
                  : `Standard ${editablePet.breed.split('/')[0].trim()} (${editablePet.sex === 'female' ? 'Female' : 'Male'}): `}
                <strong className="text-[#0B5D2E]">
                  {breedWeightRef.min}–{breedWeightRef.max} kg
                </strong>
              </span>
              <button
                type="button"
                onClick={() =>
                  setEditablePet({
                    ...editablePet,
                    idealWeightKg: breedWeightRef.midpoint,
                    targetWeightKg: breedWeightRef.midpoint,
                  })
                }
                className="px-2 py-0.5 bg-white border border-[#0B5D2E30] text-[#0B5D2E] rounded-lg font-bold hover:bg-[#0B5D2E] hover:text-white transition shrink-0"
              >
                {isEs ? `Ideal ${breedWeightRef.midpoint} kg` : `Set ${breedWeightRef.midpoint} kg`}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Peso Actual (kg)' : 'Current Weight (kg)'}
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="100"
                value={editablePet.currentWeightKg}
                onChange={(e) =>
                  setEditablePet({
                    ...editablePet,
                    currentWeightKg: parseFloat(e.target.value) || 1,
                  })
                }
                className="w-full px-3 py-3 bg-[#EAF4EC]/60 border border-[#0B5D2E30] rounded-xl text-center font-extrabold text-lg text-[#0B5D2E] min-h-[48px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Peso Ideal / Meta (kg)' : 'Ideal / Target (kg)'}
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="100"
                value={editablePet.targetWeightKg || editablePet.idealWeightKg}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 1;
                  setEditablePet({
                    ...editablePet,
                    targetWeightKg: val,
                    idealWeightKg: val,
                  });
                }}
                className="w-full px-3 py-3 bg-white border border-gray-200 rounded-xl text-center font-bold text-lg text-[#1C2B21] min-h-[48px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Edad aproximada (años)' : 'Age (years)'}
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={editablePet.ageYears || 2}
                onChange={(e) =>
                  setEditablePet({
                    ...editablePet,
                    ageYears: parseFloat(e.target.value) || 1,
                  })
                }
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-center font-semibold text-sm min-h-[48px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? '¿Está castrado / esterilizado?' : 'Neutered?'}
              </label>
              <div className="grid grid-cols-2 gap-1 bg-[#EAF4EC] p-1 rounded-xl min-h-[48px] items-center">
                <button
                  type="button"
                  onClick={() => setEditablePet({ ...editablePet, isNeutered: true })}
                  className={`py-2 rounded-lg text-xs font-bold ${
                    editablePet.isNeutered ? 'bg-[#0B5D2E] text-white' : 'text-[#44544A]'
                  }`}
                >
                  {isEs ? 'Sí' : 'Yes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditablePet({ ...editablePet, isNeutered: false })}
                  className={`py-2 rounded-lg text-xs font-bold ${
                    !editablePet.isNeutered ? 'bg-[#0B5D2E] text-white' : 'text-[#44544A]'
                  }`}
                >
                  {isEs ? 'No' : 'No'}
                </button>
              </div>
            </div>
          </div>

          {/* Activity Level */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#1C2B21]">
              {isEs ? 'Nivel de actividad' : 'Activity level'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'low', label: isEs ? 'Bajo' : 'Low' },
                { id: 'moderate', label: isEs ? 'Moderado' : 'Moderate' },
                { id: 'high', label: isEs ? 'Alto' : 'High' },
              ].map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setEditablePet({ ...editablePet, activityLevel: a.id as any })}
                  className={`py-2.5 rounded-xl border text-xs font-bold min-h-[48px] ${
                    editablePet.activityLevel === a.id
                      ? 'border-[#0B5D2E] bg-[#EAF4EC] text-[#0B5D2E]'
                      : 'border-gray-200 bg-white text-[#44544A]'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleNext}
            className="w-full min-h-[52px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-base flex items-center justify-center gap-2 hover:bg-[#094723] transition active:scale-98 shadow-md mt-4"
          >
            <span>{isEs ? 'Continuar a Condición Corporal' : 'Continue to Body Condition'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ================= STEP 2: BODY CONDITION (BCS 1-9) ================= */}
      {step === 2 && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4 animate-in fade-in">
          <div>
            <h2 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
              {isEs ? '2. Condición corporal (BCS 1 a 9)' : '2. Body Condition Score (BCS)'}
            </h2>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs ? 'Compara con las fotos reales y selecciona la condición de tu mascota' : 'Compare with real photos and select your pet\'s body condition'}
            </p>
          </div>

          <BCSSelector
            species={editablePet.species}
            value={bcs}
            onChange={(val) => {
              setBcs(val);
              // Auto-suggest goal based on BCS rule: if BCS >= 7, suggest weight loss
              if (val >= 7) setGoal('lose');
              else if (val <= 3) setGoal('gain');
              else setGoal('maintain');
            }}
            lang={userAccount.language}
          />

          <button
            onClick={handleNext}
            className="w-full min-h-[52px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-base flex items-center justify-center gap-2 hover:bg-[#094723] transition active:scale-98 shadow-md"
          >
            <span>{isEs ? 'Continuar a Objetivo' : 'Continue to Weight Goal'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ================= STEP 3: GOAL ================= */}
      {step === 3 && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4 animate-in fade-in">
          <div>
            <h2 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
              {isEs ? '3. ¿Cuál es el objetivo nutricional?' : '3. What is the feeding goal?'}
            </h2>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs ? 'Ajustaremos el factor calórico según su meta' : 'We will calculate the caloric factor accordingly'}
            </p>
          </div>

          {/* If BCS is 7-9, suggest weight loss prominently (Rule Page 4) */}
          {bcs >= 7 && (
            <div className="bg-[#FFFBEB] p-3 rounded-2xl border border-[#D97706]/30 text-xs text-[#92400E] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0" />
              <span>
                {isEs
                  ? 'Con BCS ' + bcs + '/9 sugerimos Bajar de peso para cuidar sus articulaciones y corazón, pero tú decides.'
                  : 'At BCS ' + bcs + '/9 we recommend Weight Loss to protect joints and heart, but you choose.'}
              </span>
            </div>
          )}

          <div className="space-y-2.5">
            {[
              {
                id: 'maintain',
                title: isEs ? 'Mantener peso ideal' : 'Maintain ideal weight',
                desc: isEs ? 'Conservar su condición física óptima y nivel de energía.' : 'Keep current weight and steady energy.',
                badge: isEs ? 'Mantenimiento' : 'Maintenance',
              },
              {
                id: 'lose',
                title: isEs ? 'Bajar de peso saludablemente' : 'Healthy weight loss',
                desc: isEs ? 'Pérdida segura calculada sobre peso ideal (sin dietas extremas).' : 'Safe caloric reduction based on ideal weight.',
                badge: isEs ? 'Pérdida gradual' : 'Gradual loss',
              },
              {
                id: 'gain',
                title: isEs ? 'Subir de peso / Recuperación' : 'Weight gain / Recovery',
                desc: isEs ? 'Aumento controlado de masa magra sin acumulación adiposa.' : 'Lean mass recovery without excessive fat.',
                badge: isEs ? 'Ganancia' : 'Gain',
              },
              {
                id: 'growth',
                title: isEs ? 'Crecimiento (Cachorro o Gatito)' : 'Growth (Puppy or Kitten)',
                desc: isEs ? 'Altos requerimientos energéticos para cachorros en desarrollo.' : 'Higher caloric intake for puppies and kittens.',
                badge: isEs ? 'Crecimiento' : 'Growth',
              },
            ].map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGoal(g.id as Goal)}
                className={`w-full p-4 rounded-2xl border-2 text-left transition flex items-center justify-between min-h-[64px] ${
                  goal === g.id
                    ? 'border-[#0B5D2E] bg-[#EAF4EC] ring-1 ring-[#0B5D2E]'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-extrabold text-base text-[#1C2B21]">
                      {g.title}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-[#0B5D2E] border border-[#0B5D2E20]">
                      {g.badge}
                    </span>
                  </div>
                  <p className="text-xs text-[#44544A] mt-1">{g.desc}</p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ml-3 ${
                    goal === g.id ? 'border-[#0B5D2E] bg-[#0B5D2E] text-white' : 'border-gray-300'
                  }`}
                >
                  {goal === g.id && <Check className="w-3.5 h-3.5" />}
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={handleNext}
            className="w-full min-h-[52px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-base flex items-center justify-center gap-2 hover:bg-[#094723] transition active:scale-98 shadow-md"
          >
            <span>{isEs ? 'Continuar a Alimento' : 'Continue to Food'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ================= STEP 4: FOOD SELECTION & MIXED & TREATS ================= */}
      {step === 4 && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-5 animate-in fade-in">
          <div>
            <h2 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
              {isEs ? '4. Alimento y Premios' : '4. Food & Treats'}
            </h2>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs
                ? 'Elige seco, húmedo o mixto (calculado por KCAL, nunca por volumen)'
                : 'Dry, wet, or mixed feeding (calculated BY KCAL, never by volume)'}
            </p>
          </div>

          {/* Feeding Type Selector: Dry, Wet, Mixed, BARF */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'dry', label: isEs ? 'Solo Seco' : 'Dry only', icon: '🥣' },
              { id: 'wet', label: isEs ? 'Solo Húmedo' : 'Wet only', icon: '🥫' },
              { id: 'mixed', label: isEs ? 'Mixto (Mix)' : 'Mixed', icon: '✨' },
              { id: 'barf', label: isEs ? 'BARF (Cruda)' : 'BARF', icon: '🥩' },
            ].map((ft) => (
              <button
                key={ft.id}
                type="button"
                onClick={() => {
                  const nextType = ft.id as 'dry' | 'wet' | 'mixed' | 'barf';
                  setFoodType(nextType);
                  if (nextType === 'barf') {
                    setEditablePet({ ...editablePet, dietType: 'barf' });
                  } else if (editablePet.dietType === 'barf') {
                    setEditablePet({ ...editablePet, dietType: 'commercial' });
                  }
                }}
                className={`p-3 rounded-2xl border text-center transition min-h-[58px] ${
                  foodType === ft.id
                    ? 'border-[#0B5D2E] bg-[#0B5D2E] text-white font-bold shadow-xs'
                    : 'border-gray-200 bg-white text-[#1C2B21] hover:bg-gray-50'
                }`}
              >
                <div className="text-lg">{ft.icon}</div>
                <div className="text-xs font-heading font-bold">{ft.label}</div>
              </button>
            ))}
          </div>

          {foodType === 'barf' && (
            <div className="bg-[#FFFBEB] p-3.5 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <strong className="block">Dieta BARF con derivación veterinaria</strong>
              <p>
                Calculamos su requerimiento energético (MER), pero las fórmulas, cantidades crudas, manejo sanitario, huesos y transiciones deben validarse con un veterinario.
              </p>
            </div>
          )}

          {/* If Mixed feeding: KCAL slider and presets 25/75, 50/50, 75/25 (Page 4) */}
          {foodType === 'mixed' && (
            <div className="bg-[#EAF4EC] p-4 rounded-2xl border border-[#0B5D2E20] space-y-3">
              <div className="flex justify-between items-center text-xs font-bold text-[#0B5D2E]">
                <span>🥣 {isEs ? 'Seco:' : 'Dry:'} {mixedDryPct}% kcal</span>
                <span>🥫 {isEs ? 'Húmedo:' : 'Wet:'} {100 - mixedDryPct}% kcal</span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={mixedDryPct}
                onChange={(e) => setMixedDryPct(Number(e.target.value))}
                className="w-full h-3 bg-white rounded-lg appearance-none cursor-pointer accent-[#0B5D2E]"
              />

              {/* Presets 25/75, 50/50, 75/25 */}
              <div className="flex gap-2">
                {[
                  { label: '25% Seco / 75% Húmedo', dry: 25 },
                  { label: '50% / 50%', dry: 50 },
                  { label: '75% Seco / 25% Húmedo', dry: 75 },
                ].map((preset) => (
                  <button
                    key={preset.dry}
                    type="button"
                    onClick={() => setMixedDryPct(preset.dry)}
                    className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold border transition ${
                      mixedDryPct === preset.dry
                        ? 'bg-[#0B5D2E] text-white border-[#0B5D2E]'
                        : 'bg-white text-[#44544A] border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#44544A]">
                {isEs
                  ? '⚖️ La alimentación mixta se calcula estrictamente por calorías para evitar desbalances nutricionales.'
                  : '⚖️ Mixed feeding is strictly balanced by calories rather than volume.'}
              </p>
            </div>
          )}

          {/* Food Search and Database Selector */}
          <div className="space-y-3">
            {/* Comparador trigger callout */}
            <div className="bg-[#EAF4EC] p-3.5 rounded-2xl border border-[#0B5D2E25] flex items-center justify-between gap-2 shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0B5D2E] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Scale className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <span className="font-heading font-extrabold text-xs text-[#0B5D2E] block">
                    {isEs ? 'Comparador de Alimentos' : 'Food Comparer'}
                  </span>
                  <p className="text-[11px] text-[#44544A]">
                    {isEs ? 'Compara 2-3 opciones y elige la mejor para su ración' : 'Compare 2-3 options and pick the best one'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowComparerModal(true)}
                className="px-3.5 py-2 bg-[#0B5D2E] text-white rounded-xl text-xs font-heading font-extrabold hover:bg-[#094723] transition shrink-0 min-h-[44px] shadow-xs active:scale-95"
              >
                {isEs ? 'Comparar' : 'Compare'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Seleccionar alimento de la base multi-marca' : 'Select food from multi-brand database'}
              </label>
              <button
                type="button"
                onClick={() => setShowAddCustomModal(true)}
                className="text-xs font-bold text-[#0B5D2E] hover:underline"
              >
                {isEs ? '+ Alimento manual' : '+ Custom food'}
              </button>
            </div>

            {/* Search bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
              <input
                type="text"
                value={foodSearchQuery}
                onChange={(e) => setFoodSearchQuery(e.target.value)}
                placeholder={isEs ? 'Buscar por marca (Royal Canin, Pro Plan, Hills, etc.)...' : 'Search by brand...'}
                className="w-full pl-9 pr-4 py-2.5 bg-[#EAF4EC]/40 border border-gray-200 rounded-xl text-xs text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] min-h-[44px]"
              />
            </div>

            {/* Food items scroll list */}
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {matchingFoods.map((item) => {
                const isSelected =
                  (foodType === 'dry' && dryFood?.id === item.id) ||
                  (foodType === 'wet' && wetFood?.id === item.id) ||
                  (foodType === 'mixed' && (dryFood?.id === item.id || wetFood?.id === item.id));

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.type === 'wet') {
                        setWetFood(item);
                        if (foodType === 'dry') setFoodType('wet');
                      } else {
                        setDryFood(item);
                        if (foodType === 'wet') setFoodType('dry');
                      }
                    }}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                      isSelected
                        ? 'border-[#0B5D2E] bg-[#EAF4EC] font-semibold ring-1 ring-[#0B5D2E]'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div>
                      <span className="text-[11px] font-bold text-[#0B5D2E] uppercase">
                        {item.brand} ({item.type === 'wet' ? 'Húmedo' : 'Seco'})
                      </span>
                      <p className="text-xs text-[#1C2B21] font-bold leading-tight">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-[#44544A]">
                        {item.kcalPerKg} kcal/kg • Prot: {item.proteinPct}% • Grasa: {item.fatPct}%
                      </p>
                    </div>

                    <div className="text-right shrink-0 ml-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-[#0B5D2E] border border-[#0B5D2E20] font-bold">
                        Score {item.score}/100
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Treats Budget Mini-Calculator (Page 4: max 10% kcal, subtracted from food) */}
          <div className="bg-[#FFF7ED] p-4 rounded-2xl border border-[#F57C1A]/30 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-[#9A3412]">
                🍪 {isEs ? 'Presupuesto de premios (máx 10% kcal)' : 'Treats budget (max 10% kcal)'}
              </span>
              <span className="text-xs font-extrabold text-[#F57C1A]">
                {totalTreatsKcal} kcal {isEs ? 'descontadas de la comida' : 'subtracted from food'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-1">
                <label className="text-[#9A3412] font-semibold">
                  {isEs ? 'Premios al día:' : 'Treats per day:'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={treatsPerDay}
                  onChange={(e) => setTreatsPerDay(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2 bg-white border border-[#F57C1A]/30 rounded-xl text-center font-bold text-[#1C2B21]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[#9A3412] font-semibold">
                  {isEs ? 'Kcal aprox. por premio:' : 'Kcal per treat:'}
                </label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={kcalPerTreat}
                  onChange={(e) => setKcalPerTreat(Math.max(1, parseInt(e.target.value) || 15))}
                  className="w-full px-3 py-2 bg-white border border-[#F57C1A]/30 rounded-xl text-center font-bold text-[#1C2B21]"
                />
              </div>
            </div>
            <p className="text-[11px] text-[#9A3412]">
              {isEs
                ? 'ℹ️ Los premios se restan de la ración de comida, nunca se añaden por encima.'
                : 'ℹ️ Treats are subtracted from the food ration, never added on top.'}
            </p>
          </div>

          <button
            onClick={handleNext}
            className="w-full min-h-[52px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-base flex items-center justify-center gap-2 hover:bg-[#094723] transition active:scale-98 shadow-md"
          >
            <span>{isEs ? 'Continuar a Comidas al Día' : 'Continue to Meals per Day'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ================= STEP 5: MEALS PER DAY ================= */}
      {step === 5 && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-5 animate-in fade-in">
          <div>
            <h2 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
              {isEs ? '5. ¿Cuántas comidas al día?' : '5. Meals per day'}
            </h2>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs ? 'Dividiremos la ración exactamente en partes iguales' : 'We will divide the daily ration into equal portions'}
            </p>
          </div>

          {/* Meals count selector: 1, 2, 3 or 4 */}
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => {
                  setMealsPerDay(count);
                  if (count === 1) setMealTimes(['12:00']);
                  if (count === 2) setMealTimes(['08:00', '20:00']);
                  if (count === 3) setMealTimes(['08:00', '14:00', '20:00']);
                  if (count === 4) setMealTimes(['07:30', '12:00', '16:30', '20:30']);
                }}
                className={`p-3 rounded-2xl border text-center transition min-h-[64px] flex flex-col items-center justify-center ${
                  mealsPerDay === count
                    ? 'border-[#0B5D2E] bg-[#0B5D2E] text-white shadow-xs'
                    : 'border-gray-200 bg-white text-[#1C2B21] hover:bg-gray-50'
                }`}
              >
                <span className="font-heading font-black text-2xl">{count}</span>
                <span className="text-[11px] font-bold">
                  {count === 1 ? (isEs ? 'toma' : 'meal') : (isEs ? 'tomas' : 'meals')}
                </span>
              </button>
            ))}
          </div>

          {/* Meal times inputs */}
          <div className="space-y-2 pt-2">
            <label className="text-xs font-bold text-[#1C2B21]">
              {isEs ? 'Horarios sugeridos de cada comida' : 'Meal times'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: mealsPerDay }).map((_, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-[#EAF4EC] p-2.5 rounded-xl">
                  <span className="text-xs font-bold text-[#0B5D2E] shrink-0">
                    #{idx + 1}:
                  </span>
                  <input
                    type="time"
                    value={mealTimes[idx] || (idx === 0 ? '08:00' : '20:00')}
                    onChange={(e) => {
                      const updated = [...mealTimes];
                      updated[idx] = e.target.value;
                      setMealTimes(updated);
                    }}
                    className="w-full bg-white px-2 py-1 border border-gray-200 rounded-lg text-xs font-bold text-[#1C2B21]"
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleNext}
            className="w-full min-h-[52px] bg-[#F57C1A] text-white rounded-2xl font-heading font-extrabold text-lg flex items-center justify-center gap-2 hover:bg-[#e06d12] transition active:scale-98 shadow-md"
          >
            <span>{isEs ? 'Ver su plan nutricional' : 'See their nutritional plan'}</span>
            <Sparkles className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ================= STEP 6: FINAL RESULTS (THE PRODUCT HERO) ================= */}
      {step === 6 && (
        <div className="bg-white rounded-3xl p-6 border-2 border-[#0B5D2E30] shadow-lg space-y-6 animate-in zoom-in-95">
          {/* Top badge */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{editablePet.species === 'dog' ? '🐶' : '🐱'}</span>
              <div>
                <h2 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
                  {isEs ? `Plan nutricional de ${editablePet.name}` : `Feeding plan for ${editablePet.name}`}
                </h2>
                <p className="text-xs text-[#44544A]">
                  {isEs ? 'Calculado con precisión gramo por gramo' : 'Calculated gram by gram'}
                </p>
              </div>
            </div>
            <span className="bg-[#EAF4EC] text-[#0B5D2E] text-xs font-bold px-3 py-1 rounded-full border border-[#0B5D2E20]">
              NRC 2006
            </span>
          </div>

          {/* ================= HERO NUMBER: Grams per meal in largest type ================= */}
          <div className="text-center py-3 bg-[#EAF4EC]/60 rounded-3xl p-5 border border-[#0B5D2E20]">
            <span className="text-xs font-bold uppercase tracking-widest text-[#0B5D2E] block mb-1">
              {result.rationConfirmed
                ? isEs
                  ? 'Ración recomendada'
                  : 'Recommended ration'
                : isEs
                ? 'Requerimiento energético diario (MER)'
                : 'Daily energy requirement (MER)'}
            </span>
            {result.rationConfirmed ? (
              <>
                <div className="font-heading font-black text-5xl sm:text-6xl text-[#1C2B21] tracking-tight leading-none my-1 tabular-nums">
                  {formatRation(result.gramsPerMeal, units)}
                </div>
                <span className="text-lg font-bold text-[#44544A] block font-['Nunito',sans-serif]">
                  {isEs ? 'por comida' : 'per meal'}
                </span>
                <p className="text-xs font-semibold text-[#0B5D2E] mt-2">
                  {isEs
                    ? `${result.kcalPerMeal} kcal en cada una de las ${mealsPerDay} tomas del día`
                    : `${result.kcalPerMeal} kcal across ${mealsPerDay} daily meals`}
                </p>
              </>
            ) : (
              <>
                <div className="font-heading font-black text-4xl sm:text-5xl text-[#1C2B21] tracking-tight leading-none my-1 tabular-nums">
                  {result.mer} kcal/día
                </div>
                <p className="text-xs font-semibold text-amber-800 mt-2">
                  {foodType === 'barf'
                    ? 'En dieta BARF, confirma fórmulas y gramos exactos con tu médico veterinario.'
                    : 'Falta confirmar la etiqueta (kcal/kg) del alimento para expresar la ración en gramos.'}
                </p>
              </>
            )}
          </div>

          {/* Daily Breakdown: Grams/day, MER, cups/cans, treats */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[#F8FAF8] p-3 rounded-2xl border border-gray-200">
              <span className="text-[#44544A] block">{isEs ? 'Total al día:' : 'Daily total:'}</span>
              <span className="font-heading font-black text-xl text-[#1C2B21] tabular-nums">
                {result.rationConfirmed ? formatRation(result.gramsPerDay, units) : 'Etiqueta pendiente'}
              </span>
              <span className="text-[11px] text-[#0B5D2E] block font-semibold mt-0.5">
                {result.foodMerKcal} kcal en comida
              </span>
            </div>

            <div className="bg-[#F8FAF8] p-3 rounded-2xl border border-gray-200">
              <span className="text-[#44544A] block">
                {result.cupsPerDay ? (isEs ? 'Medida en tazas:' : 'Cups per day:') : (result.cansPerDay ? (isEs ? 'Medida en latas:' : 'Cans per day:') : (isEs ? 'Energía total:' : 'Total energy:'))}
              </span>
              <span className="font-heading font-black text-xl text-[#1C2B21] tabular-nums">
                {result.cupsPerDay ? `${result.cupsPerDay} tazas` : (result.cansPerDay ? `${result.cansPerDay} latas` : `${result.mer} kcal`)}
              </span>
              <span className="text-[11px] text-[#44544A] block mt-0.5">
                {result.treatsBudgetKcal > 0
                  ? (isEs ? `Premios: máx ${result.treatsBudgetKcal} kcal` : `Treats: max ${result.treatsBudgetKcal} kcal`)
                  : (isEs ? 'Premios bajo pauta veterinaria' : 'Treats per vet advice')}
              </span>
            </div>
          </div>

          {/* Mixed breakdown if mixed */}
          {foodType === 'mixed' && (
            <div className="bg-[#EAF4EC] p-3.5 rounded-2xl border border-[#0B5D2E20] text-xs space-y-1">
              <span className="font-bold text-[#0B5D2E] block">
                {isEs ? 'Detalle de porción mixta por comida:' : 'Mixed portion detail per meal:'}
              </span>
              <div className="flex justify-between text-[#1C2B21] font-semibold">
                <span>🥣 {isEs ? 'Seco:' : 'Dry:'} {result.dryGramsPerMeal} g ({mixedDryPct}%)</span>
                <span>🥫 {isEs ? 'Húmedo:' : 'Wet:'} {result.wetGramsPerMeal} g ({100 - mixedDryPct}%)</span>
              </div>
            </div>
          )}

          {/* Cat hepatic lipidosis warning (Page 4) */}
          {result.catHepaticLipidosisWarning && (
            <div className="bg-[#FEF2F2] p-3.5 rounded-2xl border border-[#C0392B]/30 text-xs text-[#991B1B] space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-[#C0392B]" />
                {isEs ? 'Aviso médico de seguridad para gatos:' : 'Critical safety notice for cats:'}
              </span>
              <p>
                {isEs
                  ? '¡Nunca sometas a un gato a una dieta relámpago o ayuno estricto! El descenso abrupto desencadena lipidosis hepática, una emergencia médica potencialmente mortal. La pérdida de peso segura debe ser gradual (máximo 0.5% a 2% de su peso a la semana).'
                  : 'Never subject a cat to a crash diet. Rapid weight reduction triggers hepatic lipidosis, a life-threatening emergency. Weight loss must be gradual (0.5% - 2% weekly).'}
              </p>
            </div>
          )}

          {/* Safe loss pace */}
          {goal === 'lose' && result.safeLossRateKgPerWeek && (
            <div className="bg-[#F0FDF4] p-3 rounded-2xl border border-[#1E8A49]/30 text-xs text-[#166534] flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#1E8A49] shrink-0" />
              <span>
                {isEs
                  ? `Ritmo seguro semanal: de ${result.safeLossRateKgPerWeek.min} kg a ${result.safeLossRateKgPerWeek.max} kg por semana.`
                  : `Safe weight loss rate: ${result.safeLossRateKgPerWeek.min} kg to ${result.safeLossRateKgPerWeek.max} kg per week.`}
              </span>
            </div>
          )}

          {/* Manual +/- 10% adjustment slider (Page 4) */}
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-[#1C2B21]">
              <span>{isEs ? 'Ajuste manual individual (+/- 10%)' : 'Manual adjustment (+/- 10%)'}</span>
              <span className="text-[#0B5D2E]">
                {manualAdjustmentPct > 0 ? `+${manualAdjustmentPct}%` : `${manualAdjustmentPct}%`}
              </span>
            </div>
            <input
              type="range"
              min="-10"
              max="10"
              step="1"
              value={manualAdjustmentPct}
              onChange={(e) => setManualAdjustmentPct(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0B5D2E]"
            />
            <p className="text-[11px] text-[#44544A]">
              {isEs
                ? 'Permite compensar si notas que tu mascota pierde o gana peso más rápido debido a su metabolismo particular o clima.'
                : 'Compensates if pet gains or loses weight faster due to specific individual metabolism or winter/summer climate.'}
            </p>
          </div>

          {/* Collapsible Formulas (Page 4: "FORMULAS - SHOW THEM, DO NOT HIDE THEM") */}
          <div className="border border-gray-200 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowFormulasDetails(!showFormulasDetails)}
              className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between text-xs font-bold text-[#0B5D2E] hover:bg-gray-100 transition min-h-[44px]"
            >
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4" />
                <span>{isEs ? 'Ver fórmulas científicas aplicadas (NRC 2006)' : 'View scientific formulas applied (NRC 2006)'}</span>
              </div>
              {showFormulasDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showFormulasDetails && (
              <div className="p-4 bg-white text-xs text-[#1C2B21] space-y-2 border-t border-gray-200 font-mono">
                <p>
                  <strong>RER = 70 × (peso en kg)^0.75</strong>
                  <br />
                  = 70 × ({result.weightUsedKg})^0.75 = <strong>{result.rer} kcal/día</strong>
                </p>
                <p>
                  <strong>MER = RER × Factor ({result.factor})</strong>
                  <br />
                  {result.factorExplanation}
                  <br />= <strong>{result.mer} kcal/día</strong>
                </p>
                <div className="bg-[#EAF4EC]/70 p-2.5 rounded-xl font-sans text-[11px] space-y-1 text-[#1C2B21]">
                  <div>
                    <strong>{isEs ? 'Perfil sexual / reproductivo:' : 'Sex & reproductive factor:'}</strong>{' '}
                    {result.sexAdjustmentNote} ({isEs ? 'Base' : 'Base'}: {result.baseFactor})
                  </div>
                  <div>
                    <strong>{isEs ? 'Perfil metabólico de raza:' : 'Breed metabolic profile:'}</strong>{' '}
                    {result.breedAdjustmentNote}
                  </div>
                  <div>
                    <strong>{isEs ? 'Rango de peso ideal de referencia:' : 'Reference ideal weight range:'}</strong>{' '}
                    {result.idealWeightRangeKg[0]}–{result.idealWeightRangeKg[1]} kg
                  </div>
                </div>
                <p className="text-[#44544A] font-sans">
                  {isEs
                    ? 'En animales con sobrepeso, el cálculo se ejecuta sobre el peso objetivo/ideal para evitar sobreestimar las calorías de mantenimiento.'
                    : 'In overweight pets, calculations use ideal weight to avoid caloric overestimation.'}
                </p>
              </div>
            )}
          </div>

          {/* Legal and Educational Disclaimer (Page 2, 4, 14) */}
          <p className="text-[11px] text-[#44544A] bg-[#EAF4EC] p-3 rounded-2xl border border-[#0B5D2E15] leading-relaxed">
            <span className="font-bold text-[#0B5D2E] block mb-0.5">
              ⚖️ {isEs ? 'Aviso médico educativo:' : 'Veterinary educational notice:'}
            </span>
            {isEs
              ? 'Ración App es una guía educativa de alimentación basada en NRC 2006, WSAVA y AAHA. No diagnostica, no prescribe dietas terapéuticas y no sustituye al veterinario.'
              : 'Ración App is an educational feeding guide based on NRC 2006, WSAVA and AAHA. It does not diagnose, prescribe therapeutic diets or replace a licensed veterinarian.'}
          </p>

          {/* Primary Action Button: Guardar este plan (Rule 1, 4) */}
          <button
            onClick={handleSaveAndApply}
            className="w-full min-h-[52px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-lg flex items-center justify-center gap-2 hover:bg-[#094723] transition active:scale-98 shadow-md"
          >
            <Check className="w-5 h-5 stroke-[3]" />
            <span>{isEs ? 'Guardar este plan' : 'Save this plan'}</span>
          </button>
        </div>
      )}

      {/* Modal: Add custom food manually */}
      {showAddCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveCustomFood}
            className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-[#0B5D2E20]"
          >
            <h3 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
              {isEs ? 'Agregar Alimento desde Etiqueta' : 'Add Food from Label'}
            </h3>
            <p className="text-xs text-[#44544A]">
              {isEs ? 'Ingresa los datos impresos en el envase' : 'Enter data printed on bag'}
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Marca' : 'Brand'}
              </label>
              <input
                type="text"
                required
                value={customBrand}
                onChange={(e) => setCustomBrand(e.target.value)}
                placeholder="Ej. Mi Marca Favorita"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Nombre del producto' : 'Product name'}
              </label>
              <input
                type="text"
                required
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Ej. Adulto Pollo y Arroz"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Energía metabolizable (kcal/kg)' : 'Metabolizable energy (kcal/kg)'}
              </label>
              <input
                type="number"
                required
                min="500"
                max="6000"
                value={customKcalPerKg}
                onChange={(e) => setCustomKcalPerKg(parseInt(e.target.value) || 3600)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddCustomModal(false)}
                className="flex-1 py-3 bg-gray-100 rounded-xl text-xs font-bold text-[#44544A]"
              >
                {isEs ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold"
              >
                {isEs ? 'Guardar' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Comparer Modal overlay */}
      {showComparerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 shadow-2xl relative border border-[#0B5D2E20] flex flex-col">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100 mb-2">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-[#0B5D2E]" />
                <h3 className="font-heading font-extrabold text-sm text-[#0B5D2E]">
                  {isEs ? 'Comparar Alimentos para el Cálculo' : 'Compare Foods for Calculation'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowComparerModal(false)}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <FoodsView
                pet={editablePet}
                merTargetKcal={result?.mer || Math.round(70 * Math.pow(editablePet.currentWeightKg || 10, 0.75) * 1.6)}
                userAccount={userAccount}
                initialSubTab="compare"
                onSelectFoodForPet={(food) => {
                  if (foodType === 'wet') {
                    setWetFood(food);
                  } else {
                    setDryFood(food);
                  }
                  setShowComparerModal(false);
                }}
                onClose={() => setShowComparerModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
