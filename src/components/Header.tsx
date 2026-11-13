import React, { useState } from 'react';
import { Pet, UserAccount } from '../types';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Shield, Plus, WifiOff, Download, Globe, User as UserIcon, LogIn, LogOut, Bell } from 'lucide-react';
import { OfflineSyncIndicator } from './OfflineSyncIndicator';
import { useAuth } from '../contexts/AuthContext.tsx';

interface HeaderProps {
  pets: Pet[];
  activePet?: Pet;
  onSelectPet: (id: string) => void;
  onAddNewPet: () => void;
  userAccount: UserAccount;
  onUpdateAccount: (updated: Partial<UserAccount>) => void;
  onOpenPayment?: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
  idToken?: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  pets,
  activePet,
  onSelectPet,
  onAddNewPet,
  userAccount,
  onUpdateAccount,
  onOpenPayment,
  onOpenNotifications,
  unreadNotificationsCount = 1,
  idToken,
}) => {
  const { isInstallable, isInstalled, isOnline, install, isIOS } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, openAuthModal, signOut } = useAuth();

  const isEs = userAccount.language === 'es';

  const toggleLanguage = () => {
    onUpdateAccount({ language: isEs ? 'en' : 'es' });
  };

  const toggleUnits = () => {
    onUpdateAccount({ units: userAccount.units === 'metric' ? 'imperial' : 'metric' });
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#0B5D2E18] shadow-xs px-4 py-2.5 transition-all">
      {/* Top micro bar: brand symbol + language / unit toggle + auth + offline alert */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* Brand Icon Shield (In-app only shield icon according to Brand Manual Page 8) */}
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-[#0B5D2E] shadow-xs">
            <img
              src="/assets/aistudio/Racio_n_App__Nutricio_n_con_carin_o_8fb59a2d.png"
              alt="Ración App Shield"
              className="w-full h-full object-cover scale-140"
            />
          </div>
          <span className="font-heading font-extrabold text-lg text-[#0B5D2E] tracking-tight">
            Ración App
          </span>
          {userAccount.isLicensed ? (
            <span className="bg-[#0B5D2E]/10 text-[#0B5D2E] text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#0B5D2E20]">
              PRO
            </span>
          ) : (
            <button
              onClick={onOpenPayment}
              className="bg-[#F57C1A] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-xs hover:bg-[#d9670f] transition active:scale-95"
            >
              {isEs ? 'Desbloquear PRO' : 'Unlock PRO'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Notifications Center Bell */}
          <button
            type="button"
            onClick={onOpenNotifications}
            className="relative p-1.5 rounded-lg border border-[#0B5D2E20] bg-[#EAF4EC] text-[#0B5D2E] hover:bg-[#d9ebdd] transition"
            title={isEs ? 'Avisos y reposición' : 'Notifications'}
          >
            <Bell className="w-3.5 h-3.5" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#F57C1A] rounded-full ring-2 ring-white" />
            )}
          </button>

          {/* Offline & Sync Status Indicator */}
          <OfflineSyncIndicator idToken={idToken} isCompact />

          {/* User Auth Pill or Register Button */}
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 p-0.5 pr-2 rounded-full border border-[#0B5D2E25] bg-[#EAF4EC] hover:bg-[#d9ebd9] transition min-h-[32px]"
                title={user.displayName || user.email || 'Mi Cuenta'}
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Usuario'}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#0B5D2E] text-white flex items-center justify-center text-[10px] font-black uppercase">
                    {(user.displayName || user.email || 'U')[0]}
                  </div>
                )}
                <span className="text-xs font-bold text-[#0B5D2E] max-w-[80px] truncate hidden sm:inline">
                  {user.displayName?.split(' ')[0] || user.email?.split('@')[0] || 'Cuenta'}
                </span>
              </button>

              {/* User Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-xl border border-[#0B5D2E20] p-3.5 z-50 text-left animate-in fade-in">
                  <div className="pb-2.5 border-b border-gray-100">
                    <p className="text-xs font-bold text-[#1C2B21] truncate">
                      {user.displayName || (isEs ? 'Usuario Registrado' : 'Registered User')}
                    </p>
                    <p className="text-[11px] text-[#64748B] truncate">{user.email}</p>
                    <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 bg-[#EAF4EC] text-[#0B5D2E] rounded-full">
                      ✓ {isEs ? 'Sincronizado' : 'Synced'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      signOut();
                      setShowUserMenu(false);
                    }}
                    className="w-full mt-2.5 py-2 px-2.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{isEs ? 'Cerrar sesión' : 'Sign out'}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('register')}
              className="flex items-center gap-1 bg-[#0B5D2E] text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-xs hover:bg-[#094723] transition active:scale-95"
              title="Crear cuenta o iniciar sesión"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isEs ? 'Registrarse' : 'Sign up'}</span>
              <span className="sm:hidden">{isEs ? 'Entrar' : 'Login'}</span>
            </button>
          )}

          {/* Install PWA Button */}
          {isInstallable && !isInstalled && (
            <button
              onClick={install}
              className="flex items-center gap-1 bg-white text-[#0B5D2E] border border-[#0B5D2E30] text-xs font-bold px-2 py-1 rounded-lg shadow-xs hover:bg-[#EAF4EC] transition active:scale-95"
              title="Instalar aplicación"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isEs ? 'Instalar' : 'Install'}</span>
            </button>
          )}

          {isIOS && !isInstalled && (
            <button
              onClick={() => setShowIOSModal(true)}
              className="flex items-center gap-1 bg-white text-[#0B5D2E] border border-[#0B5D2E30] text-xs font-bold px-2 py-1 rounded-lg"
            >
              <Download className="w-3 h-3" />
              <span>iOS</span>
            </button>
          )}

          {/* Unit Toggle */}
          <button
            onClick={toggleUnits}
            className="text-xs font-bold px-2 py-1 rounded-lg border border-[#0B5D2E20] bg-[#EAF4EC] text-[#0B5D2E] hover:bg-[#d9ebdd] transition"
            title="Cambiar unidades"
          >
            {userAccount.units === 'metric' ? 'kg/g' : 'lb/oz'}
          </button>

          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border border-[#0B5D2E20] bg-[#EAF4EC] text-[#0B5D2E] hover:bg-[#d9ebdd] transition"
            title="Cambiar idioma"
          >
            <Globe className="w-3 h-3" />
            <span>{isEs ? 'ES' : 'EN'}</span>
          </button>
        </div>
      </div>

      {/* Pet switcher bar: horizontal scroll of photo avatars */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
        {pets.map((pet) => {
          const isSelected = pet.id === activePet?.id;
          return (
            <button
              key={pet.id}
              onClick={() => onSelectPet(pet.id)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full transition-all shrink-0 min-h-[44px] ${
                isSelected
                  ? 'bg-[#0B5D2E] text-white shadow-sm ring-2 ring-[#0B5D2E] ring-offset-1'
                  : 'bg-[#EAF4EC] text-[#1C2B21] hover:bg-[#dcefe0] border border-[#0B5D2E15]'
              }`}
            >
              <div className="w-7 h-7 rounded-full overflow-hidden bg-white/30 flex items-center justify-center font-bold text-xs">
                {pet.photoUrl ? (
                  <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{pet.species === 'dog' ? '🐶' : '🐱'}</span>
                )}
              </div>
              <span className="font-heading font-bold text-sm tracking-wide pr-1">
                {pet.name}
              </span>
            </button>
          );
        })}

        {/* Add pet button */}
        <button
          onClick={onAddNewPet}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-dashed border-[#0B5D2E] text-[#0B5D2E] hover:bg-[#EAF4EC] transition-colors shrink-0 min-h-[44px]"
          title={isEs ? 'Agregar otra mascota' : 'Add another pet'}
        >
          <Plus className="w-4 h-4" />
          <span className="text-xs font-bold">{isEs ? '+ Mascota' : '+ Pet'}</span>
        </button>
      </div>

      {/* iOS Safari Guided Install Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-[#0B5D2E20]">
            <h3 className="font-heading font-extrabold text-xl text-[#0B5D2E] mb-2">
              {isEs ? 'Instalar en iPhone o iPad' : 'Install on iPhone / iPad'}
            </h3>
            <p className="text-sm text-[#44544A] mb-4">
              {isEs
                ? 'Para usar Ración App como una app nativa sin conexión:'
                : 'To run Ración App natively and offline:'}
            </p>
            <ol className="text-sm text-[#1C2B21] space-y-2 list-decimal list-inside font-semibold mb-6">
              <li>{isEs ? 'Toca el botón Compartir en Safari (icono de cuadrado con flecha)' : 'Tap the Share button in Safari toolbar'}</li>
              <li>{isEs ? 'Baja y selecciona "Agregar a pantalla de inicio"' : 'Scroll down and tap "Add to Home Screen"'}</li>
              <li>{isEs ? 'Toca "Agregar" en la esquina superior' : 'Tap "Add" in top corner'}</li>
            </ol>
            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-3 bg-[#0B5D2E] text-white rounded-xl font-bold min-h-[48px]"
            >
              {isEs ? 'Entendido' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
