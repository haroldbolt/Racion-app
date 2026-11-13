-- ============================================================================
-- RACIÓN APP - CLOUD SQL FOR POSTGRESQL DATABASE SCHEMA
-- Compatible with Cloud SQL Developer Edition & Drizzle ORM
-- ============================================================================

-- 1. Users (Auth Linked)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uid TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Pet Profiles (Perfiles de Mascotas)
CREATE TABLE IF NOT EXISTS pets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    name TEXT NOT NULL,
    species TEXT NOT NULL CHECK (species IN ('dog', 'cat')),
    breed TEXT NOT NULL,
    breed_size TEXT CHECK (breed_size IN ('toy', 'small', 'medium', 'large', 'giant')),
    sex TEXT NOT NULL CHECK (sex IN ('male', 'female')),
    is_neutered BOOLEAN NOT NULL DEFAULT TRUE,
    birth_date TEXT,
    age_years DOUBLE PRECISION,
    current_weight_kg DOUBLE PRECISION NOT NULL,
    ideal_weight_kg DOUBLE PRECISION NOT NULL,
    target_weight_kg DOUBLE PRECISION NOT NULL,
    bcs INTEGER NOT NULL CHECK (bcs BETWEEN 1 AND 9),
    activity_level TEXT NOT NULL CHECK (activity_level IN ('low', 'moderate', 'high')),
    photo_url TEXT,
    special_state TEXT DEFAULT 'none',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Feeding Plans (Planes Alimenticios)
CREATE TABLE IF NOT EXISTS feeding_plans (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    food_brand TEXT,
    food_name TEXT,
    food_type TEXT DEFAULT 'dry' CHECK (food_type IN ('dry', 'wet', 'mixed', 'barf', 'cooked')),
    meals_per_day INTEGER NOT NULL CHECK (meals_per_day > 0),
    grams_per_day INTEGER NOT NULL,
    grams_per_meal INTEGER NOT NULL,
    rer INTEGER,
    mer INTEGER,
    factor DOUBLE PRECISION,
    treats_budget_kcal INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Weight Records (Pesajes e Historial de Peso)
CREATE TABLE IF NOT EXISTS weight_records (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    date TEXT NOT NULL,
    weight_kg DOUBLE PRECISION NOT NULL,
    waist_cm DOUBLE PRECISION,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Meal Logs (Registros de Comida Diarios)
CREATE TABLE IF NOT EXISTS meal_logs (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    date TEXT NOT NULL,
    meal_index INTEGER NOT NULL,
    meal_time TEXT NOT NULL,
    grams_fed INTEGER NOT NULL,
    fed_by TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Health & Veterinary Logs
CREATE TABLE IF NOT EXISTS health_logs (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    notes TEXT,
    severity TEXT NOT NULL DEFAULT 'normal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexing for fast queries by user and pet
CREATE INDEX IF NOT EXISTS idx_pets_user_id ON pets(user_id);
CREATE INDEX IF NOT EXISTS idx_plans_pet_id ON feeding_plans(pet_id);
CREATE INDEX IF NOT EXISTS idx_weights_pet_date ON weight_records(pet_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_logs_pet_date ON meal_logs(pet_id, date);
CREATE INDEX IF NOT EXISTS idx_health_pet_date ON health_logs(pet_id, date);
