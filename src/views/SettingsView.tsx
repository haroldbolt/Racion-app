import React, { useState } from 'react';
import { UserAccount, Pet } from '../types';
import { useCity } from '../contexts/CityContext';
import { BogotaPostalCodeField } from '../components/BogotaPostalCodeField';
import { isBogotaPostalCode, LIVE_PRICE_CITIES } from '../types/livePrices';
import { StorageService } from '../utils/storage';
import {
  Download,
  Trash2,
  Shield,
  FileSpreadsheet,
  Sun,
  Moon,
} from 'lucide-react';

function downloadData(data: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface SettingsViewProps {
  userAccount: UserAccount;
  pets: Pet[];
  onUpdateAccount: (updated: Partial<UserAccount>) => void;
  onResetAllData: () => void | Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  userAccount,
  pets,
  onUpdateAccount,
  onResetAllData,
}) => {
  const isEs = userAccount.language === 'es';
  const {selectedCity, setCity} = useCity();
  const [cityDraft, setCityDraft] = useState(selectedCity);
  const [postalDraft, setPostalDraft] = useState(() => StorageService.getBogotaPostalCode());
  const [invalidPostal, setInvalidPostal] = useState(false);
  const [savedDelivery, setSavedDelivery] = useState(false);

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showExportSuccess, setShowExportSuccess] = useState(false);

  const [fileError, setFileError] = useState('');
  const handleExportJSON = async () => {
    setFileError('');
    try {
      downloadData(
        await StorageService.exportAllDataJSON(),
        'application/json',
        `RacionApp_Backup_${new Date().toISOString().split('T')[0]}.json`
      );
    } catch {
      setFileError(isEs ? 'No pudimos incluir todos los recibos en la copia. Inténtalo de nuevo.' : 'Could not include every receipt in the backup. Please retry.');
      return;
    }
    setShowExportSuccess(true);
    setTimeout(() => setShowExportSuccess(false), 2500);
  };

  // Export data as CSV
  const handleExportCSV = () => {
    let csv = 'PetName,Species,Breed,CurrentWeightKg,IdealWeightKg,BCS\n';
    pets.forEach((p) => {
      csv += `"${p.name}","${p.species}","${p.breed}",${p.currentWeightKg},${p.idealWeightKg},${p.bcs}\n`;
    });
    downloadData(csv, 'text/csv', `RacionApp_Mascotas_${new Date().toISOString().split('T')[0]}.csv`);
    setShowExportSuccess(true);
    setTimeout(() => setShowExportSuccess(false), 2500);
  };

  return (
    <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
      <div>
        <h3 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
          {isEs ? 'Ajustes y Privacidad' : 'Settings & Privacy'}
        </h3>
        <p className="text-xs text-[#44544A] mt-0.5">
          {isEs ? 'Preferencias, exportación y control de tus datos' : 'Preferences, data export and privacy'}
        </p>
      </div>

      {/* Language & Units */}
      {/* Language, Units & Visual Theme */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
        <span className="font-heading font-extrabold text-base text-[#1C2B21] block">
          {isEs ? 'Idioma, Unidades y Modo Visual' : 'Language, Units & Visual Theme'}
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Idioma */}
          <div className="space-y-1">
            <label className="font-bold text-[#44544A]">{isEs ? 'Idioma:' : 'Language:'}</label>
            <div className="grid grid-cols-2 gap-1 bg-[#EAF4EC] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => onUpdateAccount({ language: 'es' })}
                className={`py-2 rounded-lg font-bold transition ${
                  userAccount.language === 'es' ? 'bg-[#0B5D2E] text-white shadow-xs' : 'text-[#44544A]'
                }`}
              >
                Español
              </button>
              <button
                type="button"
                onClick={() => onUpdateAccount({ language: 'en' })}
                className={`py-2 rounded-lg font-bold transition ${
                  userAccount.language === 'en' ? 'bg-[#0B5D2E] text-white shadow-xs' : 'text-[#44544A]'
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* Sistema de Unidades */}
          <div className="space-y-1">
            <label className="font-bold text-[#44544A]">{isEs ? 'Sistema:' : 'System:'}</label>
            <div className="grid grid-cols-2 gap-1 bg-[#EAF4EC] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => onUpdateAccount({ units: 'metric' })}
                className={`py-2 rounded-lg font-bold transition ${
                  userAccount.units === 'metric' ? 'bg-[#0B5D2E] text-white shadow-xs' : 'text-[#44544A]'
                }`}
              >
                kg / g
              </button>
              <button
                type="button"
                onClick={() => onUpdateAccount({ units: 'imperial' })}
                className={`py-2 rounded-lg font-bold transition ${
                  userAccount.units === 'imperial' ? 'bg-[#0B5D2E] text-white shadow-xs' : 'text-[#44544A]'
                }`}
              >
                lb / oz
              </button>
            </div>
          </div>

          {/* Modo Visual */}
          <div className="space-y-1">
            <label className="font-bold text-[#44544A]">{isEs ? 'Modo Visual:' : 'Theme:'}</label>
            <div className="grid grid-cols-2 gap-1 bg-[#EAF4EC] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => onUpdateAccount({ theme: 'light' })}
                className={`py-2 rounded-lg font-bold transition flex items-center justify-center gap-1 ${
                  userAccount.theme !== 'dark' ? 'bg-[#0B5D2E] text-white shadow-xs' : 'text-[#44544A]'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>{isEs ? 'Claro' : 'Light'}</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateAccount({ theme: 'dark' })}
                className={`py-2 rounded-lg font-bold transition flex items-center justify-center gap-1 ${
                  userAccount.theme === 'dark' ? 'bg-[#1E8A49] text-white shadow-xs' : 'text-[#44544A]'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>{isEs ? 'Oscuro' : 'Dark'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <form className="space-y-3 rounded-3xl border border-[#0B5D2E20] bg-white p-5 shadow-sm" onSubmit={event => {
        event.preventDefault();
        const code = postalDraft.trim();
        if (cityDraft === 'Bogotá' && code && !isBogotaPostalCode(code)) {
          setInvalidPostal(true);
          return;
        }
        setCity(cityDraft);
        if (cityDraft === 'Bogotá') StorageService.setBogotaPostalCode(code);
        setSavedDelivery(true);
      }}>
        <h4 className="font-heading text-base font-extrabold text-[#1C2B21]">
          {isEs ? 'Destino de entrega' : 'Delivery destination'}
        </h4>
        <label className="block text-xs font-bold">
          {isEs ? 'Ciudad' : 'City'}
          <select className="mt-1 block min-h-11 w-full rounded-xl border px-3 text-sm" value={cityDraft} onChange={event => {
            setCityDraft(event.target.value);
            setInvalidPostal(false);
            setSavedDelivery(false);
          }}>
            {[...new Set([...LIVE_PRICE_CITIES, selectedCity])].map(city => <option key={city}>{city}</option>)}
          </select>
        </label>
        {cityDraft === 'Bogotá' && <BogotaPostalCodeField isEs={isEs} value={postalDraft} invalid={invalidPostal} onChange={value => {
          setPostalDraft(value);
          setInvalidPostal(false);
          setSavedDelivery(false);
        }} />}
        <button type="submit" className="min-h-11 rounded-xl border px-3 text-sm font-bold text-[#0B5D2E]">
          {isEs ? 'Guardar destino' : 'Save destination'}
        </button>
        {savedDelivery && <p role="status" className="text-xs">{isEs ? 'Destino guardado.' : 'Destination saved.'}</p>}
      </form>

      {/* Data Export (CSV & JSON) */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-[#0B5D2E]" />
          <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
            {isEs ? 'Exportar mis datos' : 'Export My Data'}
          </h4>
        </div>
        <p className="text-xs text-[#44544A]">
          {isEs
            ? 'Descarga tus perfiles en CSV o una copia de tus datos locales en JSON.'
            : 'Download your pet profiles as CSV or a copy of your local data as JSON.'}
        </p>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleExportCSV}
            className="py-2.5 px-3 bg-white border border-[#0B5D2E40] text-[#0B5D2E] rounded-xl text-xs font-bold hover:bg-[#EAF4EC] transition flex items-center justify-center gap-1.5 min-h-[44px]"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isEs ? 'Exportar CSV' : 'Export CSV'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportJSON}
            className="py-2.5 px-3 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold hover:bg-[#094723] transition flex items-center justify-center gap-1.5 min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            <span>{isEs ? 'Exportar JSON' : 'Export JSON'}</span>
          </button>
        </div>

        {fileError && <p role="alert" className="text-xs text-red-700">{fileError}</p>}
        {showExportSuccess && (
          <p className="text-xs text-[#1E8A49] font-bold text-center pt-1">
            ✓ {isEs ? 'Copia descargada exitosamente en tu dispositivo.' : 'Backup successfully downloaded.'}
          </p>
        )}
      </div>

      {/* Your data and privacy/LGPD (Page 6) */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#0B5D2E]" />
            <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
              {isEs ? 'Tus datos y privacidad' : 'Your data and privacy'}
            </h4>
          </div>
          <button
            onClick={() => setShowPrivacyModal(true)}
            className="text-xs font-bold text-[#0B5D2E] hover:underline"
          >
            {isEs ? 'Leer completa' : 'Read full'}
          </button>
        </div>
        <p className="text-xs text-[#44544A]">
          {isEs
            ? 'Tus datos se guardan en este navegador. Si borras sus datos o usas otro navegador, tus registros no estarán allí.'
            : 'Your data is saved in this browser. If you clear its data or switch browsers, your records will not be there.'}
        </p>
      </div>

      {/* Wipe Local Data */}
      <div className="bg-[#FEF2F2] rounded-3xl p-5 border border-[#C0392B]/30 space-y-3">
        <div className="flex items-center gap-2 text-[#991B1B]">
          <Trash2 className="w-5 h-5 text-[#C0392B]" />
          <h4 className="font-heading font-extrabold text-base">
            {isEs ? 'Borrar todos mis datos' : 'Delete all my data'}
          </h4>
        </div>
        <p className="text-xs text-[#7F1D1D]">
          {isEs
            ? 'Elimina permanentemente todas las mascotas, planes guardados e historiales de este dispositivo.'
            : 'Permanently wipes all local pets, logs, and feeding plans.'}
        </p>

        {showConfirmDelete ? (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-bold text-[#991B1B]">
              {isEs ? '¿Estás completamente seguro?' : 'Are you completely sure?'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-700"
              >
                {isEs ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                onClick={async () => {
                  try {
                    await onResetAllData();
                    setShowConfirmDelete(false);
                  } catch {
                    setFileError(isEs ? 'No pudimos borrar el diario y sus recibos. Inténtalo de nuevo.' : 'Could not delete the diary and its receipts. Please retry.');
                  }
                }}
                className="flex-1 py-2.5 bg-[#C0392B] text-white rounded-xl text-xs font-bold shadow-xs"
              >
                {isEs ? 'Sí, borrar todo' : 'Yes, delete everything'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirmDelete(true)}
            className="w-full py-2.5 bg-white border border-[#C0392B]/40 text-[#C0392B] rounded-xl text-xs font-bold hover:bg-red-50 transition min-h-[44px]"
          >
            {isEs ? 'Borrar datos locales' : 'Delete local data'}
          </button>
        )}
      </div>

      {/* Privacy Policy Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto space-y-4 shadow-2xl border border-[#0B5D2E20]">
            <h3 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
              {isEs ? 'Privacidad y Términos de Ración App' : 'Privacy & Terms'}
            </h3>
            <div className="text-xs text-[#1C2B21] space-y-2.5 leading-relaxed">
              <p>
                {isEs
                  ? 'Esta beta no tiene cuentas. Los perfiles, planes, tomas y pesajes se guardan en este navegador.'
                  : 'This beta has no accounts. Profiles, plans, meals and weigh-ins are saved in this browser.'}
              </p>
              <p>
                {isEs
                  ? 'Puedes descargar una copia en JSON antes de borrar los datos. El archivo contiene tus registros: guárdalo en un lugar seguro.'
                  : 'You can download a JSON copy before deleting your data. It contains your records, so store it somewhere safe.'}
              </p>
              <p>
                {isEs
                  ? 'Las raciones son estimaciones y no sustituyen la indicación de un veterinario.'
                  : 'Portions are estimates and do not replace veterinary guidance.'}
              </p>
            </div>
            <button
              onClick={() => setShowPrivacyModal(false)}
              className="w-full py-3 bg-[#0B5D2E] text-white rounded-xl font-bold text-xs"
            >
              {isEs ? 'Cerrar' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
