import React, { useState, useEffect, useRef } from 'react';
import { Pet, FeedingPlan, MealLog, WeightRecord, HealthLog, UserAccount, FoodItem, VetGuideline, MonetizationInfo } from './types';
import { StorageService } from './utils/storage';
import { Header } from './components/Header';
import { BottomNav, TabId } from './components/BottomNav';
import { TodayView } from './views/TodayView';
import { PetsView } from './views/PetsView';
import { CalculatorView } from './views/CalculatorView';
import { ProgressView } from './views/ProgressView';
import { MoreView } from './views/MoreView';
import { FoodsView } from './views/FoodsView';
import { OnboardingModal, OnboardingPetData } from './components/OnboardingModal';
import { PetModal } from './components/PetModal';
import { PaymentView } from './views/PaymentView';
import { AuthModal } from './components/AuthModal';
import { TrialCountdownBanner } from './components/TrialCountdownBanner';
import { LockedFeatureNotice } from './components/LockedFeatureNotice';
import { CloudSqlService } from './services/cloudSqlService.ts';
import { useAuth } from './contexts/AuthContext.tsx';
import { OfflineSyncIndicator } from './components/OfflineSyncIndicator';
import { SyncQueue } from './services/syncQueueService';
import { NotificationsCenterModal } from './components/NotificationsCenterModal';
import { ImportLocalDataModal } from './components/ImportLocalDataModal';
import {
  calculateFeedingPlan,
  buildFeedingPlan,
  recalculatePlanForPet,
  determineFactor,
} from './utils/calculator';
import { findBreedProfile } from './data/breeds';
import { isPetPuppy, hasConfirmedLabel } from './utils/feedingGuide';

export default function App() {
  // Initialize Storage
  useEffect(() => {
    StorageService.initialize();
  }, []);

  // Primary reactive state
  const [pets, setPets] = useState<Pet[]>(() => StorageService.getPets());
  const [activePetId, setActivePetId] = useState<string>(() => StorageService.getActivePetId());
  const [plans, setPlans] = useState<Record<string, FeedingPlan>>(() => StorageService.getPlans());
  const [userAccount, setUserAccount] = useState<UserAccount>(() => StorageService.getUserAccount());

  // Active Tab
  const [currentTab, setCurrentTab] = useState<TabId>('today');

  // Logs for active pet
  const [mealLogs, setMealLogs] = useState<MealLog[]>(() => StorageService.getTodayMealLogs(activePetId));
  const [weightRecords, setWeightRecords] = useState<WeightRecord[]>(() => StorageService.getWeightRecords(activePetId));
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>(() => StorageService.getHealthLogs(activePetId));

  // Modals
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    // If no pets exist or explicit first visit, show onboarding
    return StorageService.getPets().length === 0;
  });
  const [showPetModal, setShowPetModal] = useState<boolean>(false);
  const [petToEdit, setPetToEdit] = useState<Pet | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [compareSubTab, setCompareSubTab] = useState<'prices' | 'compare'>('prices');

  // Monetization state from backend (Rule 8)
  const [monetization, setMonetization] = useState<MonetizationInfo | null>(null);

  // Authentication & Cloud SQL sync
  const { user: authUser, idToken, isAuthModalOpen, authModalMode, closeAuthModal } = useAuth();

  // Auto-detect if user signed in and has local guest pets to offer import
  useEffect(() => {
    if (authUser && idToken && pets.length > 0) {
      const imported = localStorage.getItem('racion_app_local_data_imported');
      if (!imported) {
        setShowImportModal(true);
      }
    }
  }, [authUser, idToken]);

  // Initial connection verification with Cloud SQL
  useEffect(() => {
    CloudSqlService.checkConnection().then((status) => {
      if (status?.configured) {
        console.log('[Cloud SQL] Service connection initialized successfully:', status.database);
      }
    });
  }, []);

  // Sync dataset with Cloud SQL when user is authenticated
  useEffect(() => {
    if (!idToken || !authUser) return;
    CloudSqlService.syncInitialData(idToken, {
      pets,
      plans,
      weights: StorageService.getWeightRecords(activePetId),
      mealLogs,
    });
  }, [idToken, authUser]);

  // Keep SyncQueue updated with the current auth token
  useEffect(() => {
    SyncQueue.setIdToken(idToken || null);
    if (idToken && navigator.onLine) {
      SyncQueue.processQueue();
    }
  }, [idToken]);

  const fetchMonetizationStatus = async () => {
    try {
      const res = await fetch('/api/monetization/status');
      if (res.ok) {
        const data: MonetizationInfo = await res.json();
        setMonetization(data);
        if (data.status === 'charged_lifetime' && !userAccount.isLicensed) {
          handleUpdateAccount({ isLicensed: true, licenseKey: data.chargeTransactionId || 'RACION-PRO-LIFETIME' });
        }
      }
    } catch (e) {
      // Offline fallback
    }
  };

  useEffect(() => {
    fetchMonetizationStatus();
    const interval = setInterval(fetchMonetizationStatus, 15000);
    return () => clearInterval(interval);
  }, [userAccount.isLicensed]);

  const handleCancelTrial = async () => {
    try {
      await fetch('/api/monetization/cancel-trial', { method: 'POST' });
      await fetchMonetizationStatus();
    } catch (e) {
      console.error('Failed to cancel trial', e);
    }
  };

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
      setMealLogs(StorageService.getTodayMealLogs(activePetId));
      setWeightRecords(StorageService.getWeightRecords(activePetId));
      setHealthLogs(StorageService.getHealthLogs(activePetId));
    }
  }, [activePetId]);

  const activePet = pets.find((p) => p.id === activePetId) || pets[0];
  const activePlan = activePet ? plans[activePet.id] : undefined;

  // Meal toggle handler
  const handleToggleMeal = (
    mealIndex: number,
    fedBy: string,
    grams: number,
    time: string,
    plannedGrams?: number,
    forceComplete?: boolean
  ) => {
    if (!activePet) return;
    StorageService.toggleMealCompleted(
      activePet.id,
      mealIndex,
      fedBy,
      grams,
      time,
      plannedGrams,
      forceComplete
    );
    const updatedMeals = StorageService.getTodayMealLogs(activePet.id);
    setMealLogs(updatedMeals);
    if (idToken) {
      const toggled = updatedMeals.find((m) => m.mealIndex === mealIndex);
      if (toggled) {
        CloudSqlService.saveMealLog(activePet.id, toggled, idToken);
      }
    }
  };

  // Add weight record handler
  const handleAddWeightRecord = (record: WeightRecord) => {
    StorageService.addWeightRecord(record);
    setWeightRecords(StorageService.getWeightRecords(record.petId));
    // Refresh pets list since currentWeight was updated
    setPets(StorageService.getPets());
    if (idToken) {
      CloudSqlService.saveWeightRecord(record.petId, record, idToken);
    }
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
    if (idToken) {
      CloudSqlService.saveFeedingPlan(plan.petId, plan, idToken);
    }
    setCurrentTab('today');
  };

  // Update plan ration from auto-recalculation
  const handleUpdatePlanRation = (newGramsPerDay: number, newGramsPerMeal: number) => {
    if (!activePet || !activePlan) return;
    const updatedPlan: FeedingPlan = {
      ...activePlan,
      gramsPerDay: newGramsPerDay,
      gramsPerMeal: newGramsPerMeal,
    };
    StorageService.savePlan(updatedPlan);
    setPlans(StorageService.getPlans());
    if (idToken) {
      CloudSqlService.saveFeedingPlan(activePet.id, updatedPlan, idToken);
    }
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
    if (idToken) {
      CloudSqlService.saveFeedingPlan(activePet.id, updatedPlan, idToken);
    }
  };

  // Update pet profile silently (from Calculator Step 1 before saving new plan)
  const handleUpdatePetProfile = (updatedPet: Pet) => {
    const updatedPets = pets.map((p) => (p.id === updatedPet.id ? updatedPet : p));
    setPets(updatedPets);
    StorageService.savePets(updatedPets);
    if (idToken) {
      CloudSqlService.savePet(updatedPet, idToken);
    }
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

    // Recalculate active feeding plan when breed, sex, neutered status, weight, or age changes
    const existingPlan = plans[savedPet.id];
    if (existingPlan && !existingPlan.isVetLocked) {
      const recalculated = recalculatePlanForPet(savedPet, existingPlan);
      StorageService.savePlan(recalculated);
      setPlans(StorageService.getPlans());
      if (idToken) {
        CloudSqlService.saveFeedingPlan(savedPet.id, recalculated, idToken);
      }
    }

    if (idToken) {
      CloudSqlService.savePet(savedPet, idToken);
    }
  };

  // Finish onboarding (2-step setup -> opens pet guide automatically)
  const handleFinishOnboarding = (petBasics?: OnboardingPetData) => {
    setShowOnboarding(false);
    if (!petBasics) return;

    const sp = petBasics.species || 'dog';
    const defaultBreed = sp === 'cat' ? 'Mestizo / Criollo / Mixed' : 'Mestizo / No sé';
    const chosenBreed = petBasics.breed || defaultBreed;
    const chosenSize = petBasics.breedSize || findBreedProfile(chosenBreed, sp).size;
    const fallbackWeight = sp === 'cat' ? 4.2 : 12.5;
    const weight = petBasics.currentWeightKg || fallbackWeight;
    const ageYears = petBasics.ageYears ?? 1;
    const ageMonths = petBasics.ageMonths ?? Math.max(1, Math.round(ageYears * 12));

    const newPet: Pet = {
      id: 'pet_' + Date.now(),
      name: petBasics.name || (sp === 'cat' ? 'Luna' : 'Milo'),
      species: sp,
      breed: chosenBreed,
      breedSize: chosenSize,
      sex: petBasics.sex || 'male',
      isNeutered: petBasics.isNeutered ?? false,
      ageYears,
      ageMonths,
      currentWeightKg: weight,
      idealWeightKg: petBasics.idealWeightKg || weight,
      targetWeightKg: petBasics.targetWeightKg || weight,
      expectedAdultWeightKg: petBasics.expectedAdultWeightKg,
      bcs: 5,
      activityLevel: 'moderate',
      photoUrl: petBasics.photoUrl,
      specialState: petBasics.specialState || 'none',
      dietType: petBasics.dietType || 'commercial',
      restrictions: petBasics.restrictions || [],
      restrictionNotes: petBasics.restrictionNotes,
      profileRefinementPending: petBasics.profileRefinementPending,
      createdAt: new Date().toISOString(),
    };

    const updated = [newPet, ...pets];
    setPets(updated);
    StorageService.savePets(updated);
    StorageService.setActivePetId(newPet.id);
    setActivePetId(newPet.id);

    const isBarf = petBasics.foodEntryMode === 'barf' || newPet.dietType === 'barf';
    const rawFood = petBasics.selectedFood;
    const puppy = isPetPuppy(newPet);
    const confirmedKcal =
      rawFood?.kcalPerKg && rawFood.kcalPerKg > 400 && rawFood.labelStatus !== 'unconfirmed'
        ? rawFood.kcalPerKg
        : 0;

    const foodItem: FoodItem = {
      id: rawFood?.id || (isBarf ? 'barf_' + Date.now() : 'food_' + Date.now()),
      brand: rawFood?.brand || (isBarf ? 'BARF' : 'Por confirmar'),
      name: rawFood?.name || (isBarf ? 'Dieta Natural Cruda (BARF)' : 'Alimento habitual'),
      species: sp,
      lifeStage: puppy ? (sp === 'cat' ? 'kitten' : 'puppy') : 'adult',
      type: isBarf ? 'barf' : rawFood?.type === 'wet' ? 'wet' : 'dry',
      kcalPerKg: confirmedKcal,
      proteinPct: rawFood?.proteinPct ?? 0,
      fatPct: rawFood?.fatPct ?? 0,
      fiberPct: rawFood?.fiberPct ?? 0,
      moisturePct: rawFood?.moisturePct ?? (rawFood?.type === 'wet' ? 78 : 0),
      ashPct: rawFood?.ashPct,
      carbsPct: rawFood?.carbsPct,
      country: rawFood?.country || 'Colombia',
      bagSizeKg: rawFood?.bagSizeKg,
      availableSizesKg: rawFood?.availableSizesKg,
      imageUrl: rawFood?.imageUrl,
      labelStatus: isBarf
        ? 'unconfirmed'
        : rawFood?.labelStatus || (confirmedKcal > 400 ? 'user_confirmed_label' : 'unconfirmed'),
      isCompleteAndBalanced: rawFood?.isCompleteAndBalanced,
      suitableForGrowth: rawFood?.suitableForGrowth,
      kibbleSizeSuitability: rawFood?.kibbleSizeSuitability,
      dataSource: rawFood?.dataSource,
      formulaNotes: rawFood?.formulaNotes,
      fichaNutricional: rawFood?.fichaNutricional,
    };

    const foodType: 'dry' | 'wet' | 'barf' = isBarf
      ? 'barf'
      : foodItem.type === 'wet'
      ? 'wet'
      : 'dry';

    const calcInputs = {
      pet: newPet,
      goal: (puppy ? 'growth' : 'maintain') as 'growth' | 'maintain',
      bcs: 5,
      foodType,
      dryFood: foodType === 'dry' ? foodItem : undefined,
      wetFood: foodType === 'wet' ? foodItem : undefined,
      mealsPerDay: puppy && ageMonths < 6 ? 3 : 2,
      mealTimes: puppy && ageMonths < 6 ? ['08:00', '14:00', '20:00'] : ['08:00', '20:00'],
      bagWeightKg: foodItem.bagSizeKg,
      scheduleConfigured: false,
    };

    const calcResult = calculateFeedingPlan(calcInputs);
    const initialPlan = buildFeedingPlan(calcInputs, calcResult);
    initialPlan.id = 'plan_' + newPet.id;

    StorageService.savePlan(initialPlan);
    setPlans(StorageService.getPlans());
    if (idToken) {
      CloudSqlService.savePet(newPet, idToken);
      CloudSqlService.saveFeedingPlan(newPet.id, initialPlan, idToken);
    }

    setCurrentTab('today');
  };

  // Update user account
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

    // If guideline exists, update and lock active plan
    if (guideline && activePlan) {
      const totalGrams = guideline.prescribedGramsPerMeal * guideline.mealsPerDay;
      const lockedPlan: FeedingPlan = {
        ...activePlan,
        isVetLocked: true,
        gramsPerMeal: guideline.prescribedGramsPerMeal,
        mealsPerDay: guideline.mealsPerDay,
        mer: guideline.prescribedKcal,
        gramsPerDay: totalGrams,
        foodName: guideline.prescribedFoodName,
        rationConfirmed: totalGrams > 0,
        scheduleConfigured: true,
        treatsBudgetKcal: 0,
      };
      StorageService.savePlan(lockedPlan);
      setPlans(StorageService.getPlans());
    } else if (!guideline && activePlan) {
      const unlockedPlan: FeedingPlan = {
        ...activePlan,
        isVetLocked: false,
      };
      const recalculated = recalculatePlanForPet(
        { ...activePet, hasVetGuideline: false, vetGuideline: undefined },
        unlockedPlan
      );
      StorageService.savePlan(recalculated);
      setPlans(StorageService.getPlans());
    }
  };

  // Use food for pet from Catalog / Comparer / Alternatives
  const handleSelectFoodForPet = (food: FoodItem) => {
    if (!activePet) return;

    // Respect locked vet plan: do not overwrite if locked
    if (activePlan?.isVetLocked || activePet.vetGuideline?.locked) {
      setCurrentTab('today');
      return;
    }

    const effectivePet: Pet =
      activePet.dietType === 'barf' && food.type !== 'barf'
        ? { ...activePet, dietType: 'commercial' }
        : activePet;

    if (effectivePet !== activePet) {
      handleUpdatePetProfile(effectivePet);
    }

    const normalizedFood: FoodItem = {
      ...food,
      labelStatus:
        food.labelStatus || (hasConfirmedLabel(food) ? 'verified_manufacturer' : 'unconfirmed'),
    };

    if (activePlan) {
      const nextFoodType: 'dry' | 'wet' | 'barf' =
        normalizedFood.type === 'barf' ? 'barf' : normalizedFood.type === 'wet' ? 'wet' : 'dry';

      const draftPlan: FeedingPlan = {
        ...activePlan,
        foodId: normalizedFood.id,
        foodBrand: normalizedFood.brand,
        foodName: normalizedFood.name,
        foodType: nextFoodType,
        dryFood: nextFoodType === 'wet' ? activePlan.dryFood : normalizedFood,
        wetFood: nextFoodType === 'wet' ? normalizedFood : activePlan.wetFood,
        bagWeightKg: normalizedFood.bagSizeKg || activePlan.bagWeightKg,
      };

      const recalculated = recalculatePlanForPet(effectivePet, draftPlan);
      StorageService.savePlan(recalculated);
      setPlans(StorageService.getPlans());
      if (idToken) {
        CloudSqlService.saveFeedingPlan(effectivePet.id, recalculated, idToken);
      }
    }
    setCurrentTab('today');
  };

  // Reset all data
  const handleResetAllData = () => {
    StorageService.clearAllData();
    setPets(StorageService.getPets());
    setActivePetId(StorageService.getActivePetId());
    setPlans(StorageService.getPlans());
    setUserAccount(StorageService.getUserAccount());
    setCurrentTab('today');
  };

  const isFeatureAccessBlocked = monetization ? (!monetization.canAccessFeatures && !userAccount.isLicensed) : false;
  const isDark = userAccount.theme === 'dark';

  return (
    <div className={`min-h-screen flex flex-col font-['Nunito',sans-serif] transition-colors duration-200 ${
      isDark ? 'bg-[#0D1510] text-[#EAF4EC]' : 'bg-[#EAF4EC] text-[#1C2B21]'
    }`}>
      {/* Top Header */}
      <Header
        pets={pets}
        activePet={activePet}
        onSelectPet={(id) => setActivePetId(id)}
        onAddNewPet={() => {
          setPetToEdit(null);
          setShowPetModal(true);
        }}
        userAccount={userAccount}
        onUpdateAccount={handleUpdateAccount}
        onOpenPayment={() => setShowPaymentModal(true)}
        onOpenNotifications={() => setShowNotificationsModal(true)}
        idToken={idToken}
      />

      {/* Offline & Synchronization State Banner */}
      <div className="w-full max-w-md mx-auto px-4 pt-2">
        <OfflineSyncIndicator idToken={idToken} />
      </div>

      {/* 72h Trial Countdown & 24h Expiration Notice Banner (Rule 1, 2, 7) */}
      <TrialCountdownBanner
        monetization={monetization}
        onOpenPaymentModal={() => setShowPaymentModal(true)}
        onCancelTrial={handleCancelTrial}
        lang={userAccount.language}
      />

      {/* Main View Area */}
      <main className="flex-1 w-full max-w-md mx-auto">
        {currentTab === 'today' && activePet && (
          <TodayView
            pet={activePet}
            plan={activePlan}
            mealLogs={mealLogs}
            onToggleMeal={handleToggleMeal}
            userAccount={userAccount}
            allPets={pets}
            plans={plans}
            onSelectFoodForPet={handleSelectFoodForPet}
            onSavePlan={handleSavePlan}
            onUpdatePetProfile={handleUpdatePetProfile}
            onAddWeightRecord={handleAddWeightRecord}
            onAddHealthLog={handleAddHealthLog}
            onEditPet={(p) => {
              setPetToEdit(p);
              setShowPetModal(true);
            }}
            onNavigateTab={(tab, subTab) => {
              if (tab === 'compare') {
                if (subTab) setCompareSubTab(subTab);
                setCurrentTab('compare');
              } else if (tab === 'calculate') setCurrentTab('calculate');
              else if (tab === 'progress') setCurrentTab('progress');
              else if (tab === 'pets') setCurrentTab('pets');
              else if (tab === 'more') setCurrentTab('more');
            }}
            onOpenStoreModal={() => setCurrentTab('more')}
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
            initialSubTab={compareSubTab}
            onSelectFoodForPet={handleSelectFoodForPet}
            onPlanUpdate={handleUpdatePlanDetails}
            onClose={() => setCurrentTab('today')}
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
          isFeatureAccessBlocked ? (
            <LockedFeatureNotice
              status={monetization?.status || 'canceled'}
              lang={userAccount.language}
              onOpenPayment={() => setShowPaymentModal(true)}
              onOpenSettings={() => setCurrentTab('more')}
            />
          ) : (
            <CalculatorView
              pet={activePet}
              onSavePlan={handleSavePlan}
              onUpdatePet={handleUpdatePetProfile}
              userAccount={userAccount}
              onNavigateHome={() => setCurrentTab('today')}
            />
          )
        )}

        {currentTab === 'progress' && activePet && (
          isFeatureAccessBlocked ? (
            <LockedFeatureNotice
              status={monetization?.status || 'canceled'}
              lang={userAccount.language}
              onOpenPayment={() => setShowPaymentModal(true)}
              onOpenSettings={() => setCurrentTab('more')}
            />
          ) : (
            <ProgressView
              pet={activePet}
              plan={activePlan}
              weightRecords={weightRecords}
              healthLogs={healthLogs}
              onAddWeightRecord={handleAddWeightRecord}
              onAddHealthLog={handleAddHealthLog}
              onUpdatePlanRation={handleUpdatePlanRation}
              userAccount={userAccount}
            />
          )
        )}

        {currentTab === 'more' && activePet && (
          <MoreView
            pet={activePet}
            pets={pets}
            plan={activePlan}
            weightRecords={weightRecords}
            healthLogs={healthLogs}
            userAccount={userAccount}
            monetization={monetization}
            onRefreshMonetization={fetchMonetizationStatus}
            onUpdateAccount={handleUpdateAccount}
            onUpdateVetGuideline={handleUpdateVetGuideline}
            onSelectFoodForPet={handleSelectFoodForPet}
            onActivateLicense={(key) => {
              handleUpdateAccount({ isLicensed: true, licenseKey: key });
            }}
            onResetAllData={handleResetAllData}
            onNavigateTab={(tab) => setCurrentTab(tab as TabId)}
            idToken={idToken}
          />
        )}
      </main>

      {/* Fixed 5-Tab Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        onTabChange={(tab) => setCurrentTab(tab)}
        lang={userAccount.language}
      />

      {/* Onboarding Welcome Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onFinish={handleFinishOnboarding}
        lang={userAccount.language}
      />

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

      {/* Payment Checkout Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full my-6 p-2 shadow-2xl relative">
            <PaymentView
              userAccount={userAccount}
              monetization={monetization}
              onRefreshMonetization={fetchMonetizationStatus}
              onActivateLicense={(key) => {
                handleUpdateAccount({ isLicensed: true, licenseKey: key });
                setShowPaymentModal(false);
              }}
              onClose={() => setShowPaymentModal(false)}
            />
          </div>
        </div>
      )}

      {/* User Authentication & Registration Modal (Google / Email) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        initialMode={authModalMode}
        activePet={activePet}
        onFoodSelected={handleSelectFoodForPet}
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

      {/* Safe Local Data Import Modal */}
      {idToken && (
        <ImportLocalDataModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          idToken={idToken}
          lang={userAccount.language}
          onImportComplete={(count) => {
            console.log(`[Import] Successfully imported ${count} pets to cloud account`);
          }}
        />
      )}
    </div>
  );
}
