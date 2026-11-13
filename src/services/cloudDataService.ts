import fs from 'fs';
import path from 'path';

// Persistent file-backed store for cloud metadata, price history, family sharing and alerts
const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'cloud_app_store.json');

export interface UserProfilePreferences {
  uid: string;
  email: string;
  displayName?: string;
  language: 'es' | 'en';
  units: 'metric' | 'imperial';
  city: string;
  remindersEnabled: boolean;
  theme: 'light' | 'dark';
  isLicensed: boolean;
  licenseKey?: string;
  notificationsOptIn: boolean;
  updatedAt: string;
}

export interface PriceObservation {
  id: string;
  productBrand: string;
  productName: string;
  presentationWeightKg: number;
  city: string;
  merchantName: string;
  priceCop: number;
  shippingCostCop: number | null;
  totalCostCop: number | null;
  productUrl: string;
  sourceEngine: string;
  isVerified: boolean;
  observationDate: string; // YYYY-MM-DD
  observedAt: string; // ISO string
}

export interface TrackedProductAlert {
  id: string;
  userId: string;
  petId?: string;
  foodBrand: string;
  foodName: string;
  bagSizeKg: number;
  targetPriceCop: number;
  targetIncludesShipping: boolean;
  alertEnabled: boolean;
  lastCheckedPriceCop?: number;
  lastAlertSentAt?: string;
  createdAt: string;
}

export interface FamilyInviteRecord {
  id: string;
  inviteCode: string;
  ownerUid: string;
  ownerEmail: string;
  petIds: string[];
  role: 'feeder' | 'weighed_and_fed' | 'viewer';
  status: 'pending' | 'accepted' | 'revoked';
  acceptedByUid?: string;
  acceptedByEmail?: string;
  createdAt: string;
}

export interface SharedPetAccessRecord {
  id: string;
  petId: string;
  ownerUid: string;
  caregiverUid: string;
  caregiverEmail: string;
  role: 'feeder' | 'weighed_and_fed' | 'viewer';
  grantedAt: string;
}

interface AppStoreData {
  profiles: Record<string, UserProfilePreferences>;
  priceObservations: PriceObservation[];
  trackedAlerts: Record<string, TrackedProductAlert[]>; // userId -> alerts
  invites: FamilyInviteRecord[];
  sharedAccess: SharedPetAccessRecord[];
}

let store: AppStoreData = {
  profiles: {},
  priceObservations: [],
  trackedAlerts: {},
  invites: [],
  sharedAccess: [],
};

// Ensure data dir and load from disk
function initStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_FILE)) {
      const content = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      store = {
        profiles: parsed.profiles || {},
        priceObservations: parsed.priceObservations || [],
        trackedAlerts: parsed.trackedAlerts || {},
        invites: parsed.invites || [],
        sharedAccess: parsed.sharedAccess || [],
      };
    } else {
      saveStore();
    }
  } catch (e) {
    console.error('Failed to initialize cloud store:', e);
  }
}

function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save cloud store:', e);
  }
}

initStore();

export const CloudDataService = {
  // ================= USER PROFILES & PREFERENCES =================
  getUserProfile(uid: string): UserProfilePreferences | null {
    return store.profiles[uid] || null;
  },

  upsertUserProfile(uid: string, updates: Partial<UserProfilePreferences>): UserProfilePreferences {
    const existing = store.profiles[uid] || {
      uid,
      email: updates.email || '',
      displayName: updates.displayName || 'Usuario',
      language: 'es',
      units: 'metric',
      city: 'Bogotá',
      remindersEnabled: true,
      theme: 'light',
      isLicensed: false,
      notificationsOptIn: false,
      updatedAt: new Date().toISOString(),
    };

    const updated: UserProfilePreferences = {
      ...existing,
      ...updates,
      uid,
      updatedAt: new Date().toISOString(),
    };

    store.profiles[uid] = updated;
    saveStore();
    return updated;
  },

  // ================= PRICE HISTORY & OBSERVATIONS =================
  recordObservation(obs: Omit<PriceObservation, 'id' | 'observationDate' | 'observedAt'>) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    // Check if an identical observation already exists today to prevent duplicate logs on reload
    const existingIndex = store.priceObservations.findIndex(
      (o) =>
        o.productBrand.toLowerCase() === obs.productBrand.toLowerCase() &&
        o.productName.toLowerCase() === obs.productName.toLowerCase() &&
        Math.abs(o.presentationWeightKg - obs.presentationWeightKg) < 0.1 &&
        o.city.toLowerCase() === obs.city.toLowerCase() &&
        o.merchantName.toLowerCase() === obs.merchantName.toLowerCase() &&
        o.observationDate === dateStr
    );

    if (existingIndex >= 0) {
      // Update with latest observed price
      store.priceObservations[existingIndex].priceCop = obs.priceCop;
      store.priceObservations[existingIndex].shippingCostCop = obs.shippingCostCop;
      store.priceObservations[existingIndex].totalCostCop = obs.totalCostCop;
      store.priceObservations[existingIndex].productUrl = obs.productUrl;
    } else {
      const newObs: PriceObservation = {
        ...obs,
        id: 'obs_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        observationDate: dateStr,
        observedAt: now.toISOString(),
      };
      store.priceObservations.push(newObs);
    }

    // Keep observations bounded to last 60 days
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    store.priceObservations = store.priceObservations.filter((o) => o.observationDate >= cutoff);

    saveStore();
  },

  getPriceHistory(
    brand: string,
    productName: string,
    presentationWeightKg: number,
    city: string,
    daysLimit = 30
  ) {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - daysLimit * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const targetBrand = brand.toLowerCase().trim();
    const targetProduct = productName.toLowerCase().trim();
    const targetCity = city.toLowerCase().trim();

    // Filter observations matching exact brand, product, weight and city within window
    const matches = store.priceObservations.filter((obs) => {
      const brandMatch = obs.productBrand.toLowerCase().includes(targetBrand) || targetBrand.includes(obs.productBrand.toLowerCase());
      const weightMatch = Math.abs(obs.presentationWeightKg - presentationWeightKg) < 0.5;
      const cityMatch =
        obs.city.toLowerCase() === targetCity ||
        obs.city.toLowerCase().includes('nacional') ||
        targetCity.includes('nacional');
      const inWindow = obs.observationDate >= cutoffDate;

      return brandMatch && weightMatch && cityMatch && inWindow && obs.priceCop > 0;
    });

    // Group observations by observationDate, taking the minimum verified product price for each day
    const byDate: Record<string, PriceObservation[]> = {};
    for (const m of matches) {
      if (!byDate[m.observationDate]) byDate[m.observationDate] = [];
      byDate[m.observationDate].push(m);
    }

    const sortedDates = Object.keys(byDate).sort();

    const dailyPoints = sortedDates.map((dateStr) => {
      const dayObs = byDate[dateStr];
      // Find lowest product price for this day
      let minObs = dayObs[0];
      for (const o of dayObs) {
        if (o.priceCop < minObs.priceCop) minObs = o;
      }

      // Format date for display: "12 Oct", "15 Nov"
      const [year, month, day] = dateStr.split('-');
      const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const formattedDate = `${parseInt(day)} ${monthNames[d.getMonth()]}`;

      return {
        date: dateStr,
        formattedDate,
        minPriceCop: minObs.priceCop,
        merchantName: minObs.merchantName,
        shippingCostCop: minObs.shippingCostCop,
        totalCostCop: minObs.totalCostCop,
        productUrl: minObs.productUrl,
        observationsCount: dayObs.length,
      };
    });

    const prices = dailyPoints.map((p) => p.minPriceCop);
    let minPrice: number | null = null;
    let currentPrice: number | null = null;
    let medianPrice: number | null = null;

    if (prices.length > 0) {
      currentPrice = dailyPoints[dailyPoints.length - 1].minPriceCop;
      minPrice = Math.min(...prices);

      const sortedPrices = [...prices].sort((a, b) => a - b);
      const mid = Math.floor(sortedPrices.length / 2);
      medianPrice = sortedPrices.length % 2 !== 0 ? sortedPrices[mid] : (sortedPrices[mid - 1] + sortedPrices[mid]) / 2;
    }

    return {
      brand,
      productName,
      presentationWeightKg,
      city,
      daysWithData: dailyPoints.length,
      hasSufficientData: dailyPoints.length >= 2,
      currentPrice,
      minPrice,
      medianPrice,
      points: dailyPoints,
      comparableBaseNote: 'Base comparable: menor precio verificado del producto antes de costos de envío.',
    };
  },

  // ================= "COMPRA A TIEMPO" / PRICE ALERTS =================
  getTrackedAlerts(userId: string): TrackedProductAlert[] {
    return store.trackedAlerts[userId] || [];
  },

  saveTrackedAlert(alert: Omit<TrackedProductAlert, 'id' | 'createdAt'>): TrackedProductAlert {
    if (!store.trackedAlerts[alert.userId]) {
      store.trackedAlerts[alert.userId] = [];
    }

    const existingIndex = store.trackedAlerts[alert.userId].findIndex(
      (a) =>
        a.foodBrand.toLowerCase() === alert.foodBrand.toLowerCase() &&
        a.foodName.toLowerCase() === alert.foodName.toLowerCase() &&
        Math.abs(a.bagSizeKg - alert.bagSizeKg) < 0.2
    );

    const fullAlert: TrackedProductAlert = {
      ...alert,
      id: existingIndex >= 0 ? store.trackedAlerts[alert.userId][existingIndex].id : 'alert_' + Date.now(),
      createdAt: existingIndex >= 0 ? store.trackedAlerts[alert.userId][existingIndex].createdAt : new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      store.trackedAlerts[alert.userId][existingIndex] = fullAlert;
    } else {
      store.trackedAlerts[alert.userId].push(fullAlert);
    }

    saveStore();
    return fullAlert;
  },

  deleteTrackedAlert(userId: string, alertId: string): boolean {
    if (!store.trackedAlerts[userId]) return false;
    const initialLen = store.trackedAlerts[userId].length;
    store.trackedAlerts[userId] = store.trackedAlerts[userId].filter((a) => a.id !== alertId);
    saveStore();
    return store.trackedAlerts[userId].length < initialLen;
  },

  // ================= FAMILY SHARING & CAREGIVERS =================
  createFamilyInvite(
    ownerUid: string,
    ownerEmail: string,
    petIds: string[],
    role: 'feeder' | 'weighed_and_fed' | 'viewer' = 'feeder'
  ): FamilyInviteRecord {
    const inviteCode = 'RACION-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const record: FamilyInviteRecord = {
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      inviteCode,
      ownerUid,
      ownerEmail,
      petIds,
      role,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    store.invites.push(record);
    saveStore();
    return record;
  },

  acceptFamilyInvite(inviteCode: string, caregiverUid: string, caregiverEmail: string) {
    const invite = store.invites.find(
      (i) => i.inviteCode.toUpperCase() === inviteCode.trim().toUpperCase() && i.status === 'pending'
    );

    if (!invite) {
      throw new Error('Código de invitación no válido o expirado.');
    }

    if (invite.ownerUid === caregiverUid) {
      throw new Error('No puedes unirte a una invitación generada por tu propia cuenta.');
    }

    invite.status = 'accepted';
    invite.acceptedByUid = caregiverUid;
    invite.acceptedByEmail = caregiverEmail;

    // Grant access to each shared pet
    for (const petId of invite.petIds) {
      // Remove any prior access to avoid duplication
      store.sharedAccess = store.sharedAccess.filter(
        (sa) => !(sa.petId === petId && sa.caregiverUid === caregiverUid)
      );

      store.sharedAccess.push({
        id: 'acc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        petId,
        ownerUid: invite.ownerUid,
        caregiverUid,
        caregiverEmail,
        role: invite.role,
        grantedAt: new Date().toISOString(),
      });
    }

    saveStore();
    return {
      success: true,
      sharedPetIds: invite.petIds,
      ownerEmail: invite.ownerEmail,
      role: invite.role,
    };
  },

  getCaregiversForOwner(ownerUid: string) {
    const invites = store.invites.filter((i) => i.ownerUid === ownerUid);
    const shared = store.sharedAccess.filter((s) => s.ownerUid === ownerUid);

    return {
      activeCaregivers: shared,
      pendingInvites: invites.filter((i) => i.status === 'pending'),
    };
  },

  getSharedPetsForCaregiver(caregiverUid: string): SharedPetAccessRecord[] {
    return store.sharedAccess.filter((s) => s.caregiverUid === caregiverUid);
  },

  revokeCaregiverAccess(ownerUid: string, caregiverUid: string, petId?: string): boolean {
    const beforeLen = store.sharedAccess.length;
    store.sharedAccess = store.sharedAccess.filter((s) => {
      if (s.ownerUid !== ownerUid || s.caregiverUid !== caregiverUid) return true;
      if (petId && s.petId !== petId) return true;
      return false; // Revoke
    });

    saveStore();
    return store.sharedAccess.length < beforeLen;
  },

  // ================= PRIVACY & ACCOUNT PURGE =================
  deleteUserData(uid: string) {
    delete store.profiles[uid];
    delete store.trackedAlerts[uid];
    store.invites = store.invites.filter((i) => i.ownerUid !== uid && i.acceptedByUid !== uid);
    store.sharedAccess = store.sharedAccess.filter((s) => s.ownerUid !== uid && s.caregiverUid !== uid);
    saveStore();
  },
};
