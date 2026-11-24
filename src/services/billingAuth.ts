import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  browserSessionPersistence } from 'firebase/auth';
import { billingConfiguration } from './billingClient';

const config = billingConfiguration();
const app = initializeApp({
  projectId: config.projectId, apiKey: config.apiKey, authDomain: config.projectId + '.firebaseapp.com',
}, 'racion-billing');
export const billingAuth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
});
billingAuth.languageCode = 'es';
if (config.emulator) connectAuthEmulator(billingAuth, config.emulator, { disableWarnings: true });
