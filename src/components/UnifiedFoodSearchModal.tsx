import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Pet, FoodItem, FeedingPlan, RecentFoodSearch } from '../types';
import { PET_FOODS_DATABASE } from '../data/foods';
import { StorageService } from '../utils/storage';
import { getConfirmedPresentations } from '../data/foodPresentations';
import { loadShopifyCatalog, ShopifyProduct, shopifyProductToFoodItem } from '../services/shopifyCatalogService';
import { PriceComparatorService } from '../services/priceComparatorService';
import { formatCOP } from '../utils/i18n';
import { Search, X, Clock, ArrowRight, Package, Sparkles, Check, Globe, Loader2 } from 'lucide-react';

interface UnifiedFoodSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePet?: Pet;
  allPets?: Pet[];
  plans?: Record<string, FeedingPlan>;
  onSelectFood: (selection: {
    brand: string;
    productName: string;
    weightKg: number;
    imageUrl?: string;
    sourceFoodItem?: FoodItem;
    confirmedSizesKg?: number[];
  }) => void;
  lang?: 'es' | 'en';
  category?: 'all' | 'main' | 'snacks';
  includeArchived?: boolean;
  titleOverride?: string;
}

/**
 * Normalizes text for instant, accent-insensitive and lowercase token matching.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Resolves a high-fidelity product packshot thumbnail for foods.
 */
export function resolveFoodThumbnail(
  brand: string = '',
  name: string = '',
  species?: string,
  explicitImg?: string
): string | undefined {
  if (explicitImg && explicitImg.trim().length > 0) return explicitImg;

  const b = normalizeText(brand);
  const n = normalizeText(name);

  // Royal Canin Fit 32 / Cat
  if (n.includes('fit 32') || (b.includes('royal canin') && (species === 'cat' || n.includes('gato') || n.includes('cat')))) {
    return '/assets/food_rc_fit32.png';
  }

  // Royal Canin Dog
  if (b.includes('royal canin') || n.includes('royal canin')) {
    return '/assets/food_rc_dog.jpg';
  }

  // Purina Pro Plan
  if (b.includes('pro plan') || b.includes('purina') || n.includes('pro plan')) {
    return '/assets/food_proplan_dog.jpg';
  }

  // Hill's Science Diet
  if (b.includes('hill') || n.includes('science diet') || n.includes('hills')) {
    return '/assets/food_hills_dog.jpg';
  }

  // Agility Gold
  if (b.includes('agility') || n.includes('agility')) {
    return '/assets/food_agility_gold.jpg';
  }

  return undefined;
}

export const UnifiedFoodSearchModal: React.FC<UnifiedFoodSearchModalProps> = ({
  isOpen,
  onClose,
  activePet,
  allPets = [],
  plans = {},
  onSelectFood,
  lang = 'es',
  category = 'all',
  includeArchived = true,
  titleOverride,
}) => {
  const isEs = lang === 'es';

  // Instant reactive state: typing immediately updates filtered results without any debounce delay
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }
    // Auto-focus immediately when modal opens
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Listen to Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Extract explicit package weight from query (e.g. "fit 32 4kg", "medium 15", "royal 7.5 kg")
  const extractedWeight = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;

    // Matches e.g. "4kg", "15 kg", "7.5kilos", "12k"
    const kgMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilos|kilo|k)\b/i);
    if (kgMatch) {
      const val = parseFloat(kgMatch[1]);
      return val > 0 && val <= 50 ? val : null;
    }

    // Matches trailing standalone number like "fit 32 4" (avoid matching line numbers like 32)
    const trailingNumMatch = trimmed.match(/\s+(\d+(?:\.\d+)?)$/);
    if (trailingNumMatch) {
      const val = parseFloat(trailingNumMatch[1]);
      // Standard commercial bag sizes
      if ([1, 1.5, 2, 3, 4, 6.8, 7.5, 8, 10, 12, 13.6, 14, 15, 17, 20].includes(val)) {
        return val;
      }
    }

    return null;
  }, [query]);

  // Tokenize query for smart multi-field matching
  const searchTokens = useMemo(() => {
    const rawTokens = normalizeText(query)
      .replace(/(\d+(?:\.\d+)?)\s*(?:kg|kilos|kilo|k)\b/g, '') // strip weight token from name tokens
      .split(/\s+/)
      .filter((t) => t.length > 0);

    return rawTokens.map((tok) => {
      // Alias expansions
      if (tok === 'rc') return 'royal';
      if (tok === 'ppp') return 'pro';
      if (tok === 'sd') return 'science';
      return tok;
    });
  }, [query]);

  // 1. Registered foods from all user pets
  const registeredPetFoods = useMemo(() => {
    const list: Array<{
      petName: string;
      petSpecies: string;
      brand: string;
      productName: string;
      weightKg: number;
      imageUrl?: string;
      foodItem?: FoodItem;
      searchableText: string;
    }> = [];

    allPets.forEach((p) => {
      const plan = plans[p.id];
      if (plan && plan.foodBrand && plan.foodName) {
        const brand = plan.foodBrand;
        const productName = plan.foodName;
        const thumbnail =
          plan.dryFood?.imageUrl ||
          resolveFoodThumbnail(brand, productName, p.species);

        list.push({
          petName: p.name,
          petSpecies: p.species,
          brand,
          productName,
          weightKg: plan.bagWeightKg || 15,
          imageUrl: thumbnail,
          foodItem: plan.dryFood,
          searchableText: normalizeText(`${p.name} ${brand} ${productName} ${p.species}`),
        });
      }
    });

    return list;
  }, [allPets, plans]);

  // 2. Recent searches
  const recentSearches: RecentFoodSearch[] = useMemo(() => {
    return StorageService.getRecentFoodSearches();
  }, []);

  // 3. Shopify Catalog Products (1,528 products)
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);
  useEffect(() => {
    loadShopifyCatalog()
      .then((cat) => {
        if (cat?.productos) {
          setShopifyProducts(cat.productos);
        }
      })
      .catch((err) => console.warn('Catalog load note in search modal:', err));
  }, []);

  // Convert Shopify products into unified FoodItem array with enriched nutritional sheets & packaging metadata
  const shopifyAsFoodItems = useMemo<FoodItem[]>(() => {
    return shopifyProducts
      .filter((sp) => {
        if (!includeArchived && (sp.estado_catalogo === 'archivado' || sp.estado_shopify === 'ARCHIVED')) {
          return false;
        }
        const isSnack = sp.categoria_catalogo === 'snack' || sp.tipo === 'Snacks';
        if (category === 'snacks' && !isSnack) return false;
        if (category === 'main' && isSnack) return false;
        return true;
      })
      .map((sp) => shopifyProductToFoodItem(sp));
  }, [shopifyProducts, category, includeArchived]);

  // Combined Catalog database (built-in + user custom foods + Shopify full catalog)
  const catalogFoods = useMemo(() => {
    const custom = StorageService.getCustomFoods();
    const merged = [...custom, ...PET_FOODS_DATABASE, ...shopifyAsFoodItems];
    // Deduplicate identical brand+name prioritizing custom / verified built-in items ahead of pending Shopify entries
    const seen = new Set<string>();
    return merged.filter((f) => {
      const k = `${normalizeText(f.brand)}__${normalizeText(f.name)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [shopifyAsFoodItems]);

  // 4. Live Internet Search State (Google Shopping Colombia via SerpApi)
  const [isSearchingInternet, setIsSearchingInternet] = useState<boolean>(false);
  const [internetResults, setInternetResults] = useState<Array<{
    id: string;
    brand: string;
    productName: string;
    fullName: string;
    species: 'dog' | 'cat';
    imageUrl?: string;
    confirmedSizesKg: number[];
    samplePriceCop?: number;
    stores: string[];
    source: 'internet_google_shopping';
  }>>([]);
  const [hasSearchedInternet, setHasSearchedInternet] = useState<boolean>(false);

  const handleSearchInternet = async (customQuery?: string) => {
    const q = (customQuery || query).trim();
    if (!q) return;

    setIsSearchingInternet(true);
    setHasSearchedInternet(true);

    try {
      const results = await PriceComparatorService.discoverProducts({
        query: q,
        species: activePet?.species,
      });
      setInternetResults(results);
    } catch (err) {
      console.warn('Error during internet discovery:', err);
      setInternetResults([]);
    } finally {
      setIsSearchingInternet(false);
    }
  };

  // Filter Tier 1 (Registered Pet Foods) instantly
  const filteredRegisteredFoods = useMemo(() => {
    if (searchTokens.length === 0) return registeredPetFoods;
    return registeredPetFoods.filter((rf) =>
      searchTokens.every((token) => rf.searchableText.includes(token))
    );
  }, [registeredPetFoods, searchTokens]);

  // Filter Tier 2 (Recent Searches) instantly
  const filteredRecentSearches = useMemo(() => {
    if (searchTokens.length === 0) return recentSearches.slice(0, 4);
    return recentSearches
      .filter((rs) => {
        const hay = normalizeText(`${rs.brand} ${rs.productName} ${rs.weightKg}`);
        return searchTokens.every((token) => hay.includes(token));
      })
      .slice(0, 3);
  }, [recentSearches, searchTokens]);

  // Filter Tier 3 (Catalog Database) instantly with smart ranking
  const filteredCatalog = useMemo(() => {
    if (searchTokens.length === 0) {
      // Prioritize active pet's species first if query is empty
      const targetSpecies = activePet?.species || 'cat';
      const speciesMatches = catalogFoods.filter((f) => f.species === targetSpecies);
      const otherMatches = catalogFoods.filter((f) => f.species !== targetSpecies);
      return [...speciesMatches, ...otherMatches].slice(0, 12);
    }

    // Match all tokens against brand, name, species, lifeStage, ingredients, barcode
    const matches: Array<{
      food: FoodItem;
      score: number;
    }> = [];

    catalogFoods.forEach((food) => {
      const brandNorm = normalizeText(food.brand);
      const nameNorm = normalizeText(food.name);
      const speciesEs = food.species === 'cat' ? 'gato felino' : 'perro canino';
      const stageEs =
        food.lifeStage === 'puppy'
          ? 'cachorro puppy gatito kitten'
          : food.lifeStage === 'senior'
          ? 'senior mayor'
          : 'adulto adult';
      const combined = normalizeText(
        `${brandNorm} ${nameNorm} ${speciesEs} ${food.species} ${stageEs} ${food.barcode || ''}`
      );

      const allTokensMatch = searchTokens.every((token) => combined.includes(token));
      if (!allTokensMatch) return;

      // Calculate ranking score
      let score = 0;
      const firstToken = searchTokens[0];

      // Exact brand match or prefix
      if (brandNorm.startsWith(firstToken)) score += 50;
      if (brandNorm.includes(firstToken)) score += 20;

      // Name prefix
      if (nameNorm.startsWith(firstToken)) score += 40;
      if (nameNorm.includes(firstToken)) score += 15;

      // Species match with active pet
      if (activePet && food.species === activePet.species) score += 30;

      // Has confirmed image
      if (food.imageUrl || resolveFoodThumbnail(food.brand, food.name, food.species)) {
        score += 10;
      }

      // Prioritize active products ahead of archived products
      if (food.estadoCatalogo === 'archivado') score -= 40;
      else score += 15;

      // Boost items with verified datasheets
      if (food.fichaNutricional?.coincidenciaEstado === 'verificado' || food.kcalPerKg > 400) {
        score += 12;
      }

      // If user specified a weight, reward items that offer that exact presentation
      if (extractedWeight) {
        const sizes = getConfirmedPresentations(food);
        if (sizes && sizes.includes(extractedWeight)) {
          score += 25;
        }
      }

      matches.push({ food, score });
    });

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, 20).map((m) => m.food);
  }, [catalogFoods, searchTokens, activePet, extractedWeight]);

  // Handler to select a food item
  const handleSelectOption = (
    brand: string,
    name: string,
    preferredWeight?: number,
    img?: string,
    item?: FoodItem,
    customSizes?: number[]
  ) => {
    const confirmed = customSizes || getConfirmedPresentations(item);
    let chosenWeight = preferredWeight || 15;

    // If query contained an extracted weight and it's valid, prioritize it
    if (extractedWeight && (!confirmed || confirmed.length === 0 || confirmed.includes(extractedWeight))) {
      chosenWeight = extractedWeight;
    } else if (confirmed && confirmed.length > 0) {
      chosenWeight = preferredWeight && confirmed.includes(preferredWeight)
        ? preferredWeight
        : confirmed.includes(chosenWeight)
        ? chosenWeight
        : confirmed[0];
    }

    const resolvedImg = img || resolveFoodThumbnail(brand, name, item?.species, item?.imageUrl);

    onSelectFood({
      brand,
      productName: name,
      weightKg: chosenWeight,
      imageUrl: resolvedImg,
      sourceFoodItem: item,
      confirmedSizesKg: confirmed && confirmed.length > 0 ? confirmed : undefined,
    });
    onClose();
  };

  // Handler to search custom text entered by user
  const handleCustomSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    // Trigger real internet search on Google Shopping Colombia
    handleSearchInternet(trimmed);
  };

  // Highlight matching characters in text
  const renderHighlighted = (text: string) => {
    if (searchTokens.length === 0) return <span>{text}</span>;
    // Simple regex pattern for highlighting
    const pattern = new RegExp(`(${searchTokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const parts = text.split(pattern);

    return (
      <span>
        {parts.map((part, i) =>
          searchTokens.some((t) => normalizeText(t) === normalizeText(part)) ? (
            <span key={i} className="text-[#0B5D2E] font-extrabold bg-[#0B5D2E15] px-0.5 rounded">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl p-4 sm:p-5 max-w-md w-full shadow-2xl border border-[#0B5D2E20] space-y-3 relative max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-gray-100 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-[#0B5D2E] block">
                {isEs ? 'Busca su alimento' : 'Find their food'}
              </label>
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[9px] font-extrabold shadow-2xs"
                title={isEs ? 'Conectado a Google Shopping Colombia' : 'Online connected'}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                <span>{isEs ? 'En línea' : 'Online'}</span>
              </div>
            </div>
            <h3 className="font-heading font-black text-lg text-[#1C2B21]">
              {titleOverride || (isEs ? 'Buscar alimento o marca' : 'Search food or brand')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Unified Search Input with Instant Typing Feedback */}
        <div className="relative shrink-0">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (filteredCatalog.length > 0) {
                  const top = filteredCatalog[0];
                  const sizes = getConfirmedPresentations(top) || (top.bagSizeKg ? [top.bagSizeKg] : [15]);
                  handleSelectOption(top.brand, top.name, sizes[0], top.imageUrl, top);
                } else if (query.trim()) {
                  handleCustomSearch();
                }
              }
            }}
            placeholder={isEs ? 'Ej. Agility Gold grandes adultos' : 'E.g. Agility Gold large adults'}
            className="w-full pl-10 pr-9 py-2.5 bg-[#F8FAF8] border border-[#0B5D2E30] rounded-2xl text-xs font-bold text-[#1C2B21] focus:outline-none focus:ring-2 focus:ring-[#0B5D2E]/25 focus:border-[#0B5D2E] transition"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        {/* Extracted Weight Hint Pill if detected */}
        {extractedWeight && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#EAF4EC] border border-[#0B5D2E25] rounded-xl text-[11px] font-bold text-[#0B5D2E] shrink-0 animate-in fade-in">
            <Sparkles className="w-3.5 h-3.5 text-[#0B5D2E]" />
            <span>
              {isEs
                ? `Presentación detectada en tu búsqueda: ${extractedWeight} kg`
                : `Detected package size: ${extractedWeight} kg`}
            </span>
          </div>
        )}

        {/* Scrollable suggestions container */}
        <div className="overflow-y-auto space-y-3.5 flex-1 pr-1 -mr-1">
          {/* Priority 1: User's registered pet foods */}
          {filteredRegisteredFoods.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#0B5D2E] flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#0B5D2E]" />
                  <span>{isEs ? 'Alimentos de tus mascotas' : 'Your pets\' foods'}</span>
                </span>
                <span className="text-[10px] font-bold text-gray-400">
                  {filteredRegisteredFoods.length}
                </span>
              </div>

              <div className="space-y-1.5">
                {filteredRegisteredFoods.map((rf, idx) => {
                  const thumbnail = rf.imageUrl || resolveFoodThumbnail(rf.brand, rf.productName, rf.petSpecies);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectOption(rf.brand, rf.productName, rf.weightKg, thumbnail, rf.foodItem)}
                      className="w-full p-2.5 bg-[#EAF4EC]/70 hover:bg-[#EAF4EC] border border-[#0B5D2E30] rounded-2xl flex items-center justify-between text-left transition group min-h-[52px] shadow-2xs hover:shadow-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Thumbnail Miniature */}
                        <div className="w-10 h-12 bg-white rounded-xl p-0.5 border border-[#0B5D2E20] flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                          {thumbnail ? (
                            <img
                              src={thumbnail}
                              alt={rf.productName}
                              className="w-full h-full object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full bg-[#0B5D2E10] flex items-center justify-center">
                              <span className="text-sm">{rf.petSpecies === 'cat' ? '🐱' : '🐶'}</span>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-wider bg-[#0B5D2E] text-white px-1.5 py-0.5 rounded-full shrink-0">
                              {rf.petName}
                            </span>
                            <span className="text-xs font-bold text-[#1C2B21] truncate">
                              {renderHighlighted(rf.brand)}
                            </span>
                          </div>
                          <p className="text-[11px] font-semibold text-[#44544A] leading-tight truncate">
                            {renderHighlighted(rf.productName)}
                          </p>
                          <p className="text-[10px] font-bold text-[#0B5D2E] mt-0.5">
                            {rf.weightKg} kg · {isEs ? 'Ración habitual' : 'Usual food'}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[#0B5D2E] opacity-80 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Priority 2: Recent searches */}
          {filteredRecentSearches.length > 0 && (
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#F57C1A] flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#F57C1A]" />
                  <span>{isEs ? 'Búsquedas recientes' : 'Recent searches'}</span>
                </span>
              </div>
              <div className="space-y-1.5">
                {filteredRecentSearches.map((rc) => {
                  const thumbnail = rc.imageUrl || resolveFoodThumbnail(rc.brand, rc.productName);
                  return (
                    <button
                      key={rc.id}
                      type="button"
                      onClick={() => handleSelectOption(rc.brand, rc.productName, rc.weightKg, thumbnail)}
                      className="w-full p-2 bg-[#F8FAF8] hover:bg-gray-100/90 border border-gray-200 rounded-2xl flex items-center justify-between text-left transition min-h-[46px] group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-10 bg-white rounded-lg p-0.5 border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                          {thumbnail ? (
                            <img src={thumbnail} alt={rc.productName} className="w-full h-full object-contain" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                          )}
                        </div>
                        <div className="min-w-0 truncate">
                          <span className="text-xs font-bold text-[#1C2B21]">
                            {renderHighlighted(rc.brand)} {renderHighlighted(rc.productName)}
                          </span>
                          <span className="text-[10px] font-semibold text-gray-500 ml-1.5">
                            · {rc.weightKg} kg
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 transition shrink-0 ml-2" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Priority 3: Local catalog suggestions */}
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#44544A]">
                {query.trim()
                  ? isEs
                    ? `Catálogo Ración (${filteredCatalog.length})`
                    : `Catalog Matches (${filteredCatalog.length})`
                  : isEs
                  ? 'Catálogo recomendado'
                  : 'Recommended catalog'}
              </span>
              {filteredCatalog.length > 0 && (
                <span className="text-[9px] font-semibold text-gray-400">
                  {isEs ? 'Filtro instantáneo' : 'Instant filter'}
                </span>
              )}
            </div>

            {filteredCatalog.length > 0 ? (
              <div className="space-y-2">
                {filteredCatalog.map((food) => {
                  const sizes = getConfirmedPresentations(food) || (food.bagSizeKg ? [food.bagSizeKg] : [15]);
                  const thumbnail = resolveFoodThumbnail(food.brand, food.name, food.species, food.imageUrl);
                  const isCat = food.species === 'cat';

                  return (
                    <div
                      key={food.id}
                      className="p-2.5 bg-white hover:bg-[#F8FAF8] border border-gray-200/90 hover:border-[#0B5D2E40] rounded-2xl transition space-y-2 group shadow-2xs hover:shadow-xs"
                    >
                      {/* Top row: thumbnail + title + species + open action */}
                      <div
                        onClick={() => {
                          const targetWeight =
                            extractedWeight && sizes.includes(extractedWeight)
                              ? extractedWeight
                              : sizes[0];
                          handleSelectOption(food.brand, food.name, targetWeight, thumbnail, food);
                        }}
                        className="flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Miniature packshot container */}
                          <div className="w-11 h-14 bg-white rounded-xl p-0.5 border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs group-hover:border-[#0B5D2E30] transition">
                            {thumbnail ? (
                              <img
                                src={thumbnail}
                                alt={food.name}
                                className="w-full h-full object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <div
                                className={`w-full h-full rounded-lg flex flex-col items-center justify-center p-0.5 ${
                                  isCat ? 'bg-amber-50' : 'bg-emerald-50'
                                }`}
                              >
                                <span className="text-base">{isCat ? '🐱' : '🐶'}</span>
                                <span className="text-[7px] font-black uppercase text-gray-400 truncate max-w-full">
                                  {food.brand.split(' ')[0]}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-extrabold text-[#1C2B21]">
                                {renderHighlighted(food.brand)}
                              </span>
                              <span
                                className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full ${
                                  isCat
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {isCat ? 'Gato' : 'Perro'}
                              </span>
                              {food.lifeStage && (
                                <span className="text-[9px] font-semibold text-gray-500 capitalize">
                                  · {food.lifeStage === 'puppy' ? (isCat ? 'Gatito' : 'Cachorro') : food.lifeStage}
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] font-medium text-[#44544A] leading-tight truncate mt-0.5">
                              {renderHighlighted(food.name)}
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              {food.estadoCatalogo === 'archivado' ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                  Archivado
                                </span>
                              ) : food.fichaNutricional?.coincidenciaEstado === 'verificado' || food.labelStatus === 'verified_manufacturer' ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  Ficha verificada
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                  Sin dato verificado
                                </span>
                              )}
                              {food.fotoAlcance === 'referencial' && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                  Foto referencial
                                </span>
                              )}
                              {food.empaqueTipo === 'fraccionado' && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-orange-50 text-orange-800">
                                  Fraccionado
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 group-hover:text-[#0B5D2E] transition shrink-0 ml-2">
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      </div>

                      {/* Presentation pills: user can tap directly on their desired presentation */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5 border-t border-gray-100">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider shrink-0">
                          {isEs ? 'Presentaciones:' : 'Sizes:'}
                        </span>
                        {sizes.map((size) => {
                          const isExtracted = extractedWeight === size;
                          return (
                            <button
                              key={size}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectOption(food.brand, food.name, size, thumbnail, food);
                              }}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                                isExtracted
                                  ? 'bg-[#0B5D2E] text-white shadow-2xs'
                                  : 'bg-[#F2F5F3] hover:bg-[#EAF4EC] text-[#1C2B21] hover:text-[#0B5D2E] border border-transparent hover:border-[#0B5D2E30]'
                              }`}
                            >
                              {isExtracted && <Check className="w-2.5 h-2.5" />}
                              <span>{size} kg</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

              {/* Live Internet Search Progress Animation */}
              {isSearchingInternet && (
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-1.5 animate-pulse my-2">
                  <div className="flex items-center justify-center gap-2 text-emerald-900 font-extrabold text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>
                      {isEs
                        ? `Consultando Google Shopping en Colombia para "${query}"...`
                        : `Searching Google Shopping Colombia for "${query}"...`}
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-700">
                    {isEs
                      ? 'Explorando tiendas: Laika, Agrocampo, Kanú, Éxito, Puppis, Mercado Libre...'
                      : 'Checking real Colombian stores in live mode...'}
                  </p>
                </div>
              )}

              {/* Live Internet Search Results */}
              {internetResults.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-emerald-200/60 my-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-emerald-600" />
                      <span>
                        {isEs
                          ? `Encontrados en internet (${internetResults.length})`
                          : `Found on internet (${internetResults.length})`}
                      </span>
                    </span>
                    <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full border border-emerald-200">
                      Google Shopping Colombia
                    </span>
                  </div>

                  <div className="space-y-2">
                    {internetResults.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-white hover:bg-emerald-50/40 border border-emerald-300 rounded-2xl transition space-y-2 shadow-2xs hover:shadow-xs group"
                      >
                        <div
                          onClick={() => {
                            const targetSize =
                              extractedWeight && item.confirmedSizesKg.includes(extractedWeight)
                                ? extractedWeight
                                : item.confirmedSizesKg[0];
                            handleSelectOption(
                              item.brand,
                              item.productName,
                              targetSize,
                              item.imageUrl,
                              undefined,
                              item.confirmedSizesKg
                            );
                          }}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-12 h-14 bg-[#F8FAF8] rounded-xl p-0.5 border border-emerald-200 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.fullName}
                                  className="w-full h-full object-contain"
                                  loading="lazy"
                                />
                              ) : (
                                <Package className="w-6 h-6 text-emerald-600 opacity-80" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-extrabold text-[#1C2B21]">{item.brand}</span>
                                <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full">
                                  {item.species === 'cat' ? 'Gato' : 'Perro'}
                                </span>
                                {item.samplePriceCop && (
                                  <span className="text-[10px] font-extrabold text-[#0B5D2E]">
                                    {formatCOP(item.samplePriceCop)}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-medium text-[#44544A] leading-tight truncate mt-0.5">
                                {item.productName}
                              </p>
                              {item.stores.length > 0 && (
                                <p className="text-[9px] text-gray-500 truncate mt-0.5">
                                  {isEs ? 'En: ' : 'At: '}
                                  {item.stores.join(', ')}
                                </p>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-emerald-600 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                        </div>

                        {/* Presentation pills */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-emerald-100">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider shrink-0">
                            {isEs ? 'Tamaños confirmados:' : 'Confirmed sizes:'}
                          </span>
                          {item.confirmedSizesKg.map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectOption(
                                  item.brand,
                                  item.productName,
                                  size,
                                  item.imageUrl,
                                  undefined,
                                  item.confirmedSizesKg
                                );
                              }}
                              className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#EAF4EC] hover:bg-[#0B5D2E] text-[#0B5D2E] hover:text-white transition shadow-2xs cursor-pointer"
                            >
                              {size} kg
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Explicit action: "Buscar en comercios / Google Shopping" */}
              {query.trim() && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleSearchInternet(query.trim())}
                    disabled={isSearchingInternet}
                    className="w-full p-2.5 bg-[#F6FAF7] hover:bg-[#EAF4EC] border border-[#0B5D2E30] rounded-2xl flex items-center justify-between text-left transition group shadow-2xs cursor-pointer disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-white border border-[#0B5D2E25] flex items-center justify-center text-[#0B5D2E] shrink-0">
                        {isSearchingInternet ? (
                          <Loader2 className="w-4 h-4 animate-spin text-[#0B5D2E]" />
                        ) : (
                          <Globe className="w-4 h-4 text-[#0B5D2E]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[#0B5D2E] block">
                          {isSearchingInternet
                            ? isEs
                              ? 'Buscando en tiendas en internet...'
                              : 'Searching online...'
                            : isEs
                            ? 'Buscar en internet (Google Shopping)'
                            : 'Search online stores'}
                        </span>
                        <p className="text-[10px] text-gray-500 truncate">
                          {isEs
                            ? `Consultar tiendas en tiempo real para "${query}"`
                            : `Check Google Shopping & live stores for "${query}"`}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#0B5D2E] opacity-75 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                  </button>
                </div>
              )}
            </div>
          ) : (
              /* When 0 items in local catalog match */
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 text-center space-y-2.5">
                <div className="w-10 h-10 bg-white rounded-full mx-auto flex items-center justify-center text-gray-400 border border-gray-200">
                  <Package className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#1C2B21]">
                    {isEs
                      ? `No encontramos "${query}" en el catálogo precargado`
                      : `No matches found for "${query}"`}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {isEs
                      ? 'Puedes buscar ofertas de esta referencia directamente en tiendas de internet.'
                      : 'You can search for offers across online pet stores.'}
                  </p>
                </div>

                {isSearchingInternet ? (
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-center gap-2 text-emerald-800 text-xs font-bold animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>{isEs ? 'Buscando en Google Shopping Colombia...' : 'Searching Google Shopping...'}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSearchInternet(query.trim())}
                    className="w-full py-2.5 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold shadow-xs hover:bg-[#094723] transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>
                      {isEs
                        ? `Buscar "${query}" en internet (Google Shopping)`
                        : `Search "${query}" online`}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Live Internet Search Results if triggered when local was empty */}
                {internetResults.length > 0 && (
                  <div className="space-y-2 pt-2 text-left">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900">
                        {isEs ? `Resultados en internet (${internetResults.length})` : `Found online (${internetResults.length})`}
                      </span>
                    </div>
                    {internetResults.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-white border border-emerald-300 rounded-2xl space-y-2 shadow-2xs"
                      >
                        <div
                          onClick={() => {
                            const targetSize =
                              extractedWeight && item.confirmedSizesKg.includes(extractedWeight)
                                ? extractedWeight
                                : item.confirmedSizesKg[0];
                            handleSelectOption(
                              item.brand,
                              item.productName,
                              targetSize,
                              item.imageUrl,
                              undefined,
                              item.confirmedSizesKg
                            );
                          }}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-10 h-12 bg-white rounded-lg p-0.5 border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.fullName} className="w-full h-full object-contain" />
                              ) : (
                                <Package className="w-5 h-5 text-gray-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-[#1C2B21] block truncate">{item.brand} {item.productName}</span>
                              {item.samplePriceCop && (
                                <span className="text-[10px] font-bold text-[#0B5D2E]">
                                  {formatCOP(item.samplePriceCop)}
                                </span>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-gray-100">
                          {item.confirmedSizesKg.map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectOption(
                                  item.brand,
                                  item.productName,
                                  size,
                                  item.imageUrl,
                                  undefined,
                                  item.confirmedSizesKg
                                );
                              }}
                              className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#EAF4EC] hover:bg-[#0B5D2E] text-[#0B5D2E] hover:text-white transition"
                            >
                              {size} kg
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer info note */}
        <div className="pt-1 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 shrink-0">
          <span>{isEs ? 'Filtro local sin esperas' : 'Instant local filter'}</span>
          <span>{isEs ? 'Enter para seleccionar' : 'Enter to select'}</span>
        </div>
      </div>
    </div>
  );
};
