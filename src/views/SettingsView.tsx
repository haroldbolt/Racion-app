import React, { useState } from 'react';
import { UserAccount, Pet } from '../types';
import { StorageService } from '../utils/storage';
import { jsPDF } from 'jspdf';
import {
  Settings,
  Globe,
  Download,
  Trash2,
  Shield,
  FileSpreadsheet,
  Check,
  MessageSquare,
  HelpCircle,
  Sun,
  Moon,
} from 'lucide-react';

interface SettingsViewProps {
  userAccount: UserAccount;
  pets: Pet[];
  onUpdateAccount: (updated: Partial<UserAccount>) => void;
  onResetAllData: () => void;
  idToken?: string | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  userAccount,
  pets,
  onUpdateAccount,
  onResetAllData,
  idToken,
}) => {
  const isEs = userAccount.language === 'es';

  const [whatsappPhone, setWhatsappPhone] = useState(userAccount.whatsappPhone || '');
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showExportSuccess, setShowExportSuccess] = useState(false);

  // Export data as JSON (local and cloud)
  const handleExportJSON = async () => {
    let dataStr = StorageService.exportAllDataJSON();
    if (idToken) {
      try {
        const res = await fetch('/api/user/export', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const cloudData = await res.json();
          dataStr = JSON.stringify(cloudData, null, 2);
        }
      } catch (e) {
        // Fall back to local dataStr
      }
    }
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RacionApp_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    setShowExportSuccess(true);
    setTimeout(() => setShowExportSuccess(false), 2500);
  };

  // Export data as CSV
  const handleExportCSV = () => {
    let csv = 'PetName,Species,Breed,CurrentWeightKg,IdealWeightKg,BCS\n';
    pets.forEach((p) => {
      csv += `"${p.name}","${p.species}","${p.breed}",${p.currentWeightKg},${p.idealWeightKg},${p.bcs}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RacionApp_Mascotas_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
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
          {isEs ? 'Preferencias, recordatorios, exportación y control total de tus datos' : 'Preferences, reminders, data export and privacy'}
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

      {/* WhatsApp Opt-in (Page 6) */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-[#25D366]" />
          <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
            {isEs ? 'Canal de WhatsApp (Opcional)' : 'WhatsApp Channel (Optional)'}
          </h4>
        </div>

        <div className="p-3 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E20] space-y-2">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#25D366]" />
              <span className="font-bold text-[#0B5D2E] text-xs">
                {isEs ? 'Recordatorios de salud y pesaje por WhatsApp (Opcional)' : 'Health & weight updates via WhatsApp (Optional)'}
              </span>
            </div>
            <input
              type="checkbox"
              checked={userAccount.whatsappOptIn}
              onChange={(e) => onUpdateAccount({ whatsappOptIn: e.target.checked })}
              className="w-5 h-5 accent-[#0B5D2E] rounded cursor-pointer"
            />
          </label>
            <p className="text-[11px] text-[#44544A]">
              {isEs
                ? 'Plantillas informativas exclusivas de aviso de comida o pesaje. Nunca enviaremos publicidad comercial.'
                : 'Informational reminders only. No promotional spam.'}
            </p>
            {userAccount.whatsappOptIn && (
              <input
                type="tel"
                value={whatsappPhone}
                onChange={(e) => {
                  setWhatsappPhone(e.target.value);
                  onUpdateAccount({ whatsappPhone: e.target.value });
                }}
                placeholder="+54 9 11 1234-5678"
                className="w-full px-3 py-2 bg-white border border-[#0B5D2E30] rounded-xl text-xs font-semibold"
              />
            )}
          </div>
        </div>

      {/* Data Export (CSV & JSON) */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-[#0B5D2E]" />
          <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
            {isEs ? 'Exportar mis datos (Control total)' : 'Export My Data'}
          </h4>
        </div>
        <p className="text-xs text-[#44544A]">
          {isEs
            ? 'Descarga una copia completa de tus mascotas, raciones y pesajes en formato abierto.'
            : 'Download a complete copy of your pet records, rations, and logs.'}
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

        {showExportSuccess && (
          <p className="text-xs text-[#1E8A49] font-bold text-center pt-1">
            ✓ {isEs ? 'Copia descargada exitosamente en tu dispositivo.' : 'Backup successfully downloaded.'}
          </p>
        )}
      </div>

      {/* Privacy Policy & GDPR/LGPD (Page 6) */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#0B5D2E]" />
            <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
              {isEs ? 'Política de Privacidad y GDPR' : 'Privacy Policy & GDPR'}
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
            ? 'Regla estricta de Ración App: Tus datos de mascotas viven en tu dispositivo. Jamás vendemos información a terceros ni almacenamos fotos de etiquetas sin tu consentimiento explícito.'
            : 'Strict policy: Your pet data is yours. We never sell data to advertisers.'}
        </p>
      </div>

      {/* Delete Account & Wipe Local Data */}
      <div className="bg-[#FEF2F2] rounded-3xl p-5 border border-[#C0392B]/30 space-y-3">
        <div className="flex items-center gap-2 text-[#991B1B]">
          <Trash2 className="w-5 h-5 text-[#C0392B]" />
          <h4 className="font-heading font-extrabold text-base">
            {isEs ? 'Borrar todos mis datos' : 'Delete Account & All Data'}
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
                  if (idToken) {
                    try {
                      await fetch('/api/user/delete-account', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${idToken}` },
                      });
                    } catch (e) {
                      // Handled
                    }
                  }
                  onResetAllData();
                  setShowConfirmDelete(false);
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
            {isEs ? 'Borrar cuenta y datos' : 'Delete account and data'}
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
                <strong>1. Privacidad Primero:</strong> Ración App opera bajo el modelo de almacenamiento local y encriptado. No comercializamos bases de datos con marcas de comida ni anunciantes.
              </p>
              <p>
                <strong>2. Fotos de Etiquetas e IA:</strong> Las imágenes subidas para extracción OCR se procesan de forma transitoria y segura. Nunca se almacenan permanentemente sin confirmación.
              </p>
              <p>
                <strong>3. Cumplimiento GDPR / LGPD:</strong> Tienes derecho absoluto a la exportación de tus datos en formatos estándar (JSON, CSV, PDF) y al borrado definitivo con un solo toque.
              </p>
              <p>
                <strong>4. Guía Educativa:</strong> Esta aplicación se fundamenta en guías nutricionales públicas (NRC 2006, WSAVA, AAHA). No constituye prescripción médica.
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
