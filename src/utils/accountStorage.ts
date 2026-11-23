export const STORAGE_KEYS = {
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
  BOGOTA_POSTAL_CODE: 'racion_bogota_postal_code_v1',
  WATER_LOGS: 'racion_water_logs_v1',
  LOCAL_DIARY_DATES: 'racion_local_diary_dates_v1',
};

const ownerKey = 'racion:legacy-owner';
const dataKeys = Object.values(STORAGE_KEYS);
const decisionKey = (uid: string) => 'racion:profile:' + encodeURIComponent(uid) + ':import';
const personalKey = (uid: string, key: string) => 'racion:profile:' + encodeURIComponent(uid) + ':' + key;
let scope: { uid: string; inherited: boolean } | undefined;
let epoch = 0;
let accountMode = false;

export function getLegacyDataAvailable(uid: string): boolean {
  if (localStorage.getItem(decisionKey(uid)) || localStorage.getItem(ownerKey)) return false;
  return dataKeys.some(key => {
    if (key === STORAGE_KEYS.LOCAL_DIARY_DATES) return false;
    const value = localStorage.getItem(key);
    return !!value && value !== '[]' && value !== '{}';
  });
}

// A read-write IndexedDB transaction serializes a claim across tabs even when
// two different signed-in accounts confirm the migration at the same time.
function claimLegacy(uid: string, generation: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('racion-legacy-claim-v1', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('ownership');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('ownership', 'readwrite');
      const owners = tx.objectStore('ownership');
      const query = owners.get('owner');
      let granted = false;
      query.onsuccess = () => {
        if (generation !== epoch) return;
        const existing = query.result ?? localStorage.getItem(ownerKey);
        granted = !existing || existing === uid;
        if (granted && !query.result) owners.put(uid, 'owner');
      };
      tx.oncomplete = () => { db.close(); resolve(granted); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('No se pudo vincular el diario.')); };
    };
  });
}

export async function activateAccountStorage(uid: string, claim: boolean): Promise<void> {
  if (!uid) throw new Error('Falta la cuenta del diario.');
  accountMode = true;
  const generation = ++epoch;
  scope = undefined;
  let decision = localStorage.getItem(decisionKey(uid));
  if (!decision) {
    const sameOwner = localStorage.getItem(ownerKey) === uid;
    const inherited = sameOwner || (claim && await claimLegacy(uid, generation));
    if (generation !== epoch) return;
    if (claim && !inherited) throw new Error('Otra cuenta ya vinculó los datos anteriores.');
    if (inherited) localStorage.setItem(ownerKey, uid);
    decision = inherited ? 'inherit' : 'empty';
    localStorage.setItem(decisionKey(uid), decision);
  }
  scope = { uid, inherited: decision === 'inherit' && localStorage.getItem(ownerKey) === uid };
}

export function releaseAccountStorage() {
  accountMode = true;
  ++epoch;
  scope = undefined;
}

// Each browser tab reads its own signed-in workspace. Legacy values form a
// read-only baseline for their owner; changed values are saved under the UID.
export const accountData = {
  getItem(key: string): string | null {
    if (!scope) return accountMode ? null : localStorage.getItem(key);
    return localStorage.getItem(personalKey(scope.uid, key)) ??
      (scope.inherited ? localStorage.getItem(key) : null);
  },
  setItem(key: string, value: string) {
    if (accountMode && !scope) throw new Error('El diario está cerrado.');
    localStorage.setItem(scope ? personalKey(scope.uid, key) : key, value);
  },
  clear() {
    if (accountMode && !scope) return;
    for (const key of dataKeys) {
      if (scope) localStorage.removeItem(personalKey(scope.uid, key));
      if (!scope || scope.inherited) localStorage.removeItem(key);
    }
  },
};
