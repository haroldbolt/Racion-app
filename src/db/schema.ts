import { boolean, doublePrecision, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table linked to Firebase Auth UID or Cloud SQL account UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID or local account UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  phone: text('phone'),
  passwordHash: text('password_hash'),
  authProvider: text('auth_provider').default('google'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
});

// Pets table
export const pets = pgTable('pets', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .references(() => users.uid)
    .notNull(),
  name: text('name').notNull(),
  species: text('species').notNull(), // 'dog' | 'cat'
  breed: text('breed').notNull(),
  breedSize: text('breed_size'),
  sex: text('sex').notNull(), // 'male' | 'female'
  isNeutered: boolean('is_neutered').default(true).notNull(),
  birthDate: text('birth_date'),
  ageYears: doublePrecision('age_years'),
  currentWeightKg: doublePrecision('current_weight_kg').notNull(),
  idealWeightKg: doublePrecision('ideal_weight_kg').notNull(),
  targetWeightKg: doublePrecision('target_weight_kg').notNull(),
  bcs: integer('bcs').notNull(), // 1 - 9
  activityLevel: text('activity_level').notNull(), // 'low' | 'moderate' | 'high'
  photoUrl: text('photo_url'),
  specialState: text('special_state').default('none'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
});

// Feeding Plans table
export const feedingPlans = pgTable('feeding_plans', {
  id: text('id').primaryKey(),
  petId: text('pet_id')
    .references(() => pets.id)
    .notNull(),
  userId: text('user_id')
    .references(() => users.uid)
    .notNull(),
  foodBrand: text('food_brand'),
  foodName: text('food_name'),
  foodType: text('food_type').default('dry'),
  mealsPerDay: integer('meals_per_day').notNull(),
  gramsPerDay: integer('grams_per_day').notNull(),
  gramsPerMeal: integer('grams_per_meal').notNull(),
  rer: integer('rer'),
  mer: integer('mer'),
  factor: doublePrecision('factor'),
  treatsBudgetKcal: integer('treats_budget_kcal'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
});

// Weight Records table
export const weightRecords = pgTable('weight_records', {
  id: text('id').primaryKey(),
  petId: text('pet_id')
    .references(() => pets.id)
    .notNull(),
  userId: text('user_id')
    .references(() => users.uid)
    .notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  weightKg: doublePrecision('weight_kg').notNull(),
  waistCm: doublePrecision('waist_cm'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
});

// Health Logs table
export const healthLogs = pgTable('health_logs', {
  id: text('id').primaryKey(),
  petId: text('pet_id')
    .references(() => pets.id)
    .notNull(),
  userId: text('user_id')
    .references(() => users.uid)
    .notNull(),
  date: text('date').notNull(),
  type: text('type').notNull(), // 'vaccine' | 'vet_visit' | 'deworming' | 'symptom'
  title: text('title').notNull(),
  notes: text('notes'),
  severity: text('severity').default('normal').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
});

// Meal Logs table (registros diarios de comida)
export const mealLogs = pgTable('meal_logs', {
  id: text('id').primaryKey(),
  petId: text('pet_id')
    .references(() => pets.id)
    .notNull(),
  userId: text('user_id')
    .references(() => users.uid)
    .notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  mealIndex: integer('meal_index').notNull(),
  mealTime: text('meal_time').notNull(),
  gramsFed: integer('grams_fed').notNull(),
  fedBy: text('fed_by').notNull(),
  completed: boolean('completed').default(false).notNull(),
  completedAt: text('completed_at'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
});

// Food Purchases / Costs table (registro de compras y costos de comida en COP)
export const foodPurchases = pgTable('food_purchases', {
  id: text('id').primaryKey(),
  petId: text('pet_id')
    .references(() => pets.id)
    .notNull(),
  userId: text('user_id')
    .references(() => users.uid)
    .notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  foodBrand: text('food_brand').notNull(),
  foodName: text('food_name').notNull(),
  foodType: text('food_type').default('dry').notNull(),
  bagSizeKg: doublePrecision('bag_size_kg').notNull(),
  pricePaidCop: doublePrecision('price_paid_cop').notNull(),
  costPerKgCop: doublePrecision('cost_per_kg_cop').notNull(),
  storeName: text('store_name'),
  receiptPhotoUrl: text('receipt_photo_url'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  pets: many(pets),
  feedingPlans: many(feedingPlans),
  weightRecords: many(weightRecords),
  healthLogs: many(healthLogs),
  mealLogs: many(mealLogs),
  foodPurchases: many(foodPurchases),
}));

export const petsRelations = relations(pets, ({ one, many }) => ({
  owner: one(users, {
    fields: [pets.userId],
    references: [users.uid],
  }),
  feedingPlans: many(feedingPlans),
  weightRecords: many(weightRecords),
  healthLogs: many(healthLogs),
  mealLogs: many(mealLogs),
  foodPurchases: many(foodPurchases),
}));

export const feedingPlansRelations = relations(feedingPlans, ({ one }) => ({
  pet: one(pets, {
    fields: [feedingPlans.petId],
    references: [pets.id],
  }),
  user: one(users, {
    fields: [feedingPlans.userId],
    references: [users.uid],
  }),
}));

export const weightRecordsRelations = relations(weightRecords, ({ one }) => ({
  pet: one(pets, {
    fields: [weightRecords.petId],
    references: [pets.id],
  }),
  user: one(users, {
    fields: [weightRecords.userId],
    references: [users.uid],
  }),
}));

export const healthLogsRelations = relations(healthLogs, ({ one }) => ({
  pet: one(pets, {
    fields: [healthLogs.petId],
    references: [pets.id],
  }),
  user: one(users, {
    fields: [healthLogs.userId],
    references: [users.uid],
  }),
}));

export const mealLogsRelations = relations(mealLogs, ({ one }) => ({
  pet: one(pets, {
    fields: [mealLogs.petId],
    references: [pets.id],
  }),
  user: one(users, {
    fields: [mealLogs.userId],
    references: [users.uid],
  }),
}));

export const foodPurchasesRelations = relations(foodPurchases, ({ one }) => ({
  pet: one(pets, {
    fields: [foodPurchases.petId],
    references: [pets.id],
  }),
  user: one(users, {
    fields: [foodPurchases.userId],
    references: [users.uid],
  }),
}));

