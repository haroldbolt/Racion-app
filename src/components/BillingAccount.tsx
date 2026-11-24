import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { signOut, type Auth, type User } from 'firebase/auth';
import { fetchAccess, PurchaseIdentityError, type AccessStatus } from '../services/billingClient';
import { activateAccountStorage, getLegacyDataAvailable, releaseAccountStorage } from '../utils/accountStorage';
import { AccessScreen, primaryButton, textButton } from './BillingFrame';

const PetWorkspace = lazy(() => import('../PetWorkspace'));
function AccountDialog({ children, close }: { children: ReactNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} aria-label="Mi cuenta" onCancel={close}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[min(90vw,26rem)] overflow-auto rounded-3xl bg-white p-6 text-[#1C2B21] shadow-xl backdrop:bg-black/50">
    <button type="button" onClick={close} className={textButton}>Volver a la app</button>
    <div className="mt-2 space-y-4">{children}</div>
  </dialog>;
}

function AccountWorkspace({ uid, openAccount }: { uid: string; openAccount: () => void }) {
  const [state, setState] = useState<'loading' | 'choice' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [claim, setClaim] = useState<boolean>();
  useEffect(() => {
    let active = true;
    const open = async () => {
      if (claim === undefined && getLegacyDataAvailable(uid)) {
        setState('choice');
        return;
      }
      setState('loading');
      await activateAccountStorage(uid, claim === true);
      if (active) setState('ready');
    };
    void open().catch(() => { if (active) setState('error'); });
    return () => { active = false; releaseAccountStorage(); };
  }, [uid, claim, attempt]);
  if (state === 'ready') return <Suspense fallback={<AccessScreen><p role="status">Abriendo tu diario…</p></AccessScreen>}>
    <PetWorkspace onOpenAccount={openAccount} />
  </Suspense>;
  return <AccessScreen>
    {state === 'choice' && <>
      <h1 className="font-heading text-2xl font-extrabold">Hay datos de una beta anterior en este dispositivo</h1>
      <p>Si las mascotas, compras y registros te pertenecen, puedes vincularlos a tu cuenta en este navegador.</p>
      <button type="button" className={primaryButton} onClick={() => setClaim(true)}>Vincular mis datos anteriores</button>
      <button type="button" className={textButton} onClick={() => setClaim(false)}>Empezar con una cuenta vacía</button>
    </>}
    {state === 'loading' && <p role="status">Abriendo tus datos…</p>}
    {state === 'error' && <><p role="alert">No se pudieron abrir tus datos en este dispositivo. Revisa el espacio disponible y vuelve a intentarlo.</p>
      <button type="button" className={textButton} onClick={() => { setClaim(undefined); setAttempt(value => value + 1); }}>Reintentar</button></>}
    <button type="button" className={textButton} onClick={openAccount}>Mi cuenta</button>
  </AccessScreen>;
}

const headings: Record<AccessStatus['status'], string> = {
  not_purchased:'Aún no encontramos tu compra',
  pending:'Pago pendiente',
  paid:'Acceso activo',
  revoked:'Acceso retirado',
};
const explanations: Record<AccessStatus['status'], string> = {
  not_purchased:'Comprueba que estás usando el mismo correo de tu compra en Hotmart. Si acabas de pagar, vuelve a consultar en unos momentos.',
  pending:'Hotmart está procesando tu pago. Podrás abrir el diario cuando se apruebe.',
  paid:'Hotmart confirmó tu compra de Ración App por un pago único de 25 USD.',
  revoked:'El pago asociado a este correo se devolvió o se anuló. Puedes consultar el estado en tus compras de Hotmart.',
};

export function BillingAccount({ user, auth, checkoutUrl }: { user: User; auth: Auth; checkoutUrl?: string | null }) {
  const [access, setAccess] = useState<AccessStatus>();
  const [accountOpen, setAccountOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const lastRequest = useRef(0);

  const refresh = useCallback(async () => {
    const stamp = ++revision.current;
    setBusy(true);
    lastRequest.current = Date.now();
    try {
      const next = await fetchAccess(user);
      if (stamp === revision.current) {
        setAccess(next);
        setError('');
        if (!next.canAccess) setAccountOpen(false);
      }
    } catch (cause) {
      if (stamp === revision.current) {
        if (cause instanceof PurchaseIdentityError) {
          setAccess(undefined);
          setAccountOpen(false);
        }
        setError(cause instanceof Error ? cause.message : 'No pudimos consultar tu compra.');
      }
    } finally {
      if (stamp === revision.current) setBusy(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
    const onFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRequest.current > 2000) void refresh();
    };
    window.addEventListener('pageshow', onFocus);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      revision.current++;
      window.removeEventListener('pageshow', onFocus);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);
  useEffect(() => {
    const slow = access?.status === 'paid' || access?.status === 'revoked';
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, slow ? 300000 : 30000);
    return () => clearInterval(timer);
  }, [access?.status, refresh]);

  const panel = <>
    <h1 className="font-heading text-2xl font-extrabold">{access ? headings[access.status] : 'Mi cuenta'}</h1>
    <p className="break-words text-sm">{user.email}</p>
    {access && <p>{explanations[access.status]}</p>}
    {access?.status === 'not_purchased' && checkoutUrl && <div className="space-y-2">
      <p className="text-sm font-bold">Pago único de 25 USD en Hotmart</p>
      <a className={primaryButton + ' block text-center'} href={checkoutUrl} referrerPolicy="no-referrer">Comprar</a>
    </div>}
    {!access && busy && <p role="status">Consultando tu compra en Ración App…</p>}
    {error && <p className="text-sm text-red-800" role="alert">{error}</p>}
    <div className="flex flex-wrap justify-between">
      <button type="button" className={textButton} disabled={busy} onClick={() => void refresh()}>Actualizar estado</button>
      <button type="button" className={textButton} onClick={() => void signOut(auth).catch(() => setError('No se pudo cerrar la sesión. Vuelve a intentarlo.'))}>Cerrar sesión</button>
    </div>
  </>;
  return access?.canAccess ? <>
    <AccountWorkspace uid={user.uid} openAccount={() => { setAccountOpen(true); void refresh(); }} />
    {accountOpen && <AccountDialog close={() => setAccountOpen(false)}>{panel}</AccountDialog>}
  </> : <AccessScreen>{panel}</AccessScreen>;
}
