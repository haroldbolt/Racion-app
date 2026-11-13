import React, { useState } from 'react';
import { Pet, FeedingPlan, UserAccount, WeightRecord, HealthLog, FoodItem, VetGuideline, MonetizationInfo } from '../types';
import { FoodsView } from './FoodsView';
import { VetView } from './VetView';
import { FamilyView } from './FamilyView';
import { SettingsView } from './SettingsView';
import { PaymentView } from './PaymentView';
import { PriceComparatorView } from '../components/PriceComparatorView';
import {
  UtensilsCrossed,
  Stethoscope,
  ShoppingBag,
  Users,
  CreditCard,
  Settings,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  ArrowLeft,
  AlertTriangle,
  Sun,
  Moon,
  LogIn,
  LogOut,
  User as UserIcon,
  DollarSign,
  HardDrive,
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';
import { FoodCostTracker } from '../components/FoodCostTracker';
import { useAuth } from '../contexts/AuthContext.tsx';
import { SyncQueue, SyncStatus } from '../services/syncQueueService';

interface MoreViewProps {
  pet: Pet;
  pets?: Pet[];
  plan?: FeedingPlan;
  weightRecords: WeightRecord[];
  healthLogs: HealthLog[];
  userAccount: UserAccount;
  monetization?: MonetizationInfo | null;
  onRefreshMonetization?: () => Promise<void>;
  onUpdateAccount: (updated: Partial<UserAccount>) => void;
  onUpdateVetGuideline: (guideline: VetGuideline | undefined) => void;
  onSelectFoodForPet: (food: FoodItem) => void;
  onActivateLicense: (key: string) => void;
  onResetAllData: () => void;
  initialSubSection?: string | null;
  onNavigateTab?: (tab: 'pets' | 'compare' | 'calculate' | 'today' | 'progress') => void;
  idToken?: string | null;
}

export const MoreView: React.FC<MoreViewProps> = ({
  pet,
  pets = [],
  plan,
  weightRecords,
  healthLogs,
  userAccount,
  monetization,
  onRefreshMonetization,
  onUpdateAccount,
  onUpdateVetGuideline,
  onSelectFoodForPet,
  onActivateLicense,
  onResetAllData,
  initialSubSection = null,
  onNavigateTab,
  idToken,
}) => {
  const isEs = userAccount.language === 'es';
  const { user: authUser, openAuthModal, signOut: handleSignOut } = useAuth();

  // Local storage & sync queue state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(SyncQueue.getStatus());
  const [isSyncingManual, setIsSyncingManual] = useState<boolean>(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  React.useEffect(() => {
    SyncQueue.setIdToken(idToken || null);
    const unsub = SyncQueue.subscribe((s) => setSyncStatus(s));
    return () => unsub();
  }, [idToken]);

  const handleManualSyncNow = async () => {
    setIsSyncingManual(true);
    setSyncSuccessMessage(null);
    try {
      const res = await SyncQueue.processQueue();
      if (res.syncedCount > 0) {
        setSyncSuccessMessage(
          isEs ? `¡${res.syncedCount} cambio(s) sincronizado(s) con éxito!` : `Successfully synced ${res.syncedCount} item(s)!`
        );
      } else {
        setSyncSuccessMessage(
          isEs ? 'Todo está al día con el servidor.' : 'Everything is already up to date.'
        );
      }
      setTimeout(() => setSyncSuccessMessage(null), 3500);
    } catch {
      // Handled in service
    } finally {
      setIsSyncingManual(false);
    }
  };

  // Subsections inside "Más"
  const [currentSection, setCurrentSection] = useState<string | null>(initialSubSection);

  // If a subsection is opened, render it with Back button to "Más" list
  if (currentSection === 'foods') {
    return (
      <div>
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <button
            onClick={() => setCurrentSection(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
          </button>
        </div>
        <FoodsView
          pet={pet}
          merTargetKcal={plan?.mer || 600}
          userAccount={userAccount}
          onSelectFoodForPet={(food) => {
            onSelectFoodForPet(food);
            setCurrentSection(null);
          }}
          onClose={() => setCurrentSection(null)}
        />
      </div>
    );
  }

  if (currentSection === 'price_comparator') {
    return (
      <div className="pb-28">
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <button
            onClick={() => setCurrentSection(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
          </button>
        </div>
        <div className="p-4 pt-1">
          <PriceComparatorView
            pet={pet}
            pets={pets}
            plan={plan}
            initialFood={plan?.dryFood}
            userAccount={userAccount}
          />
        </div>
      </div>
    );
  }

  if (currentSection === 'vet') {
    return (
      <div>
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <button
            onClick={() => setCurrentSection(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
          </button>
        </div>
        <VetView
          pet={pet}
          plan={plan}
          weightRecords={weightRecords}
          healthLogs={healthLogs}
          userAccount={userAccount}
          onUpdateVetGuideline={onUpdateVetGuideline}
        />
      </div>
    );
  }

  if (currentSection === 'shop') {
    return (
      <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
        <button
          onClick={() => setCurrentSection(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
        </button>

        <div className="bg-white rounded-3xl p-6 border border-[#0B5D2E20] shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#EAF4EC] rounded-2xl text-[#0B5D2E]">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
                {isEs ? 'Tienda y Recompra de Alimento' : 'Food Reorder & Stores'}
              </h3>
              <p className="text-xs text-[#44544A]">
                {isEs ? 'Sin tienda interna que distraiga — enlace directo a tu tienda favorita' : 'No cluttered store — direct external reorder link'}
              </p>
            </div>
          </div>

          <div className="bg-[#EAF4EC] p-4 rounded-2xl border border-[#0B5D2E15] space-y-2">
            <span className="text-xs font-bold text-[#0B5D2E] uppercase block">
              {isEs ? 'Alimento configurado para ' : 'Configured food for '} {pet.name}:
            </span>
            <h4 className="font-heading font-black text-lg text-[#1C2B21]">
              {plan?.foodBrand} {plan?.foodName}
            </h4>
            <div className="flex justify-between items-center text-xs text-[#44544A] pt-1">
              <span>{isEs ? 'Ración:' : 'Daily ration:'} <strong>{plan?.gramsPerDay || 190} g/día</strong></span>
              <span className="font-extrabold text-[#0B5D2E]">
                {isEs ? `Quedan ~${plan?.bagDaysRemaining || 30} días` : `~${plan?.bagDaysRemaining || 30} days left`}
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <a
              href={`https://www.google.com/search?q=comprar+alimento+${encodeURIComponent(plan?.foodBrand || '')}+${encodeURIComponent(plan?.foodName || '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[52px] bg-[#F57C1A] text-white rounded-2xl font-heading font-extrabold text-base flex items-center justify-center gap-2 hover:bg-[#e06d12] transition shadow-md active:scale-95"
            >
              <span>{isEs ? 'Comprar este alimento ahora' : 'Buy this food now'}</span>
              <ExternalLink className="w-4 h-4" />
            </a>

            <p className="text-[11px] text-[#44544A] text-center">
              {isEs
                ? 'Ración App no cobra comisiones de intermediario obligatorio. Te conectamos libremente con tiendas locales y veterinarias.'
                : 'Direct connection to local pet delivery and certified distributors.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (currentSection === 'family') {
    return (
      <div>
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <button
            onClick={() => setCurrentSection(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
          </button>
        </div>
        <FamilyView
          pet={pet}
          pets={pets}
          plan={plan}
          userAccount={userAccount}
          onUpdateAccount={onUpdateAccount}
        />
      </div>
    );
  }

  if (currentSection === 'food_costs') {
    return (
      <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
        <button
          onClick={() => setCurrentSection(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
        </button>
        <FoodCostTracker
          pet={pet}
          plan={plan}
          userAccount={userAccount}
        />
      </div>
    );
  }

  if (currentSection === 'payment') {
    return (
      <div>
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <button
            onClick={() => setCurrentSection(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
          </button>
        </div>
        <PaymentView
          userAccount={userAccount}
          monetization={monetization}
          onRefreshMonetization={onRefreshMonetization}
          onActivateLicense={onActivateLicense}
          onClose={() => setCurrentSection(null)}
        />
      </div>
    );
  }

  if (currentSection === 'settings') {
    return (
      <div>
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <button
            onClick={() => setCurrentSection(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
          </button>
        </div>
        <SettingsView
          userAccount={userAccount}
          pets={[pet]}
          onUpdateAccount={onUpdateAccount}
          onResetAllData={onResetAllData}
          idToken={idToken}
        />
      </div>
    );
  }

  // Main "Más" menu list ordered strictly by frequency of use (Page 11)
  const menuItems = [
    {
      id: 'pets',
      title: isEs ? 'Mis Mascotas' : 'My Pets',
      subtitle: isEs
        ? 'Gestionar perfiles, agregar nuevas mascotas o cambiar mascota activa'
        : 'Manage profiles, add new pets or switch active pet',
      icon: <Users className="w-5 h-5 text-[#0B5D2E]" />,
    },
    {
      id: 'foods',
      title: isEs ? 'Alimentos y Comparador' : 'Food Catalog & Comparer',
      subtitle: isEs
        ? 'Base multi-marca, escáner de código, IA de etiquetas y alimentos tóxicos'
        : 'Multi-brand database, barcode scanner, label AI and toxic food alerts',
      icon: <UtensilsCrossed className="w-5 h-5 text-[#0B5D2E]" />,
      badge: isEs ? 'Nutrición' : 'Nutrition',
    },
    {
      id: 'price_comparator',
      title: isEs ? 'Comparador de Precios (Google Shopping)' : 'Price Comparer (Google Shopping)',
      subtitle: isEs
        ? 'Ofertas en tiempo real con tiendas colombianas (Laika, Agrocampo, Kanú, Éxito)'
        : 'Real-time Google Shopping offers in Colombia (Laika, Agrocampo, Kanú, Éxito)',
      icon: <ShoppingBag className="w-5 h-5 text-[#0B5D2E]" />,
      badge: '$ COP',
    },
    {
      id: 'vet',
      title: isEs ? 'Módulo Veterinario y Urgencias' : 'Veterinary Module & 24h',
      subtitle: isEs
        ? 'Pauta médica con bloqueo, informe PDF para el médico y ficha de emergencia'
        : 'Vet guideline lock, official PDF report and emergency protocol',
      icon: <Stethoscope className="w-5 h-5 text-[#0B5D2E]" />,
      badge: isEs ? 'Salud' : 'Health',
    },
    {
      id: 'shop',
      title: isEs ? 'Recompra y Duración del Bulto' : 'Food Reorder & Bag Alert',
      subtitle: isEs
        ? `Te quedan ~${plan?.bagDaysRemaining || 30} días de comida • Enlace directo de compra`
        : `~${plan?.bagDaysRemaining || 30} days left in bag • Direct store link`,
      icon: <ShoppingBag className="w-5 h-5 text-[#F57C1A]" />,
    },
    {
      id: 'family',
      title: isEs ? 'Familia y Guardería' : 'Family & Caregivers',
      subtitle: isEs
        ? 'Roles compartidos y hoja de cuidados en PDF (1 página) para cuidadores'
        : 'Family sync and 1-page daycare PDF summary',
      icon: <Users className="w-5 h-5 text-[#0B5D2E]" />,
    },
    {
      id: 'food_costs',
      title: isEs ? 'Gastos en Comida ($ COP)' : 'Food Expenses ($ COP)',
      subtitle: isEs
        ? 'Sube tus facturas, recibos y supervisa el gasto diario/mensual en Pesos Colombianos'
        : 'Log purchases, receipts, and monitor daily/monthly food expenses in COP',
      icon: <DollarSign className="w-5 h-5 text-[#0B5D2E]" />,
      badge: '$ COP',
    },
    {
      id: 'payment',
      title: isEs ? 'Licencia Vitalicia - $ 80.000 COP (~20 USD)' : 'Lifetime License ($ 80,000 COP / ~USD 20)',
      subtitle: isEs
        ? userAccount.isLicensed
          ? '✓ Licencia PRO Activa para siempre'
          : 'Desbloquear todas las mascotas sin suscripción'
        : userAccount.isLicensed
        ? '✓ PRO License Active'
        : 'Unlock all pets forever (no subscription)',
      icon: <CreditCard className="w-5 h-5 text-[#F57C1A]" />,
      badge: userAccount.isLicensed ? 'PRO' : '$ COP',
    },
    {
      id: 'settings',
      title: isEs ? 'Ajustes y Privacidad' : 'Settings & Privacy',
      subtitle: isEs
        ? 'Idioma (ES/EN), unidades (kg/lb), exportar CSV/JSON y borrar cuenta'
        : 'Language, units, CSV/JSON export and account deletion',
      icon: <Settings className="w-5 h-5 text-[#44544A]" />,
    },
  ];

  return (
    <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
      <div>
        <h2 className="font-heading font-extrabold text-2xl text-[#0B5D2E]">
          {isEs ? 'Más opciones' : 'More options'}
        </h2>
        <p className="text-xs text-[#44544A] mt-0.5">
          {isEs
            ? 'Herramientas avanzadas organizadas por frecuencia de uso'
            : 'Advanced tools organized by frequency of use'}
        </p>
      </div>

      {/* Account / Cloud Sync Card */}
      <div className="bg-white rounded-3xl p-4 border border-[#0B5D2E18] shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center shrink-0 font-bold overflow-hidden border border-[#0B5D2E20]">
            {authUser?.photoURL ? (
              <img src={authUser.photoURL} alt={authUser.displayName || 'User'} className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-5 h-5 text-[#0B5D2E]" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-heading font-extrabold text-sm text-[#1C2B21] block truncate">
                {authUser ? (authUser.displayName || authUser.phoneNumber || authUser.email) : (isEs ? 'Cuenta en la nube' : 'Cloud Account')}
              </span>
              {authUser && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-[#EAF4EC] text-[#0B5D2E] rounded-md shrink-0">
                  {authUser.providerData[0]?.providerId === 'google.com'
                    ? 'Google'
                    : authUser.providerData[0]?.providerId === 'phone'
                    ? 'Celular'
                    : 'Correo'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#44544A] truncate">
              {authUser
                ? (isEs ? 'Sincronización activa en la nube' : 'Active cloud synchronization')
                : (isEs ? 'Entra con Google, correo o celular' : 'Sign in with Google, email or phone')}
            </p>
          </div>
        </div>

        {authUser ? (
          <button
            type="button"
            onClick={handleSignOut}
            className="px-3 py-2 rounded-xl text-xs font-bold text-[#44544A] hover:bg-gray-100 transition shrink-0 flex items-center gap-1.5 min-h-[40px]"
          >
            <LogOut className="w-4 h-4" />
            <span>{isEs ? 'Salir' : 'Sign out'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openAuthModal('register')}
            className="px-3.5 py-2 bg-[#0B5D2E] text-white rounded-xl text-xs font-heading font-extrabold hover:bg-[#094723] transition shrink-0 flex items-center gap-1.5 shadow-xs min-h-[40px] active:scale-95"
          >
            <LogIn className="w-4 h-4" />
            <span>{isEs ? 'Entrar / Registrarse' : 'Sign in / Register'}</span>
          </button>
        )}
      </div>

      {/* Visual Mode Selector (Claro / Oscuro) - Persists in userAccount */}
      <div className="bg-white rounded-3xl p-4 border border-[#0B5D2E18] shadow-sm flex items-center justify-between gap-3 transition-all">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-[#EAF4EC] text-[#0B5D2E] shrink-0">
            {userAccount.theme === 'dark' ? (
              <Moon className="w-5 h-5 text-[#27AE60]" />
            ) : (
              <Sun className="w-5 h-5 text-[#F57C1A]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading font-extrabold text-base text-[#1C2B21]">
                {isEs ? 'Modo Visual' : 'Visual Theme'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E20]">
                {userAccount.theme === 'dark' ? (isEs ? 'Oscuro' : 'Dark') : (isEs ? 'Claro' : 'Light')}
              </span>
            </div>
            <p className="text-xs text-[#44544A] mt-0.5">
              {userAccount.theme === 'dark'
                ? (isEs ? 'Fondo oscuro con acento verde de marca' : 'Dark slate with brand green accents')
                : (isEs ? 'Fondo claro natural con acento verde' : 'Light natural with brand green accents')}
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <div className="flex items-center bg-[#EAF4EC] p-1 rounded-2xl border border-[#0B5D2E15] shrink-0">
          <button
            type="button"
            onClick={() => onUpdateAccount({ theme: 'light' })}
            aria-label={isEs ? 'Cambiar a modo claro' : 'Switch to light mode'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-heading font-bold transition-all min-h-[40px] ${
              userAccount.theme !== 'dark'
                ? 'bg-white text-[#0B5D2E] shadow-sm ring-1 ring-black/5'
                : 'text-[#44544A] hover:text-[#0B5D2E]'
            }`}
          >
            <Sun className={`w-4 h-4 ${userAccount.theme !== 'dark' ? 'text-[#F57C1A]' : ''}`} />
            <span className="hidden sm:inline">{isEs ? 'Claro' : 'Light'}</span>
          </button>
          <button
            type="button"
            onClick={() => onUpdateAccount({ theme: 'dark' })}
            aria-label={isEs ? 'Cambiar a modo oscuro' : 'Switch to dark mode'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-heading font-bold transition-all min-h-[40px] ${
              userAccount.theme === 'dark'
                ? 'bg-[#1E8A49] text-white shadow-sm'
                : 'text-[#44544A] hover:text-[#0B5D2E]'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span className="hidden sm:inline">{isEs ? 'Oscuro' : 'Dark'}</span>
          </button>
        </div>
      </div>

      {/* Robust Local Storage & Auto-Sync Status Card */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E18] shadow-sm space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl shrink-0 ${
              !syncStatus.isOnline
                ? 'bg-amber-100 text-amber-700'
                : syncStatus.pendingCount > 0
                ? 'bg-blue-100 text-blue-700'
                : 'bg-[#EAF4EC] text-[#0B5D2E]'
            }`}>
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-heading font-extrabold text-base text-[#1C2B21]">
                  {isEs ? 'Almacenamiento Local y Sincronización' : 'Offline Storage & Sync'}
                </span>
              </div>
              <span className="text-xs text-[#44544A] block mt-0.5">
                {isEs
                  ? 'Modo sin conexión resiliente de alta disponibilidad'
                  : 'High-availability resilient offline mode'}
              </span>
            </div>
          </div>

          {/* Network badge */}
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 shrink-0 ${
            !syncStatus.isOnline
              ? 'bg-amber-500/15 text-amber-700 border border-amber-500/30'
              : syncStatus.isSyncing
              ? 'bg-[#0B5D2E]/10 text-[#0B5D2E] border border-[#0B5D2E20]'
              : syncStatus.pendingCount > 0
              ? 'bg-blue-500/10 text-blue-700 border border-blue-500/20'
              : 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20'
          }`}>
            {!syncStatus.isOnline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                <span>{isEs ? 'Sin conexión' : 'Offline'}</span>
              </>
            ) : syncStatus.isSyncing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0B5D2E]" />
                <span>{isEs ? 'Sincronizando' : 'Syncing'}</span>
              </>
            ) : syncStatus.pendingCount > 0 ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                <span>{syncStatus.pendingCount} {isEs ? 'pendientes' : 'pending'}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isEs ? 'Al día' : 'Synced'}</span>
              </>
            )}
          </span>
        </div>

        <p className="text-xs text-[#44544A] leading-relaxed">
          {isEs
            ? 'La app funciona al 100% de manera autónoma sin internet. Tus mascotas, pesajes, comidas, planes y gastos en COP se guardan de forma instantánea en tu dispositivo y se sincronizan automáticamente con el servidor al recuperar conexión.'
            : 'The app is 100% fully functional without internet. All pets, weigh-ins, meals, plans, and food expenses are immediately stored on your device and automatically synced with the server when reconnected.'}
        </p>

        {/* Sync Status Details */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#EAF4EC]/50 p-2.5 rounded-2xl border border-[#0B5D2E15]">
            <span className="text-[10px] text-[#44544A] uppercase font-bold tracking-wider block">
              {isEs ? 'Cola local de cambios' : 'Local Queue'}
            </span>
            <span className="font-heading font-extrabold text-sm text-[#0B5D2E]">
              {syncStatus.pendingCount === 0
                ? (isEs ? '0 pendientes (Todo guardado)' : '0 pending')
                : `${syncStatus.pendingCount} ${isEs ? 'pendientes de subida' : 'pending upload'}`}
            </span>
          </div>

          <div className="bg-[#EAF4EC]/50 p-2.5 rounded-2xl border border-[#0B5D2E15]">
            <span className="text-[10px] text-[#44544A] uppercase font-bold tracking-wider block">
              {isEs ? 'Última sincronización' : 'Last Sync'}
            </span>
            <span className="font-heading font-extrabold text-sm text-[#1C2B21]">
              {syncStatus.lastSyncedAt
                ? new Date(syncStatus.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : (isEs ? 'Pendiente' : 'Pending')}
            </span>
          </div>
        </div>

        {/* Feedback message */}
        {syncSuccessMessage && (
          <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncSuccessMessage}</span>
          </div>
        )}

        {/* Manual Sync Trigger */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleManualSyncNow}
            disabled={isSyncingManual || syncStatus.isSyncing || !syncStatus.isOnline}
            className={`flex-1 py-2.5 px-4 rounded-2xl text-xs font-heading font-extrabold flex items-center justify-center gap-2 transition min-h-[44px] ${
              !syncStatus.isOnline
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : isSyncingManual || syncStatus.isSyncing
                ? 'bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E25]'
                : 'bg-[#0B5D2E] text-white hover:bg-[#094723] active:scale-98 shadow-xs cursor-pointer'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingManual || syncStatus.isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {!syncStatus.isOnline
                ? (isEs ? 'Modo sin internet (esperando red)' : 'Offline mode (waiting for network)')
                : isSyncingManual || syncStatus.isSyncing
                ? (isEs ? 'Sincronizando ahora...' : 'Syncing now...')
                : (isEs ? 'Sincronizar cambios ahora' : 'Sync now')}
            </span>
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === 'pets' && onNavigateTab) {
                onNavigateTab('pets');
              } else if (item.id === 'foods' && onNavigateTab) {
                onNavigateTab('compare');
              } else {
                setCurrentSection(item.id);
              }
            }}
            className="w-full bg-white p-4 rounded-3xl border border-[#0B5D2E18] shadow-sm hover:border-[#0B5D2E40] transition text-left flex items-center justify-between min-h-[68px] active:scale-99"
          >
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-2xl bg-[#EAF4EC] shrink-0">
                {item.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-extrabold text-base text-[#1C2B21]">
                    {item.title}
                  </span>
                  {item.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E20]">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#44544A] mt-0.5 line-clamp-1">
                  {item.subtitle}
                </p>
              </div>
            </div>

            <ChevronRight className="w-5 h-5 text-[#44544A] shrink-0 ml-2" />
          </button>
        ))}
      </div>

      {/* Brand card at bottom of More */}
      <div className="bg-[#EAF4EC] p-4 rounded-3xl border border-[#0B5D2E15] text-center space-y-1">
        <span className="font-heading font-extrabold text-sm text-[#0B5D2E]">
          Ración App • MVP v1.0
        </span>
        <p className="text-[11px] text-[#44544A]">
          {isEs
            ? 'Basado en NRC 2006, WSAVA y AAHA. Pago único sin suscripción.'
            : 'Based on NRC 2006, WSAVA & AAHA. One-time payment, no subscription.'}
        </p>
      </div>
    </div>
  );
};
