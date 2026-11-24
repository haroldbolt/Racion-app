import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Separate build for the previously published anonymous beta. A URL or a saved
// browser preference cannot change the access policy of a billing build.
const Entry = ['anonymous-beta', 'muse-review'].includes(import.meta.env.MODE)
  ? lazy(() => import('./PetWorkspace'))
  : lazy(() => import('./components/BillingGate'));

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<p className="p-6 text-center" role="status">Cargando Ración App…</p>}>
    <Entry />
  </Suspense>
);
