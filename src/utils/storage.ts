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
import { repairVetExamples } from './vetRecords';
import { localDateKey } from './localDate';
import { getPlanCostSummary, sameFormulaName, withPlanCosts } from './foodCosts';
import { getPlannedMealComponents, getPlannedMeals } from './mealPortions';

import { accountData, STORAGE_KEYS } from './accountStorage';

const DEFAULT_USER: UserAccount = {
  email: '',
  isLicensed: false,
  language: 'es',
  units: 'metric',
  theme: 'light',
  familyName: '',
  familyMembers: [],
  remindersEnabled: true,
  whatsappOptIn: false,
};

function migrateDatedLogs(key: string, timestampPattern: RegExp) {
  try {
    const data = accountData.getItem(key);
    if (!data) return;

    const entries: { id: string; date: string }[] = JSON.parse(data);
    let changed = false;
    for (const entry of entries) {
      const timestamp = timestampPattern.exec(entry.id)?.[1];
      if (!timestamp) continue;

      const createdAt = new Date(Number(timestamp));
      if (createdAt.toISOString().slice(0, 10) !== entry.date) continue;

      const localDay = localDateKey(createdAt);
      if (localDay !== entry.date) {
        entry.date = localDay;
        changed = true;
      }
    }

    if (changed) accountData.setItem(key, JSON.stringify(entries));
  } catch {
    // Keep the original values if a legacy entry cannot be read.
  }
}

function migrateHydrationDates() {
  try {
    const states: Record<string, HydrationDailyState> = JSON.parse(accountData.getItem(STORAGE_KEYS.HYDRATION_STATE) || '{}');
    const water: Record<string, number> = JSON.parse(accountData.getItem(STORAGE_KEYS.WATER_LOGS) || '{}');
    let statesChanged = false;
    let waterChanged = false;

    for (const [key, state] of Object.entries(states)) {
      if (!state.updatedAt) continue;
      const updated = new Date(state.updatedAt);
      if (Number.isNaN(updated.getTime())) continue;

      const utcDay = updated.toISOString().slice(0, 10);
      const localDay = localDateKey(updated);
      if (utcDay === localDay || !key.endsWith(`_${utcDay}`)) continue;

      const localKey = key.slice(0, -utcDay.length) + localDay;
      // Two saved snapshots can straddle the old UTC boundary. Keep both when they overlap.
      if (Object.hasOwn(states, localKey)) continue;

      states[localKey] = state;
      delete states[key];
      statesChanged = true;
      if (Object.hasOwn(water, key) && water[key] === state.bowlsLogged && !Object.hasOwn(water, localKey)) {
        water[localKey] = water[key];
        delete water[key];
        waterChanged = true;
      }
    }

    if (statesChanged) accountData.setItem(STORAGE_KEYS.HYDRATION_STATE, JSON.stringify(states));
    if (waterChanged) accountData.setItem(STORAGE_KEYS.WATER_LOGS, JSON.stringify(water));
  } catch {
    // Keep the original values if a legacy entry cannot be read.
  }
}

export const StorageService = {
  initialize() {
    if (typeof window === 'undefined') return;
    const pets = this.getPets();
    if (pets.some(p => p.vetGuideline && !p.vetGuideline.confirmedByGuardian && !p.vetGuideline.needsReview)) {
      const rawPlans = accountData.getItem(STORAGE_KEYS.PLANS);
      let plans: Record<string, FeedingPlan> | undefined;
      try {
        const parsed = JSON.parse(rawPlans ?? '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) plans = parsed;
      } catch { /* Keep an unreadable plan store intact. */ }
      if (repairVetExamples(pets, plans ?? {})) {
        // Write plans first so an interrupted write can safely retry on the next load.
        if (plans && rawPlans !== null) accountData.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans));
        this.savePets(pets);
      }
    }
    if (accountData.getItem(STORAGE_KEYS.LOCAL_DIARY_DATES)) return;

    // These IDs encode the recording instant. Entries dated manually keep their selected day.
    migrateDatedLogs(STORAGE_KEYS.MEAL_LOGS, /^ml_(\d{13})_/);
    migrateDatedLogs(STORAGE_KEYS.TREAT_LOGS, /^tr_(\d{13})$/);
    migrateDatedLogs(STORAGE_KEYS.WEIGHT_RECORDS, /^w_(\d{13})$/);
    migrateDatedLogs(STORAGE_KEYS.HEALTH_LOGS, /^hl_water_(\d{13})$/);
    migrateHydrationDates();
    accountData.setItem(STORAGE_KEYS.LOCAL_DIARY_DATES, 'true');
  },

  getPets(): Pet[] {
    try {
      const data = accountData.getItem(STORAGE_KEYS.PETS);
      const pets: unknown = data ? JSON.parse(data) : [];
      return Array.isArray(pets) ? pets : [];
    } catch {
      return [];
    }
  },

  savePets(pets: Pet[]) {
    accountData.setItem(STORAGE_KEYS.PETS, JSON.stringify(pets));
  },

  deletePet(petId: string) {
    const pets = this.getPets().filter(p => p.id !== petId);
    accountData.setItem(STORAGE_KEYS.PETS, JSON.stringify(pets));
    if (this.getActivePetId() === petId && pets.length > 0) {
      this.setActivePetId(pets[0].id);
    }
  },

  getActivePetId(): string {
    const id = accountData.getItem(STORAGE_KEYS.ACTIVE_PET_ID);
    const pets = this.getPets();
    if (id && pets.some((p) => p.id === id)) return id;
    const fallbackId = pets[0]?.id || '';
    if (fallbackId) {
      accountData.setItem(STORAGE_KEYS.ACTIVE_PET_ID, fallbackId);
    }
    return fallbackId;
  },

  setActivePetId(id: string) {
    accountData.setItem(STORAGE_KEYS.ACTIVE_PET_ID, id);
  },

  getActivePet(): Pet | undefined {
    const pets = this.getPets();
    const id = this.getActivePetId();
    return pets.find(p => p.id === id) || pets[0];
  },

  getPlans(): Record<string, FeedingPlan> {
    try {
      const data = accountData.getItem(STORAGE_KEYS.PLANS);
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
    plans[plan.petId] = withPlanCosts(plan, this.getFoodPurchases(plan.petId));
    accountData.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans));
  },

  getTodayMealLogs(petId: string): MealLog[] {
    const today = localDateKey();
    try {
      const data = accountData.getItem(STORAGE_KEYS.MEAL_LOGS);
      const all: MealLog[] = data ? JSON.parse(data) : [];
      const latestByMeal = new Map<number, MealLog>();
      for (const log of all) {
        if (log.petId === petId && log.date === today) {
          latestByMeal.set(log.mealIndex, log);
        }
      }
      return Array.from(latestByMeal.values());
    } catch {
      return [];
    }
  },

  getMealHistory(petId: string): MealLog[] {
    try {
      const logs: MealLog[] = JSON.parse(accountData.getItem(STORAGE_KEYS.MEAL_LOGS) || '[]');
      const latest = new Map<string, MealLog>();
      for (const log of logs) {
        if (log.petId === petId) latest.set(log.date + '/' + log.mealIndex, log);
      }
      return [...latest.values()].filter((entry) => entry.completed).sort(
        (a, b) => b.date.localeCompare(a.date) || b.mealTime.localeCompare(a.mealTime)
      );
    } catch { return []; }
  },

  toggleMealCompleted(
    petId: string,
    mealIndex: number,
    fedBy: string,
    grams: number,
    scheduledTime: string,
    plannedGrams?: number,
    forceCompleteWithGrams?: boolean,
    mixedComponents?: import('../types').MealMixedComponent[],
    gramsEaten?: number
  ): MealLog {
    const now = new Date();
    const today = localDateKey(now);
    const data = accountData.getItem(STORAGE_KEYS.MEAL_LOGS);
    const all: MealLog[] = data ? JSON.parse(data) : [];

    const current = all.slice().reverse().find(
      l => l.petId === petId && l.date === today && l.mealIndex === mealIndex,
    );
    const completedAt = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (current?.completed && !forceCompleteWithGrams) {
      current.completed = false;
      current.completedAt = undefined;
      accountData.setItem(STORAGE_KEYS.MEAL_LOGS, JSON.stringify(all));
      return current;
    }
    const plan = this.getPlan(petId);
    const portion = plan && getPlannedMeals(plan)[mealIndex];
    const components: import('../types').MealMixedComponent[] = mixedComponents ?? (plan && portion && getPlannedMealComponents(plan, portion, grams)) ??
      [{ foodName: plan?.foodName || 'Alimento registrado', role: 'main' as const, gramsPlanned: plannedGrams ?? grams, gramsFed: grams, kcalPerKg: 0 }];
    const cost = getPlanCostSummary(plan, this.getFoodPurchases(petId));
    const eaten = Math.max(0, Math.min(grams, gramsEaten ?? grams));
    const snapshots = components.map((item) => {
      // An edited log keeps its original price, including historical entries with no price.
      const price = current?.completed ? undefined : cost.components.find(({food, role}) =>
        role === item.role && (food.id === item.foodId || Boolean(food.sourceFoodId && food.sourceFoodId === item.sourceFoodId)) &&
        sameFormulaName(food, {brand:item.brand, name:item.foodName, sourceFoodId:item.sourceFoodId}));
      return {
        ...item,
        gramsEaten: item.gramsEaten ?? (components.length === 1 ? eaten : item.gramsFed),
        priceSnapshot: item.priceSnapshot ?? {
          copPerGram: price?.costPerGramCop,
          source: price?.basis?.source,
          packageKg: price?.packageKg,
        },
      };
    });
    const log: MealLog = {
      id: current?.id ?? 'ml_' + now.getTime() + '_' + Math.random(),
      petId, date: today, mealIndex, mealTime: scheduledTime, plannedGrams: plannedGrams ?? grams,
      gramsFed: grams, gramsEaten: eaten, mixedComponents: snapshots, fedBy, completed: true, completedAt,
    };
    if (current) Object.assign(current, log);
    else all.push(log);
    accountData.setItem(STORAGE_KEYS.MEAL_LOGS, JSON.stringify(all));
    return log;
  },

  getWeightRecords(petId: string): WeightRecord[] {
    try {
      const data = accountData.getItem(STORAGE_KEYS.WEIGHT_RECORDS);
      const all: WeightRecord[] = data ? JSON.parse(data) : [];
      return all.filter(w => w.petId === petId).sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  },

  addWeightRecord(record: WeightRecord): boolean {
    const data = accountData.getItem(STORAGE_KEYS.WEIGHT_RECORDS);
    const all: WeightRecord[] = data ? JSON.parse(data) : [];
    const hasNewerWeight = all.some(weight => weight.petId === record.petId && weight.date > record.date);
    all.push(record);
    accountData.setItem(STORAGE_KEYS.WEIGHT_RECORDS, JSON.stringify(all));

    if (hasNewerWeight) return false;

    const pets = this.getPets();
    const pet = pets.find(p => p.id === record.petId);
    if (!pet || pet.currentWeightKg === record.weightKg) return false;

    pet.currentWeightKg = record.weightKg;
    this.savePets(pets);
    return true;
  },

  getHealthLogs(petId: string): HealthLog[] {
    try {
      const data = accountData.getItem(STORAGE_KEYS.HEALTH_LOGS);
      const all: HealthLog[] = data ? JSON.parse(data) : [];
      return all.filter(h => h.petId === petId).sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      return [];
    }
  },

  addHealthLog(log: HealthLog) {
    const data = accountData.getItem(STORAGE_KEYS.HEALTH_LOGS);
    const all: HealthLog[] = data ? JSON.parse(data) : [];
    all.unshift(log);
    accountData.setItem(STORAGE_KEYS.HEALTH_LOGS, JSON.stringify(all));
  },

  getWaterGlassesToday(petId: string, today = localDateKey()): number {
    try {
      const data = accountData.getItem(STORAGE_KEYS.WATER_LOGS);
      const map = data ? JSON.parse(data) : {};
      return map[`${petId}_${today}`] || 0;
    } catch {
      return 0;
    }
  },

  setWaterGlassesToday(petId: string, count: number, today = localDateKey()) {
    try {
      const data = accountData.getItem(STORAGE_KEYS.WATER_LOGS);
      const map = data ? JSON.parse(data) : {};
      map[`${petId}_${today}`] = Math.max(0, count);
      accountData.setItem(STORAGE_KEYS.WATER_LOGS, JSON.stringify(map));
    } catch {
      // ignore
    }
  },

  getHydrationStateToday(petId: string): HydrationDailyState {
    const today = localDateKey();
    const bowls = this.getWaterGlassesToday(petId, today);
    try {
      const data = accountData.getItem(STORAGE_KEYS.HYDRATION_STATE);
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
    const now = new Date();
    const today = localDateKey(now);
    this.setWaterGlassesToday(petId, state.bowlsLogged, today);
    try {
      const data = accountData.getItem(STORAGE_KEYS.HYDRATION_STATE);
      const map = data ? JSON.parse(data) : {};
      map[`${petId}_${today}`] = {
        ...state,
        updatedAt: now.toISOString(),
      };
      accountData.setItem(STORAGE_KEYS.HYDRATION_STATE, JSON.stringify(map));
    } catch {
      // ignore
    }
  },

  getTreatLogsToday(petId: string): TreatLog[] {
    const today = localDateKey();
    return this.getTreatHistory(petId).filter((entry) => entry.date === today);
  },

  getTreatHistory(petId: string): TreatLog[] {
    try {
      const data = accountData.getItem(STORAGE_KEYS.TREAT_LOGS);
      const all: TreatLog[] = data ? JSON.parse(data) : [];
      return all.filter((l) => l.petId === petId);
    } catch {
      return [];
    }
  },

  addTreatLog(log: TreatLog) {
    try {
      const data = accountData.getItem(STORAGE_KEYS.TREAT_LOGS);
      const all: TreatLog[] = data ? JSON.parse(data) : [];
      all.unshift(log);
      accountData.setItem(STORAGE_KEYS.TREAT_LOGS, JSON.stringify(all));
    } catch {
      // ignore
    }
  },

  deleteTreatLog(id: string) {
    try {
      const data = accountData.getItem(STORAGE_KEYS.TREAT_LOGS);
      const all: TreatLog[] = data ? JSON.parse(data) : [];
      const filtered = all.filter((l) => l.id !== id);
      accountData.setItem(STORAGE_KEYS.TREAT_LOGS, JSON.stringify(filtered));
    } catch {
      // ignore
    }
  },

  getTrainingRationGramsToday(petId: string): number {
    const today = localDateKey();
    try {
      const data = accountData.getItem(STORAGE_KEYS.TRAINING_RATION);
      const map = data ? JSON.parse(data) : {};
      return Math.max(0, Number(map[`${petId}_${today}`]) || 0);
    } catch {
      return 0;
    }
  },

  setTrainingRationGramsToday(petId: string, grams: number) {
    const today = localDateKey();
    try {
      const data = accountData.getItem(STORAGE_KEYS.TRAINING_RATION);
      const map = data ? JSON.parse(data) : {};
      map[`${petId}_${today}`] = Math.max(0, Math.round(grams));
      accountData.setItem(STORAGE_KEYS.TRAINING_RATION, JSON.stringify(map));
    } catch {
      // ignore
    }
  },

  getUserAccount(): UserAccount {
    try {
      const data = accountData.getItem(STORAGE_KEYS.USER_ACCOUNT);
      return data ? { ...DEFAULT_USER, ...JSON.parse(data) } : DEFAULT_USER;
    } catch {
      return DEFAULT_USER;
    }
  },

  saveUserAccount(acc: UserAccount) {
    accountData.setItem(STORAGE_KEYS.USER_ACCOUNT, JSON.stringify(acc));
  },

  getCustomFoods(): FoodItem[] {
    try {
      const data = accountData.getItem(STORAGE_KEYS.CUSTOM_FOODS);
      const list = data ? JSON.parse(data) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  },

  addCustomFood(food: FoodItem) {
    const list = this.getCustomFoods().filter((saved) => saved.id !== food.id);
    accountData.setItem(STORAGE_KEYS.CUSTOM_FOODS, JSON.stringify([food, ...list]));
  },

  getFoodPurchases(petId?: string): FoodCostEntry[] {
    try {
      const data = accountData.getItem(STORAGE_KEYS.FOOD_PURCHASES);
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
    accountData.setItem(STORAGE_KEYS.FOOD_PURCHASES, JSON.stringify(all));
    const plan = this.getPlan(entry.petId);
    if (plan) this.savePlan(plan);
  },

  deleteFoodPurchase(id: string) {
    const all = this.getFoodPurchases();
    const filtered = all.filter(p => p.id !== id);
    accountData.setItem(STORAGE_KEYS.FOOD_PURCHASES, JSON.stringify(filtered));
    const removed = all.find((entry) => entry.id === id);
    const plan = removed && this.getPlan(removed.petId);
    if (plan) this.savePlan(plan);
  },

  updateFoodPurchase(entry: FoodCostEntry) {
    const all = this.getFoodPurchases();
    const idx = all.findIndex(p => p.id === entry.id);
    if (idx >= 0) {
      all[idx] = entry;
      accountData.setItem(STORAGE_KEYS.FOOD_PURCHASES, JSON.stringify(all));
      const plan = this.getPlan(entry.petId);
      if (plan) this.savePlan(plan);
    }
  },

  exportAllDataJSON(): string {
    const read = (key: string, fallback: unknown): unknown => {
      try {
        const stored = accountData.getItem(key);
        return stored === null ? fallback : JSON.parse(stored);
      } catch {
        return fallback;
      }
    };
    const payload = {
      exportedAt: new Date().toISOString(),
      account: this.getUserAccount(),
      pets: this.getPets(),
      plans: this.getPlans(),
      mealLogs: read(STORAGE_KEYS.MEAL_LOGS, []),
      treatLogs: read(STORAGE_KEYS.TREAT_LOGS, []),
      trainingRation: read(STORAGE_KEYS.TRAINING_RATION, {}),
      hydrationState: read(STORAGE_KEYS.HYDRATION_STATE, {}),
      waterLogs: read(STORAGE_KEYS.WATER_LOGS, {}),
      weightRecords: read(STORAGE_KEYS.WEIGHT_RECORDS, []),
      healthLogs: read(STORAGE_KEYS.HEALTH_LOGS, []),
      customFoods: this.getCustomFoods(),
      foodPurchases: this.getFoodPurchases(),
    };
    return JSON.stringify(payload, null, 2);
  },

  getUserCity(): string {
    return accountData.getItem(STORAGE_KEYS.USER_CITY) || 'Bogotá';
  },

  setUserCity(city: string): void {
    accountData.setItem(STORAGE_KEYS.USER_CITY, city);
  },

  getRecentFoodSearches(): RecentFoodSearch[] {
    try {
      const data = accountData.getItem(STORAGE_KEYS.RECENT_FOOD_SEARCHES);
      if (data) return JSON.parse(data);
    } catch {}
    return [];
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
      accountData.setItem(STORAGE_KEYS.RECENT_FOOD_SEARCHES, JSON.stringify(filtered.slice(0, 6)));
    } catch {}
  },

  clearAllData() {
    accountData.clear();
  },
};
