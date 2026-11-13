import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Search,
  Check,
  Globe,
  Loader2,
  Package,
  Smartphone,
} from 'lucide-react';
import { Pet, FoodItem, Species } from '../types';
import { PriceComparatorService } from '../services/priceComparatorService.ts';
import {
  loadShopifyCatalog,
  searchShopifyCatalog,
  parseVariantWeight,
} from '../services/shopifyCatalogService.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'register' | 'login';
  activePet?: Pet;
  onFoodSelected?: (food: FoodItem) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'register',
  activePet,
  onFoodSelected,
}) => {
  const { signInWithGoogle, registerWithCredentials, loginWithCredentials } = useAuth();

  const [mode, setMode] = useState<'register' | 'login'>(initialMode);
  const [accountMethod, setAccountMethod] = useState<'email' | 'phone'>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Internet food selection state for registration
  const [foodQuery, setFoodQuery] = useState('');
  const [foodSpecies, setFoodSpecies] = useState<Species>(activePet?.species || 'dog');
  const [isSearchingFood, setIsSearchingFood] = useState(false);
  const [foodSuggestions, setFoodSuggestions] = useState<
    Array<{
      id: string;
      brand: string;
      productName: string;
      fullName: string;
      imageUrl?: string;
      sizesKg: number[];
      source: 'catalog' | 'internet';
    }>
  >([]);
  const [selectedFood, setSelectedFood] = useState<{
    id: string;
    brand: string;
    name: string;
    imageUrl?: string;
    bagSizeKg: number;
    availableSizesKg: number[];
    kcalPerKg?: number;
  } | null>(null);

  // Sync mode if initialMode changes
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMsg(null);
    }
  }, [isOpen, initialMode]);

  // Sync pet species if activePet changes
  useEffect(() => {
    if (activePet?.species) {
      setFoodSpecies(activePet.species);
    }
  }, [activePet]);

  // Real-time catalog + internet search with debounce
  useEffect(() => {
    if (mode !== 'register') return;
    const trimmed = foodQuery.trim();
    if (!trimmed) {
      setFoodSuggestions([]);
      setIsSearchingFood(false);
      return;
    }

    let isMounted = true;
    setIsSearchingFood(true);

    const timer = setTimeout(async () => {
      try {
        const results: Array<{
          id: string;
          brand: string;
          productName: string;
          fullName: string;
          imageUrl?: string;
          sizesKg: number[];
          source: 'catalog' | 'internet';
        }> = [];

        // 1. Local catalog instant search
        try {
          const catalog = await loadShopifyCatalog();
          const localMatches = searchShopifyCatalog(catalog, {
            query: trimmed,
            species: foodSpecies,
            category: 'main',
            limit: 6,
          });

          for (const item of localMatches) {
            const sizes: number[] = [];
            for (const v of item.presentaciones) {
              const p = parseVariantWeight(v.nombre);
              if (p.kg && !sizes.includes(p.kg)) {
                sizes.push(p.kg);
              }
            }
            results.push({
              id: item.id,
              brand: item.marca,
              productName: item.nombre,
              fullName: `${item.marca} ${item.nombre}`,
              imageUrl: item.foto_url || undefined,
              sizesKg: sizes.length > 0 ? sizes.sort((a, b) => a - b) : [1.5, 3, 15],
              source: 'catalog',
            });
          }
        } catch {
          // ignore catalog load errors
        }

        // 2. Internet Google Shopping Colombia discovery
        if (trimmed.length >= 3) {
          try {
            const onlineResults = await PriceComparatorService.discoverProducts({
              query: trimmed,
              species: foodSpecies,
            });

            for (const online of onlineResults) {
              const alreadyExists = results.some(
                (r) =>
                  r.brand.toLowerCase() === online.brand.toLowerCase() &&
                  r.productName.toLowerCase().includes(online.productName.toLowerCase())
              );
              if (!alreadyExists) {
                results.push({
                  id: online.id,
                  brand: online.brand,
                  productName: online.productName,
                  fullName: online.fullName,
                  imageUrl: online.imageUrl,
                  sizesKg: online.confirmedSizesKg.length > 0 ? online.confirmedSizesKg : [1.5, 3, 15],
                  source: 'internet',
                });
              }
            }
          } catch {
            // ignore network errors
          }
        }

        if (isMounted) {
          setFoodSuggestions(results.slice(0, 8));
          setIsSearchingFood(false);
        }
      } catch {
        if (isMounted) setIsSearchingFood(false);
      }
    }, 280);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [foodQuery, foodSpecies, mode]);

  const applySelectedFoodToPet = () => {
    if (!selectedFood) return;
    const hasKcal = Boolean(selectedFood.kcalPerKg && selectedFood.kcalPerKg > 400);
    const foodItem: FoodItem = {
      id: selectedFood.id,
      brand: selectedFood.brand,
      name: selectedFood.name,
      species: foodSpecies,
      lifeStage: /cachorr|puppy|gatit|kitten/i.test(selectedFood.name)
        ? (foodSpecies === 'cat' ? 'kitten' : 'puppy')
        : 'adult',
      type: 'dry',
      kcalPerKg: hasKcal ? selectedFood.kcalPerKg! : 0,
      proteinPct: 0,
      fatPct: 0,
      fiberPct: 0,
      moisturePct: 10,
      country: 'Colombia',
      bagSizeKg: selectedFood.bagSizeKg,
      availableSizesKg: selectedFood.availableSizesKg,
      imageUrl: selectedFood.imageUrl,
      labelStatus: hasKcal ? 'user_confirmed_label' : 'unconfirmed',
      dataSource: hasKcal ? 'Ficha confirmada' : 'Catálogo (etiqueta pendiente)',
    };
    if (onFoodSelected) {
      onFoodSelected(foodItem);
    }
  };

  if (!isOpen) return null;

  const extractErrorCode = (err: any): string => {
    if (err?.code && typeof err.code === 'string') return err.code;
    const msg = String(err?.message || '');
    const match = msg.match(/\((auth\/[a-z0-9-]+)\)/i);
    return match ? match[1] : '';
  };

  const getSpanishErrorMessage = (err: any): string => {
    const code = extractErrorCode(err);
    switch (code) {
      case 'auth/popup-closed-by-user':
        return 'Cerraste la ventana de Google antes de finalizar. Puedes intentarlo de nuevo o usar correo o celular.';
      case 'auth/cancelled-popup-request':
        return 'Se canceló la ventana de Google. Inténtalo de nuevo.';
      case 'auth/popup-blocked':
        return 'Tu navegador bloqueó la ventana emergente de Google. Permite los pop-ups o regístrate con tu correo o celular aquí abajo.';
      case 'auth/unauthorized-domain':
        return 'Este dominio no está autorizado para Google Sign-In. Puedes ingresar con tu correo electrónico o número de celular.';
      case 'auth/network-request-failed':
        return 'No se pudo conectar al servidor. Revisa tu conexión a internet.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos en poco tiempo. Espera unos minutos antes de reintentar.';
      default:
        return err?.message || 'Ocurrió un error al procesar tu solicitud. Inténtalo de nuevo.';
    }
  };

  const handleGoogleAuth = async () => {
    if (loading) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      applySelectedFoodToPet();
      onClose();
    } catch (err: any) {
      setErrorMsg(getSpanishErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg(null);

    if (mode === 'register') {
      if (accountMethod === 'email') {
        const cleanEmail = email.trim();
        if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          setErrorMsg('Por favor ingresa un correo electrónico válido.');
          return;
        }
        if (password.length < 6) {
          setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
          return;
        }
        if (password !== confirmPassword) {
          setErrorMsg('Las contraseñas no coinciden. Verifícalas.');
          return;
        }

        setLoading(true);
        try {
          await registerWithCredentials({
            method: 'email',
            email: cleanEmail,
            password,
            displayName: name.trim() || undefined,
          });
          applySelectedFoodToPet();
          onClose();
        } catch (err: any) {
          setErrorMsg(getSpanishErrorMessage(err));
        } finally {
          setLoading(false);
        }
        return;
      }

      // Phone registration
      const cleanDigits = phone.replace(/[^\d]/g, '');
      if (cleanDigits.length < 7 || cleanDigits.length > 15) {
        setErrorMsg('Ingresa un número de celular válido (7 a 15 dígitos).');
        return;
      }
      if (password.length < 4) {
        setErrorMsg('Tu clave o PIN debe tener al menos 4 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Las claves no coinciden. Verifícalas.');
        return;
      }

      setLoading(true);
      try {
        await registerWithCredentials({
          method: 'phone',
          phone: cleanDigits,
          password,
          displayName: name.trim() || undefined,
        });
        applySelectedFoodToPet();
        onClose();
      } catch (err: any) {
        setErrorMsg(getSpanishErrorMessage(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    // Login mode (accepts either Email or Phone)
    if (!loginIdentifier.trim() || !password) {
      setErrorMsg('Ingresa tu correo electrónico o celular y tu contraseña.');
      return;
    }

    setLoading(true);
    try {
      await loginWithCredentials({
        identifier: loginIdentifier.trim(),
        password,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(getSpanishErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full max-h-[92dvh] sm:max-h-[90dvh] flex flex-col shadow-2xl border border-[#0B5D2E20] relative overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0B5D2E] to-[#127A3F] px-5 sm:px-6 py-4 sm:py-5 text-white relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition active:scale-95"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-sm p-1.5 flex items-center justify-center border border-white/20">
              <img
                src="/assets/aistudio/Racio_n_App__Nutricio_n_con_carin_o_8fb59a2d.png"
                alt="Ración App"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2 className="font-heading font-extrabold text-xl leading-tight">
                {mode === 'register' ? 'Crea tu Cuenta' : 'Iniciar Sesión'}
              </h2>
              <p className="text-xs text-white/85">
                {mode === 'register'
                  ? 'Ingresa con Google, correo o número de celular'
                  : 'Accede con tu cuenta de Google, correo o celular'}
              </p>
            </div>
          </div>
        </div>

        {/* Tab switcher: Register vs Login */}
        <div className="grid grid-cols-2 p-1.5 bg-[#EAF4EC]/60 border-b border-[#0B5D2E15] shrink-0">
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg(null);
            }}
            className={`py-2.5 text-xs font-heading font-extrabold rounded-2xl transition-all ${
              mode === 'register'
                ? 'bg-white text-[#0B5D2E] shadow-xs'
                : 'text-[#44544A] hover:text-[#0B5D2E]'
            }`}
          >
            Crear Cuenta
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
            }}
            className={`py-2.5 text-xs font-heading font-extrabold rounded-2xl transition-all ${
              mode === 'login'
                ? 'bg-white text-[#0B5D2E] shadow-xs'
                : 'text-[#44544A] hover:text-[#0B5D2E]'
            }`}
          >
            Iniciar Sesión
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto overscroll-contain flex-1">
          {/* Option 1: 1-Click Google */}
          <div>
            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full min-h-[48px] bg-white border border-[#CBD5E1] text-[#1E293B] hover:bg-gray-50 rounded-2xl font-heading font-bold text-sm flex items-center justify-center gap-3 transition shadow-xs active:scale-98 disabled:opacity-50"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>
                {mode === 'register' ? 'Registrarme con Google' : 'Continuar con Google'}
              </span>
              <span className="text-[10px] font-extrabold bg-[#EAF4EC] text-[#0B5D2E] px-2 py-0.5 rounded-md">
                1 clic
              </span>
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-[#64748B] font-medium">
                  {mode === 'register'
                    ? 'o crea cuenta con otro correo o celular'
                    : 'o ingresa con tu correo o celular'}
                </span>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Account Method Switcher (Register mode: Email vs Phone) */}
          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setAccountMethod('email');
                  setErrorMsg(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  accountMethod === 'email'
                    ? 'bg-white text-[#0B5D2E] shadow-xs'
                    : 'text-[#44544A] hover:text-[#1C2B21]'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Cualquier Correo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccountMethod('phone');
                  setErrorMsg(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  accountMethod === 'phone'
                    ? 'bg-white text-[#0B5D2E] shadow-xs'
                    : 'text-[#44544A] hover:text-[#1C2B21]'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Número de Celular</span>
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-[#1C2B21] mb-1">
                  Tu nombre o familia
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Juan Gómez o Familia Pérez"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#0B5D2E] focus:ring-1 focus:ring-[#0B5D2E] outline-none transition"
                  />
                </div>
              </div>
            )}

            {/* Identifier Field */}
            {mode === 'register' ? (
              accountMethod === 'email' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[#1C2B21]">
                      Correo electrónico *
                    </label>
                    <span className="text-[10px] text-[#64748B]">
                      Outlook, Hotmail, Yahoo, iCloud, Gmail...
                    </span>
                  </div>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tucorreo@outlook.com"
                      autoComplete="email"
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#0B5D2E] focus:ring-1 focus:ring-[#0B5D2E] outline-none transition"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-[#1C2B21] mb-1">
                    Número de celular / WhatsApp *
                  </label>
                  <div className="relative">
                    <Smartphone className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ej. 300 123 4567"
                      autoComplete="tel"
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#0B5D2E] focus:ring-1 focus:ring-[#0B5D2E] outline-none transition"
                    />
                  </div>
                </div>
              )
            ) : (
              <div>
                <label className="block text-xs font-bold text-[#1C2B21] mb-1">
                  Correo electrónico o número de celular *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="tucorreo@dominio.com o 300 123 4567"
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#0B5D2E] focus:ring-1 focus:ring-[#0B5D2E] outline-none transition"
                  />
                </div>
              </div>
            )}

            {/* Password / PIN */}
            <div>
              <label className="block text-xs font-bold text-[#1C2B21] mb-1">
                {mode === 'register' && accountMethod === 'phone'
                  ? 'Clave o PIN de acceso *'
                  : 'Contraseña *'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === 'register' && accountMethod === 'phone'
                      ? 'Mínimo 4 caracteres o números'
                      : 'Mínimo 6 caracteres'
                  }
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className="w-full pl-10 pr-10 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#0B5D2E] focus:ring-1 focus:ring-[#0B5D2E] outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  aria-label="Ver u ocultar contraseña"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password (Registration only) */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-[#1C2B21] mb-1">
                  {accountMethod === 'phone' ? 'Confirmar clave o PIN *' : 'Confirmar contraseña *'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={
                      accountMethod === 'phone' ? 'Repite tu clave o PIN' : 'Repite tu contraseña'
                    }
                    autoComplete="new-password"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#0B5D2E] focus:ring-1 focus:ring-[#0B5D2E] outline-none transition"
                  />
                </div>
              </div>
            )}

            {/* Dedicated Pet Food Section (Registration only, Connected to Internet) */}
            {mode === 'register' && (
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-[#1C2B21]">
                    ¿Cuál es el alimento que le das a tu mascota?
                  </label>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <Globe className="w-2.5 h-2.5" />
                    <span>Internet en vivo</span>
                  </span>
                </div>

                {/* Pet species toggle */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[11px] text-[#44544A] font-medium">Para:</span>
                  <button
                    type="button"
                    onClick={() => setFoodSpecies('dog')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      foodSpecies === 'dog'
                        ? 'bg-[#0B5D2E] text-white shadow-xs'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    🐶 Perro
                  </button>
                  <button
                    type="button"
                    onClick={() => setFoodSpecies('cat')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      foodSpecies === 'cat'
                        ? 'bg-[#0B5D2E] text-white shadow-xs'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    🐱 Gato
                  </button>
                </div>

                {/* Selected Food Preview Card */}
                {selectedFood ? (
                  <div className="p-3 bg-[#EAF4EC] border-2 border-[#0B5D2E] rounded-2xl flex items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-white p-1 border border-[#0B5D2E20] shrink-0 flex items-center justify-center overflow-hidden">
                        {selectedFood.imageUrl ? (
                          <img
                            src={selectedFood.imageUrl}
                            alt={selectedFood.name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Package className="w-6 h-6 text-[#0B5D2E]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-[#0B5D2E] uppercase tracking-wide">
                            {selectedFood.brand}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-emerald-100 text-[#0B5D2E] px-1.5 py-0.5 rounded-md font-bold">
                            <Check className="w-2.5 h-2.5" />
                            {selectedFood.bagSizeKg} kg
                          </span>
                        </div>
                        <p className="text-xs font-bold text-[#1C2B21] truncate leading-snug">
                          {selectedFood.name}
                        </p>
                        <p className="text-[10px] text-[#44544A]">
                          ✓ Se sincronizará automáticamente en tu ración diaria
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedFood(null)}
                      className="text-xs font-bold text-[#0B5D2E] hover:underline shrink-0 px-2 py-1 bg-white rounded-lg border border-[#0B5D2E30]"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={foodQuery}
                        onChange={(e) => setFoodQuery(e.target.value)}
                        placeholder="Ej. Agility Gold, Royal Canin, Taste of the Wild..."
                        className="w-full pl-10 pr-9 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#0B5D2E] focus:ring-1 focus:ring-[#0B5D2E] outline-none transition"
                      />
                      {isSearchingFood ? (
                        <Loader2 className="w-4 h-4 text-[#0B5D2E] animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                      ) : foodQuery ? (
                        <button
                          type="button"
                          onClick={() => setFoodQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>

                    {foodSuggestions.length > 0 && (
                      <div className="max-h-48 overflow-y-auto space-y-1.5 p-1 bg-gray-50 border border-gray-200 rounded-xl">
                        {foodSuggestions.map((item) => (
                          <div
                            key={item.id}
                            className="p-2 bg-white rounded-lg border border-gray-200 hover:border-[#0B5D2E] transition text-left flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-9 h-9 rounded-md bg-gray-50 p-0.5 border border-gray-200 shrink-0 flex items-center justify-center overflow-hidden">
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.productName}
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <Package className="w-4 h-4 text-gray-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-bold text-[#0B5D2E] uppercase">
                                    {item.brand}
                                  </span>
                                  {item.source === 'internet' && (
                                    <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1 rounded">
                                      Google
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-semibold text-[#1C2B21] truncate">
                                  {item.productName}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {item.sizesKg.slice(0, 3).map((size) => (
                                <button
                                  key={size}
                                  type="button"
                                  onClick={() => {
                                    setSelectedFood({
                                      id: item.id,
                                      brand: item.brand,
                                      name: item.productName,
                                      imageUrl: item.imageUrl,
                                      bagSizeKg: size,
                                      availableSizesKg: item.sizesKg,
                                    });
                                    setFoodQuery('');
                                    setFoodSuggestions([]);
                                  }}
                                  className="px-2 py-1 bg-[#EAF4EC] hover:bg-[#0B5D2E] text-[#0B5D2E] hover:text-white rounded-md text-[11px] font-bold transition"
                                >
                                  {size} kg
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-[10px] text-[#44544A] italic">
                      💡 Si no encuentras el tuyo, puedes seleccionarlo o cambiarlo más adelante desde tu ración.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#094723] transition active:scale-98 shadow-md disabled:opacity-50 mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : mode === 'register' ? (
                <>
                  <span>Crear Cuenta Gratis</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Iniciar Sesión</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Mode switch footer */}
          <div className="pt-1 text-center text-xs text-[#64748B]">
            {mode === 'register' ? (
              <p>
                ¿Ya tienes una cuenta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg(null);
                  }}
                  className="font-bold text-[#0B5D2E] hover:underline"
                >
                  Iniciar Sesión
                </button>
              </p>
            ) : (
              <p>
                ¿Aún no tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg(null);
                  }}
                  className="font-bold text-[#0B5D2E] hover:underline"
                >
                  Crear cuenta gratis
                </button>
              </p>
            )}
          </div>

          {/* Privacy & Cloud Promise */}
          <div className="bg-[#EAF4EC]/60 rounded-xl p-3 border border-[#0B5D2E15] flex items-center gap-2 text-[11px] text-[#44544A]">
            <ShieldCheck className="w-4 h-4 text-[#0B5D2E] shrink-0" />
            <span>Tus datos de ración y mascotas se sincronizan de forma privada y segura en tu cuenta.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
