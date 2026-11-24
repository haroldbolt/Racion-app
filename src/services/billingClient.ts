import type { User } from 'firebase/auth';
import { hasPurchaseTerms, hotmartCheckoutUrl } from '../utils/hotmart.mjs';

export interface AccessStatus {
  status: 'not_purchased' | 'pending' | 'paid' | 'revoked';
  canAccess: boolean;
  amountCents: number;
  currency: string;
  renewal: boolean;
}

const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

function workerOrigin() {
  const address = import.meta.env.VITE_BILLING_API_URL?.trim();
  if (!address) throw new Error('El servicio de compras aún no está configurado.');
  const worker = new URL(address);
  if (worker.pathname !== '/' || worker.search || worker.hash || worker.username || worker.password ||
      (worker.protocol !== 'https:' && !(loopback(location.hostname) && loopback(worker.hostname) && worker.protocol === 'http:'))) {
    throw new Error('La dirección del servicio de compras no es válida.');
  }
  return worker.origin;
}

export function billingConfiguration() {
  const projectId = import.meta.env.VITE_BILLING_FIREBASE_PROJECT_ID?.trim();
  const apiKey = import.meta.env.VITE_BILLING_FIREBASE_API_KEY?.trim();
  if (!projectId || !apiKey) throw new Error('El servicio de cuentas aún no está configurado.');
  const emulator = import.meta.env.VITE_BILLING_AUTH_EMULATOR_URL?.trim();
  if (emulator) {
    const url = new URL(emulator);
    if (!loopback(location.hostname) || !loopback(url.hostname) || url.protocol !== 'http:' || url.username || url.password) {
      throw new Error('El emulador de cuentas solo está disponible en este equipo.');
    }
  }
  return { projectId, apiKey, emulator };
}

type PurchaseTerms = { amountCents?: unknown; currency?: unknown; renewal?: unknown };
export function readCheckoutUrl(value: unknown): string {
  const offer = value as (PurchaseTerms & {provider?: unknown; checkoutUrl?: unknown}) | null;
  if (!hasPurchaseTerms(offer) || offer?.provider !== 'hotmart' || typeof offer.checkoutUrl !== 'string') {
    throw new Error('La oferta de Ración App aún no está disponible.');
  }
  const url = hotmartCheckoutUrl(offer.checkoutUrl);
  if (!url) throw new Error('El enlace de compra de Hotmart no es válido.');
  return url;
}

export function readAccess(value: unknown): AccessStatus {
  const data = value as AccessStatus | null;
  if (!data || !hasPurchaseTerms(data) || !['not_purchased', 'pending', 'paid', 'revoked'].includes(data.status) ||
      data.canAccess !== (data.status === 'paid')) {
    throw new Error('No pudimos verificar el acceso para esta compra.');
  }
  return data;
}

function workerGet(route: string, headers?: Record<string, string>) {
  return fetch(workerOrigin() + '/api/billing/' + route, {
    method:'GET', headers, credentials:'omit', redirect:'error', cache:'no-store',
    referrerPolicy:'no-referrer', signal:AbortSignal.timeout(15000),
  });
}

export async function fetchCheckoutUrl() {
  const response = await workerGet('offer');
  if (!response.ok) throw new Error('La oferta de Ración App aún no está disponible.');
  return readCheckoutUrl(await response.json());
}

export class PurchaseIdentityError extends Error {}

export async function fetchAccess(user: User) {
  const send = async (refresh: boolean) => workerGet('status', { Authorization: 'Bearer ' + await user.getIdToken(refresh) });
  let response: Response;
  try {
    response = await send(false);
    if (response.status === 401) response = await send(true);
  } catch (error) {
    if (['auth/user-token-expired', 'auth/user-disabled', 'auth/invalid-user-token'].includes((error as {code?:string})?.code || '')) {
      throw new PurchaseIdentityError('Tu sesión venció. Vuelve a ingresar para consultar tu compra.');
    }
    throw new Error('No pudimos conectar con el servicio de compras. Tus datos siguen guardados en este navegador.');
  }
  if (response.status === 401 || response.status === 403) throw new PurchaseIdentityError('Verifica tu correo y vuelve a ingresar para consultar tu compra.');
  if (!response.ok) throw new Error('No pudimos consultar tu compra. Inténtalo de nuevo.');
  return readAccess(await response.json());
}
