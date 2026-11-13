import { db } from './index.ts';
import { pets, feedingPlans, weightRecords, healthLogs, mealLogs, foodPurchases } from './schema.ts';
import { eq, and } from 'drizzle-orm';

// Helper to format ISO timestamp string or undefined
function formatTimestamp(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (val instanceof Date) return val.toISOString();
  return undefined;
}

// ==================== PETS ====================
export async function getPetsByUser(userId: string) {
  try {
    return await db.select().from(pets).where(eq(pets.userId, userId));
  } catch (error) {
    console.error('Database query failed in getPetsByUser:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function upsertPet(petData: any) {
  try {
    const cleanValues: typeof pets.$inferInsert = {
      id: String(petData.id),
      userId: String(petData.userId),
      name: String(petData.name || 'Mascota'),
      species: (petData.species === 'cat' ? 'cat' : 'dog') as 'cat' | 'dog',
      breed: String(petData.breed || 'Mestizo'),
      breedSize: petData.breedSize || null,
      sex: (petData.sex === 'female' ? 'female' : 'male') as 'male' | 'female',
      isNeutered: Boolean(petData.isNeutered ?? true),
      birthDate: petData.birthDate || null,
      ageYears: petData.ageYears !== undefined && petData.ageYears !== null ? Number(petData.ageYears) : null,
      currentWeightKg: Number(petData.currentWeightKg || 10),
      idealWeightKg: Number(petData.idealWeightKg || 10),
      targetWeightKg: Number(petData.targetWeightKg || 10),
      bcs: Number(petData.bcs || 5),
      activityLevel: String(petData.activityLevel || 'moderate'),
      photoUrl: petData.photoUrl || null,
      specialState: petData.specialState || 'none',
      createdAt: formatTimestamp(petData.createdAt),
    };

    const result = await db
      .insert(pets)
      .values(cleanValues)
      .onConflictDoUpdate({
        target: pets.id,
        set: {
          name: cleanValues.name,
          species: cleanValues.species,
          breed: cleanValues.breed,
          breedSize: cleanValues.breedSize,
          sex: cleanValues.sex,
          isNeutered: cleanValues.isNeutered,
          birthDate: cleanValues.birthDate,
          ageYears: cleanValues.ageYears,
          currentWeightKg: cleanValues.currentWeightKg,
          idealWeightKg: cleanValues.idealWeightKg,
          targetWeightKg: cleanValues.targetWeightKg,
          bcs: cleanValues.bcs,
          activityLevel: cleanValues.activityLevel,
          photoUrl: cleanValues.photoUrl,
          specialState: cleanValues.specialState,
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in upsertPet:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function deletePetById(petId: string, userId: string) {
  try {
    // Delete dependent records first
    await db.delete(feedingPlans).where(and(eq(feedingPlans.petId, petId), eq(feedingPlans.userId, userId)));
    await db.delete(weightRecords).where(and(eq(weightRecords.petId, petId), eq(weightRecords.userId, userId)));
    await db.delete(healthLogs).where(and(eq(healthLogs.petId, petId), eq(healthLogs.userId, userId)));
    await db.delete(mealLogs).where(and(eq(mealLogs.petId, petId), eq(mealLogs.userId, userId)));
    return await db.delete(pets).where(and(eq(pets.id, petId), eq(pets.userId, userId))).returning();
  } catch (error) {
    console.error('Database query failed in deletePetById:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

// ==================== FEEDING PLANS ====================
export async function getFeedingPlanByPet(petId: string, userId: string) {
  try {
    const result = await db
      .select()
      .from(feedingPlans)
      .where(and(eq(feedingPlans.petId, petId), eq(feedingPlans.userId, userId)));
    return result[0] || null;
  } catch (error) {
    console.error('Database query failed in getFeedingPlanByPet:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function upsertFeedingPlan(planData: any) {
  try {
    const cleanValues: typeof feedingPlans.$inferInsert = {
      id: String(planData.id || `plan_${planData.petId}`),
      petId: String(planData.petId),
      userId: String(planData.userId),
      foodBrand: planData.foodBrand ? String(planData.foodBrand) : null,
      foodName: planData.foodName ? String(planData.foodName) : null,
      foodType: planData.foodType ? String(planData.foodType) : 'dry',
      mealsPerDay: Number(planData.mealsPerDay || 2),
      gramsPerDay: Number(planData.gramsPerDay || 100),
      gramsPerMeal: Number(planData.gramsPerMeal || 50),
      rer: planData.rer !== undefined && planData.rer !== null ? Number(planData.rer) : null,
      mer: planData.mer !== undefined && planData.mer !== null ? Number(planData.mer) : null,
      factor: planData.factor !== undefined && planData.factor !== null ? Number(planData.factor) : null,
      treatsBudgetKcal: planData.treatsBudgetKcal !== undefined && planData.treatsBudgetKcal !== null ? Number(planData.treatsBudgetKcal) : null,
      createdAt: formatTimestamp(planData.createdAt),
    };

    const result = await db
      .insert(feedingPlans)
      .values(cleanValues)
      .onConflictDoUpdate({
        target: feedingPlans.id,
        set: {
          foodBrand: cleanValues.foodBrand,
          foodName: cleanValues.foodName,
          foodType: cleanValues.foodType,
          mealsPerDay: cleanValues.mealsPerDay,
          gramsPerDay: cleanValues.gramsPerDay,
          gramsPerMeal: cleanValues.gramsPerMeal,
          rer: cleanValues.rer,
          mer: cleanValues.mer,
          factor: cleanValues.factor,
          treatsBudgetKcal: cleanValues.treatsBudgetKcal,
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in upsertFeedingPlan:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

// ==================== WEIGHT RECORDS ====================
export async function getWeightRecordsByPet(petId: string, userId: string) {
  try {
    return await db
      .select()
      .from(weightRecords)
      .where(and(eq(weightRecords.petId, petId), eq(weightRecords.userId, userId)));
  } catch (error) {
    console.error('Database query failed in getWeightRecordsByPet:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function insertWeightRecord(recordData: any) {
  try {
    const cleanValues: typeof weightRecords.$inferInsert = {
      id: String(recordData.id || `w_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`),
      petId: String(recordData.petId),
      userId: String(recordData.userId),
      date: String(recordData.date),
      weightKg: Number(recordData.weightKg),
      waistCm: recordData.waistCm !== undefined && recordData.waistCm !== null ? Number(recordData.waistCm) : null,
      notes: recordData.notes ? String(recordData.notes) : null,
      createdAt: formatTimestamp(recordData.createdAt),
    };

    const result = await db
      .insert(weightRecords)
      .values(cleanValues)
      .onConflictDoUpdate({
        target: weightRecords.id,
        set: {
          weightKg: cleanValues.weightKg,
          waistCm: cleanValues.waistCm,
          notes: cleanValues.notes,
          date: cleanValues.date,
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in insertWeightRecord:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

// ==================== HEALTH LOGS ====================
export async function getHealthLogsByPet(petId: string, userId: string) {
  try {
    return await db
      .select()
      .from(healthLogs)
      .where(and(eq(healthLogs.petId, petId), eq(healthLogs.userId, userId)));
  } catch (error) {
    console.error('Database query failed in getHealthLogsByPet:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function insertHealthLog(logData: any) {
  try {
    const cleanValues: typeof healthLogs.$inferInsert = {
      id: String(logData.id || `h_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`),
      petId: String(logData.petId),
      userId: String(logData.userId),
      date: String(logData.date),
      type: String(logData.type || 'vaccine'),
      title: String(logData.title || 'Evento de salud'),
      notes: logData.notes ? String(logData.notes) : null,
      severity: String(logData.severity || 'normal'),
      createdAt: formatTimestamp(logData.createdAt),
    };

    const result = await db
      .insert(healthLogs)
      .values(cleanValues)
      .onConflictDoUpdate({
        target: healthLogs.id,
        set: {
          title: cleanValues.title,
          type: cleanValues.type,
          notes: cleanValues.notes,
          severity: cleanValues.severity,
          date: cleanValues.date,
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in insertHealthLog:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

// ==================== MEAL LOGS ====================
export async function getMealLogsByPet(petId: string, userId: string, date?: string) {
  try {
    if (date) {
      return await db
        .select()
        .from(mealLogs)
        .where(and(eq(mealLogs.petId, petId), eq(mealLogs.userId, userId), eq(mealLogs.date, date)));
    }
    return await db
      .select()
      .from(mealLogs)
      .where(and(eq(mealLogs.petId, petId), eq(mealLogs.userId, userId)));
  } catch (error) {
    console.error('Database query failed in getMealLogsByPet:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function upsertMealLog(logData: any) {
  try {
    const cleanValues: typeof mealLogs.$inferInsert = {
      id: String(logData.id || `m_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`),
      petId: String(logData.petId),
      userId: String(logData.userId),
      date: String(logData.date),
      mealIndex: Number(logData.mealIndex || 0),
      mealTime: String(logData.mealTime || '08:00'),
      gramsFed: Number(logData.gramsFed || 0),
      fedBy: String(logData.fedBy || 'Familia'),
      completed: Boolean(logData.completed),
      completedAt: logData.completedAt ? String(logData.completedAt) : null,
      createdAt: formatTimestamp(logData.createdAt),
    };

    const result = await db
      .insert(mealLogs)
      .values(cleanValues)
      .onConflictDoUpdate({
        target: mealLogs.id,
        set: {
          gramsFed: cleanValues.gramsFed,
          fedBy: cleanValues.fedBy,
          completed: cleanValues.completed,
          completedAt: cleanValues.completedAt,
          mealTime: cleanValues.mealTime,
          mealIndex: cleanValues.mealIndex,
          date: cleanValues.date,
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in upsertMealLog:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

// ==================== FOOD PURCHASES (GASTO EN COMIDA EN COP) ====================
export async function getFoodPurchasesByPet(petId: string) {
  try {
    return await db
      .select()
      .from(foodPurchases)
      .where(eq(foodPurchases.petId, petId))
      .orderBy(foodPurchases.date);
  } catch (error) {
    console.error('Database query failed in getFoodPurchasesByPet:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function insertFoodPurchase(purchaseData: any) {
  try {
    const cleanValues: typeof foodPurchases.$inferInsert = {
      id: String(purchaseData.id || `fp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`),
      petId: String(purchaseData.petId),
      userId: String(purchaseData.userId),
      date: String(purchaseData.date || new Date().toISOString().split('T')[0]),
      foodBrand: String(purchaseData.foodBrand || ''),
      foodName: String(purchaseData.foodName || ''),
      foodType: String(purchaseData.foodType || 'dry'),
      bagSizeKg: Number(purchaseData.bagSizeKg || 1),
      pricePaidCop: Number(purchaseData.pricePaidCop || 0),
      costPerKgCop: Number(purchaseData.costPerKgCop || (Number(purchaseData.pricePaidCop) / Number(purchaseData.bagSizeKg || 1))),
      storeName: purchaseData.storeName ? String(purchaseData.storeName) : null,
      receiptPhotoUrl: purchaseData.receiptPhotoUrl ? String(purchaseData.receiptPhotoUrl) : null,
      notes: purchaseData.notes ? String(purchaseData.notes) : null,
      createdAt: formatTimestamp(purchaseData.createdAt),
    };

    const result = await db.insert(foodPurchases).values(cleanValues).returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in insertFoodPurchase:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function deleteFoodPurchaseById(id: string, userId: string) {
  try {
    await db
      .delete(foodPurchases)
      .where(and(eq(foodPurchases.id, id), eq(foodPurchases.userId, userId)));
    return { success: true };
  } catch (error) {
    console.error('Database query failed in deleteFoodPurchaseById:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

