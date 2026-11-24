import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, reload, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type Auth, type User,
} from 'firebase/auth';
import { AccessScreen, primaryButton, textButton } from './BillingFrame';
import { BillingAccount } from './BillingAccount';
import { fetchCheckoutUrl } from '../services/billingClient';

const field = 'mt-1 block w-full rounded-xl border border-[#0B5D2E40] bg-white p-3 text-base font-normal text-[#1C2B21]';
const heading = 'font-heading text-2xl font-extrabold';
const messages: Record<string, string> = {
  'auth/email-already-in-use': 'Ese correo ya tiene una cuenta. Elige «Ingresar» o recupera tu contraseña.',
  'auth/weak-password': 'Elige una contraseña de al menos seis caracteres.',
  'auth/invalid-credential': 'Revisa el correo y la contraseña e intenta de nuevo.',
  'auth/network-request-failed': 'Revisa tu conexión para continuar.',
  'auth/too-many-requests': 'Hubo demasiados intentos. Vuelve a probar en unos minutos.',
};

function AccountForm({ auth, back }: { auth: Auth; back: () => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const change = (next: typeof mode) => { setMode(next); setError(''); setNotice(''); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email);
        setNotice('Si existe una cuenta con este correo, recibirás un enlace para recuperar tu contraseña.');
      } else if (mode === 'register') {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        // The verification screen also lets the buyer resend the message on a later visit.
        await sendEmailVerification(user);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      if (mode === 'reset' && code === 'auth/user-not-found') {
        setNotice('Si existe una cuenta con este correo, recibirás un enlace para recuperar tu contraseña.');
      } else {
        setError(messages[code || ''] || 'No pudimos completar la solicitud. Inténtalo de nuevo.');
      }
    } finally { setBusy(false); }
  }
  return <AccessScreen>
    <h1 className={heading}>{mode === 'reset' ? 'Recuperar contraseña' : mode === 'register' ? 'Crea tu acceso' : 'Ya compré'}</h1>
    <p className="text-sm">Usa el mismo correo con el que compraste Ración App en Hotmart.</p>
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-sm font-bold">Correo electrónico
        <input name="email" type="email" autoComplete="email" className={field} required />
      </label>
      {mode !== 'reset' && <label className="block text-sm font-bold">Contraseña
        <input name="password" type="password" minLength={mode === 'register' ? 6 : undefined}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'} className={field} required />
      </label>}
      {error && <p className="text-sm text-red-800" role="alert">{error}</p>}
      {notice && <p className="text-sm" role="status">{notice}</p>}
      <button type="submit" className={primaryButton} disabled={busy}>
        {busy ? 'Un momento…' : mode === 'reset' ? 'Enviar enlace' : mode === 'register' ? 'Crear cuenta' : 'Ingresar'}
      </button>
    </form>
    {mode === 'login' ? <>
      <p className="text-sm">¿Es tu primera compra? <button className={textButton} disabled={busy} onClick={() => change('register')}>Crear mi acceso</button></p>
      <button className={textButton} disabled={busy} onClick={() => change('reset')}>Olvidé mi contraseña</button>
    </> : <button className={textButton} disabled={busy} onClick={() => change('login')}>Volver a ingresar</button>}
    <button className={textButton} onClick={back} disabled={busy}>Volver al inicio</button>
  </AccessScreen>;
}

async function confirmedEmail(user: User) {
  await reload(user);
  if (!user.emailVerified) return false;
  await user.getIdToken(true);
  return true;
}

function VerifyEmail({ auth, user, verified }: { auth: Auth; user: User; verified: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        if (await confirmedEmail(user) && active) verified();
      } catch { /* A failed background check leaves the manual retry available. */ }
      finally { checking = false; }
    };
    void check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      active = false;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [user, verified]);

  async function verify(resend: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      if (resend) {
        await sendEmailVerification(user);
        setMessage('Te enviamos un nuevo enlace de verificación.');
      } else {
        if (await confirmedEmail(user)) verified();
        else setMessage('Tu correo aún está pendiente de verificación. Abre el enlace del mensaje y vuelve aquí.');
      }
    } catch (error) {
      setMessage(messages[(error as {code?:string}).code || ''] || 'No pudimos verificar tu correo. Vuelve a intentarlo.');
    } finally { setBusy(false); }
  }
  return <AccessScreen>
    <h1 className={heading}>Verifica tu correo</h1>
    <p className="text-sm">Abre el enlace de verificación enviado a <strong>{user.email}</strong> para vincular tu compra.</p>
    {message && <p role="status" className="text-sm">{message}</p>}
    <button className={primaryButton} disabled={busy} onClick={() => void verify(false)}>Ya verifiqué mi correo</button>
    <button className={textButton} disabled={busy} onClick={() => void verify(true)}>Reenviar enlace</button>
    <button className={textButton} disabled={busy} onClick={() => void signOut(auth).catch(() => setMessage('No se pudo cerrar la sesión. Inténtalo de nuevo.'))}>Cerrar sesión</button>
  </AccessScreen>;
}

export default function BillingGate() {
  const [session, setSession] = useState<{ auth: Auth; user: User | null }>();
  const [authError, setAuthError] = useState(false);
  const [accessForm, setAccessForm] = useState(false);
  const [offer, setOffer] = useState<string | null>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    let unsubscribe: (() => void) | undefined;
    import('../services/billingAuth').then(({ billingAuth }) => {
      if (!current) return;
      unsubscribe = onAuthStateChanged(billingAuth, user => {
        if (!current) return;
        setSession({ auth: billingAuth, user });
        if (user) setAccessForm(false);
      }, () => { if (current) setAuthError(true); });
    }).catch(() => { if (current) setAuthError(true); });
    return () => { current = false; unsubscribe?.(); };
  }, []);

  useEffect(() => {
    let current = true;
    fetchCheckoutUrl().then(url => { if (current) setOffer(url); })
      .catch(() => { if (current) setOffer(null); });
    return () => { current = false; };
  }, [attempt]);

  const confirmed = useCallback(() => {
    setSession(previous => previous?.user && previous.auth.currentUser?.uid === previous.user.uid
      ? { ...previous } : previous);
  }, []);
  if (session?.user) {
    const {user, auth} = session;
    if (!user.emailVerified) return <VerifyEmail key={user.uid} auth={auth} user={user} verified={confirmed} />;
    return <BillingAccount key={user.uid} auth={auth} user={user} checkoutUrl={offer} />;
  }
  if (accessForm && session) return <AccountForm auth={session.auth} back={() => setAccessForm(false)} />;
  if (accessForm) return <AccessScreen>
    <h1 className={heading}>Ya compré</h1>
    {authError ? <><p role="alert">El servicio de cuentas aún no está disponible. Conserva el correo de confirmación de Hotmart.</p>
      <button className={textButton} onClick={() => location.reload()}>Reintentar</button></> : <p role="status">Conectando con tu cuenta…</p>}
    <button className={textButton} onClick={() => setAccessForm(false)}>Volver al inicio</button>
  </AccessScreen>;
  return <AccessScreen>
    <h1 className={heading}>Ración App para tus mascotas</h1>
    <p>Calcula sus raciones y el costo por toma. Lleva en este dispositivo su diario de comidas y pesajes.</p>
    <p className="font-bold">Pago único de 25 USD en Hotmart · Sin renovación</p>
    {offer && session && !authError
      ? <a className={primaryButton + ' block text-center'} href={offer} referrerPolicy="no-referrer">Comprar</a>
      : <button className={primaryButton} disabled>Comprar</button>}
    {offer === null || authError ? <div className="text-sm" role="status">La venta aún no está disponible.
      {!authError && <button className={textButton} onClick={() => { setOffer(undefined); setAttempt(a => a + 1); }}>Volver a consultar</button>}
    </div> : (!offer || !session) && <p className="text-sm" role="status">Consultando disponibilidad…</p>}
    <button className={textButton} onClick={() => setAccessForm(true)}>Ya compré</button>
  </AccessScreen>;
}
