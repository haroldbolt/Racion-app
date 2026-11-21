import React, { useState, useEffect } from 'react';
import { Pet, FeedingPlan, MealLog, WeightRecord, HealthLog, UserAccount, FoodItem, FoodPriceBasis, VetGuideline, MealMixedComponent } from './types';
import { localDateKey } from './utils/localDate';
import { StorageService } from './utils/storage';
import { Header } from './components/Header';
import { BottomNav, TabId } from './components/BottomNav';
import { TodayView } from './views/TodayView';
import { PetsView } from './views/PetsView';
import { CalculatorView } from './views/CalculatorView';
import { ProgressView } from './views/ProgressView';
import { MoreView } from './views/MoreView';
import { FoodsView } from './views/FoodsView';
import { PriceComparisonView } from './views/PriceComparisonView';
import { PetModal } from './components/PetModal';
import { NotificationsCenterModal } from './components/NotificationsCenterModal';
import {
  recalculatePlanForPet,
  determineFactor,
} from './utils/calculator';
import { getEffectiveFoodItem, hasConfirmedLabel } from './utils/feedingGuide';
import { withPlanCosts } from './utils/foodCosts';
import { previewFoodChoice } from './utils/offerPlan';
import { PlanChangePreview } from './components/PlanChangePreview';
import { getPlanSafetyNotices } from './utils/foodSafety';

type PriceSelection = {
  food: FoodItem;
  packageKg?: number;
  returnTo: 'today' | 'compare' | 'more';
};

export default function App() {
  // Primary reactive state
  const [pets, setPets] = useState<Pet[]>(() => {
    StorageService.initialize();
    return StorageService.getPets();
  });
  const [activePetId, setActivePetId] = useState<string>(() => StorageService.getActivePetId());
  const [plans, setPlans] = useState<Record<string, FeedingPlan>>(() => StorageService.getPlans());
  const [userAccount, setUserAccount] = useState<UserAccount>(() => StorageService.getUserAccount());

  // Active Tab
  const [currentTab, setCurrentTab] = useState<TabId>('today');
  const [priceSelection, setPriceSelection] = useState<PriceSelection>();
  const [calculatorSelection, setCalculatorSelection] = useState<{ petId: string; food: FoodItem }>();

  const [planChoice, setPlanChoice] = useState<{ pet: Pet; plan: FeedingPlan }>();
  const isEs = userAccount.language === 'es';

  // Logs for active pet
  const [mealLogs, setMealLogs] = useState<MealLog[]>(() => StorageService.getTodayMealLogs(activePetId));
  const [weightRecords, setWeightRecords] = useState<WeightRecord[]>(() => StorageService.getWeightRecords(activePetId));
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>(() => StorageService.getHealthLogs(activePetId));

  const [showPetModal, setShowPetModal] = useState(false);
  const [petToEdit, setPetToEdit] = useState<Pet | null>(null);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [diaryDay, setDiaryDay] = useState(localDateKey);

  useEffect(() => {
    // Re-read the browser's calendar on resume and when an open diary passes midnight.
    const refreshDay = () => setDiaryDay(localDateKey());
    const interval = window.setInterval(refreshDay, 1000);
    document.addEventListener('visibilitychange', refreshDay);
    window.addEventListener('focus', refreshDay);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshDay);
      window.removeEventListener('focus', refreshDay);
    };
  }, []);

  // Sync visual theme (claro / oscuro) globally to html and document attributes
  useEffect(() => {
    const isDark = userAccount.theme === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [userAccount.theme]);

  // Sync logs when active pet changes
  useEffect(() => {
    if (activePetId) {
      StorageService.setActivePetId(activePetId);
      setWeightRecords(StorageService.getWeightRecords(activePetId));
      setHealthLogs(StorageService.getHealthLogs(activePetId));
    }
  }, [activePetId]);

  useEffect(() => {
    setMealLogs(StorageService.getTodayMealLogs(activePetId));
  }, [activePetId, diaryDay]);

  const activePet = pets.find((p) => p.id === activePetId) || pets[0];
  const activePlan = activePet ? plans[activePet.id] : undefined;
  const habitualFood = activePlan?.isVetLocked ? undefined : getEffectiveFoodItem(activePlan);

  const openPriceComparison = (returnTo: PriceSelection['returnTo'], food = habitualFood) => {
    if (!food || food.type === 'barf' || food.kcalPerPiece) return;
    const packageKg = food.bagSizeKg ?? (food.id === habitualFood?.id ? activePlan?.bagWeightKg : undefined);
    setPriceSelection({ food, packageKg, returnTo });
    setCurrentTab('prices');
    window.scrollTo(0, 0);
  };

  const selectPetFromHeader = (id: string) => {
    if (currentTab === 'prices' && id !== activePet?.id) setCurrentTab('today');
    setPlanChoice(undefined);
    setActivePetId(id);
  };

  // Meal toggle handler
  const handleToggleMeal = (
    mealIndex: number,
    fedBy: string,
    grams: number,
    time: string,
    plannedGrams?: number,
    forceComplete?: boolean,
    mixedComponents?: MealMixedComponent[],
    gramsEaten?: number
  ) => {
    if (!activePet) return;
    StorageService.toggleMealCompleted(
      activePet.id,
      mealIndex,
      fedBy,
      grams,
      time,
      plannedGrams,
      forceComplete,
      mixedComponents,
      gramsEaten
    );
    setDiaryDay(localDateKey());
    setMealLogs(StorageService.getTodayMealLogs(activePet.id));
  };

  const handleAddWeightRecord = (record: WeightRecord) => {
    const changedWeight = StorageService.addWeightRecord(record);
    setWeightRecords(StorageService.getWeightRecords(record.petId));
    setPets(StorageService.getPets());
    return changedWeight;
  };

  // Add health event
  const handleAddHealthLog = (log: HealthLog) => {
    StorageService.addHealthLog(log);
    setHealthLogs(StorageService.getHealthLogs(log.petId));
  };

  // Save feeding plan
  const handleSavePlan = (plan: FeedingPlan) => {
    StorageService.savePlan(plan);
    setPlans(StorageService.getPlans());
    setCalculatorSelection(undefined);
    setCurrentTab('today');
  };

  const handleUpdatePlanRation = (updatedPlan: FeedingPlan) => {
    if (updatedPlan.petId !== activePet?.id || activePlan?.isVetLocked) return;
    StorageService.savePlan(updatedPlan);
    setPlans(StorageService.getPlans());
  };

  // Update plan details (e.g. food cost in COP, bag days remaining)
  const handleUpdatePlanDetails = (patch: Partial<FeedingPlan>) => {
    if (!activePet || !activePlan) return;
    const updatedPlan: FeedingPlan = {
      ...activePlan,
      ...patch,
    };
    StorageService.savePlan(updatedPlan);
    setPlans(StorageService.getPlans());
  };

  // Update pet profile silently (from Calculator Step 1 before saving new plan)
  const handleUpdatePetProfile = (updatedPet: Pet) => {
    const updatedPets = pets.map((p) => (p.id === updatedPet.id ? updatedPet : p));
    setPets(updatedPets);
    StorageService.savePets(updatedPets);
  };

  // Save pet (new or edit)
  const handleSavePet = (savedPet: Pet) => {
    const existingIdx = pets.findIndex((p) => p.id === savedPet.id);
    let updatedPets: Pet[] = [];
    if (existingIdx >= 0) {
      updatedPets = [...pets];
      updatedPets[existingIdx] = savedPet;
    } else {
      updatedPets = [...pets, savedPet];
    }
    setPets(updatedPets);
    StorageService.savePets(updatedPets);
    setActivePetId(savedPet.id);
    setShowPetModal(false);
    setPetToEdit(null);
    if (existingIdx < 0) setCurrentTab('calculate');

    // Recalculate active feeding plan when breed, sex, neutered status, weight, or age changes
    const existingPlan = plans[savedPet.id];
    if (existingPlan && !existingPlan.isVetLocked) {
      const recalculated = recalculatePlanForPet(savedPet, existingPlan);
      StorageService.savePlan(recalculated);
      setPlans(StorageService.getPlans());
    }

  };

  const handleUpdateAccount = (updated: Partial<UserAccount>) => {
    const nextAccount = { ...userAccount, ...updated };
    setUserAccount(nextAccount);
    StorageService.saveUserAccount(nextAccount);
  };

  // Update vet guideline lock
  const handleUpdateVetGuideline = (guideline: VetGuideline | undefined) => {
    if (!activePet) return;
    const updatedPets = pets.map((p) => {
      if (p.id === activePet.id) {
        return {
          ...p,
          hasVetGuideline: !!guideline,
          vetGuideline: guideline,
        };
      }
      return p;
    });
    setPets(updatedPets);
    StorageService.savePets(updatedPets);

    const updatedPet = updatedPets.find((pet) => pet.id === activePet.id);
    if (activePlan && updatedPet) {
      const previousFood = getEffectiveFoodItem(activePlan);
      const recalculated = recalculatePlanForPet(updatedPet, {
        ...activePlan,
        isVetLocked: false,
        foodName: previousFood?.name || activePlan.foodName,
        foodBrand: previousFood?.brand || activePlan.foodBrand,
      });
      StorageService.savePlan(recalculated);
      setPlans(StorageService.getPlans());
    }
  };

  // Use food for pet from Catalog / Comparer / Alternatives
  const handleSelectFoodForPet = (food: FoodItem, price?: FoodPriceBasis) => {
    if (!activePet || food.species !== activePet.species) return;

    // Respect locked vet plan: do not overwrite if locked
    if (activePlan?.isVetLocked || activePet.vetGuideline?.locked) {
      setCurrentTab('today');
      return;
    }

    const normalizedFood: FoodItem = { ...food,
      labelStatus: food.labelStatus || (hasConfirmedLabel(food) ? 'verified_manufacturer' : 'unconfirmed'),
    };
    const effectivePet = activePet.dietType === 'barf' && food.type !== 'barf'
      ? { ...activePet, dietType: 'commercial' as const } : activePet;
    const proposed = activePlan && previewFoodChoice(effectivePet, activePlan, normalizedFood, price);
    if (!proposed || !proposed.rationConfirmed) {
      setCalculatorSelection({ petId: activePet.id, food: normalizedFood });
      setCurrentTab('calculate');
      return;
    }
    setPlanChoice({ pet: effectivePet, plan: proposed });
  };

  const handleUsePrice = (food: FoodItem, basis: FoodPriceBasis) => {
    handleSelectFoodForPet({ ...food, priceBasis: basis, bagSizeKg: basis.packageKg,
      barcode: food.bagSizeKg === basis.packageKg ? food.barcode : undefined }, basis);
  };

  // Reset all data
  const handleResetAllData = () => {
    StorageService.clearAllData();
    setPets(StorageService.getPets());
    setActivePetId(StorageService.getActivePetId());
    setPlans(StorageService.getPlans());
    setCalculatorSelection(undefined);
    setPriceSelection(undefined);
    setMealLogs([]);
    setWeightRecords([]);
    setHealthLogs([]);
    setUserAccount(StorageService.getUserAccount());
    setCurrentTab('today');
  };

  const isDark = userAccount.theme === 'dark';

  return (
    <div className={`min-h-screen flex flex-col font-['Nunito',sans-serif] transition-colors duration-200 ${
      isDark ? 'bg-[#0D1510] text-[#EAF4EC]' : 'bg-[#EAF4EC] text-[#1C2B21]'
    }`}>
      {/* Top Header */}
      <Header
        pets={pets}
        activePet={activePet}
        onSelectPet={selectPetFromHeader}
        onAddNewPet={() => {
          setPetToEdit(null);
          setShowPetModal(true);
        }}
        userAccount={userAccount}
        onUpdateAccount={handleUpdateAccount}

        onOpenNotifications={() => setShowNotificationsModal(true)}

      />

      <main className="flex-1 w-full max-w-md mx-auto">
        {!activePet && currentTab !== 'more' && currentTab !== 'pets' && (
          <section className="mx-4 mt-6 rounded-3xl border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#17251C]">
            <h1 className="text-2xl font-extrabold">
              {userAccount.language === 'es' ? 'La rutina de tu mascota' : 'Your pet’s feeding routine'}
            </h1>
            <p className="mt-2 text-sm">
              {userAccount.language === 'es'
                ? 'Calcula su ración estimada y guarda sus tomas y pesajes en este navegador.'
                : 'Estimate a daily portion and save meals and weigh-ins in this browser.'}
            </p>
            <button
              type="button"
              className="mt-5 w-full rounded-xl bg-[#0B5D2E] px-4 py-3 font-extrabold text-white"
              onClick={() => setShowPetModal(true)}
            >
              {userAccount.language === 'es' ? 'Agregar mascota' : 'Add pet'}
            </button>
          </section>
        )}
        {currentTab === 'today' && activePet && (
          <TodayView
            key={`${activePet.id}:${diaryDay}`}
            pet={activePet}
            plan={activePlan}
            mealLogs={mealLogs.filter((log) => log.petId === activePet.id && log.date === diaryDay)}
            onToggleMeal={handleToggleMeal}
            userAccount={userAccount}
            onSavePlan={handleSavePlan}
            onUpdatePetProfile={handleUpdatePetProfile}
            onAddWeightRecord={handleAddWeightRecord}
            onAddHealthLog={handleAddHealthLog}
            onEditPet={(p) => {
              setPetToEdit(p);
              setShowPetModal(true);
            }}
            onNavigateTab={setCurrentTab}
            onComparePrices={(food) => openPriceComparison('today', food)}
          />
        )}

        {currentTab === 'compare' && activePet && (
          <FoodsView
            pet={activePet}
            pets={pets}
            onSelectPet={(id) => setActivePetId(id)}
            onAddNewPet={() => {
              setPetToEdit(null);
              setShowPetModal(true);
            }}
            plans={plans}
            merTargetKcal={
              activePlan?.mer ||
              Math.round(
                70 *
                  Math.pow(activePet.currentWeightKg || 10, 0.75) *
                  determineFactor(activePet, 'maintain', activePet.bcs || 5).factor
              )
            }
            userAccount={userAccount}
            plan={activePlan}
            onSelectFoodForPet={handleSelectFoodForPet}
            onPlanUpdate={handleUpdatePlanDetails}
            onComparePrices={(food) => openPriceComparison('compare', food)}
            onClose={() => setCurrentTab('today')}
          />
        )}

        {currentTab === 'prices' && priceSelection && (
          <PriceComparisonView
            key={JSON.stringify([priceSelection.food.id, priceSelection.packageKg])}
            food={priceSelection.food}
            pet={activePet}
            plan={activePlan}
            onPick={(food) => openPriceComparison(priceSelection.returnTo, food)}
            onReviewFood={!activePlan?.isVetLocked ? handleSelectFoodForPet : undefined}
            packageKg={priceSelection.packageKg}
            backTo={priceSelection.returnTo === 'compare' ? 'foods' : priceSelection.returnTo === 'more' ? 'more' : 'plan'}
            language={userAccount.language}
            onUsePrice={handleUsePrice}
            onBack={() => {
              setCurrentTab(priceSelection.returnTo);
              window.scrollTo(0, 0);
            }}
          />
        )}

        {currentTab === 'pets' && (
          <PetsView
            pets={pets}
            activePetId={activePetId}
            plans={plans}
            userAccount={userAccount}
            onSelectPet={(id) => setActivePetId(id)}
            onEditPet={(pet) => {
              setPetToEdit(pet);
              setShowPetModal(true);
            }}
            onAddNewPet={() => {
              setPetToEdit(null);
              setShowPetModal(true);
            }}
            onCalculateRation={(petId) => {
              setActivePetId(petId);
              setCurrentTab('calculate');
            }}
          />
        )}

        {currentTab === 'calculate' && activePet && (
          <CalculatorView
            key={activePet.id}
            pet={activePet}
            savedPlan={activePlan}
            initialFood={calculatorSelection?.petId === activePet.id ? calculatorSelection.food : undefined}
            onSavePlan={handleSavePlan}
            onUpdatePet={handleUpdatePetProfile}
            userAccount={userAccount}
            onNavigateHome={() => {
              setCalculatorSelection(undefined);
              setCurrentTab('today');
            }}
          />
        )}

        {currentTab === 'progress' && activePet && (
          <ProgressView
            key={activePet.id}
            pet={activePet}
            plan={activePlan}
            weightRecords={weightRecords.filter((record) => record.petId === activePet?.id)}
            healthLogs={healthLogs.filter((log) => log.petId === activePet?.id)}
            onAddWeightRecord={handleAddWeightRecord}
            onAddHealthLog={handleAddHealthLog}
            onUpdatePlanRation={handleUpdatePlanRation}
            userAccount={userAccount}
          />
        )}

        {currentTab === 'more' && (
          <MoreView
            pet={activePet}
            pets={pets}
            plan={activePlan}
            weightRecords={weightRecords.filter((record) => record.petId === activePet?.id)}
            healthLogs={healthLogs.filter((log) => log.petId === activePet?.id)}
            userAccount={userAccount}


            onUpdateAccount={handleUpdateAccount}
            onUpdateVetGuideline={handleUpdateVetGuideline}
            onSelectFoodForPet={handleSelectFoodForPet}
            onResetAllData={handleResetAllData}
            onComparePrices={habitualFood && habitualFood.type !== 'barf' ? (food) => openPriceComparison('more', food) : undefined}
            onPlanUpdate={handleUpdatePlanDetails}
            onNavigateTab={setCurrentTab}

          />
        )}
      </main>

      {/* Fixed 5-Tab Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        onTabChange={(tab) => setCurrentTab(tab)}
        lang={userAccount.language}
      />

      {planChoice && activePet?.id === planChoice.pet.id && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3">
          <section role="dialog" aria-modal="true" aria-label={isEs ? 'Revisar cambio de plan' : 'Review plan change'}
            className="max-h-[88dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-[var(--surface-card)] p-5">
            <PlanChangePreview pet={planChoice.pet} current={activePlan} proposed={planChoice.plan} lang={userAccount.language} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="min-h-11 rounded-xl border px-4" onClick={() => setPlanChoice(undefined)}>{isEs ? 'Cancelar' : 'Cancel'}</button>
              <button type="button" disabled={getPlanSafetyNotices(planChoice.pet, planChoice.plan).some(n => n.level === 'mismatch')}
                className="min-h-11 rounded-xl bg-[#0B5D2E] px-4 font-bold text-white disabled:opacity-50" onClick={() => {
                  if (planChoice.pet !== activePet) handleUpdatePetProfile(planChoice.pet);
                  handleSavePlan(withPlanCosts(planChoice.plan, StorageService.getFoodPurchases(activePet.id)));
                  setPlanChoice(undefined);
                }}>{isEs ? 'Aplicar a' : 'Apply to'} {activePet.name}</button>
            </div>
          </section>
        </div>
      )}

      {/* Add / Edit Pet Modal */}
      <PetModal
        isOpen={showPetModal}
        petToEdit={petToEdit}
        onClose={() => {
          setShowPetModal(false);
          setPetToEdit(null);
        }}
        onSave={handleSavePet}
        lang={userAccount.language}
      />

      {/* Notifications & Reorder Center Modal */}
      <NotificationsCenterModal
        isOpen={showNotificationsModal}
        onClose={() => setShowNotificationsModal(false)}
        pet={activePet}
        plan={activePlan}
        userAccount={userAccount}
        lang={userAccount.language}
      />

    </div>
  );
}
