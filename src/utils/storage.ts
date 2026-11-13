import {
  Pet,
  FeedingPlan,
  MealLog,
  WeightRecord,
  HealthLog,
  FoodItem,
  UserAccount,
  FoodCostEntry,
  RecentFoodSearch,
  TreatLog,
  HydrationDailyState,
} from '../types';
import { PET_FOODS_DATABASE } from '../data/foods';
import { SyncQueue } from '../services/syncQueueService';

const STORAGE_KEYS = {
  PETS: 'racion_pets_v1',
  ACTIVE_PET_ID: 'racion_active_pet_id_v1',
  PLANS: 'racion_plans_v1',
  MEAL_LOGS: 'racion_meal_logs_v1',
  TREAT_LOGS: 'racion_treat_logs_v1',
  TRAINING_RATION: 'racion_training_ration_v1',
  HYDRATION_STATE: 'racion_hydration_state_v1',
  WEIGHT_RECORDS: 'racion_weight_records_v1',
  HEALTH_LOGS: 'racion_health_logs_v1',
  CUSTOM_FOODS: 'racion_custom_foods_v1',
  FOOD_PURCHASES: 'racion_food_purchases_v1',
  RECENT_FOOD_SEARCHES: 'racion_recent_food_searches_v1',
  USER_ACCOUNT: 'racion_user_account_v1',
  USER_CITY: 'racion_user_city_v1',
  WATER_LOGS: 'racion_water_logs_v1',
  INITIALIZED: 'racion_initialized_v1',
};

const DEFAULT_PETS: Pet[] = [
  {
    id: 'pet-milo',
    name: 'Milo',
    species: 'dog',
    breed: 'Mestizo / Mixed',
    breedSize: 'medium',
    sex: 'male',
    isNeutered: true,
    birthDate: '2022-04-10',
    ageYears: 2.5,
    currentWeightKg: 14.2,
    idealWeightKg: 13.5,
    targetWeightKg: 13.5,
    bcs: 6, // slightly above ideal
    activityLevel: 'moderate',
    photoUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=400&q=80',
    specialState: 'none',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'pet-luna',
    name: 'Luna',
    species: 'cat',
    breed: 'Europeo Común',
    sex: 'female',
    isNeutered: true,
    birthDate: '2023-01-15',
    ageYears: 1.8,
    currentWeightKg: 4.3,
    idealWeightKg: 4.2,
    targetWeightKg: 4.2,
    bcs: 5, // ideal
    activityLevel: 'moderate',
    photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=400&q=80',
    specialState: 'none',
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_PLANS: Record<string, FeedingPlan> = {
  'pet-milo': {
    id: 'plan_milo_initial',
    petId: 'pet-milo',
    createdAt: new Date().toISOString(),
    foodId: 'rc-medium-adult',
    foodName: 'Medium Adult Dog Dry',
    foodBrand: 'Royal Canin',
    foodType: 'dry',
    dryFood: PET_FOODS_DATABASE.find(f => f.id === 'rc-medium-adult'),
    mixedDryPct: 100,
    mixedWetPct: 0,
    mealsPerDay: 2,
    mealTimes: ['08:00', '20:00'],
    rer: 489,
    factor: 1.6,
    mer: 782,
    gramsPerDay: 190,
    gramsPerMeal: 95,
    kcalPerMeal: 365,
    cupsPerDay: 2.0,
    treatsBudgetKcal: 78,
    treatsCountToday: 1,
    manualAdjustmentPct: 0,
    bagWeightKg: 15,
    bagDaysRemaining: 42,
    rationConfirmed: true,
    scheduleConfigured: true,
  },
  'pet-luna': {
    id: 'plan_luna_initial',
    petId: 'pet-luna',
    createdAt: new Date().toISOString(),
    foodId: 'rc-sterilised-37-cat',
    foodName: 'Sterilised 37 Neutered Cat Dry',
    foodBrand: 'Royal Canin',
    foodType: 'dry',
    dryFood: PET_FOODS_DATABASE.find(f => f.id === 'rc-sterilised-37-cat'),
    mixedDryPct: 100,
    mixedWetPct: 0,
    mealsPerDay: 2,
    mealTimes: ['08:30', '19:30'],
    rer: 205,
    factor: 1.2,
    mer: 246,
    gramsPerDay: 62,
    gramsPerMeal: 31,
    kcalPerMeal: 115,
    treatsBudgetKcal: 25,
    treatsCountToday: 0,
    manualAdjustmentPct: 0,
    bagWeightKg: 4,
    bagDaysRemaining: 55,
    rationConfirmed: true,
    scheduleConfigured: true,
  },
};

const DEFAULT_USER: UserAccount = {
  email: 'familia@ejemplo.com',
  isLicensed: false, // Default is free calculation trial, user can unlock $20 lifetime
  language: 'es',
  units: 'metric',
  theme: 'light',
  familyName: 'Familia Mascotera',
  familyMembers: [
    { id: 'fm-1', name: 'Mamá', role: 'feeder', avatarColor: '#0B5D2E' },
    { id: 'fm-2', name: 'Papá', role: 'weighed_and_fed', avatarColor: '#F57C1A' },
    { id: 'fm-3', name: 'Hijo', role: 'viewer', avatarColor: '#1E8A49' },
  ],
  remindersEnabled: true,
  whatsappOptIn: false,
};

export const StorageService = {
  initialize() {
    if (typeof window === 'undefined') return;

    if (!localStorage.getItem(STORAGE_KEYS.INITIALIZED)) {
      localStorage.setItem(STORAGE_KEYS.PETS, JSON.stringify(DEFAULT_PETS));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PET_ID, DEFAULT_PETS[0].id);
      localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(DEFAULT_PLANS));
      localStorage.setItem(STORAGE_KEYS.USER_ACCOUNT, JSON.stringify(DEFAULT_USER));

      // Seed initial weight records
      const initialWeights: WeightRecord[] = [
        {
          id: 'w1',
          petId: 'pet-milo',
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          weightKg: 14.6,
          notes: 'Peso inicial de control',
        },
        {
          id: 'w2',
          petId: 'pet-milo',
          date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          weightKg: 14.4,
          notes: 'Disminución controlada',
        },
        {
          id: 'w3',
          petId: 'pet-milo',
          date: new Date().toISOString().split('T')[0],
          weightKg: 14.2,
          notes: 'Vas bien, bajó 200 g hacia la meta',
        },
        {
          id: 'wl1',
          petId: 'pet-luna',
          date: new Date().toISOString().split('T')[0],
          weightKg: 4.3,
          notes: 'Peso estable',
        },
      ];
      localStorage.setItem(STORAGE_KEYS.WEIGHT_RECORDS, JSON.stringify(initialWeights));

      // Seed health logs
      const initialHealthLogs: HealthLog[] = [
        {
          id: 'hl1',
          petId: 'pet-milo',
          date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          type: 'vaccine',
          title: 'Vacuna Séxtuple canina',
          notes: 'Sin efectos secundarios, próxima dosis en 1 año',
          severity: 'normal',
        },
        {
          id: 'hl2',
          petId: 'pet-milo',
          date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          type: 'deworming',
          title: 'Desparasitación interna trimestral',
          notes: 'Comprimido palatale administrado con éxito',
          severity: 'normal',
        },
      ];
      localStorage.setItem(STORAGE_KEYS.HEALTH_LOGS, JSON.stringify(initialHealthLogs));

      // Seed initial food purchase records in COP (Pesos Colombianos)
      const initialPurchases: FoodCostEntry[] = [
        {
          id: 'fp-1',
          petId: 'pet-milo',
          date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          foodBrand: 'Royal Canin',
          foodName: 'Medium Adult Dog Dry',
          foodType: 'dry',
          bagSizeKg: 15,
          pricePaidCop: 295000,
          costPerKgCop: Math.round(295000 / 15),
          costPerDayCop: Math.round((295000 / 15) * (214 / 1000)),
          costPerMonthCop: Math.round((295000 / 15) * (214 / 1000) * 30.5),
          estimatedDaysDuration: Math.round((15 * 1000) / 214),
          storeName: 'Agrocampo Bogotá',
          notes: 'Bulto de 15 kg comprado con descuento de fin de mes',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'fp-2',
          petId: 'pet-luna',
          date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          foodBrand: 'Royal Canin',
          foodName: 'Sterilised 37 Neutered Cat Dry',
          foodType: 'dry',
          bagSizeKg: 4,
          pricePaidCop: 148000,
          costPerKgCop: Math.round(148000 / 4),
          costPerDayCop: Math.round((148000 / 4) * (62 / 1000)),
          costPerMonthCop: Math.round((148000 / 4) * (62 / 1000) * 30.5),
          estimatedDaysDuration: Math.round((4 * 1000) / 62),
          storeName: 'Laika Pets Colombia',
          notes: 'Bulto de 4 kg para gato esterilizado',
          createdAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem(STORAGE_KEYS.FOOD_PURCHASES, JSON.stringify(initialPurchases));

      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    }
  },

  getPets(): Pet[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PETS);
      return data ? JSON.parse(data) : DEFAULT_PETS;
    } catch {
      return DEFAULT_PETS;
    }
  },

  savePets(pets: Pet[]) {
    localStorage.setItem(STORAGE_KEYS.PETS, JSON.stringify(pets));
    // Enqueue each pet to sync queue for offline persistence and auto-sync
    pets.forEach(p => SyncQueue.enqueue('upsert_pet', p));
  },

  deletePet(petId: string) {
    const pets = this.getPets().filter(p => p.id !== petId);
    localStorage.setItem(STORAGE_KEYS.PETS, JSON.stringify(pets));
    SyncQueue.enqueue('delete_pet', { id: petId });
    if (this.getActivePetId() === petId && pets.length > 0) {
      this.setActivePetId(pets[0].id);
    }
  },

  getActivePetId(): string {
    const id = localStorage.getItem(STORAGE_KEYS.ACTIVE_PET_ID);
    const pets = this.getPets();
    if (id && pets.some((p) => p.id === id)) return id;
    const fallbackId = pets[0]?.id || '';
    if (fallbackId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PET_ID, fallbackId);
    }
    return fallbackId;
  },

  setActivePetId(id: string) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PET_ID, id);
  },

  getActivePet(): Pet | undefined {
    const pets = this.getPets();
    const id = this.getActivePetId();
    return pets.find(p => p.id === id) || pets[0];
  },

  getPlans(): Record<string, FeedingPlan> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PLANS);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  },

  getPlan(petId: string): FeedingPlan | undefined {
    const plans = this.getPlans();
    return plans[petId];
  },

  savePlan(plan: FeedingPlan) {
    const plans = this.getPlans();
    plans[plan.petId] = plan;
    localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans));
    SyncQueue.enqueue('save_plan', plan);
  },

  getTodayMealLogs(petId: string): MealLog[] {
    const today = new Date().toISOString().split('T')[0];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MEAL_LOGS);
      const all: MealLog[] = data ? JSON.parse(data) : [];
      return all.filter(l => l.petId === petId && l.date === today);
    } catch {
      return [];
    }
  },

  toggleMealCompleted(
    petId: string,
    mealIndex: number,
    fedBy: string,
    grams: number,
    scheduledTime: string,
    plannedGrams?: number,
    forceCompleteWithGrams?: boolean,
    mixedComponents?: import('../types').MealMixedComponent[]
  ): MealLog {
    const today = new Date().toISOString().split('T')[0];
    const data = localStorage.getItem(STORAGE_KEYS.MEAL_LOGS);
    const all: MealLog[] = data ? JSON.parse(data) : [];

    const existingIdx = all.findIndex(
      l => l.petId === petId && l.date === today && l.mealIndex === mealIndex
    );

    if (existingIdx >= 0) {
      const current = all[existingIdx];
      current.completed = forceCompleteWithGrams ? true : !current.completed;
      current.completedAt = current.completed ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;
      current.fedBy = fedBy;
      if (forceCompleteWithGrams || grams > 0) {
        current.gramsFed = grams;
      }
      if (plannedGrams !== undefined && plannedGrams >= 0) {
        current.plannedGrams = plannedGrams;
      }
      if (mixedComponents) {
        current.mixedComponents = mixedComponents;
      }
      localStorage.setItem(STORAGE_KEYS.MEAL_LOGS, JSON.stringify(all));
      SyncQueue.enqueue('save_meal', current);
      return current;
    } else {
      const newLog: MealLog = {
        id: 'ml_' + Date.now() + '_' + Math.random(),
        petId,
        date: today,
        mealIndex,
        mealTime: scheduledTime,
        plannedGrams: plannedGrams ?? grams,
        gramsFed: grams,
        mixedComponents,
        fedBy,
        completed: true,
        completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      all.push(newLog);
      localStorage.setItem(STORAGE_KEYS.MEAL_LOGS, JSON.stringify(all));
      SyncQueue.enqueue('save_meal', newLog);
      return newLog;
    }
  },

  getWeightRecords(petId: string): WeightRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WEIGHT_RECORDS);
      const all: WeightRecord[] = data ? JSON.parse(data) : [];
      return all.filter(w => w.petId === petId).sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  },

  addWeightRecord(record: WeightRecord) {
    const data = localStorage.getItem(STORAGE_KEYS.WEIGHT_RECORDS);
    const all: WeightRecord[] = data ? JSON.parse(data) : [];
    all.push(record);
    localStorage.setItem(STORAGE_KEYS.WEIGHT_RECORDS, JSON.stringify(all));
    SyncQueue.enqueue('save_weight', record);

    // Update pet's current weight locally
    const pets = this.getPets();
    const petIdx = pets.findIndex(p => p.id === record.petId);
    if (petIdx >= 0) {
      pets[petIdx].currentWeightKg = record.weightKg;
      this.savePets(pets);
    }
  },

  getHealthLogs(petId: string): HealthLog[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HEALTH_LOGS);
      const all: HealthLog[] = data ? JSON.parse(data) : [];
      return all.filter(h => h.petId === petId).sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      return [];
    }
  },

  addHealthLog(log: HealthLog) {
    const data = localStorage.getItem(STORAGE_KEYS.HEALTH_LOGS);
    const all: HealthLog[] = data ? JSON.parse(data) : [];
    all.unshift(log);
    localStorage.setItem(STORAGE_KEYS.HEALTH_LOGS, JSON.stringify(all));
  },

  getWaterGlassesToday(petId: string): number {
    const today = new Date().toISOString().split('T')[0];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WATER_LOGS);
      const map = data ? JSON.parse(data) : {};
      return map[`${petId}_${today}`] || 0;
    } catch {
      return 0;
    }
  },

  setWaterGlassesToday(petId: string, count: number) {
    const today = new Date().toISOString().split('T')[0];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WATER_LOGS);
      const map = data ? JSON.parse(data) : {};
      map[`${petId}_${today}`] = Math.max(0, count);
      localStorage.setItem(STORAGE_KEYS.WATER_LOGS, JSON.stringify(map));
    } catch {
      // ignore
    }
  },

  getHydrationStateToday(petId: string): HydrationDailyState {
    const today = new Date().toISOString().split('T')[0];
    const bowls = this.getWaterGlassesToday(petId);
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HYDRATION_STATE);
      const map = data ? JSON.parse(data) : {};
      const entry = map[`${petId}_${today}`];
      if (entry) {
        return {
          bowlsLogged: entry.bowlsLogged ?? bowls,
          intakeChangeFlag: entry.intakeChangeFlag || 'none',
          intakeChangeNote: entry.intakeChangeNote,
          updatedAt: entry.updatedAt,
        };
      }
    } catch {
      // ignore
    }
    return { bowlsLogged: bowls, intakeChangeFlag: 'none' };
  },

  setHydrationStateToday(petId: string, state: HydrationDailyState) {
    const today = new Date().toISOString().split('T')[0];
    this.setWaterGlassesToday(petId, state.bowlsLogged);
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HYDRATION_STATE);
      const map = data ? JSON.parse(data) : {};
      map[`${petId}_${today}`] = {
        ...state,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEYS.HYDRATION_STATE, JSON.stringify(map));
    } catch {
      // ignore
    }
  },

  getTreatLogsToday(petId: string): TreatLog[] {
    const today = new Date().toISOString().split('T')[0];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TREAT_LOGS);
      const all: TreatLog[] = data ? JSON.parse(data) : [];
      return all.filter((l) => l.petId === petId && l.date === today);
    } catch {
      return [];
    }
  },

  addTreatLog(log: TreatLog) {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TREAT_LOGS);
      const all: TreatLog[] = data ? JSON.parse(data) : [];
      all.unshift(log);
      localStorage.setItem(STORAGE_KEYS.TREAT_LOGS, JSON.stringify(all));
    } catch {
      // ignore
    }
  },

  deleteTreatLog(id: string) {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TREAT_LOGS);
      const all: TreatLog[] = data ? JSON.parse(data) : [];
      const filtered = all.filter((l) => l.id !== id);
      localStorage.setItem(STORAGE_KEYS.TREAT_LOGS, JSON.stringify(filtered));
    } catch {
      // ignore
    }
  },

  getTrainingRationGramsToday(petId: string): number {
    const today = new Date().toISOString().split('T')[0];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRAINING_RATION);
      const map = data ? JSON.parse(data) : {};
      return Math.max(0, Number(map[`${petId}_${today}`]) || 0);
    } catch {
      return 0;
    }
  },

  setTrainingRationGramsToday(petId: string, grams: number) {
    const today = new Date().toISOString().split('T')[0];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRAINING_RATION);
      const map = data ? JSON.parse(data) : {};
      map[`${petId}_${today}`] = Math.max(0, Math.round(grams));
      localStorage.setItem(STORAGE_KEYS.TRAINING_RATION, JSON.stringify(map));
    } catch {
      // ignore
    }
  },

  getUserAccount(): UserAccount {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USER_ACCOUNT);
      return data ? { ...DEFAULT_USER, ...JSON.parse(data) } : DEFAULT_USER;
    } catch {
      return DEFAULT_USER;
    }
  },

  saveUserAccount(acc: UserAccount) {
    localStorage.setItem(STORAGE_KEYS.USER_ACCOUNT, JSON.stringify(acc));
  },

  getCustomFoods(): FoodItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_FOODS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  addCustomFood(food: FoodItem) {
    const list = this.getCustomFoods();
    list.unshift(food);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_FOODS, JSON.stringify(list));
  },

  getFoodPurchases(petId?: string): FoodCostEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FOOD_PURCHASES);
      const all: FoodCostEntry[] = data ? JSON.parse(data) : [];
      const list = petId ? all.filter(p => p.petId === petId) : all;
      return list.sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      return [];
    }
  },

  addFoodPurchase(entry: FoodCostEntry) {
    const all = this.getFoodPurchases();
    all.unshift(entry);
    localStorage.setItem(STORAGE_KEYS.FOOD_PURCHASES, JSON.stringify(all));
    SyncQueue.enqueue('save_purchase', entry);
  },

  deleteFoodPurchase(id: string) {
    const all = this.getFoodPurchases();
    const filtered = all.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.FOOD_PURCHASES, JSON.stringify(filtered));
    SyncQueue.enqueue('delete_purchase', { id });
  },

  updateFoodPurchase(entry: FoodCostEntry) {
    const all = this.getFoodPurchases();
    const idx = all.findIndex(p => p.id === entry.id);
    if (idx >= 0) {
      all[idx] = entry;
      localStorage.setItem(STORAGE_KEYS.FOOD_PURCHASES, JSON.stringify(all));
      SyncQueue.enqueue('save_purchase', entry);
    }
  },

  exportAllDataJSON(): string {
    const payload = {
      exportedAt: new Date().toISOString(),
      account: this.getUserAccount(),
      pets: this.getPets(),
      plans: this.getPlans(),
      weightRecords: localStorage.getItem(STORAGE_KEYS.WEIGHT_RECORDS) ? JSON.parse(localStorage.getItem(STORAGE_KEYS.WEIGHT_RECORDS)!) : [],
      healthLogs: localStorage.getItem(STORAGE_KEYS.HEALTH_LOGS) ? JSON.parse(localStorage.getItem(STORAGE_KEYS.HEALTH_LOGS)!) : [],
      customFoods: this.getCustomFoods(),
      foodPurchases: this.getFoodPurchases(),
    };
    return JSON.stringify(payload, null, 2);
  },

  getUserCity(): string {
    return localStorage.getItem(STORAGE_KEYS.USER_CITY) || 'Bogotá';
  },

  setUserCity(city: string): void {
    localStorage.setItem(STORAGE_KEYS.USER_CITY, city);
  },

  getRecentFoodSearches(): RecentFoodSearch[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RECENT_FOOD_SEARCHES);
      if (data) return JSON.parse(data);
    } catch {}
    // Initial default matching user's mockup (Luna's food)
    return [
      {
        id: 'search_recent_1',
        brand: 'Royal Canin',
        productName: 'Fit 32',
        weightKg: 4,
        city: 'Bogotá',
        imageUrl: '/assets/food_rc_fit32.png',
        timestamp: Date.now() - 1000 * 60 * 45,
      },
    ];
  },

  saveRecentFoodSearch(search: { brand: string; productName: string; weightKg: number; city: string; imageUrl?: string }) {
    try {
      const current = this.getRecentFoodSearches();
      const filtered = current.filter(
        (s) =>
          !(
            s.brand.toLowerCase() === search.brand.toLowerCase() &&
            s.productName.toLowerCase() === search.productName.toLowerCase() &&
            s.weightKg === search.weightKg &&
            s.city.toLowerCase() === search.city.toLowerCase()
          )
      );
      filtered.unshift({
        id: 'search_' + Date.now(),
        brand: search.brand,
        productName: search.productName,
        weightKg: search.weightKg,
        city: search.city,
        imageUrl: search.imageUrl,
        timestamp: Date.now(),
      });
      localStorage.setItem(STORAGE_KEYS.RECENT_FOOD_SEARCHES, JSON.stringify(filtered.slice(0, 6)));
    } catch {}
  },

  clearAllData() {
    localStorage.clear();
    this.initialize();
  },
};
