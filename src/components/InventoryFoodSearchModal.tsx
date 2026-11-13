import React, { useState, useEffect, useMemo } from 'react';
import {
  ShopifyProduct,
  ShopifyVariant,
  ShopifyCatalog,
  loadShopifyCatalog,
  searchShopifyCatalog,
  parseVariantWeight,
  ParsedVariantWeight,
  getCatalogStats,
} from '../services/shopifyCatalogService';
import { Pet, FeedingPlan, FoodCostEntry } from '../types';
import { StorageService } from '../utils/storage';
import { formatCOP } from '../utils/i18n';
import {
  Search,
  X,
  Package,
  Calendar,
  DollarSign,
  Camera,
  Check,
  AlertTriangle,
  ArrowLeft,
  Store,
  ChevronRight,
  Info,
  Loader2,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';

interface InventoryFoodSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  pet: Pet;
  plan?: FeedingPlan;
  onPurchaseLogged?: (entry: FoodCostEntry) => void;
  onPlanUpdate?: (updatedPlan: Partial<FeedingPlan>) => void;
  lang?: string;
}

export const InventoryFoodSearchModal: React.FC<InventoryFoodSearchModalProps> = ({
  isOpen,
  onClose,
  pet,
  plan,
  onPurchaseLogged,
  onPlanUpdate,
  lang = 'es',
}) => {
  const isEs = lang === 'es';

  // Catalog loading state
  const [catalog, setCatalog] = useState<ShopifyCatalog | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Search & Filtering State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [category, setCategory] = useState<'main' | 'snacks'>('main');
  const [speciesFilter, setSpeciesFilter] = useState<'dog' | 'cat'>(pet.species);

  // Selection Workflow (Step 1: Product -> Step 2: Variant -> Step 3: Purchase Details)
  const [step, setStep] = useState<'select_product' | 'select_variant' | 'purchase_form'>('select_product');
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ShopifyVariant | null>(null);
  const [parsedWeight, setParsedWeight] = useState<ParsedVariantWeight | null>(null);

  // Manual weight resolution for ambiguous presentations (e.g. "0", "Default Title", "Peso por confirmar", "Bolsa")
  const [customWeightInput, setCustomWeightInput] = useState<string>('');
  const [customWeightUnit, setCustomWeightUnit] = useState<'kg' | 'g'>('kg');

  // Purchase Details State
  const [quantity, setQuantity] = useState<number>(1);
  const [pricePaidCop, setPricePaidCop] = useState<string>('185000');
  const [purchaseDate, setPurchaseDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [storeName, setStoreName] = useState<string>('');
  const [receiptPhotoUrl, setReceiptPhotoUrl] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});

  // Load catalog on open
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoadingCatalog(true);
    setLoadError(null);

    loadShopifyCatalog()
      .then((cat) => {
        if (isMounted) {
          setCatalog(cat);
          setLoadingCatalog(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setLoadError(err instanceof Error ? err.message : 'Error al cargar catálogo');
          setLoadingCatalog(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Keep speciesFilter in sync if pet changes
  useEffect(() => {
    setSpeciesFilter(pet.species);
  }, [pet.species]);

  // Reset steps on close or re-open
  const handleResetWorkflow = () => {
    setStep('select_product');
    setSelectedProduct(null);
    setSelectedVariant(null);
    setParsedWeight(null);
    setCustomWeightInput('');
    setQuantity(1);
    setReceiptPhotoUrl('');
    setNotes('');
  };

  const handleClose = () => {
    handleResetWorkflow();
    onClose();
  };

  // Filtered search results
  const searchResults = useMemo(() => {
    if (!catalog) return [];
    return searchShopifyCatalog(catalog, {
      query: searchQuery,
      species: speciesFilter,
      category,
      limit: 35,
    });
  }, [catalog, searchQuery, speciesFilter, category]);

  // When a product is selected
  const handleSelectProduct = (product: ShopifyProduct) => {
    setSelectedProduct(product);
    // If product has only 1 presentation, auto-select it or let user choose
    if (product.presentaciones.length === 1) {
      handleSelectVariant(product.presentaciones[0], product);
    } else {
      setStep('select_variant');
    }
  };

  // When a presentation is selected
  const handleSelectVariant = (variant: ShopifyVariant, productOverride?: ShopifyProduct) => {
    const parentProd = productOverride || selectedProduct;
    setSelectedVariant(variant);

    const parsed = parseVariantWeight(variant.nombre);
    setParsedWeight(parsed);

    if (parsed.isAmbiguous) {
      setCustomWeightInput('');
    } else if (parsed.kg) {
      setCustomWeightInput(parsed.kg.toString());
      setCustomWeightUnit('kg');
    }

    // Pre-populate sensible price if dry vs snack
    if (parentProd?.tipo === 'Snacks') {
      setPricePaidCop('25000');
    } else if (parsed.kg && parsed.kg >= 10) {
      setPricePaidCop('285000');
    } else if (parsed.kg && parsed.kg >= 2) {
      setPricePaidCop('95000');
    }

    setStep('purchase_form');
  };

  // Computed weight in grams
  const resolvedNetGrams = useMemo(() => {
    if (parsedWeight && !parsedWeight.isAmbiguous && parsedWeight.grams) {
      return parsedWeight.grams;
    }
    const val = parseFloat(customWeightInput.replace(',', '.')) || 0;
    if (val <= 0) return 0;
    return customWeightUnit === 'kg' ? Math.round(val * 1000) : Math.round(val);
  }, [parsedWeight, customWeightInput, customWeightUnit]);

  const resolvedNetKg = resolvedNetGrams > 0 ? +(resolvedNetGrams / 1000).toFixed(3) : 0;
  const totalWeightKgPurchased = +(resolvedNetKg * quantity).toFixed(3);

  // Financial calculations
  const numericPrice = parseFloat(pricePaidCop) || 0;
  const costPerKgCop = totalWeightKgPurchased > 0 ? Math.round(numericPrice / totalWeightKgPurchased) : 0;
  const petGramsDay = plan?.gramsPerDay || 200;
  const costPerDayCop = Math.round((costPerKgCop * petGramsDay) / 1000);
  const costPerMonthCop = Math.round(costPerDayCop * 30.5);
  const estimatedDaysDuration = petGramsDay > 0 && resolvedNetGrams > 0
    ? Math.round((resolvedNetGrams * quantity) / petGramsDay)
    : 30;

  // Handle receipt image upload
  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReceiptPhotoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit Purchase
  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !selectedVariant) return;

    if (resolvedNetGrams <= 0) {
      alert(
        isEs
          ? 'Por favor confirma o ingresa el peso neto en kg o gramos para poder calcular los días que dura el alimento.'
          : 'Please enter the net weight in kg or grams.'
      );
      return;
    }

    if (numericPrice <= 0) {
      alert(isEs ? 'Por favor ingresa un precio válido en COP.' : 'Please enter a valid price in COP.');
      return;
    }

    setIsSubmitting(true);

    const imageUrl = selectedVariant.foto_url || selectedProduct.foto_url || undefined;

    const newEntry: FoodCostEntry = {
      id: `fp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      petId: pet.id,
      date: purchaseDate,
      foodBrand: selectedProduct.marca,
      foodName: selectedProduct.nombre,
      foodType: selectedProduct.tipo === 'Snacks' ? 'snack' : (selectedProduct.tipo.toLowerCase().includes('húmedo') ? 'wet' : 'dry'),
      bagSizeKg: totalWeightKgPurchased,
      pricePaidCop: numericPrice,
      costPerKgCop,
      costPerDayCop,
      costPerMonthCop,
      estimatedDaysDuration,
      storeName: storeName.trim() || undefined,
      receiptPhotoUrl: receiptPhotoUrl || undefined,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
      // Specific Shopify Catalog linkage
      shopifyProductId: selectedProduct.id,
      shopifyVariantId: selectedVariant.id,
      presentationName: selectedVariant.nombre,
      quantity,
      currency: 'COP',
      weightInGrams: resolvedNetGrams * quantity,
      imageUrl,
    };

    // Save locally
    StorageService.addFoodPurchase(newEntry);

    // Update feeding plan if dry food
    if (onPlanUpdate && selectedProduct.tipo !== 'Snacks') {
      onPlanUpdate({
        foodBrand: selectedProduct.marca,
        foodName: selectedProduct.nombre,
        bagWeightKg: resolvedNetKg,
        bagDaysRemaining: estimatedDaysDuration,
        bagPriceCop: numericPrice,
        dailyCostCop: costPerDayCop,
        monthlyCostCop: costPerMonthCop,
      });
    }

    if (onPurchaseLogged) {
      onPurchaseLogged(newEntry);
    }

    setIsSubmitting(false);
    handleClose();
  };

  if (!isOpen) return null;

  const stats = catalog ? getCatalogStats(catalog) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl border border-[#0B5D2E20] overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-[#EAF4EC] to-white shrink-0">
          <div className="flex items-center gap-2.5">
            {step !== 'select_product' && (
              <button
                type="button"
                onClick={() => {
                  if (step === 'purchase_form') {
                    if (selectedProduct && selectedProduct.presentaciones.length > 1) {
                      setStep('select_variant');
                    } else {
                      setStep('select_product');
                    }
                  } else {
                    setStep('select_product');
                  }
                }}
                className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:text-[#0B5D2E] hover:border-[#0B5D2E] transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#0B5D2E] bg-white px-2 py-0.5 rounded-full border border-[#0B5D2E15]">
                  {step === 'select_product'
                    ? (isEs ? 'Catálogo de Inventario' : 'Inventory Catalog')
                    : step === 'select_variant'
                    ? (isEs ? 'Seleccionar Presentación' : 'Select Size')
                    : (isEs ? 'Registrar Compra y Costo' : 'Log Food Purchase')}
                </span>
                {stats && (
                  <span className="text-[10px] text-gray-500 hidden sm:inline">
                    {stats.totalProducts} {isEs ? 'productos disponibles' : 'products'}
                  </span>
                )}
              </div>
              <h3 className="font-heading font-black text-lg text-[#1C2B21] mt-0.5">
                {step === 'select_product' && (isEs ? `Alimento de ${pet.name}` : `${pet.name}'s Food`)}
                {step === 'select_variant' && (selectedProduct?.nombre || '')}
                {step === 'purchase_form' && (isEs ? 'Datos de la Compra' : 'Purchase Details')}
              </h3>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* LOADING STATE */}
          {loadingCatalog && (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#0B5D2E] animate-spin mx-auto" />
              <p className="text-xs font-semibold text-gray-600">
                {isEs ? 'Cargando catálogo oficial de alimentos...' : 'Loading food catalog...'}
              </p>
            </div>
          )}

          {/* ERROR STATE */}
          {loadError && !loadingCatalog && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-500" />
              <div>
                <p className="font-bold">{isEs ? 'No se pudo cargar el catálogo' : 'Could not load catalog'}</p>
                <p className="text-[11px] text-red-600">{loadError}</p>
              </div>
            </div>
          )}

          {/* ================= STEP 1: SELECT PRODUCT ================= */}
          {!loadingCatalog && !loadError && step === 'select_product' && (
            <div className="space-y-3.5">
              
              {/* Filter Controls: Species Pill & Category Tabs (Snacks Separated) */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F8FAF8] p-2.5 rounded-2xl border border-gray-100">
                
                {/* Category: Main Food vs Snacks */}
                <div className="flex gap-1 bg-white p-1 rounded-xl border border-gray-200 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCategory('main')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      category === 'main'
                        ? 'bg-[#0B5D2E] text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <span>🥣</span>
                    <span>{isEs ? 'Alimento principal' : 'Main Food'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategory('snacks')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      category === 'snacks'
                        ? 'bg-[#0B5D2E] text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <span>🦴</span>
                    <span>{isEs ? 'Snacks & Premios' : 'Snacks'}</span>
                  </button>
                </div>

                {/* Species selector */}
                <div className="flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                    {isEs ? 'Mascota:' : 'Pet:'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSpeciesFilter(speciesFilter === 'dog' ? 'cat' : 'dog')}
                    className="flex items-center gap-1 text-[#0B5D2E] hover:underline"
                  >
                    <span>{speciesFilter === 'dog' ? '🐶 Perro' : '🐱 Gato'}</span>
                    <span className="text-[10px] text-gray-400">({isEs ? 'cambiar' : 'change'})</span>
                  </button>
                </div>
              </div>

              {/* Instant Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    isEs
                      ? 'Escribe nombre o marca (ej. Nutra gato, Agility, Royal Canin, Churu...)'
                      : 'Type product name or brand...'
                  }
                  autoFocus
                  className="w-full pl-10 pr-9 py-2.5 bg-[#F8FAF8] border border-gray-200 rounded-2xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-[#0B5D2E] focus:bg-white min-h-[44px] transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Search Stats / Query feedback */}
              <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
                <span>
                  {searchQuery ? (
                    <>
                      {isEs ? 'Resultados para' : 'Results for'}{' '}
                      <strong className="text-gray-800">"{searchQuery}"</strong>: {searchResults.length}
                    </>
                  ) : (
                    <>
                      {isEs ? 'Mostrando sugerencias destacadas' : 'Showing suggestions'}: {searchResults.length}
                    </>
                  )}
                </span>
                <span className="text-[10px] text-[#0B5D2E] font-medium">
                  {category === 'main' ? (isEs ? 'Seco & Húmedo' : 'Dry & Wet') : (isEs ? 'Snacks' : 'Snacks')}
                </span>
              </div>

              {/* Product Results List */}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {searchResults.length === 0 ? (
                  <div className="text-center py-10 bg-[#F8FAF8] rounded-2xl border border-dashed border-gray-200 p-4 space-y-2">
                    <Package className="w-8 h-8 text-gray-400 mx-auto" />
                    <p className="text-xs font-bold text-gray-700">
                      {isEs ? 'No encontramos alimentos con ese nombre' : 'No matching foods found'}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {isEs
                        ? 'Intenta buscar solo por la marca (ej. "Royal", "Hills", "Nutra", "Agility").'
                        : 'Try searching by brand only.'}
                    </p>
                  </div>
                ) : (
                  searchResults.map((prod) => {
                    const hasImageError = imageErrorMap[prod.id];
                    const displayImage = !hasImageError && prod.foto_url ? prod.foto_url : null;
                    const variantCount = prod.presentaciones.length;

                    return (
                      <div
                        key={prod.id}
                        onClick={() => handleSelectProduct(prod)}
                        className="p-3 bg-white hover:bg-[#F8FAF8] rounded-2xl border border-gray-100 hover:border-[#0B5D2E50] cursor-pointer transition shadow-2xs flex items-center justify-between gap-3 group active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Product Image Thumbnail with Neutral Fallback */}
                          <div className="w-12 h-12 rounded-xl bg-[#EAF4EC]/60 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                            {displayImage ? (
                              <img
                                src={displayImage}
                                alt={prod.nombre}
                                className="w-full h-full object-contain p-1"
                                loading="lazy"
                                onError={() =>
                                  setImageErrorMap((prev) => ({ ...prev, [prod.id]: true }))
                                }
                              />
                            ) : (
                              <Package className="w-5 h-5 text-[#0B5D2E]" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black uppercase tracking-wider text-[#0B5D2E]">
                                {prod.marca}
                              </span>
                              <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded-md font-semibold">
                                {prod.tipo}
                              </span>
                            </div>
                            <h4 className="font-heading font-bold text-xs sm:text-sm text-[#1C2B21] truncate mt-0.5">
                              {prod.nombre}
                            </h4>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {variantCount} {variantCount === 1 ? (isEs ? 'presentación' : 'size') : (isEs ? 'presentaciones registradas' : 'sizes available')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-gray-400 group-hover:text-[#0B5D2E] transition shrink-0">
                          <span className="text-xs font-bold hidden sm:inline">
                            {isEs ? 'Elegir' : 'Select'}
                          </span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ================= STEP 2: SELECT PRESENTATION (STRICT ID LINKAGE) ================= */}
          {!loadingCatalog && step === 'select_variant' && selectedProduct && (
            <div className="space-y-4">
              
              {/* Selected Product Card */}
              <div className="p-3.5 bg-[#EAF4EC]/50 rounded-2xl border border-[#0B5D2E20] flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-white border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                  {selectedProduct.foto_url && !imageErrorMap[selectedProduct.id] ? (
                    <img
                      src={selectedProduct.foto_url}
                      alt={selectedProduct.nombre}
                      className="w-full h-full object-contain p-1"
                      onError={() =>
                        setImageErrorMap((prev) => ({ ...prev, [selectedProduct.id]: true }))
                      }
                    />
                  ) : (
                    <Package className="w-6 h-6 text-[#0B5D2E]" />
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#0B5D2E]">
                    {selectedProduct.marca}
                  </span>
                  <h4 className="font-heading font-extrabold text-sm text-[#1C2B21]">
                    {selectedProduct.nombre}
                  </h4>
                  <span className="text-[10px] text-gray-500 block">
                    ID: {selectedProduct.id.replace('gid://shopify/Product/', '#')}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold text-gray-700 block mb-2">
                  {isEs ? 'Selecciona la presentación comprada:' : 'Select presentation purchased:'}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {selectedProduct.presentaciones.map((variant) => {
                    const parsed = parseVariantWeight(variant.nombre);
                    const variantImg = variant.foto_url || selectedProduct.foto_url;
                    const hasVariantImgErr = imageErrorMap[variant.id];

                    return (
                      <div
                        key={variant.id}
                        onClick={() => handleSelectVariant(variant)}
                        className="p-3 bg-white hover:bg-[#F8FAF8] rounded-2xl border-2 border-gray-200 hover:border-[#0B5D2E] cursor-pointer transition flex items-center justify-between gap-2.5 active:scale-98 shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden border border-gray-100">
                            {variantImg && !hasVariantImgErr ? (
                              <img
                                src={variantImg}
                                alt={variant.nombre}
                                className="w-full h-full object-contain p-0.5"
                                onError={() =>
                                  setImageErrorMap((prev) => ({ ...prev, [variant.id]: true }))
                                }
                              />
                            ) : (
                              <Package className="w-4 h-4 text-[#0B5D2E]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h5 className="font-heading font-black text-sm text-[#1C2B21] truncate">
                              {variant.nombre}
                            </h5>
                            {parsed.isAmbiguous ? (
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded-md inline-flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {isEs ? 'Confirmar peso' : 'Confirm weight'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-[#0B5D2E] bg-[#EAF4EC] px-1.5 py-0.2 rounded-md">
                                ✓ {parsed.grams?.toLocaleString()} g ({parsed.kg} kg)
                              </span>
                            )}
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 3: PURCHASE REGISTRATION FORM ================= */}
          {!loadingCatalog && step === 'purchase_form' && selectedProduct && selectedVariant && (
            <form onSubmit={handleSubmitPurchase} className="space-y-4">
              
              {/* Product & Variant Identity Banner */}
              <div className="p-3.5 bg-[#F8FAF8] rounded-2xl border border-gray-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                    {(selectedVariant.foto_url || selectedProduct.foto_url) && !imageErrorMap[selectedVariant.id] ? (
                      <img
                        src={selectedVariant.foto_url || selectedProduct.foto_url || ''}
                        alt={selectedProduct.nombre}
                        className="w-full h-full object-contain p-1"
                        onError={() =>
                          setImageErrorMap((prev) => ({ ...prev, [selectedVariant.id]: true }))
                        }
                      />
                    ) : (
                      <Package className="w-5 h-5 text-[#0B5D2E]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#0B5D2E]">
                      {selectedProduct.marca}
                    </span>
                    <h4 className="font-heading font-extrabold text-xs sm:text-sm text-[#1C2B21] truncate">
                      {selectedProduct.nombre}
                    </h4>
                    <span className="text-[11px] font-bold text-gray-700 bg-white px-2 py-0.5 rounded-md border border-gray-200 inline-block mt-0.5">
                      {isEs ? 'Presentación:' : 'Size:'} {selectedVariant.nombre}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStep('select_variant')}
                  className="text-xs text-[#0B5D2E] font-bold hover:underline shrink-0"
                >
                  {isEs ? 'Cambiar' : 'Change'}
                </button>
              </div>

              {/* AMBIGUOUS WEIGHT HANDLING (Rule requirement: prompt confirmation if ambiguous) */}
              {parsedWeight?.isAmbiguous ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                  <div className="flex items-start gap-2 text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <span className="font-bold block">
                        {isEs ? 'Presentación con peso no especificado' : 'Presentation with unverified weight'}
                      </span>
                      <span className="text-amber-700 text-[11px]">
                        {isEs
                          ? `El nombre "${selectedVariant.nombre}" no especifica peso estándar. Ingresa el peso neto por empaque:`
                          : `The title "${selectedVariant.nombre}" does not specify a weight. Please enter net pack weight:`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={customWeightInput}
                      onChange={(e) => setCustomWeightInput(e.target.value)}
                      placeholder="Ej. 1.5 o 500"
                      className="flex-1 px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="flex bg-white rounded-xl border border-amber-300 p-0.5 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setCustomWeightUnit('kg')}
                        className={`px-3 py-1.5 rounded-lg transition ${
                          customWeightUnit === 'kg'
                            ? 'bg-amber-600 text-white'
                            : 'text-amber-900 hover:bg-amber-50'
                        }`}
                      >
                        kg
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomWeightUnit('g')}
                        className={`px-3 py-1.5 rounded-lg transition ${
                          customWeightUnit === 'g'
                            ? 'bg-amber-600 text-white'
                            : 'text-amber-900 hover:bg-amber-50'
                        }`}
                      >
                        g
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-[#EAF4EC]/60 rounded-xl border border-[#0B5D2E15] flex items-center justify-between text-xs">
                  <span className="text-gray-600">
                    {isEs ? 'Peso confirmado por empaque:' : 'Confirmed weight per pack:'}
                  </span>
                  <strong className="text-[#0B5D2E] font-mono">
                    {parsedWeight?.kg} kg ({parsedWeight?.grams?.toLocaleString()} g)
                  </strong>
                </div>
              )}

              {/* Form Grid: Quantity & Total Price Paid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* Quantity Purchased */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-700 block">
                    {isEs ? 'Cantidad comprada (paquetes / bultos)' : 'Quantity purchased'}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-base flex items-center justify-center transition"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="flex-1 py-2 text-center bg-[#F8FAF8] border border-gray-200 rounded-xl text-xs font-black font-mono focus:outline-none focus:border-[#0B5D2E]"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-base flex items-center justify-center transition"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-[10px] text-gray-500 block">
                    {isEs ? 'Total comprado:' : 'Total net:'} {totalWeightKgPurchased} kg
                  </span>
                </div>

                {/* Total Price Paid ($ COP) */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#0B5D2E] block">
                    {isEs ? 'Valor total pagado ($ COP)' : 'Total Price Paid ($ COP)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-black text-[#0B5D2E]">$</span>
                    <input
                      type="number"
                      step="500"
                      min="100"
                      required
                      value={pricePaidCop}
                      onChange={(e) => setPricePaidCop(e.target.value)}
                      placeholder="185000"
                      className="w-full pl-7 pr-3 py-2 bg-[#F8FAF8] border-2 border-[#0B5D2E] rounded-xl text-xs font-black font-mono text-gray-900 focus:outline-none focus:bg-white"
                    />
                  </div>
                  <span className="text-[10px] text-[#0B5D2E] font-bold block">
                    {formatCOP(numericPrice, true)} COP
                  </span>
                </div>
              </div>

              {/* Purchase Date & Store */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-700 block">
                    {isEs ? 'Fecha de compra' : 'Purchase Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F8FAF8] border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-[#0B5D2E]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-700 block">
                    {isEs ? 'Tienda o clínica (Opcional)' : 'Store / Clinic (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Ej. Agrocampo, Laika, Kanú, Éxito"
                    className="w-full px-3 py-2 bg-[#F8FAF8] border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-[#0B5D2E]"
                  />
                </div>
              </div>

              {/* Optional Receipt Photo */}
              <div className="space-y-1 pt-1 border-t border-gray-100">
                <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-[#0B5D2E]" />
                    {isEs ? 'Foto de factura o recibo (Opcional)' : 'Receipt Photo (Optional)'}
                  </span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleReceiptUpload}
                    className="text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#EAF4EC] file:text-[#0B5D2E] hover:file:bg-[#d4ead8]"
                  />
                  {receiptPhotoUrl && (
                    <span className="text-[10px] text-[#0B5D2E] font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> {isEs ? 'Foto cargada' : 'Photo loaded'}
                    </span>
                  )}
                </div>
              </div>

              {/* Calculated KPIs Preview in COP */}
              {totalWeightKgPurchased > 0 && numericPrice > 0 && (
                <div className="bg-[#EAF4EC] p-3 rounded-2xl border border-[#0B5D2E20] grid grid-cols-3 gap-2 text-center">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[#0B5D2E] block">
                      {isEs ? 'Costo / kg' : 'Cost / kg'}
                    </span>
                    <strong className="text-xs font-mono text-[#1C2B21]">
                      {formatCOP(costPerKgCop, true)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[#0B5D2E] block">
                      {isEs ? 'Costo / día' : 'Cost / day'}
                    </span>
                    <strong className="text-xs font-mono text-[#1C2B21]">
                      {formatCOP(costPerDayCop, true)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-[#F57C1A] block">
                      {isEs ? 'Duración aprox.' : 'Est. Duration'}
                    </span>
                    <strong className="text-xs font-mono text-[#1C2B21]">
                      ~{estimatedDaysDuration} {isEs ? 'días' : 'days'}
                    </strong>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || resolvedNetGrams <= 0}
                className="w-full py-3 bg-[#0B5D2E] hover:bg-[#094723] disabled:bg-gray-300 text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 shadow-md transition active:scale-98 min-h-[48px]"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>
                      {isEs
                        ? `Guardar compra en inventario de ${pet.name}`
                        : `Log purchase for ${pet.name}`}
                    </span>
                  </>
                )}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
