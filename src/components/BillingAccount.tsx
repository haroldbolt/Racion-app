import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { signOut, type Auth, type User } from 'firebase/auth';
import { billingRequest, consentVersion, readAccess, readCheckoutUrl, type AccessStatus } from '../services/billingClient';
import { activateAccountStorage, getLegacyDataAvailable, releaseAccountStorage } from '../utils/accountStorage';
import { AccessScreen, primaryButton, textButton } from './BillingFrame';

const PetWorkspace = lazy(() => import('../PetWorkspace'));
const localDate = (value: string | number) => new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Bogota',
}).format(new Date(value));

function removeReturnParam(key: string) {
  const url = new URL(location.href);
  if (!url.searchParams.has(key)) return;
  url.searchParams.delete(key);
  history.replaceState(history.state, '', url);
}

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

const labels: Record<AccessStatus['status'], string> = {
  unregistered: 'Activa tu prueba', setup_pending: 'Completa el registro de tu tarjeta',
  trial_active: 'Prueba activa', charge_pending: 'Pago en proceso', paid: 'Acceso activo',
  canceled: 'Prueba cancelada', payment_failed: 'Pago pendiente de resolver',
};

export function BillingAccount({ user, auth }: { user: User; auth: Auth }) {
  const [access, setAccess] = useState<AccessStatus>();
  const [deadline, setDeadline] = useState(0);
  const [expired, setExpired] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);
  const mutation = useRef(false);
  const revision = useRef(0);
  const lastRequest = useRef(0);
  const returnSession = useRef(new URL(location.href).searchParams.get('billing_session'));
  const wallDeadline = useRef(0);
  const accountEvents = useRef<BroadcastChannel | null>(null);

  const apply = useCallback((raw: unknown, requestedAt: number) => {
    const next = readAccess(raw);
    const remaining = Date.parse(next.trialEndsAt || '') - Date.parse(next.serverTime);
    const expiresAt = next.status === 'trial_active' ? requestedAt + remaining : 0;
    wallDeadline.current = expiresAt ? Date.now() + expiresAt - performance.now() : 0;
    setAccess(next);
    setDeadline(expiresAt);
    setExpired(next.status === 'trial_active' && performance.now() >= expiresAt);
    setError('');
  }, []);

  const refresh = useCallback(async () => {
    if (mutation.current) return;
    const stamp = ++revision.current;
    const started = performance.now();
    lastRequest.current = started;
    const current = () => mounted.current && revision.current === stamp;
    try {
      if (returnSession.current) {
        try {
          const result = await billingRequest(user, 'confirm', { sessionId: returnSession.current });
          if (!current()) return;
          apply(result, started);
          returnSession.current = null;
          removeReturnParam('billing_session');
          setNotice('');
          setAccountOpen(true);
          return;
        } catch {
          if (!current()) return;
          setNotice('Se está verificando el registro de la tarjeta. Puedes actualizar el estado.');
        }
      }
      const result = await billingRequest(user, 'status');
      if (!current()) return;
      apply(result, started);
      if (returnSession.current && readAccess(result).canAccess) {
        returnSession.current = null;
        removeReturnParam('billing_session');
        setNotice('');
        setAccountOpen(true);
      }
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : 'No pudimos verificar tu acceso.');
    }
  }, [user, apply]);

  useEffect(() => {
    mounted.current = true;
    const url = new URL(location.href);
    if (url.searchParams.has('billing_canceled')) {
      removeReturnParam('billing_canceled');
      setNotice('Saliste del formulario de la tarjeta. Consulta aquí el estado de tu prueba.');
    }
    void refresh();
    const onFocus = () => {
      if (wallDeadline.current && Date.now() >= wallDeadline.current) setExpired(true);
      if (document.visibilityState === 'visible' && performance.now() - lastRequest.current > 2000) void refresh();
    };
    if ('BroadcastChannel' in window) {
      accountEvents.current = new BroadcastChannel('racion-billing-' + user.uid);
      accountEvents.current.onmessage = () => void refresh();
    }
    window.addEventListener('pageshow', onFocus);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      mounted.current = false;
      ++revision.current;
      accountEvents.current?.close();
      accountEvents.current = null;
      window.removeEventListener('pageshow', onFocus);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh, user]);

  useEffect(() => {
    if (access?.status === 'trial_active' && !expired) {
      const expire = () => { setExpired(true); void refresh(); };
      const timer = window.setTimeout(expire, Math.max(0, deadline - performance.now()));
      return () => clearTimeout(timer);
    }
    if (access?.status !== 'charge_pending' && access?.status !== 'setup_pending' && !expired) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [access?.status, deadline, expired, refresh]);

  async function act(action: 'checkout' | 'cancel' | 'logout') {
    if (mutation.current) return;
    ++revision.current;
    mutation.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'logout') await signOut(auth);
      if (action === 'checkout') {
        if (!consent) throw new Error('Confirma las condiciones para registrar tu tarjeta.');
        const result = await billingRequest(user, 'checkout', { consentVersion });
        if (mounted.current && auth.currentUser?.uid === user.uid) location.assign(readCheckoutUrl(result));
      }
      if (action === 'cancel') {
        const started = performance.now();
        const result = await billingRequest(user, 'cancel', {});
        if (mounted.current) {
          apply(result, started);
          accountEvents.current?.postMessage('refresh');
          setConfirmCancel(false);
          setAccountOpen(false);
          setNotice('');
        }
      }
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'No pudimos completar la operación.');
        if (action === 'cancel') setConfirmCancel(false);
      }
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const canUse = !!access?.canAccess && (access.status === 'paid' || (access.status === 'trial_active' && !expired));
  const canceledSetup = access?.status === 'canceled' && !access.trialStartedAt;
  const setup = access?.status === 'unregistered' || access?.status === 'setup_pending' || canceledSetup;
  const canCancel = (access?.status === 'trial_active' && !expired) || access?.status === 'setup_pending';
  const panel = <>
    <h1 className="font-heading text-2xl font-extrabold">{access ? (expired ? 'Verificando tu acceso' : canceledSetup ? 'Activa tu prueba' : labels[access.status]) : 'Mi cuenta'}</h1>
    <p className="break-words text-sm">{user.email}</p>
    {setup && <>
      <p>Al confirmar el método de pago en Stripe empiezan tus 72 horas. Si lo confirmas ahora, el cobro correspondería al <strong>{localDate(Date.parse(access.serverTime) + 72 * 3600000)}</strong> (hora de Bogotá). Al volver verás el vencimiento definitivo.</p>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 size-4 shrink-0" />
        Autorizo un solo cobro de 18 USD al finalizar la prueba, sin renovación. Puedo cancelar antes del vencimiento.</label>
      <button type="button" className={primaryButton} disabled={!consent || busy} onClick={() => void act('checkout')}>Registrar tarjeta de prueba</button>
      <p className="text-xs text-[#44544A]">Entorno de pruebas de Stripe. Usa una tarjeta de prueba.</p>
    </>}
    {access?.status === 'trial_active' && !expired &&
      <p>Tu prueba termina el <strong>{localDate(access.trialEndsAt!)}</strong> (hora de Bogotá). Entonces se hará el cobro único de <strong>18 USD</strong>, sin renovación.</p>
    }
    {canCancel && <>
      {confirmCancel ? <div className="space-y-2 rounded-xl bg-[#EAF4EC] p-4"><p>Al confirmar, terminará el acceso de prueba y se cancelará el cargo pendiente.</p>
        <button className={primaryButton} disabled={busy} onClick={() => void act('cancel')}>Confirmar cancelación</button>
        <button className={textButton} disabled={busy} onClick={() => setConfirmCancel(false)}>Conservar mi prueba</button></div>
        : <button className={textButton} disabled={busy} onClick={() => setConfirmCancel(true)}>Cancelar prueba</button>}
    </>}
    {access?.status === 'paid' && <p>Pago único de <strong>18 USD</strong> confirmado. Tienes acceso sin renovación.</p>}
    {access?.status === 'canceled' && !canceledSetup && <p>Tu prueba terminó y el cargo de 18 USD quedó cancelado.</p>}
    {(access?.status === 'charge_pending' || expired) && <p role="status">Estamos consultando la confirmación de tu pago único de 18 USD.</p>}
    {access?.status === 'payment_failed' && <p>La pasarela no confirmó el pago. Puedes volver a consultar el estado de la operación.</p>}
    {!access && !error && <p role="status">Consultando tu acceso…</p>}
    {notice && <p className="text-sm" role="status">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap justify-between">
      <button type="button" className={textButton} disabled={busy} onClick={() => void refresh()}>Actualizar estado</button>
      <button type="button" className={textButton} disabled={busy} onClick={() => void act('logout')}>Cerrar sesión</button>
    </div>
  </>;
  return canUse ? <>
    <AccountWorkspace uid={user.uid} openAccount={() => { setAccountOpen(true); void refresh(); }} />
    {accountOpen && <AccountDialog close={() => { setAccountOpen(false); setConfirmCancel(false); }}>{panel}</AccountDialog>}
  </> : <AccessScreen>{panel}</AccessScreen>;
}
