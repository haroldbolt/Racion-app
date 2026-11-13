import { Pet, FeedingPlan, WeightRecord, MealLog, FoodCostEntry } from '../types';

export interface DbStatusResponse {
  configured: boolean;
  engine: string;
  database: string;
  status: string;
}

export const CloudSqlService = {
  /**
   * Check connection and readiness of Cloud SQL
   */
  async checkConnection(): Promise<DbStatusResponse | null> {
    try {
      const res = await fetch('/api/db/init-status');
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch (e) {
      console.warn('Could not verify Cloud SQL init status:', e);
      return null;
    }
  },

  /**
   * Synchronize full local dataset to Cloud SQL upon authentication
   */
  async syncInitialData(
    idToken: string,
    data: {
      pets: Pet[];
      plans: Record<string, FeedingPlan>;
      weights: WeightRecord[];
      mealLogs: MealLog[];
    }
  ): Promise<boolean> {
    try {
      const res = await fetch('/api/sync/initial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(data),
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to sync initial data to Cloud SQL:', e);
      return false;
    }
  },

  /**
   * Save a single pet profile to Cloud SQL
   */
  async savePet(pet: Pet, idToken: string): Promise<boolean> {
    try {
      const res = await fetch('/api/pets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(pet),
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to save pet to Cloud SQL:', e);
      return false;
    }
  },

  /**
   * Save a feeding plan to Cloud SQL
   */
  async saveFeedingPlan(petId: string, plan: FeedingPlan, idToken: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/pets/${petId}/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(plan),
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to save plan to Cloud SQL:', e);
      return false;
    }
  },

  /**
   * Save a weight record to Cloud SQL
   */
  async saveWeightRecord(petId: string, record: WeightRecord, idToken: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/pets/${petId}/weights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(record),
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to save weight record to Cloud SQL:', e);
      return false;
    }
  },

  /**
   * Save a meal log (daily food record) to Cloud SQL
   */
  async saveMealLog(petId: string, log: MealLog, idToken: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/pets/${petId}/meals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(log),
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to save meal log to Cloud SQL:', e);
      return false;
    }
  },

  /**
   * Fetch all pets for the authenticated user from Cloud SQL
   */
  async fetchPets(idToken: string): Promise<Pet[] | null> {
    try {
      const res = await fetch('/api/pets', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch (e) {
      console.error('Failed to fetch pets from Cloud SQL:', e);
      return null;
    }
  },

  /**
   * Save food purchase (gasto en comida en COP) to Cloud SQL
   */
  async savePurchase(purchase: FoodCostEntry, idToken: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/pets/${purchase.petId}/purchases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(purchase),
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to save purchase to Cloud SQL:', e);
      return false;
    }
  },

  /**
   * Fetch all purchases for a pet from Cloud SQL
   */
  async fetchPurchases(petId: string, idToken: string): Promise<FoodCostEntry[] | null> {
    try {
      const res = await fetch(`/api/pets/${petId}/purchases`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        return data.purchases || [];
      }
      return null;
    } catch (e) {
      console.error('Failed to fetch purchases from Cloud SQL:', e);
      return null;
    }
  },

  /**
   * Delete food purchase from Cloud SQL
   */
  async deletePurchase(purchaseId: string, idToken: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/purchases/${purchaseId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to delete purchase from Cloud SQL:', e);
      return false;
    }
  },
};

