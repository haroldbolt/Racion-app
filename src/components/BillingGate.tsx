import { useEffect, useState, type FormEvent } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, type Auth, type User } from 'firebase/auth';
import { AccessScreen, primaryButton, textButton } from './BillingFrame';
import { BillingAccount } from './BillingAccount';

const field = 'mt-1 block w-full rounded-xl border border-[#0B5D2E40] bg-white p-3 text-base font-normal text-[#1C2B21]';

function AccountForm({ auth }: { auth: Auth }) {
  const [register, setRegister] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    setError('');
    setBusy(true);
    try {
      if (register) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      const messages: Record<string, string> = {
        'auth/email-already-in-use': 'Ese correo ya tiene una cuenta. Elige «Ingresar a mi cuenta».',
        'auth/weak-password': 'Elige una contraseña de al menos seis caracteres.',
        'auth/invalid-credential': 'Revisa el correo y la contraseña e intenta de nuevo.',
        'auth/network-request-failed': 'Revisa tu conexión para continuar.',
        'auth/too-many-requests': 'Hubo demasiados intentos. Vuelve a probar en unos minutos.',
      };
      setError(messages[code || ''] || 'No pudimos completar el acceso. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccessScreen>
      <h1 className="font-heading text-2xl font-extrabold">{register ? 'Crea tu cuenta' : 'Ingresa a tu cuenta'}</h1>
      <p className="text-sm">Tendrás 72 horas de prueba al registrar tu tarjeta. Después se hará un único cobro de <strong>18 USD, sin renovación</strong>. Puedes cancelar antes del vencimiento.</p>
      <p className="text-xs font-semibold text-[#44544A]">Entorno de pruebas · Solo tarjetas de prueba.</p>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm font-bold">Correo electrónico
          <input name="email" type="email" autoComplete="email" className={field} required />
        </label>
        <label className="block text-sm font-bold">Contraseña
          <input name="password" type="password" minLength={register ? 6 : undefined} autoComplete={register ? 'new-password' : 'current-password'} className={field} required />
        </label>
        {error && <p className="text-sm text-red-800" role="alert">{error}</p>}
        <button type="submit" className={primaryButton} disabled={busy}>{busy ? 'Un momento…' : register ? 'Crear cuenta' : 'Ingresar'}</button>
      </form>
      <button type="button" className={textButton} disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>
        {register ? 'Ingresar a mi cuenta' : 'Crear una cuenta nueva'}
      </button>
    </AccessScreen>
  );
}

export default function BillingGate() {
  const [session, setSession] = useState<{ auth: Auth; user: User | null }>();
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    let unsubscribe: (() => void) | undefined;
    import('../services/billingAuth').then(({ billingAuth }) => {
      if (!current) return;
      unsubscribe = onAuthStateChanged(billingAuth, user => {
        if (current) setSession({ auth: billingAuth, user });
      }, () => { if (current) setError('No pudimos verificar tu sesión.'); });
    }).catch(() => { if (current) setError('El servicio de cuentas de prueba no está disponible en este momento.'); });
    return () => { current = false; unsubscribe?.(); };
  }, []);
  if (error) return <AccessScreen><h1 className="text-xl font-bold">Acceso a Ración App</h1><p role="alert">{error}</p><button className={textButton} onClick={() => location.reload()}>Reintentar</button></AccessScreen>;
  if (!session) return <AccessScreen><p role="status">Verificando tu sesión…</p></AccessScreen>;
  return session.user
    ? <BillingAccount key={session.user.uid} user={session.user} auth={session.auth} />
    : <AccountForm auth={session.auth} />;
}
