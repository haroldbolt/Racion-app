import React, { useState, useEffect, useMemo } from 'react';
import {
  Pet,
  FoodItem,
  FeedingPlan,
  PriceOffer,
  PriceComparisonResult,
  PriceComparatorConfigStatus,
  UserAccount,
  CityRelation,
  RecentFoodSearch,
} from '../types';
import { PriceComparatorService } from '../services/priceComparatorService';
import { StorageService } from '../utils/storage';
import { formatCOP } from '../utils/i18n';
import { useCity } from '../contexts/CityContext';
import { CityPickerModal } from './CityPickerModal';
import { UnifiedFoodSearchModal, resolveFoodThumbnail } from './UnifiedFoodSearchModal';
import { HowWeCompareModal } from './HowWeCompareModal';
import { getConfirmedPresentations } from '../data/foodPresentations';
import { loadShopifyCatalog, ShopifyCatalog, ShopifyProduct } from '../services/shopifyCatalogService';
import {
  Search,
  ShoppingBag,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Truck,
  MapPin,
  RefreshCw,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  TrendingDown,
  Building2,
  Check,
  Plus,
  Edit3,
  Package,
  Compass,
  X,
  Globe,
  Loader2,
} from 'lucide-react';

interface PriceComparatorViewProps {
  pet?: Pet;
  pets?: Pet[];
  onSelectPet?: (id: string) => void;
  onAddNewPet?: () => void;
  plan?: FeedingPlan;
  plans?: Record<string, FeedingPlan>;
  initialFood?: FoodItem | null;
  userAccount?: UserAccount;
  onClose?: () => void;
}

export const PriceComparatorView: React.FC<PriceComparatorViewProps> = ({
  pet,
  pets = [],
  onSelectPet,
  onAddNewPet,
  plan,
  plans = {},
  initialFood,
  userAccount,
  onClose,
}) => {
  const isEs = userAccount?.language !== 'en';

  // Global City Context
  const { selectedCity: city, setCity, detectLocation, isDetecting } = useCity();

  // Active Pet registered food deduction
  const petPlan = pet ? (plans[pet.id] || plan) : plan;
  const isRegisteredPetFood = Boolean(petPlan?.foodBrand && petPlan?.foodName);

  // Initial Food State based on Active Pet
  const defaultBrand = petPlan?.foodBrand || initialFood?.brand || (pet?.species === 'cat' ? 'Royal Canin' : 'Royal Canin');
  const defaultProductName = petPlan?.foodName || initialFood?.name || (pet?.species === 'cat' ? 'Fit 32 Adult Cat Dry' : 'Medium Adult Dog Dry');
  const defaultImage =
    initialFood?.imageUrl ||
    petPlan?.dryFood?.imageUrl ||
    resolveFoodThumbnail(defaultBrand, defaultProductName, pet?.species);

  // Search parameters
  const [brand, setBrand] = useState<string>(defaultBrand);
  const [productName, setProductName] = useState<string>(defaultProductName);
  const [productImageUrl, setProductImageUrl] = useState<string | undefined>(defaultImage);
  const [selectedFoodItem, setSelectedFoodItem] = useState<FoodItem | null>(initialFood || petPlan?.dryFood || null);
  const [customConfirmedSizes, setCustomConfirmedSizes] = useState<number[] | null>(null);

  // Live presentations automatically discovered from internet (Google Shopping Colombia)
  const [onlineSizes, setOnlineSizes] = useState<number[] | null>(null);
  const [isLoadingOnlineSizes, setIsLoadingOnlineSizes] = useState<boolean>(false);

  // Automatically fetch live presentations and live active image from the internet whenever brand or productName changes
  useEffect(() => {
    if (!brand.trim() || !productName.trim()) return;

    let isCurrent = true;
    setIsLoadingOnlineSizes(true);

    PriceComparatorService.getLivePresentations({
      brand: brand.trim(),
      productName: productName.trim(),
      city,
    })
      .then((res) => {
        if (!isCurrent) return;
        // 1. Live image from internet Google Shopping or Shopify catalog
        if (res.imageUrl) {
          setProductImageUrl(res.imageUrl);
        } else {
          // If no Google Shopping thumbnail, resolve via catalog
          loadShopifyCatalog()
            .then((cat: ShopifyCatalog) => {
              const b = brand.toLowerCase();
              const p = productName.toLowerCase();
              const match = cat.productos?.find((item: ShopifyProduct) => {
                const ib = item.marca.toLowerCase();
                const iname = item.nombre.toLowerCase();
                return (ib.includes(b) || b.includes(ib)) && (iname.includes(p) || p.includes(iname));
              });
              if (match && match.foto_url && isCurrent) {
                setProductImageUrl(match.foto_url);
              }
            })
            .catch(() => {});
        }

        // 2. Real commercial presentations from internet
        if (res.sizesKg && res.sizesKg.length > 0) {
          setOnlineSizes(res.sizesKg);
          // If current weight is not among the real internet presentations, select pet's usual or largest online size
          setWeightKg((prev) => {
            if (res.sizesKg.includes(prev)) return prev;
            if (petPlan?.bagWeightKg && res.sizesKg.includes(petPlan.bagWeightKg)) {
              return petPlan.bagWeightKg;
            }
            return res.sizesKg[res.sizesKg.length - 1];
          });
        }
      })
      .catch((err) => console.warn('Could not auto-fetch internet presentations:', err))
      .finally(() => {
        if (isCurrent) setIsLoadingOnlineSizes(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [brand, productName, city]);

  // Confirmed package weights: automatically prioritizing live internet presentations
  const confirmedSizes = useMemo(() => {
    if (onlineSizes && onlineSizes.length > 0) {
      return onlineSizes;
    }
    if (customConfirmedSizes && customConfirmedSizes.length > 0) {
      return customConfirmedSizes;
    }
    return getConfirmedPresentations(
      selectedFoodItem || {
        id: '',
        brand,
        name: productName,
        species: pet?.species || 'dog',
        lifeStage: 'adult',
        type: 'dry',
        kcalPerKg: 0,
        proteinPct: 0,
        fatPct: 0,
        fiberPct: 0,
        moisturePct: 9,
        country: 'Colombia',
        labelStatus: 'unconfirmed',
      }
    );
  }, [onlineSizes, customConfirmedSizes, selectedFoodItem, brand, productName, pet?.species]);

  // Selected package size in kg
  const [weightKg, setWeightKg] = useState<number>(() => {
    if (confirmedSizes && confirmedSizes.length > 0) {
      if (petPlan?.bagWeightKg && confirmedSizes.includes(petPlan.bagWeightKg)) {
        return petPlan.bagWeightKg;
      }
      return confirmedSizes[0];
    }
    return petPlan?.bagWeightKg || 15;
  });
  const [isCustomWeightOpen, setIsCustomWeightOpen] = useState<boolean>(false);

  // Keep weight valid whenever confirmed sizes change unless user custom-entered
  useEffect(() => {
    if (confirmedSizes && confirmedSizes.length > 0 && !isCustomWeightOpen) {
      if (!confirmedSizes.includes(weightKg)) {
        setWeightKg(confirmedSizes[0]);
      }
    }
  }, [confirmedSizes, isCustomWeightOpen]);

  // Sync when active pet changes
  useEffect(() => {
    if (pet) {
      const activePetPlan = plans[pet.id] || plan;
      const b = activePetPlan?.foodBrand || (pet.species === 'cat' ? 'Royal Canin' : 'Royal Canin');
      const n = activePetPlan?.foodName || (pet.species === 'cat' ? 'Fit 32 Adult Cat Dry' : 'Medium Adult Dog Dry');
      const img =
        activePetPlan?.dryFood?.imageUrl ||
        resolveFoodThumbnail(b, n, pet.species);

      setBrand(b);
      setProductName(n);
      setProductImageUrl(img);
      setSelectedFoodItem(activePetPlan?.dryFood || null);

      const sizes = getConfirmedPresentations(activePetPlan?.dryFood);
      if (sizes && sizes.length > 0) {
        setWeightKg(activePetPlan?.bagWeightKg && sizes.includes(activePetPlan.bagWeightKg) ? activePetPlan.bagWeightKg : sizes[0]);
      } else if (activePetPlan?.bagWeightKg) {
        setWeightKg(activePetPlan.bagWeightKg);
      }
      // Clear past search results for new pet to avoid confusion
      setSearchResult(null);
    }
  }, [pet?.id]);

  // Modals state
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  const [showCityModal, setShowCityModal] = useState<boolean>(false);
  const [showHowWeCompareModal, setShowHowWeCompareModal] = useState<boolean>(false);
  const [showPetDropdown, setShowPetDropdown] = useState<boolean>(false);

  // Results state
  const [loading, setLoading] = useState<boolean>(false);
  const [searchResult, setSearchResult] = useState<PriceComparisonResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Verification modal before opening external store
  const [verifyingOffer, setVerifyingOffer] = useState<PriceOffer | null>(null);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);

  // Recent Searches
  const [recentSearches, setRecentSearches] = useState<RecentFoodSearch[]>(() => {
    return StorageService.getRecentFoodSearches();
  });

  // Handle City Change
  const handleCitySelect = (newCity: string) => {
    if (newCity !== city) {
      setCity(newCity);
      StorageService.setUserCity(newCity);
      // Invalidate existing search result so we don't display offers from previous city
      if (searchResult && searchResult.city !== newCity) {
        setSearchResult(null);
      }
    }
  };

  // Execute Comparison
  const handleSearchPrices = async () => {
    if (!brand.trim() || !productName.trim()) {
      setErrorMsg(isEs ? 'Selecciona o escribe el nombre del alimento' : 'Select a pet food');
      return;
    }
    if (!weightKg || weightKg <= 0) {
      setErrorMsg(isEs ? 'Elige una presentación en kg' : 'Select package size');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    // Save to recent searches
    StorageService.saveRecentFoodSearch({
      brand: brand.trim(),
      productName: productName.trim(),
      weightKg,
      city,
      imageUrl: productImageUrl,
    });
    setRecentSearches(StorageService.getRecentFoodSearches());

    try {
      const result = await PriceComparatorService.searchPrices({
        brand: brand.trim(),
        productName: productName.trim(),
        presentationWeightKg: weightKg,
        presentationUnit: 'kg',
        city,
        species: pet?.species,
      });

      setSearchResult(result);
    } catch (err: any) {
      setErrorMsg(err.message || (isEs ? 'Error al consultar ofertas verificadas' : 'Error searching verified offers'));
    } finally {
      setLoading(false);
    }
  };

  // Select food from Unified Search Modal
  const handleSelectFromSearch = (sel: {
    brand: string;
    productName: string;
    weightKg: number;
    imageUrl?: string;
    sourceFoodItem?: FoodItem;
    confirmedSizesKg?: number[];
  }) => {
    setBrand(sel.brand);
    setProductName(sel.productName);
    setWeightKg(sel.weightKg);
    setProductImageUrl(sel.imageUrl || resolveFoodThumbnail(sel.brand, sel.productName, sel.sourceFoodItem?.species || pet?.species));
    setSelectedFoodItem(sel.sourceFoodItem || null);
    if (sel.confirmedSizesKg && sel.confirmedSizesKg.length > 0) {
      setCustomConfirmedSizes(sel.confirmedSizesKg);
      setOnlineSizes(sel.confirmedSizesKg);
    } else {
      setCustomConfirmedSizes(null);
      setOnlineSizes(null);
    }
    setSearchResult(null);
  };

  // Click on a recent search item
  const handleSelectRecentSearch = (rc: RecentFoodSearch) => {
    setBrand(rc.brand);
    setProductName(rc.productName);
    setWeightKg(rc.weightKg);
    if (rc.imageUrl) setProductImageUrl(rc.imageUrl);
    if (rc.city && rc.city !== city) {
      setCity(rc.city);
    }
    setSearchResult(null);
  };

  // Pre-purchase verification and redirection
  const handleOpenStore = async (offer: PriceOffer) => {
    setVerifyingOffer(offer);
    setVerificationFeedback(isEs ? 'Revalidando disponibilidad y enlace oficial...' : 'Revalidating official store link...');

    try {
      const ver = await PriceComparatorService.verifyOffer(offer.productUrl);
      setVerificationFeedback(ver.notice || (isEs ? '¡Enlace verificado! Abriendo tienda oficial...' : 'Verified! Opening store...'));
      setTimeout(() => {
        window.open(offer.productUrl, '_blank', 'noopener,noreferrer');
        setVerifyingOffer(null);
        setVerificationFeedback(null);
      }, 900);
    } catch {
      window.open(offer.productUrl, '_blank', 'noopener,noreferrer');
      setVerifyingOffer(null);
      setVerificationFeedback(null);
    }
  };

  const renderCityBadge = (relation: CityRelation, note: string) => {
    if (relation === 'in_city') {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200"
          title={note}
        >
          <Building2 className="w-3 h-3 text-emerald-600 shrink-0" />
          <span>{isEs ? 'Tienda en tu ciudad' : 'Local store'}</span>
        </span>
      );
    }
    if (relation === 'delivers_to_city') {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-800 border border-blue-200"
          title={note}
        >
          <Truck className="w-3 h-3 text-blue-600 shrink-0" />
          <span>{isEs ? 'Tienda que entrega en tu ciudad' : 'Delivers to your city'}</span>
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200"
        title={note}
      >
        <Compass className="w-3 h-3 text-gray-500 shrink-0" />
        <span>{isEs ? 'Cobertura nacional' : 'National coverage'}</span>
      </span>
    );
  };

  const formattedDate = searchResult?.lastUpdated
    ? new Date(searchResult.lastUpdated).toLocaleString('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : null;

  // Find logged purchases matching current brand/product for "Lo que pagaste" comparison
  const matchingPurchase = useMemo(() => {
    const purchases = StorageService.getFoodPurchases(pet?.id);
    if (!purchases || purchases.length === 0) return null;
    const bLow = brand.toLowerCase().trim();
    const pLow = productName.toLowerCase().trim();
    return (
      purchases.find((pur) => {
        const pb = (pur.foodBrand || '').toLowerCase();
        const pn = (pur.foodName || '').toLowerCase();
        return (pb.includes(bLow) || bLow.includes(pb)) && (pn.includes(pLow) || pLow.includes(pn) || Math.abs((pur.bagSizeKg || 0) - weightKg) < 0.3);
      }) || null
    );
  }, [pet?.id, brand, productName, weightKg]);

  // Clean presentation display label
  const cleanVarietyName = productName.replace(brand, '').replace(/Dog Dry|Cat Dry/gi, '').trim() || productName;

  return (
    <div className="space-y-4 animate-in fade-in max-w-lg mx-auto">
      {/* ================= 1. ENCABEZADO ORIENTADO AL BENEFICIO ================= */}
      <div className="text-center pt-1 px-2 space-y-1">
        <h2 className="font-heading font-black text-2xl text-[#1C2B21] tracking-tight">
          {isEs ? 'Su alimento, a mejor precio' : 'Their Food, at the Best Price'}
        </h2>
        <p className="text-xs text-[#44544A] max-w-xs mx-auto leading-relaxed">
          {isEs
            ? 'Compara el mismo producto en tiendas que entregan en tu ciudad.'
            : 'Compare the exact same product across stores delivering to your city.'}
        </p>
      </div>

      {/* ================= PET SWITCHER BAR (if multiple pets or pet provided) ================= */}
      {pet && (
        <div className="flex items-center justify-center gap-2">
          {/* Active Pet Dropdown Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPetDropdown(!showPetDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0B5D2E] text-white shadow-xs hover:bg-[#094723] transition active:scale-95 min-h-[38px]"
            >
              <div className="w-6 h-6 rounded-full overflow-hidden bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">
                {pet.photoUrl ? (
                  <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{pet.species === 'cat' ? '🐱' : '🐶'}</span>
                )}
              </div>
              <span className="font-heading font-bold text-xs tracking-wide">{pet.name}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-80" />
            </button>

            {/* Pets Dropdown Menu */}
            {showPetDropdown && pets.length > 0 && (
              <div className="absolute left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-[#0B5D2E20] p-1.5 z-40 animate-in fade-in">
                {pets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (onSelectPet) onSelectPet(p.id);
                      setShowPetDropdown(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-bold text-left transition ${
                      p.id === pet.id ? 'bg-[#EAF4EC] text-[#0B5D2E]' : 'text-[#1C2B21] hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center text-[10px]">
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span>{p.species === 'cat' ? '🐱' : '🐶'}</span>
                      )}
                    </div>
                    <span>{p.name}</span>
                    {p.id === pet.id && <Check className="w-3.5 h-3.5 text-[#0B5D2E] ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add Pet Action */}
          {onAddNewPet && (
            <button
              type="button"
              onClick={onAddNewPet}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-[#0B5D2E30] text-[#0B5D2E] hover:bg-[#EAF4EC] transition text-xs font-bold min-h-[38px]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isEs ? 'Mascota' : 'Pet'}</span>
            </button>
          )}
        </div>
      )}

      {/* ================= 2. ALIMENTO HABITUAL SELECCIONADO CARD (Design exactly matching mockup) ================= */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
        {/* Top Pet Badge & Live Internet Status */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-[10px] font-black uppercase tracking-wider bg-[#EAF4EC] text-[#0B5D2E] px-2.5 py-0.5 rounded-full border border-[#0B5D2E20]">
            {isEs
              ? `ALIMENTO DE ${pet?.name ? pet.name.toUpperCase() : 'TU MASCOTA'}`
              : `FOOD OF ${pet?.name ? pet.name.toUpperCase() : 'YOUR PET'}`}
          </span>
          <div
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-extrabold shadow-2xs"
            title={isEs ? 'Conectado a Google Shopping y catálogo oficial en tiempo real' : 'Connected to live Google Shopping and verified catalog'}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>{isLoadingOnlineSizes ? (isEs ? 'Sincronizando con internet...' : 'Syncing...') : (isEs ? 'Conectado a internet' : 'Connected to internet')}</span>
          </div>
        </div>

        {/* Product Visual & Identity Row */}
        <div className="flex items-center gap-4">
          {/* Bag Image with live indicator */}
          <div className="w-20 h-24 bg-[#F8FAF8] rounded-2xl p-1.5 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs relative">
            {isLoadingOnlineSizes && !productImageUrl ? (
              <div key="img-loading" className="w-full h-full flex flex-col items-center justify-center text-[#0B5D2E] bg-emerald-50/50 animate-pulse rounded-xl">
                <Loader2 className="w-5 h-5 animate-spin text-[#0B5D2E]" />
              </div>
            ) : productImageUrl ? (
              <img
                key="img-active"
                src={productImageUrl}
                alt={`${brand} ${productName}`}
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  const fallback = resolveFoodThumbnail(brand, productName, pet?.species);
                  if (fallback && target.src !== fallback) {
                    target.src = fallback;
                  } else {
                    target.style.display = 'none';
                  }
                }}
              />
            ) : (
              <div key="img-fallback" className="w-full h-full flex flex-col items-center justify-center text-[#0B5D2E] bg-[#EAF4EC]/40 rounded-xl">
                <Package className="w-8 h-8 opacity-80" />
                <span className="text-[9px] font-extrabold uppercase mt-1 tracking-tight">
                  {brand.slice(0, 10)}
                </span>
              </div>
            )}
            <div className="absolute bottom-1 right-1 bg-white/95 backdrop-blur-xs px-1 py-0.2 rounded text-[8px] font-black text-[#0B5D2E] border border-[#0B5D2E20] flex items-center gap-0.5 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>En vivo</span>
            </div>
          </div>

          {/* Details & Edit Action */}
          <div className="flex-1 space-y-1">
            <h3 className="font-heading font-extrabold text-xl text-[#1C2B21] leading-tight">
              {brand}
            </h3>
            <p className="text-xs font-medium text-[#44544A] leading-snug">
              {cleanVarietyName}
              {pet && <span className="text-[11px] text-gray-400"> · {pet.species === 'cat' ? 'Gato' : 'Perro'}</span>}
            </p>

            <button
              type="button"
              onClick={() => setShowSearchModal(true)}
              className="inline-flex items-center gap-1 text-xs font-bold text-[#0B5D2E] hover:underline pt-1 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEs ? 'Cambiar alimento' : 'Change food'}</span>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[#0B5D2E12]" />

        {/* Presentación (Sincronizada automáticamente con internet) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="font-heading font-bold text-xs text-[#1C2B21]">
                {isEs ? 'Presentación' : 'Package size'}
              </label>
              {isLoadingOnlineSizes && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-700 font-semibold animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                  <span>{isEs ? 'Sincronizando con internet...' : 'Syncing online...'}</span>
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
              <Globe className="w-2.5 h-2.5 text-emerald-600" />
              <span>
                {onlineSizes && onlineSizes.length > 0
                  ? isEs
                    ? `${onlineSizes.length} tamaños en tiendas online`
                    : `${onlineSizes.length} online sizes`
                  : isEs
                  ? 'Tamaños confirmados'
                  : 'Confirmed sizes'}
              </span>
            </span>
          </div>

          {confirmedSizes && confirmedSizes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {confirmedSizes.map((size) => {
                const isSelected = weightKg === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setWeightKg(size);
                      setIsCustomWeightOpen(false);
                    }}
                    className={`py-2 px-3.5 rounded-full text-xs font-bold transition min-h-[38px] flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#0B5D2E] text-white shadow-xs ring-2 ring-[#0B5D2E] ring-offset-1'
                        : 'bg-[#EAF4EC] text-[#1C2B21] hover:bg-[#d8eedb] border border-[#0B5D2E15]'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                    <span>{size} kg</span>
                  </button>
                );
              })}

              {!isCustomWeightOpen ? (
                <button
                  type="button"
                  onClick={() => setIsCustomWeightOpen(true)}
                  className="py-1.5 px-3 rounded-full text-xs font-semibold text-gray-500 hover:text-[#0B5D2E] bg-gray-100 hover:bg-[#EAF4EC] border border-dashed border-gray-300 transition"
                >
                  + {isEs ? 'Otro peso' : 'Other size'}
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-[#F8FAF8] p-1 rounded-xl border border-[#0B5D2E30]">
                  <input
                    type="number"
                    step="0.5"
                    min="0.1"
                    max="50"
                    value={weightKg}
                    onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0)}
                    className="w-16 px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-center outline-none focus:border-[#0B5D2E]"
                    autoFocus
                  />
                  <span className="text-xs font-bold text-gray-500 pr-1">kg</span>
                  <button
                    type="button"
                    onClick={() => setIsCustomWeightOpen(false)}
                    className="text-gray-400 hover:text-gray-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0)}
                  placeholder="Ej. 15"
                  className="w-24 px-3 py-1.5 bg-[#F8FAF8] border border-gray-200 rounded-xl text-xs font-bold text-center"
                />
                <span className="text-xs font-bold text-gray-600">kg</span>
              </div>
              <p className="text-[10px] text-gray-400">
                {isEs
                  ? 'Se comprobará la existencia de este gramaje al consultar ofertas.'
                  : 'This package size will be verified during search.'}
              </p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-[#0B5D2E12]" />

        {/* 5. Ciudad sin controles duplicados */}
        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2 text-[#1C2B21]">
            <MapPin className="w-4 h-4 text-[#F57C1A] shrink-0" />
            <span className="text-xs font-bold">
              {isEs ? `Entrega en ${city}` : `Delivery in ${city}`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowCityModal(true)}
            className="text-xs font-bold text-[#0B5D2E] hover:underline cursor-pointer"
          >
            {isEs ? 'Cambiar' : 'Change'}
          </button>
        </div>

        {/* Error notice if validation fails */}
        {errorMsg && (
          <div className="p-2.5 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2 border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 6. Acción principal: Comparar precios */}
        <div className="space-y-1.5 pt-1">
          <button
            type="button"
            onClick={handleSearchPrices}
            disabled={loading || !brand || !productName || !weightKg}
            className="w-full min-h-[50px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-base flex items-center justify-center gap-2 shadow-md hover:bg-[#094723] transition active:scale-98 disabled:opacity-50 cursor-pointer"
          >
            <Search className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            <span>
              {loading
                ? isEs
                  ? 'Consultando tiendas en internet...'
                  : 'Searching live stores...'
                : isEs
                ? 'Comparar precios'
                : 'Compare prices'}
            </span>
          </button>

          {loading ? (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-0.5 animate-pulse">
              <p className="text-[11px] font-extrabold text-emerald-900 flex items-center justify-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>
                  {isEs
                    ? `Buscando ofertas en vivo en ${city}...`
                    : `Checking live offers in ${city}...`}
                </span>
              </p>
              <p className="text-[10px] text-emerald-700">
                {isEs
                  ? 'Google Shopping · Laika · Agrocampo · Kanú · Éxito · Mercado Libre'
                  : 'Checking verified Colombian pet stores in real time'}
              </p>
            </div>
          ) : (
            /* Resumen discreto */
            <p className="text-[11px] text-[#44544A] text-center font-medium">
              {cleanVarietyName} · {weightKg} kg · {city}
            </p>
          )}
        </div>
      </div>

      {/* ================= TUS BÚSQUEDAS RECIENTES CARD ================= */}
      {recentSearches.length > 0 && (
        <div className="bg-white rounded-3xl p-4 border border-[#0B5D2E20] shadow-sm space-y-2.5">
          <div className="flex items-center gap-2 px-1">
            <Clock className="w-4 h-4 text-[#F57C1A]" />
            <h4 className="font-heading font-extrabold text-sm text-[#1C2B21]">
              {isEs ? 'Tus búsquedas recientes' : 'Recent searches'}
            </h4>
          </div>

          <div className="space-y-1.5">
            {recentSearches.slice(0, 3).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectRecentSearch(item)}
                className="w-full p-2.5 bg-[#F8FAF8] hover:bg-[#EAF4EC]/50 border border-gray-100 rounded-2xl flex items-center justify-between text-left transition text-xs font-semibold text-[#1C2B21] group min-h-[44px]"
              >
                <span>
                  {item.brand} {item.productName} · {item.weightKg} kg
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#0B5D2E] group-hover:translate-x-0.5 transition" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ================= CÓMO COMPARAMOS LINK ================= */}
      <div className="text-center pt-1 pb-2">
        <button
          type="button"
          onClick={() => setShowHowWeCompareModal(true)}
          className="text-xs font-bold text-[#0B5D2E] hover:underline cursor-pointer"
        >
          {isEs ? 'Cómo comparamos' : 'How we compare prices'}
        </button>
      </div>

      {/* ================= 7. RESULTADOS ÚTILES Y HONESTOS ================= */}
      {searchResult && (
        <div className="space-y-4 animate-in fade-in pt-1">
          {/* Header of results with cache freshness notice */}
          <div className="bg-[#EAF4EC] p-3.5 rounded-2xl border border-[#0B5D2E20] flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-xs font-bold text-[#0B5D2E] block">
                {isEs ? `Ofertas encontradas para ${city}:` : `Offers for ${city}:`}
              </span>
              <span className="text-[11px] text-[#44544A]">
                {searchResult.targetBrand} {searchResult.targetProductName} ({searchResult.presentationWeightKg} kg)
                {formattedDate && ` · ${formattedDate}`}
              </span>
            </div>

            <button
              type="button"
              onClick={handleSearchPrices}
              disabled={loading}
              className="text-xs font-bold text-[#0B5D2E] hover:underline flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-[#0B5D2E20] shadow-2xs"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>{isEs ? 'Actualizar precios' : 'Refresh prices'}</span>
            </button>
          </div>

          {/* API Warning / Quota Exhaustion Notice */}
          {searchResult.warningNotice && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">{searchResult.warningNotice}</p>
                {searchResult.isFromCache && formattedDate && (
                  <p className="text-[11px] text-amber-800">
                    Fecha de última consulta verificada conservada: <strong>{formattedDate}</strong>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* "Lo que pagaste" — Comparison against user's logged receipt/purchase */}
          {matchingPurchase && (
            <div className="bg-white rounded-2xl p-4 border border-[#0B5D2E30] shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#0B5D2E]">
                  Lo que pagaste
                </span>
                <span className="text-[10px] font-semibold text-gray-500">
                  {matchingPurchase.date} · {matchingPurchase.storeName || 'Compra registrada'}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <span className="font-heading font-black text-lg text-[#1C2B21]">
                    {formatCOP(matchingPurchase.pricePaidCop)}
                  </span>
                  <span className="text-xs text-[#44544A] ml-1.5">
                    ({matchingPurchase.bagSizeKg} kg · {formatCOP(matchingPurchase.costPerKgCop)}/kg)
                  </span>
                </div>
                {(searchResult.bestOffer?.totalCostCop || searchResult.lowestProductPriceOffer?.priceCop) && (
                  <span className="text-xs font-bold text-[#0B5D2E]">
                    {(() => {
                      const refPrice = searchResult.bestOffer?.totalCostCop || searchResult.lowestProductPriceOffer!.priceCop;
                      const diff = matchingPurchase.pricePaidCop - refPrice;
                      if (diff > 0) return `Puedes ahorrar ${formatCOP(diff)} hoy`;
                      if (diff < 0) return `Pagaste ${formatCOP(Math.abs(diff))} menos que hoy`;
                      return 'Mismo precio que la mejor oferta hoy';
                    })()}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* WINNER DISTINCTION: Menor total verificado vs Menor precio del producto */}
          {(searchResult.bestOffer || searchResult.lowestProductPriceOffer) && (
            <div className="grid grid-cols-1 gap-3">
              {searchResult.bestOffer && (
                <div className="bg-linear-to-br from-emerald-50 via-white to-amber-50/40 rounded-3xl p-5 border-2 border-[#0B5D2E] shadow-md space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#0B5D2E] text-white shadow-xs">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isEs ? 'Menor total verificado' : 'Lowest verified total'}</span>
                    </span>
                    {renderCityBadge(searchResult.bestOffer.cityRelation, searchResult.bestOffer.cityRelationNote)}
                  </div>

                  <div className="flex items-start justify-between gap-3 pt-1">
                    <div>
                      <h4 className="font-heading font-extrabold text-lg text-[#1C2B21]">
                        {searchResult.bestOffer.merchantName}
                      </h4>
                      <p className="text-xs text-[#44544A] line-clamp-1">
                        {searchResult.bestOffer.title}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-gray-500 block uppercase font-bold">
                        Total con envío
                      </span>
                      <span className="font-heading font-black text-2xl text-[#0B5D2E]">
                        {formatCOP(searchResult.bestOffer.totalCostCop || searchResult.bestOffer.priceCop)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white/80 p-3 rounded-2xl border border-gray-200 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500 block">{isEs ? 'Precio producto:' : 'Product:'}</span>
                      <span className="font-bold text-[#1C2B21]">{formatCOP(searchResult.bestOffer.priceCop)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">{isEs ? 'Envío a domicilio:' : 'Shipping:'}</span>
                      <span className={`font-bold ${searchResult.bestOffer.shippingCostCop === 0 ? 'text-emerald-700' : 'text-[#1C2B21]'}`}>
                        {searchResult.bestOffer.shippingCostCop === 0
                          ? (isEs ? 'Gratis ✓' : 'Free')
                          : formatCOP(searchResult.bestOffer.shippingCostCop || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#44544A]">
                    <span>{searchResult.bestOffer.stockNote} · {searchResult.bestOffer.packagingType === 'fraccionado' ? 'Fraccionado' : 'Empaque original'}</span>
                    {formattedDate && <span>Consulta: {formattedDate}</span>}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenStore(searchResult.bestOffer!)}
                    className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#094723] transition active:scale-98 shadow-sm cursor-pointer"
                  >
                    <span>{isEs ? `Comprar en ${searchResult.bestOffer.merchantName}` : `Buy at ${searchResult.bestOffer.merchantName}`}</span>
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Menor precio del producto (when different from bestOffer OR when bestOffer is null due to unconfirmed shipping) */}
              {searchResult.lowestProductPriceOffer &&
                searchResult.lowestProductPriceOffer.id !== searchResult.bestOffer?.id && (
                  <div className="bg-white rounded-2xl p-4 border-2 border-[#F57C1A]/50 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-[#FFF7ED] text-[#9A3412] border border-[#F57C1A]/40">
                        <TrendingDown className="w-3.5 h-3.5 text-[#F57C1A]" />
                        <span>Menor precio del producto</span>
                      </span>
                      {renderCityBadge(
                        searchResult.lowestProductPriceOffer.cityRelation,
                        searchResult.lowestProductPriceOffer.cityRelationNote
                      )}
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
                          {searchResult.lowestProductPriceOffer.merchantName}
                        </h4>
                        <p className="text-xs text-[#44544A] line-clamp-1">
                          {searchResult.lowestProductPriceOffer.title}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-heading font-black text-xl text-[#1C2B21]">
                          {formatCOP(searchResult.lowestProductPriceOffer.priceCop)}
                        </span>
                        <span className="block text-[10px] font-bold text-amber-700">
                          {searchResult.lowestProductPriceOffer.shippingCostCop == null
                            ? 'Envío por confirmar'
                            : searchResult.lowestProductPriceOffer.shippingCostCop === 0
                            ? 'Envío gratis'
                            : `+ ${formatCOP(searchResult.lowestProductPriceOffer.shippingCostCop)} envío`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[11px] text-[#44544A]">
                      <span>{searchResult.lowestProductPriceOffer.stockNote}</span>
                      <button
                        type="button"
                        onClick={() => handleOpenStore(searchResult.lowestProductPriceOffer!)}
                        className="font-bold text-[#0B5D2E] hover:underline flex items-center gap-1"
                      >
                        <span>Comprar directo</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* LIST OF VERIFIED OFFERS (Sorted by total known cost) */}
          {searchResult.offersWithConfirmedTotal.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="font-heading font-extrabold text-base text-[#1C2B21] px-1">
                {isEs ? 'Ofertas con total verificado:' : 'Offers with verified total:'}
              </h4>

              <div className="space-y-2.5">
                {searchResult.offersWithConfirmedTotal.map((offer: PriceOffer) => (
                  <div
                    key={offer.id}
                    className="bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs space-y-2.5 hover:border-[#0B5D2E]/40 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-heading font-extrabold text-sm text-[#1C2B21]">
                            {offer.merchantName}
                          </span>
                          {renderCityBadge(offer.cityRelation, offer.cityRelationNote)}
                        </div>
                        <p className="text-xs text-[#44544A] mt-0.5 line-clamp-1">{offer.title}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-heading font-black text-lg text-[#0B5D2E]">
                          {formatCOP(offer.totalCostCop ?? offer.priceCop)}
                        </span>
                        <span className="text-[10px] text-gray-500 block font-semibold">
                          Producto: {formatCOP(offer.priceCop)} ·{' '}
                          {offer.shippingCostCop === 0
                            ? 'Envío gratis'
                            : offer.shippingCostCop !== null && offer.shippingCostCop !== undefined
                            ? `+ ${formatCOP(offer.shippingCostCop)} envío`
                            : 'Envío por confirmar'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                      <span className="text-[10px] text-gray-500">
                        {offer.stockNote} · {formattedDate || new Date(offer.retrievedAt).toLocaleDateString('es-CO')}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleOpenStore(offer)}
                        className="py-1.5 px-3 bg-[#EAF4EC] hover:bg-[#0B5D2E] hover:text-white text-[#0B5D2E] rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isEs ? 'Comprar en esta tienda' : 'Buy here'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OFFERS WITH PENDING SHIPPING ("Envío por confirmar") */}
          {searchResult.offersWithPendingShipping.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <div className="px-1">
                <h4 className="font-heading font-extrabold text-sm text-[#1C2B21]">
                  {isEs ? 'Ofertas verificadas con envío por confirmar:' : 'Offers with pending shipping cost:'}
                </h4>
                <p className="text-[11px] text-gray-500">
                  {isEs
                    ? 'El costo del flete depende de la dirección exacta de entrega en tu ciudad.'
                    : 'Delivery fee depends on exact address.'}
                </p>
              </div>

              <div className="space-y-2">
                {searchResult.offersWithPendingShipping.map((offer: PriceOffer) => (
                  <div
                    key={offer.id}
                    className="bg-[#F8FAF8] rounded-2xl p-3.5 border border-gray-200 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[#1C2B21]">{offer.merchantName}</span>
                        {renderCityBadge(offer.cityRelation, offer.cityRelationNote)}
                      </div>
                      <p className="text-[11px] text-[#44544A] truncate mt-0.5">{offer.title}</p>
                      <span className="text-[11px] text-amber-700 font-semibold block mt-0.5">
                        Envío por confirmar · {offer.stockNote} · {formattedDate}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-heading font-extrabold text-base text-[#1C2B21] block">
                        {formatCOP(offer.priceCop)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenStore(offer)}
                        className="text-[11px] font-bold text-[#0B5D2E] hover:underline flex items-center gap-0.5 ml-auto mt-0.5 cursor-pointer"
                      >
                        <span>{isEs ? 'Ir a la tienda' : 'View store'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UNVERIFIED SNIPPETS & OUT-OF-STOCK (Explicitly excluded from best offer) */}
          {searchResult.unverifiedOffers.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <div className="px-1">
                <h4 className="font-heading font-extrabold text-sm text-gray-700">
                  No verificados / Agotados (excluidos de la mejor oferta)
                </h4>
                <p className="text-[11px] text-gray-500">
                  Precios detectados en fragmentos del buscador sin confirmación en página o sin inventario disponible.
                </p>
              </div>
              <div className="space-y-2">
                {searchResult.unverifiedOffers.map((offer: PriceOffer) => (
                  <div
                    key={offer.id}
                    className="bg-gray-50 rounded-2xl p-3 border border-gray-200 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-gray-700">{offer.merchantName}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                          {offer.inStock ? 'No verificado (fragmento)' : 'Agotado'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">{offer.title}</p>
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        Envío por confirmar · {formattedDate}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-heading font-bold text-sm text-gray-700 block">
                        {formatCOP(offer.priceCop)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenStore(offer)}
                        className="text-[11px] font-semibold text-[#0B5D2E] hover:underline flex items-center gap-0.5 ml-auto mt-0.5"
                      >
                        <span>Comprobar</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {searchResult.allOffers.length === 0 && !searchResult.warningNotice && (
            <div className="p-6 bg-white rounded-3xl border border-gray-200 text-center space-y-2">
              <Package className="w-8 h-8 text-gray-400 mx-auto" />
              <h4 className="font-heading font-bold text-sm text-[#1C2B21]">
                {isEs ? `No encontramos ofertas verificadas para ${city}` : `No verified offers for ${city}`}
              </h4>
              <p className="text-xs text-gray-500 max-w-xs mx-auto">
                {isEs
                  ? 'Intenta seleccionando otra presentación o consulta en comercios con cobertura nacional.'
                  : 'Try selecting another package size or check national delivery.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* Unified Food Search Modal */}
      <UnifiedFoodSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        activePet={pet}
        allPets={pets}
        plans={plans}
        onSelectFood={handleSelectFromSearch}
        lang={userAccount?.language}
      />

      {/* City Picker Modal */}
      <CityPickerModal
        isOpen={showCityModal}
        onClose={() => setShowCityModal(false)}
        selectedCity={city}
        onSelectCity={handleCitySelect}
        onDetectLocation={detectLocation}
        isDetecting={isDetecting}
        lang={userAccount?.language}
      />

      {/* How We Compare Modal */}
      <HowWeCompareModal
        isOpen={showHowWeCompareModal}
        onClose={() => setShowHowWeCompareModal(false)}
        lang={userAccount?.language}
      />

      {/* Pre-purchase Verification Modal */}
      {verifyingOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-[#0B5D2E20] text-center space-y-3">
            <div className="w-12 h-12 bg-[#EAF4EC] text-[#0B5D2E] rounded-full flex items-center justify-center mx-auto">
              <RefreshCw className="w-6 h-6 animate-spin text-[#0B5D2E]" />
            </div>
            <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
              {isEs ? 'Revalidando con el comercio' : 'Revalidating store'}
            </h4>
            <p className="text-xs text-[#44544A] leading-relaxed">
              {verificationFeedback}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
