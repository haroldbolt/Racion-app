import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineSyncIndicator({ lang = 'es' }: { lang?: 'es' | 'en' }) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (isOnline) return null;

  const label = lang === 'es' ? 'Sin conexión. Los cambios se guardan aquí.' : 'Offline. Changes are saved here.';
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className="p-1.5 rounded-lg bg-amber-100 text-amber-800"
    >
      <WifiOff aria-hidden="true" className="w-3.5 h-3.5" />
    </span>
  );
}
