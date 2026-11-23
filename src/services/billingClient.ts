import type { User } from 'firebase/auth';

export const consentVersion = 'trial-72h-usd18-v1';

export interface AccessStatus {
  status: 'unregistered' | 'setup_pending' | 'trial_active' | 'charge_pending' | 'paid' | 'canceled' | 'payment_failed';
  canAccess: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  chargedAt: string | null;
  amountCents: number;
  currency: string;
  renewal: boolean;
  serverTime: string;
}

type BillingRoute = 'status' | 'checkout' | 'confirm' | 'cancel';
const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

export function billingConfiguration() {
  const projectId = import.meta.env.VITE_BILLING_FIREBASE_PROJECT_ID?.trim();
  const apiKey = import.meta.env.VITE_BILLING_FIREBASE_API_KEY?.trim();
  const address = import.meta.env.VITE_BILLING_API_URL?.trim();
  if (!projectId || !apiKey || !address) throw new Error('El acceso de pruebas aún no está configurado.');
  const worker = new URL(address);
  const local = loopback(location.hostname);
  if (worker.pathname !== '/' || worker.search || worker.hash || worker.username || worker.password ||
      (worker.protocol !== 'https:' && !(local && loopback(worker.hostname) && worker.protocol === 'http:'))) {
    throw new Error('La dirección del servicio de cuentas no es válida.');
  }
  const emulator = import.meta.env.VITE_BILLING_AUTH_EMULATOR_URL?.trim();
  if (emulator) {
    const url = new URL(emulator);
    if (!local || !loopback(url.hostname) || url.protocol !== 'http:' || url.username || url.password) {
      throw new Error('El emulador de cuentas solo está disponible en este equipo.');
    }
  }
  return { projectId, apiKey, workerOrigin: worker.origin, emulator };
}

export async function billingRequest(user: User, route: BillingRoute, body?: Record<string, string>) {
  const url = billingConfiguration().workerOrigin + '/api/billing/' + route;
  const send = async (refresh: boolean) => {
    const token = await user.getIdToken(refresh);
    try {
      return await fetch(url, {
        method: route === 'status' ? 'GET' : 'POST',
        headers: { Authorization: 'Bearer ' + token, ...(body && { 'Content-Type': 'application/json' }) },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error('No se pudo conectar con el servicio de cuentas. Revisa tu conexión y vuelve a intentarlo.');
    }
  };
  let result = await send(false);
  if (result.status === 401) result = await send(true);
  if (!result.ok) {
    if (result.status === 409) throw new Error('El estado de tu prueba cambió. Actualízalo para continuar.');
    if (result.status === 401 || result.status === 403) throw new Error('La sesión no se pudo verificar. Vuelve a iniciar sesión.');
    throw new Error('No se pudo completar la consulta. Revisa tu conexión y vuelve a intentarlo.');
  }
  return result.json() as Promise<unknown>;
}

const statusNames: AccessStatus['status'][] = ['unregistered', 'setup_pending', 'trial_active', 'charge_pending', 'paid', 'canceled', 'payment_failed'];
export function readAccess(value: unknown): AccessStatus {
  const data = value as AccessStatus | null;
  if (!data || !statusNames.includes(data.status) || typeof data.canAccess !== 'boolean' ||
      data.amountCents !== 1800 || data.currency !== 'USD' || data.renewal !== false ||
      data.canAccess !== (data.status === 'trial_active' || data.status === 'paid') ||
      !Number.isFinite(Date.parse(data.serverTime)) ||
      (data.status === 'trial_active' && Date.parse(data.trialEndsAt ?? '') - Date.parse(data.trialStartedAt ?? '') !== 72 * 3600000) ||
      (data.status === 'paid' && !Number.isFinite(Date.parse(data.chargedAt ?? '')))) {
    throw new Error('No pudimos verificar el estado de la prueba. Vuelve a consultarlo.');
  }
  return data;
}

export function readCheckoutUrl(value: unknown) {
  const address = (value as { url?: string })?.url;
  if (!address || !URL.canParse(address)) throw new Error('No se pudo abrir el registro de tarjeta.');
  const url = new URL(address);
  if (url.origin !== 'https://checkout.stripe.com' || url.username || url.password ||
      !/\/cs_test_[A-Za-z0-9_]+\/?$/.test(url.pathname)) {
    throw new Error('El enlace de registro de tarjeta no es válido.');
  }
  return url.href;
}
