import React, { useState } from 'react';
import { Pet, FeedingPlan, WeightRecord } from '../types';
import { StorageService } from '../utils/storage';
import { Cloud, ArrowRight, X, CheckCircle2, ShieldCheck } from 'lucide-react';

interface ImportLocalDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (count: number) => void;
  idToken: string;
  lang?: 'es' | 'en';
}

export const ImportLocalDataModal: React.FC<ImportLocalDataModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  idToken,
  lang = 'es',
}) => {
  const isEs = lang === 'es';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const localPets = StorageService.getPets();
  const localPlans = StorageService.getPlans();

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sync/import-local', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          pets: localPets,
          plans: localPlans,
          weights: [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Mark as imported to prevent duplicate prompts
        localStorage.setItem('racion_app_local_data_imported', 'true');
        onImportComplete(data.importedPetsCount || localPets.length);
        onClose();
      } else {
        setError(isEs ? 'No se pudo completar la importación.' : 'Import could not be completed.');
      }
    } catch {
      setError(isEs ? 'Error de conexión.' : 'Connection error.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('racion_app_local_data_imported', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-[#0B5D2E20] space-y-4 relative">
        <button
          type="button"
          onClick={handleSkip}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center mx-auto">
          <Cloud className="w-6 h-6" />
        </div>

        <div className="text-center space-y-1">
          <h3 className="font-heading font-extrabold text-lg text-[#1C2B21]">
            {isEs ? '¿Importar tus mascotas a la nube?' : 'Import your pets to cloud?'}
          </h3>
          <p className="text-xs text-[#44544A] leading-relaxed">
            {isEs
              ? `Encontramos ${localPets.length} mascota(s) guardadas en este dispositivo. Puedes importarlas a tu cuenta sin sobrescribir ni duplicar información.`
              : `Found ${localPets.length} pet(s) on this device. You can import them safely without overwriting.`}
          </p>
        </div>

        {error && (
          <div className="p-2.5 bg-red-50 text-red-700 rounded-xl text-xs text-center border border-red-200">
            {error}
          </div>
        )}

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleImport}
            disabled={loading}
            className="w-full min-h-[46px] bg-[#0B5D2E] text-white rounded-xl font-heading font-extrabold text-xs flex items-center justify-center gap-1.5 hover:bg-[#094723] transition active:scale-98 shadow-xs disabled:opacity-50"
          >
            <span>{loading ? (isEs ? 'Importando...' : 'Importing...') : isEs ? 'Importar y Sincronizar' : 'Import & Sync'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleSkip}
            className="w-full py-2.5 text-xs font-bold text-gray-400 hover:text-gray-600 transition text-center"
          >
            {isEs ? 'Mantener solo en este dispositivo' : 'Keep on this device only'}
          </button>
        </div>
      </div>
    </div>
  );
};
