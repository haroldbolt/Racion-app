process.env.DISABLE_HMR = 'true';

import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  getOrCreateUser,
  getUserByUid,
  findUserByEmail,
  findUserByPhone,
  createCredentialUser,
} from './src/db/users.ts';
import {
  hashPassword,
  verifyPassword,
  signAppSessionToken,
  normalizeEmail,
  normalizePhone,
} from './src/lib/local-auth.ts';
import {
  getPetsByUser,
  upsertPet,
  deletePetById,
  getFeedingPlanByPet,
  upsertFeedingPlan,
  getWeightRecordsByPet,
  insertWeightRecord,
  getHealthLogsByPet,
  insertHealthLog,
  getMealLogsByPet,
  upsertMealLog,
  getFoodPurchasesByPet,
  insertFoodPurchase,
  deleteFoodPurchaseById,
} from './src/db/data.ts';
import { GoogleShoppingBackend } from './src/services/googleShoppingBackend.ts';
import { NutritionLookupBackend } from './src/services/nutritionLookupBackend.ts';
import { CloudDataService } from './src/services/cloudDataService.ts';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// In-memory backend monetization state store (tokenized, no raw card numbers or CVV)
interface TokenizedPaymentMethod {
  token: string;
  brand: string;
  last4: string;
  cardholderName: string;
  expMonth: string;
  expYear: string;
  authorizedChargeUsd: number; // Always 20 USD single one-time payment
  isPreAuthorizedSinglePayment: boolean; // Always true
  hasRecurringSubscription: boolean; // STRICTLY FALSE (Rule 4)
}

export type MonetizationStatus =
  | 'unregistered'
  | 'trial_active'
  | 'trial_expiring_soon' // <= 24 hours left
  | 'charged_lifetime' // 20 USD single charge completed successfully
  | 'canceled' // Canceled before trial end, 0 USD charged
  | 'payment_failed'; // Authorized charge failed at end of trial

interface MonetizationRecord {
  status: MonetizationStatus;
  userEmail: string;
  registeredAt?: string;
  trialEndsAt?: string;
  canceledAt?: string;
  chargedAt?: string;
  chargeTransactionId?: string;
  chargeAmountUsd: number;
  paymentMethod?: TokenizedPaymentMethod;
  reminder24hSent: boolean;
  timeOffsetMs: number; // For prototype simulation of advancing time
}

// Global server monetization state
let monetizationState: MonetizationRecord = {
  status: 'unregistered',
  userEmail: 'familia@ejemplo.com',
  chargeAmountUsd: 20,
  reminder24hSent: false,
  timeOffsetMs: 0,
};

// Helper: Get effective time including prototype simulation offset
function getEffectiveTime(): Date {
  return new Date(Date.now() + monetizationState.timeOffsetMs);
}

// Helper: Calculate remaining trial duration and determine current status
function calculateStatus(): {
  status: MonetizationStatus;
  hoursLeft: number;
  minutesLeft: number;
  is24hReminderDue: boolean;
  canAccessFeatures: boolean;
} {
  if (monetizationState.status === 'charged_lifetime') {
    return {
      status: 'charged_lifetime',
      hoursLeft: 0,
      minutesLeft: 0,
      is24hReminderDue: false,
      canAccessFeatures: true,
    };
  }

  if (monetizationState.status === 'canceled') {
    return {
      status: 'canceled',
      hoursLeft: 0,
      minutesLeft: 0,
      is24hReminderDue: false,
      canAccessFeatures: false,
    };
  }

  if (monetizationState.status === 'payment_failed') {
    return {
      status: 'payment_failed',
      hoursLeft: 0,
      minutesLeft: 0,
      is24hReminderDue: false,
      canAccessFeatures: false,
    };
  }

  if (monetizationState.status === 'unregistered' || !monetizationState.trialEndsAt) {
    return {
      status: 'unregistered',
      hoursLeft: 0,
      minutesLeft: 0,
      is24hReminderDue: false,
      canAccessFeatures: false,
    };
  }

  const effectiveNow = getEffectiveTime();
  const trialEnd = new Date(monetizationState.trialEndsAt);
  const diffMs = trialEnd.getTime() - effectiveNow.getTime();

  if (diffMs <= 0) {
    // 72h Trial has ended! In accordance with Rule 3:
    // Execute the single authorized one-time charge of USD 20.
    monetizationState.status = 'charged_lifetime';
    monetizationState.chargedAt = effectiveNow.toISOString();
    monetizationState.chargeTransactionId = 'txn_polar_onetime_' + Math.random().toString(36).substring(2, 10).toUpperCase();

    return {
      status: 'charged_lifetime',
      hoursLeft: 0,
      minutesLeft: 0,
      is24hReminderDue: false,
      canAccessFeatures: true,
    };
  }

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hoursLeft = Math.floor(totalMinutes / 60);
  const minutesLeft = totalMinutes % 60;
  const is24hReminderDue = hoursLeft <= 24;

  const status: MonetizationStatus = is24hReminderDue ? 'trial_expiring_soon' : 'trial_active';
  monetizationState.status = status;

  return {
    status,
    hoursLeft,
    minutesLeft,
    is24hReminderDue,
    canAccessFeatures: true, // During 72 hours, user enjoys all features without restrictions (Rule 2)
  };
}

// API Routes for Monetization

// 1. GET /api/monetization/status - Server-side permission check (Rule 8)
app.get('/api/monetization/status', (req, res) => {
  const calc = calculateStatus();
  res.json({
    status: calc.status,
    canAccessFeatures: calc.canAccessFeatures,
    trialStartedAt: monetizationState.registeredAt,
    trialEndsAt: monetizationState.trialEndsAt,
    hoursLeft: calc.hoursLeft,
    minutesLeft: calc.minutesLeft,
    is24hReminderDue: calc.is24hReminderDue,
    reminder24hSent: monetizationState.reminder24hSent,
    chargedAt: monetizationState.chargedAt,
    chargeTransactionId: monetizationState.chargeTransactionId,
    chargeAmountUsd: monetizationState.chargeAmountUsd,
    paymentMethod: monetizationState.paymentMethod
      ? {
          brand: monetizationState.paymentMethod.brand,
          last4: monetizationState.paymentMethod.last4,
          cardholderName: monetizationState.paymentMethod.cardholderName,
          token: monetizationState.paymentMethod.token,
        }
      : null,
    isOneTimePaymentOnly: true, // Rule 4
    hasRecurringSubscription: false, // Rule 4
    effectiveServerTime: getEffectiveTime().toISOString(),
  });
});

// 2. POST /api/monetization/register-trial - Starts exactly 72 hours trial with tokenized payment method (Rule 1 & 10)
app.post('/api/monetization/register-trial', (req, res) => {
  const { cardholderName, cardBrand, last4, expMonth, expYear, email } = req.body;

  if (!cardholderName || !last4) {
    return res.status(400).json({ error: 'Datos de método de pago requeridos.' });
  }

  // Tokenize payment method without storing raw card numbers or CVV (Rule 10)
  const token = 'pm_tok_' + Math.random().toString(36).substring(2, 12);
  const effectiveNow = getEffectiveTime();

  // Exactly 72 hours from confirmation (Rule 1)
  const trialEndDate = new Date(effectiveNow.getTime() + 72 * 60 * 60 * 1000);

  monetizationState = {
    ...monetizationState,
    status: 'trial_active',
    userEmail: email || monetizationState.userEmail,
    registeredAt: effectiveNow.toISOString(),
    trialEndsAt: trialEndDate.toISOString(),
    chargeAmountUsd: 20,
    reminder24hSent: false,
    paymentMethod: {
      token,
      brand: cardBrand || 'Visa',
      last4: String(last4).slice(-4),
      cardholderName,
      expMonth: expMonth || '12',
      expYear: expYear || '28',
      authorizedChargeUsd: 20,
      isPreAuthorizedSinglePayment: true,
      hasRecurringSubscription: false, // Explicitly forbidden (Rule 4 & 5)
    },
  };

  const calc = calculateStatus();
  res.json({
    success: true,
    message: 'Prueba gratuita de 72 horas iniciada con éxito. Cobro único diferido de USD 20 autorizado al vencer.',
    calc,
  });
});

// 3. POST /api/monetization/cancel-trial - Cancel before 72h without any charge (Rule 6)
app.post('/api/monetization/cancel-trial', (req, res) => {
  const effectiveNow = getEffectiveTime();

  monetizationState.status = 'canceled';
  monetizationState.canceledAt = effectiveNow.toISOString();
  // Payment authorization revoked; 0 USD charged
  monetizationState.chargeTransactionId = undefined;

  res.json({
    success: true,
    message: 'Prueba cancelada antes de las 72 horas. Se ha revocado la autorización con cobro de USD 0.',
    status: 'canceled',
    canAccessFeatures: false,
  });
});

// 4. POST /api/monetization/check-access - Backend-enforced authorization gate (Rule 8 & 9)
app.post('/api/monetization/check-access', (req, res) => {
  const { feature } = req.body;
  const calc = calculateStatus();

  // Indispensable features allowed even if canceled/failed (Rule 9):
  // Account management, payments, settings, data export, account deletion, privacy.
  const essentialFeatures = ['settings', 'payment_management', 'data_export', 'account_deletion', 'privacy'];
  if (essentialFeatures.includes(feature)) {
    return res.json({ allowed: true, reason: 'Essential data access permitted.' });
  }

  if (calc.canAccessFeatures) {
    return res.json({ allowed: true, status: calc.status });
  }

  return res.status(403).json({
    allowed: false,
    status: calc.status,
    error: 'Acceso bloqueado: la prueba gratuita finalizó o fue cancelada. Desbloquea la licencia de por vida para continuar.',
  });
});

// 5. Prototype simulation endpoints (Rule 11: simulate all states without real charges)
app.post('/api/monetization/simulate/advance-hours', (req, res) => {
  const { hours } = req.body;
  const addMs = (Number(hours) || 1) * 60 * 60 * 1000;
  monetizationState.timeOffsetMs += addMs;
  const calc = calculateStatus();
  res.json({
    success: true,
    message: `Tiempo simulado avanzado ${hours} horas.`,
    newEffectiveTime: getEffectiveTime().toISOString(),
    calc,
  });
});

app.post('/api/monetization/simulate/fail-payment', (req, res) => {
  monetizationState.status = 'payment_failed';
  res.json({
    success: true,
    message: 'Simulación: Cobro diferido rechazado por el banco (fondos insuficientes). Funcionalidades de pago bloqueadas.',
    status: 'payment_failed',
  });
});

app.post('/api/monetization/simulate/unlock-lifetime', (req, res) => {
  monetizationState.status = 'charged_lifetime';
  monetizationState.chargedAt = getEffectiveTime().toISOString();
  monetizationState.chargeTransactionId = 'txn_manual_verified_' + Math.random().toString(36).substring(2, 8).toUpperCase();
  res.json({
    success: true,
    message: 'Simulación: Pago único de USD 20 completado. Licencia permanente activada.',
    status: 'charged_lifetime',
  });
});

app.post('/api/monetization/simulate/reset', (req, res) => {
  monetizationState = {
    status: 'unregistered',
    userEmail: 'familia@ejemplo.com',
    chargeAmountUsd: 20,
    reminder24hSent: false,
    timeOffsetMs: 0,
  };
  res.json({
    success: true,
    message: 'Estado de monetización reiniciado a no registrado.',
  });
});

// ==================== MULTI-METHOD ACCOUNT AUTHENTICATION ====================

// Register with Email + Password OR Phone + Password/PIN (backed by Cloud SQL)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { method = 'email', email, phone, password, displayName } = req.body || {};

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Debes ingresar una contraseña o clave.' });
    }

    if (method === 'phone') {
      const digits = normalizePhone(String(phone || ''));
      if (digits.length < 7 || digits.length > 15) {
        return res.status(400).json({ error: 'Ingresa un número de celular válido (7 a 15 dígitos).' });
      }
      if (password.length < 4) {
        return res.status(400).json({ error: 'La clave o PIN debe tener al menos 4 caracteres.' });
      }

      const existingPhone = await findUserByPhone(digits);
      if (existingPhone) {
        return res.status(409).json({
          error: 'Ya existe una cuenta registrada con este número de celular. Inicia sesión.',
        });
      }

      const backupEmail = email ? normalizeEmail(String(email)) : '';
      if (backupEmail) {
        const existingEmail = await findUserByEmail(backupEmail);
        if (existingEmail) {
          return res.status(409).json({
            error: 'Ese correo electrónico ya está registrado en otra cuenta.',
          });
        }
      }

      const safeEmail = backupEmail || `${digits}@celular.racionapp.local`;
      const created = await createCredentialUser({
        email: safeEmail,
        phone: digits,
        displayName: displayName ? String(displayName).trim() : `Usuario ${digits.slice(-4)}`,
        passwordHash: hashPassword(password),
        authProvider: 'phone',
      });

      CloudDataService.upsertUserProfile(created.uid, {
        email: created.email,
        displayName: created.displayName || undefined,
      });

      const token = signAppSessionToken({
        uid: created.uid,
        email: created.email,
        displayName: created.displayName,
        phone: created.phone,
        authProvider: 'phone',
      });

      return res.json({
        success: true,
        token,
        user: {
          uid: created.uid,
          email: created.email,
          displayName: created.displayName,
          phoneNumber: created.phone,
          authProvider: 'phone',
        },
      });
    }

    // Default: email + password (Outlook, Hotmail, Yahoo, iCloud, Gmail, corporativo, etc.)
    const normalizedEmail = normalizeEmail(String(email || ''));
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      if (!existingUser.passwordHash && existingUser.authProvider === 'google') {
        return res.status(409).json({
          error: 'Este correo ya tiene una cuenta vinculada con Google. Usa el botón "Continuar con Google".',
        });
      }
      return res.status(409).json({
        error: 'Este correo electrónico ya está registrado. Te sugerimos Iniciar Sesión.',
      });
    }

    const cleanName = displayName ? String(displayName).trim() : normalizedEmail.split('@')[0];
    const created = await createCredentialUser({
      email: normalizedEmail,
      phone: null,
      displayName: cleanName,
      passwordHash: hashPassword(password),
      authProvider: 'email',
    });

    CloudDataService.upsertUserProfile(created.uid, {
      email: created.email,
      displayName: created.displayName || undefined,
    });

    const token = signAppSessionToken({
      uid: created.uid,
      email: created.email,
      displayName: created.displayName,
      phone: null,
      authProvider: 'email',
    });

    return res.json({
      success: true,
      token,
      user: {
        uid: created.uid,
        email: created.email,
        displayName: created.displayName,
        phoneNumber: null,
        authProvider: 'email',
      },
    });
  } catch (error: any) {
    console.error('Register endpoint failed:', error);
    return res.status(500).json({ error: 'No se pudo crear la cuenta en este momento. Inténtalo de nuevo.' });
  }
});

// Login with Email OR Phone + Password/PIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    const rawIdentifier = String(identifier || '').trim();

    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: 'Ingresa tu correo o celular y tu contraseña.' });
    }

    const isEmail = rawIdentifier.includes('@');
    const user = isEmail
      ? await findUserByEmail(rawIdentifier)
      : await findUserByPhone(rawIdentifier);

    if (!user) {
      return res.status(401).json({
        error: 'No encontramos una cuenta con esos datos. Verifica tu correo/celular o crea una cuenta nueva.',
      });
    }

    if (!user.passwordHash) {
      return res.status(401).json({
        error: 'Esta cuenta fue creada con Google. Haz clic en "Continuar con Google" para ingresar.',
      });
    }

    if (!verifyPassword(String(password), user.passwordHash)) {
      return res.status(401).json({
        error: 'Contraseña incorrecta. Verifica tus datos e inténtalo de nuevo.',
      });
    }

    const authProvider = user.authProvider === 'phone' ? 'phone' : 'email';
    const token = signAppSessionToken({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      phone: user.phone,
      authProvider,
    });

    return res.json({
      success: true,
      token,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        phoneNumber: user.phone,
        authProvider,
      },
    });
  } catch (error: any) {
    console.error('Login endpoint failed:', error);
    return res.status(500).json({ error: 'No se pudo iniciar sesión. Inténtalo de nuevo.' });
  }
});

// Validate existing app session token
app.get('/api/auth/session', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const dbUser = await getUserByUid(uid);
    if (!dbUser) {
      return res.status(404).json({ error: 'Sesión no encontrada.' });
    }
    return res.json({
      success: true,
      user: {
        uid: dbUser.uid,
        email: dbUser.email,
        displayName: dbUser.displayName,
        phoneNumber: dbUser.phone,
        authProvider: dbUser.authProvider || 'email',
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Error verificando sesión.' });
  }
});

// ==================== CLOUD SQL POSTGRESQL API ROUTES ====================

// 1. Sync / Register user in Cloud SQL
app.get('/api/user/sync', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || 'user@example.com';
    const name = (req.user as any).name || (req.user as any).displayName || 'Usuario';
    const provider = (req.user as any).authProvider || 'google';
    const user = await getOrCreateUser(uid, email, name, provider);
    res.json({ success: true, user });
  } catch (error: any) {
    console.error('Failed to sync user in Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error synchronizing user' });
  }
});

// 2. Pets CRUD
app.get('/api/pets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const userPets = await getPetsByUser(uid);
    res.json(userPets);
  } catch (error: any) {
    console.error('Failed to get pets from Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error fetching pets' });
  }
});

app.post('/api/pets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const petData = req.body;
    const saved = await upsertPet({ ...petData, userId: uid });
    res.json({ success: true, pet: saved });
  } catch (error: any) {
    console.error('Failed to save pet in Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error saving pet' });
  }
});

app.delete('/api/pets/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const petId = req.params.id;
    await deletePetById(petId, uid);
    res.json({ success: true, message: 'Pet deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete pet in Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error deleting pet' });
  }
});

// 3. Feeding Plan
app.get('/api/pets/:id/plan', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const petId = req.params.id;
    const plan = await getFeedingPlanByPet(petId, uid);
    res.json(plan);
  } catch (error: any) {
    console.error('Failed to get plan from Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error fetching plan' });
  }
});

app.post('/api/pets/:id/plan', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const petId = req.params.id;
    const planData = req.body;
    const saved = await upsertFeedingPlan({ ...planData, petId, userId: uid });
    res.json({ success: true, plan: saved });
  } catch (error: any) {
    console.error('Failed to save plan in Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error saving feeding plan' });
  }
});

// 4. Weight Records
app.get('/api/pets/:id/weights', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const petId = req.params.id;
    const records = await getWeightRecordsByPet(petId, uid);
    res.json(records);
  } catch (error: any) {
    console.error('Failed to get weights from Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error fetching weights' });
  }
});

app.post('/api/pets/:id/weights', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const petId = req.params.id;
    const recordData = req.body;
    const saved = await insertWeightRecord({ ...recordData, petId, userId: uid });
    res.json({ success: true, record: saved });
  } catch (error: any) {
    console.error('Failed to save weight record in Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error saving weight record' });
  }
});

// 5. Health Logs
app.get('/api/pets/:id/health', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const petId = req.params.id;
    const logs = await getHealthLogsByPet(petId, uid);
    res.json(logs);
  } catch (error: any) {
    console.error('Failed to get health logs from Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error fetching health logs' });
  }
});

app.post('/api/pets/:id/health', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const petId = req.params.id;
    const logData = req.body;
    const saved = await insertHealthLog({ ...logData, petId, userId: uid });
    res.json({ success: true, log: saved });
  } catch (error: any) {
    console.error('Failed to save health log in Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error saving health log' });
  }
});

// 6. Meal Logs (Registros de Comida)
app.get('/api/pets/:id/meals', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const petId = req.params.id;
    const date = req.query.date as string | undefined;
    const logs = await getMealLogsByPet(petId, uid, date);
    res.json(logs);
  } catch (error: any) {
    console.error('Failed to get meal logs from Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error fetching meal logs' });
  }
});

app.post('/api/pets/:id/meals', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const petId = req.params.id;
    const mealData = req.body;
    const saved = await upsertMealLog({ ...mealData, petId, userId: uid });
    res.json({ success: true, log: saved });
  } catch (error: any) {
    console.error('Failed to save meal log in Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error saving meal log' });
  }
});

// Food Purchases / Costs API (Pesos Colombianos - COP)
app.get('/api/pets/:id/purchases', requireAuth, async (req: AuthRequest, res) => {
  try {
    const petId = req.params.id;
    const purchases = await getFoodPurchasesByPet(petId);
    res.json({ success: true, purchases });
  } catch (error: any) {
    console.error('Failed to get food purchases from Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error fetching purchases' });
  }
});

app.post('/api/pets/:id/purchases', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const petId = req.params.id;
    const purchaseData = req.body;
    const saved = await insertFoodPurchase({ ...purchaseData, petId, userId: uid });
    res.json({ success: true, purchase: saved });
  } catch (error: any) {
    console.error('Failed to save food purchase in Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error saving purchase' });
  }
});

app.delete('/api/purchases/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const purchaseId = req.params.id;
    await deleteFoodPurchaseById(purchaseId, uid);
    res.json({ success: true, message: 'Purchase deleted' });
  } catch (error: any) {
    console.error('Failed to delete food purchase from Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Error deleting purchase' });
  }
});

// 7. Initial Connection & Verification Service
app.get('/api/db/init-status', async (_req, res) => {
  try {
    const isConfigured = Boolean(
      process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_DB_NAME
    );
    res.json({
      configured: isConfigured,
      engine: 'PostgreSQL (Cloud SQL)',
      database: process.env.SQL_DB_NAME || 'default',
      status: 'ready',
    });
  } catch (error: any) {
    res.status(500).json({ configured: false, error: error.message });
  }
});

// 8. Batch Initial Sync for User Data
app.post('/api/sync/initial', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || 'user@example.com';
    const name = (req.user as any).name || (req.user as any).displayName || 'Usuario';
    const { pets: initialPets, plans: initialPlans, weights: initialWeights, mealLogs: initialMealLogs } = req.body;

    // Ensure user exists
    await getOrCreateUser(uid, email, name);

    // Save pets
    if (Array.isArray(initialPets)) {
      for (const p of initialPets) {
        await upsertPet({ ...p, userId: uid });
      }
    }

    // Save feeding plans
    if (initialPlans && typeof initialPlans === 'object') {
      for (const [petId, plan] of Object.entries(initialPlans as Record<string, any>)) {
        if (plan) {
          await upsertFeedingPlan({ ...plan, petId, userId: uid });
        }
      }
    }

    // Save weights
    if (Array.isArray(initialWeights)) {
      for (const w of initialWeights) {
        await insertWeightRecord({ ...w, userId: uid });
      }
    }

    // Save meal logs
    if (Array.isArray(initialMealLogs)) {
      for (const m of initialMealLogs) {
        await upsertMealLog({ ...m, userId: uid });
      }
    }

    res.json({ success: true, message: 'All initial user data synced to Cloud SQL.' });
  } catch (error: any) {
    console.error('Initial sync failed:', error);
    res.status(500).json({ error: error.message || 'Failed initial sync' });
  }
});

// 9. Process Queued Offline Mutations in Batch
app.post('/api/sync/batch', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const { operations } = req.body;

    if (!Array.isArray(operations) || operations.length === 0) {
      return res.json({ success: true, processedCount: 0, processedIds: [] });
    }

    const processedIds: string[] = [];
    const failedItems: Array<{ id: string; error: string }> = [];

    for (const op of operations) {
      try {
        switch (op.type) {
          case 'upsert_pet':
            await upsertPet({ ...op.payload, userId: uid });
            processedIds.push(op.id);
            break;
          case 'delete_pet':
            await deletePetById(op.payload.id, uid);
            processedIds.push(op.id);
            break;
          case 'save_plan':
            await upsertFeedingPlan({ ...op.payload, petId: op.payload.petId, userId: uid });
            processedIds.push(op.id);
            break;
          case 'save_weight':
            await insertWeightRecord({ ...op.payload, userId: uid });
            processedIds.push(op.id);
            break;
          case 'save_meal':
            await upsertMealLog({ ...op.payload, userId: uid });
            processedIds.push(op.id);
            break;
          case 'save_purchase':
            await insertFoodPurchase({ ...op.payload, userId: uid });
            processedIds.push(op.id);
            break;
          case 'delete_purchase':
            await deleteFoodPurchaseById(op.payload.id, uid);
            processedIds.push(op.id);
            break;
          default:
            console.warn(`Unknown sync operation type: ${op.type}`);
            processedIds.push(op.id); // discard unknown to prevent queue jam
        }
      } catch (err: any) {
        console.error(`Failed processing sync item ${op.id} (${op.type}):`, err);
        failedItems.push({ id: op.id, error: err.message || 'Operation failed' });
      }
    }

    res.json({
      success: true,
      processedCount: processedIds.length,
      processedIds,
      failedCount: failedItems.length,
      failedItems,
    });
  } catch (error: any) {
    console.error('Batch sync endpoint failure:', error);
    res.status(500).json({ error: error.message || 'Failed batch sync' });
  }
});

// 10. Price Comparator & Google Shopping Provider Endpoints
app.get('/api/price-comparator/status', (req, res) => {
  try {
    const status = GoogleShoppingBackend.getStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed getting comparator status' });
  }
});

app.post('/api/price-comparator/search', async (req, res) => {
  try {
    const {
      productName,
      brand,
      presentationWeightKg,
      weightKg,
      presentationUnit,
      city,
      species,
      forceRefresh,
    } = req.body;

    if (!productName || !brand) {
      return res.status(400).json({ error: 'productName and brand are required' });
    }

    const weight = Number(presentationWeightKg ?? weightKg) || 15;
    const result = await GoogleShoppingBackend.searchPrices({
      productName,
      brand,
      presentationWeightKg: weight,
      presentationUnit: presentationUnit || 'kg',
      city: city || 'Bogotá',
      species,
      forceRefresh: Boolean(forceRefresh),
    });

    // Auto-record verified observations into CloudDataService for real historical tracking
    if (result && Array.isArray(result.allOffers)) {
      for (const offer of result.allOffers) {
        if (offer.priceCop > 0) {
          CloudDataService.recordObservation({
            productBrand: result.targetBrand,
            productName: result.targetProductName,
            presentationWeightKg: result.presentationWeightKg,
            city: result.city,
            merchantName: offer.merchantName,
            priceCop: offer.priceCop,
            shippingCostCop: offer.shippingCostCop ?? null,
            totalCostCop: offer.totalCostCop ?? null,
            productUrl: offer.productUrl,
            sourceEngine: offer.sourceEngine,
            isVerified: offer.verificationStatus === 'verified',
          });
        }
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error('Price comparator search failed:', error);
    res.status(500).json({ error: error.message || 'Error consultando comparador de precios' });
  }
});

app.post('/api/price-comparator/verify', async (req, res) => {
  try {
    const { offerUrl } = req.body;
    if (!offerUrl) {
      return res.status(400).json({ error: 'offerUrl is required' });
    }
    const verification = await GoogleShoppingBackend.verifyOffer(offerUrl);
    res.json(verification);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Verification error' });
  }
});

app.post('/api/price-comparator/config-key', (req, res) => {
  try {
    const { apiKey } = req.body;
    const success = GoogleShoppingBackend.setDynamicKey(apiKey);
    const updatedStatus = GoogleShoppingBackend.getStatus();
    res.json({ success, status: updatedStatus });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed updating key' });
  }
});

app.post('/api/price-comparator/discover-products', async (req, res) => {
  try {
    const { query, city, species } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    const products = await GoogleShoppingBackend.discoverProductsFromInternet({
      query,
      city: city || 'Bogotá',
      species,
    });
    res.json({ products });
  } catch (error: any) {
    console.error('Discover products failed:', error);
    res.status(500).json({ error: error.message || 'Failed to discover products' });
  }
});

app.post('/api/price-comparator/product-presentations', async (req, res) => {
  try {
    const { brand, productName, city } = req.body;
    if (!brand || !productName) {
      return res.status(400).json({ error: 'brand and productName are required' });
    }
    const result = await GoogleShoppingBackend.getLiveOnlinePresentations({
      brand,
      productName,
      city: city || 'Bogotá',
    });
    res.json(result);
  } catch (error: any) {
    console.error('Fetch live presentations failed:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch live presentations' });
  }
});

// 10b. Live Web Nutritional Datasheet Verification Endpoint
app.post('/api/nutrition/compare-lookup', async (req, res) => {
  try {
    const { foods, forceRefresh } = req.body || {};
    if (!Array.isArray(foods) || foods.length === 0) {
      return res.status(400).json({ error: 'foods array is required' });
    }
    const result = await NutritionLookupBackend.lookupAndVerifyFoods({
      foods,
      forceRefresh: Boolean(forceRefresh),
    });
    res.json(result);
  } catch (error: any) {
    console.error('Nutrition compare lookup failed:', error);
    res.status(500).json({ error: error.message || 'Error verificando fichas nutricionales en internet' });
  }
});

// 11. Price History Endpoint (30-day real observations, daily minimums, median)
app.get('/api/price-history', (req, res) => {
  try {
    const brand = String(req.query.brand || '');
    const productName = String(req.query.product || req.query.productName || '');
    const weightKg = Number(req.query.weight || req.query.presentationWeightKg) || 15;
    const city = String(req.query.city || 'Bogotá');
    const days = Number(req.query.days) || 30;

    const history = CloudDataService.getPriceHistory(brand, productName, weightKg, city, days);
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching price history' });
  }
});

// 12. "Compra a tiempo" / Tracked Price Alerts
app.get('/api/price-alerts', requireAuth, (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const alerts = CloudDataService.getTrackedAlerts(uid);
    res.json(alerts);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching price alerts' });
  }
});

app.post('/api/price-alerts', requireAuth, (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const { petId, foodBrand, foodName, bagSizeKg, targetPriceCop, targetIncludesShipping, alertEnabled } = req.body;
    if (!foodBrand || !foodName || !targetPriceCop) {
      return res.status(400).json({ error: 'foodBrand, foodName and targetPriceCop are required' });
    }
    const saved = CloudDataService.saveTrackedAlert({
      userId: uid,
      petId,
      foodBrand,
      foodName,
      bagSizeKg: Number(bagSizeKg) || 15,
      targetPriceCop: Number(targetPriceCop),
      targetIncludesShipping: Boolean(targetIncludesShipping),
      alertEnabled: alertEnabled !== false,
    });
    res.json({ success: true, alert: saved });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error saving price alert' });
  }
});

app.delete('/api/price-alerts/:id', requireAuth, (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const success = CloudDataService.deleteTrackedAlert(uid, req.params.id);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error deleting price alert' });
  }
});

// 13. User Profile & Preferences
app.get('/api/user/profile', requireAuth, (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const profile = CloudDataService.getUserProfile(uid);
    res.json({ success: true, profile });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching user profile' });
  }
});

app.put('/api/user/profile', requireAuth, (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const updates = req.body;
    const saved = CloudDataService.upsertUserProfile(uid, {
      ...updates,
      email: req.user!.email || updates.email || '',
    });
    res.json({ success: true, profile: saved });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error updating user profile' });
  }
});

// 14. Family Sharing Endpoints
app.post('/api/family/invite', requireAuth, (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || 'owner@example.com';
    const { petIds, role } = req.body;
    if (!Array.isArray(petIds) || petIds.length === 0) {
      return res.status(400).json({ error: 'At least one petId is required' });
    }
    const invite = CloudDataService.createFamilyInvite(uid, email, petIds, role || 'feeder');
    res.json({ success: true, invite });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error generating invite' });
  }
});

app.post('/api/family/accept', requireAuth, (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || 'caregiver@example.com';
    const { inviteCode } = req.body;
    if (!inviteCode) {
      return res.status(400).json({ error: 'inviteCode is required' });
    }
    const result = CloudDataService.acceptFamilyInvite(inviteCode, uid, email);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Error accepting invite' });
  }
});

app.get('/api/family/caregivers', requireAuth, (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const data = CloudDataService.getCaregiversForOwner(uid);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching caregivers' });
  }
});

app.get('/api/family/shared-pets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const sharedAccess = CloudDataService.getSharedPetsForCaregiver(uid);
    if (sharedAccess.length === 0) {
      return res.json([]);
    }
    const sharedPetsList: any[] = [];
    for (const sa of sharedAccess) {
      const ownerPets = await getPetsByUser(sa.ownerUid);
      const pet = ownerPets.find((p) => p.id === sa.petId);
      if (pet) {
        sharedPetsList.push({
          ...pet,
          isSharedPet: true,
          sharedRole: sa.role,
          sharedBy: sa.ownerUid,
          ownerEmail: sa.caregiverEmail,
        });
      }
    }
    res.json(sharedPetsList);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching shared pets' });
  }
});

app.post('/api/family/revoke', requireAuth, (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const { caregiverUid, petId } = req.body;
    if (!caregiverUid) {
      return res.status(400).json({ error: 'caregiverUid is required' });
    }
    const success = CloudDataService.revokeCaregiverAccess(uid, caregiverUid, petId);
    res.json({ success });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error revoking access' });
  }
});

// 15. Guest Local Data Import
app.post('/api/sync/import-local', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const { pets: localPets, plans: localPlans, weights: localWeights } = req.body;

    const existingPets = await getPetsByUser(uid);
    const existingIds = new Set(existingPets.map((p) => p.id));
    let importedPets = 0;

    if (Array.isArray(localPets)) {
      for (const p of localPets) {
        if (!existingIds.has(p.id)) {
          await upsertPet({ ...p, userId: uid });
          importedPets++;
          if (localPlans && localPlans[p.id]) {
            await upsertFeedingPlan({ ...localPlans[p.id], petId: p.id, userId: uid });
          }
        }
      }
    }

    if (Array.isArray(localWeights)) {
      for (const w of localWeights) {
        await insertWeightRecord({ ...w, userId: uid });
      }
    }

    res.json({ success: true, importedPetsCount: importedPets });
  } catch (error: any) {
    console.error('Failed to import local data:', error);
    res.status(500).json({ error: error.message || 'Failed local data import' });
  }
});

// 16. Privacy: Data Export & Account Deletion
app.get('/api/user/export', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const userPets = await getPetsByUser(uid);
    const profile = CloudDataService.getUserProfile(uid);
    const alerts = CloudDataService.getTrackedAlerts(uid);

    res.json({
      exportDate: new Date().toISOString(),
      uid,
      profile,
      pets: userPets,
      trackedAlerts: alerts,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Export failed' });
  }
});

app.post('/api/user/delete-account', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const userPets = await getPetsByUser(uid);
    for (const p of userPets) {
      await deletePetById(p.id, uid);
    }
    CloudDataService.deleteUserData(uid);
    res.json({
      success: true,
      message: 'Cuenta y datos personales eliminados con éxito. Los comprobantes fiscales de transacciones se conservan por requisito contable legal.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Account deletion failed' });
  }
});

// Dev server / Vite middleware setup
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, () => {
    console.log(`[Ración App Server] Server running on port ${PORT}`);
  });
}

startServer();
