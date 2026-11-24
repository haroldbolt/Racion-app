export type Species = 'dog' | 'cat';

export type Sex = 'male' | 'female';

export type ActivityLevel = 'low' | 'moderate' | 'high';

export type Goal = 'maintain' | 'lose' | 'gain' | 'growth';

export type LifeStage = 'puppy' | 'kitten' | 'adult' | 'senior';

export type BreedSize = 'toy' | 'small' | 'medium' | 'large' | 'giant';

export type DietType = 'commercial' | 'barf' | 'therapeutic' | 'mixed';

export type LabelStatus = 'verified_manufacturer' | 'user_confirmed_label' | 'unconfirmed';

export type SpecialState =
  | 'none'
  | 'diabetes'
  | 'kidney'
  | 'pancreatitis'
  | 'allergy'
  | 'pregnancy'
  | 'lactation'
  | 'hospitalised';

export interface Pet {
  id: string;
  name: string;
  species: Species;
  breed: string;
  breedSize?: BreedSize;
  sex: Sex;
  isNeutered: boolean;
  birthDate?: string;
  ageYears?: number;
  ageMonths?: number;
  currentWeightKg: number;
  initialWeighIn?: WeightRecord;
  idealWeightKg: number;
  targetWeightKg: number;
  expectedAdultWeightKg?: number;
  bcs: number; // 1 to 9
  activityLevel: ActivityLevel;
  photoUrl?: string;
  specialState: SpecialState;
  dietType?: DietType;
  restrictions?: string[];
  restrictionNotes?: string;
  avoidedIngredients?: string[];
  vetNutrientLimits?: VetNutrientLimit[];
  profileRefinementPending?: {
    adultWeight?: boolean;
    activity?: boolean;
    bcs?: boolean;
  };
  hasVetGuideline?: boolean;
  vetGuideline?: VetGuideline;
  vetContact?: { name: string; phone: string };
  createdAt: string;
}

export type VetNutrient = 'proteina' | 'grasa' | 'fibra' | 'carbohidratos' | 'cenizas' | 'humedad';

export interface VetNutrientLimit {
  nutrient: VetNutrient;
  maximum: number;
  unit: 'pct_as_fed' | 'pct_dry_matter' | 'grams_per_day';
}

export type NutrientQualifier = 'minimo' | 'maximo' | 'tipico';
export type MeasurementBasis = 'tal_como_se_vende' | 'materia_seca';
export type EmpaqueTipo = 'fabrica' | 'fraccionado' | 'por_confirmar';

export interface NutrientValue {
  declaracionOriginal?: string; // Source quantity when converted to the app’s display unit.
  source?: { name: string; url?: string; observedAt: string };
  valor: number;
  unidadOriginal: string;
  baseMedicion: MeasurementBasis;
  calificador: NutrientQualifier;
}

export interface NutritionDatasheet {
  discrepancies?: { field: string; other: NutrientValue; sourceUrl: string }[];
  kcalPerKg?: NutrientValue & { nota?: string };
  kcalPerUnit?: NutrientValue;
  proteina?: NutrientValue;
  grasa?: NutrientValue;
  fibra?: NutrientValue;
  humedad?: NutrientValue;
  cenizas?: NutrientValue;
  carbohidratos?: NutrientValue;
  fuenteUrl?: string;
  fuenteNombre?: string;
  fechaConsulta?: string;
  mercado?: string;
  coincidenciaEstado: 'verificado' | 'revision_requerida' | 'pendiente';
  notasRevision?: string;
}

export interface FoodPriceBasis {
  packageKg: number;
  priceCop: number;
  source: 'online' | 'manual' | 'receipt';
  observedAt: string;
  selectedAt?: string;
  storeName?: string;
  sourceUrl?: string;
  shippingCop?: number | null;
  includeShipping?: boolean;
  postalCode?: string;
}

export interface FoodItem {
  manufacturerFormulaName?: string;
  /** Official product page assigned to a single formula in the verified catalogue. */
  manufacturerFormulaUrl?: string;
  declaredIcaRegistration?: string;
  icaRegistry?: {registration:string; name:string; sourceUrl:string};
  storeName?: string;
  storeProductUrl?: string;
  feedingGuide?: {
    lifeStage?: 'adult' | 'kitten';
    aboveWeight?: { afterKg: number; startGrams: number; gramsPerKg: number };
    sourceUrl: string;
    sourceName: string;
    sourceType?: 'manufacturer' | 'store';
    ranges: { minWeightKg: number; maxWeightKg: number; minGrams: number; maxGrams: number }[];
  };
  sourceFoodId?: string;
  id: string;
  brand: string;
  name: string;
  species: Species;
  lifeStage: LifeStage | 'all';
  lifeStageKnown?: boolean;
  nutritionalUse?: 'complete' | 'complementary' | 'treat';
  type: 'dry' | 'wet' | 'barf';
  kcalPerKg: number;
  kcalPerCup?: number;
  kcalPerCan?: number;
  kcalPerPiece?: number;
  proteinPct: number;
  fatPct: number;
  fiberPct: number;
  moisturePct: number;
  ashPct?: number;
  carbsPct?: number;
  country: string;
  barcode?: string;
  ingredientsSummary?: string;
  score?: number; // 0-100 educational
  priceApproxUsd?: number;
  priceApproxCop?: number; // Price in Colombian Pesos (COP)
  bagSizeKg?: number;
  availableSizesKg?: number[]; // Sizes offered by shops, saved by the user or listed on the product sheet.
  manufacturerSizesKg?: number[]; // Only sizes documented for this exact formula on its manufacturer sheet.
  packagePrices?: FoodPriceBasis[];
  priceBasis?: FoodPriceBasis;
  imageUrl?: string;
  buyUrl?: string;
  // Label & compatibility validation fields
  labelStatus?: LabelStatus;
  labelPhotoUrl?: string;
  isCompleteAndBalanced?: boolean;
  suitableForGrowth?: boolean;
  kibbleSizeSuitability?: BreedSize[];
  dataSource?: string;
  formulaNotes?: string;
  fichaNutricional?: NutritionDatasheet;
  estadoCatalogo?: 'activo' | 'archivado';
  empaqueTipo?: EmpaqueTipo;
  fotoAlcance?: 'presentacion_exacta' | 'referencial' | string;
}

export interface TreatCatalogItem {
  id: string;
  brand: string;
  name: string;
  species: Species;
  kcalPerUnit?: number; // Defined ONLY when label explicitly states kcal per piece/unit
  kcalPer100g?: number;
  unitLabel?: string; // e.g. "galleta", "bocadito", "sobre 30 g"
  hasKcalPerUnitOnLabel: boolean;
  dataSource: string;
  fichaNutricional?: NutritionDatasheet;
}

export interface TreatLog {
  id: string;
  petId: string;
  date: string; // YYYY-MM-DD
  name: string;
  brand?: string;
  kcal: number;
  pieces?: number;
  kcalPerUnit?: number;
  hasKcalPerUnitOnLabel: boolean;
  isTrainingFromRation?: boolean;
  gramsFromRation?: number;
  nutritionComponent?: MealMixedComponent;
  loggedAt: string;
}

export interface HydrationDailyState {
  bowlsLogged: number;
  intakeChangeFlag?: 'none' | 'much_more' | 'much_less';
  intakeChangeNote?: string;
  updatedAt?: string;
}

export interface FoodCostEntry {
  id: string;
  petId: string;
  foodId?: string;
  sourceFoodId?: string;
  foodSourceUrl?: string;
  formulaAtPurchase?: { name: string; analysis?: NutritionDatasheet };
  plannedMealCostsAtPurchase?: Array<{ time: string; grams: number; costCop?: number; partial: boolean }>;
  openedOn?: string;
  sharedWithPetIds?: string[];
  componentRole?: 'dry' | 'wet' | 'main';
  date: string; // YYYY-MM-DD
  foodBrand: string;
  foodName: string;
  foodType: 'dry' | 'wet' | 'mixed' | 'snack' | 'barf';
  bagSizeKg: number; // e.g. 15 kg
  pricePaidCop: number; // Price in Colombian Pesos (COP), e.g. 280000
  costPerKgCop: number; // calculated e.g. pricePaidCop / bagSizeKg
  costPerDayCop?: number; // calculated based on pet's plan
  costPerMonthCop?: number; // calculated (costPerDayCop * 30.5)
  estimatedDaysDuration?: number; // days the bag lasts
  storeName?: string; // e.g. "Agrocampo", "Laika", "Éxito", "Veterinaria"
  receiptPhotoUrl?: string; // photo or receipt image data URL
  receiptFormat?: 'image' | 'pdf'; // Original PDFs are stored locally under the purchase ID.
  receiptReadMethod?: 'local_ocr' | 'pdf_text';
  receiptItemDescription?: string;
  notes?: string;
  createdAt: string;
  // Shopify catalog integration identifiers & fields
  shopifyProductId?: string;
  shopifyVariantId?: string;
  presentationName?: string;
  quantity?: number;
  currency?: string;
  weightInGrams?: number;
  imageUrl?: string;
}

export type FoodPurchase = FoodCostEntry;

export interface RecentFoodSearch {
  id: string;
  brand: string;
  productName: string;
  weightKg: number;
  city: string;
  imageUrl?: string;
  timestamp: number;
}

export interface FeedingPlan {
  id: string;
  petId: string;
  createdAt: string;
  foodId: string;
  foodName: string;
  foodBrand: string;
  foodType: 'dry' | 'wet' | 'mixed' | 'barf';
  dryFood?: FoodItem;
  wetFood?: FoodItem;
  mixedDryPct: number; // e.g. 50
  mixedWetPct: number; // e.g. 50
  mealsPerDay: number;
  mealTimes: string[];
  rer: number;
  factor: number;
  goal?: Goal;
  mer: number; // total kcal/day
  rationSource?: 'label' | 'manufacturer_midpoint' | 'manufacturer_adjusted' | 'manual' | 'veterinary';
  manufacturerGramsPerDay?: number; // Suggested or adjusted amount from this formula’s feeding guide
  manualGramsPerDay?: number; // Owner-entered amount pending label or manufacturer confirmation
  foodMerKcal?: number; // daily kcal from meals, excluding reserved treats
  treatsKcal?: number; // daily kcal entered when calculating, before the budget cap
  gramsPerDay: number;
  dryGramsPerDay?: number;
  wetGramsPerDay?: number;
  gramsPerMeal: number;
  kcalPerMeal: number;
  cupsPerDay?: number;
  cansPerDay?: number;
  treatsBudgetKcal: number;
  treatsCountToday: number;
  manualAdjustmentPct: number; // -10 to +10
  manualAdjustmentReason?: string;
  bagWeightKg?: number;
  bagDaysRemaining?: number;
  bagPriceCop?: number;
  dailyCostCop?: number;
  monthlyCostCop?: number;
  isVetLocked?: boolean;
  rationConfirmed?: boolean;
  scheduleConfigured?: boolean;
  trainingRationGramsToday?: number;
}

export interface WeightRecord {
  id: string;
  petId: string;
  date: string;
  weightKg: number;
  source?: 'profile_creation';
  waistCm?: number;
  photoUrl?: string;
  notes?: string;
}

export interface MealMixedComponent {
  foodId?: string;
  sourceFoodId?: string;
  brand?: string;
  foodName: string;
  foodLabelStatus?: LabelStatus | null;
  role: 'dry' | 'wet' | 'main';
  gramsPlanned: number;
  gramsFed: number;
  gramsEaten?: number;
  priceSnapshot?: { copPerGram?: number; source?: FoodPriceBasis['source']; packageKg?: number };
  kcalPerKg?: number;
  proteinPct?: number;
  fatPct?: number;
  fiberPct?: number;
  moisturePct?: number;
  ashPct?: number;
  carbsPct?: number;
  fichaNutricional?: NutritionDatasheet;
}

export interface MealLog {
  id: string;
  petId: string;
  date: string; // YYYY-MM-DD
  mealIndex: number;
  mealTime: string;
  plannedGrams?: number;
  gramsFed: number;
  gramsEaten?: number;
  fedBy: string; // "Carlos", "Marta", etc.
  completed: boolean;
  completedAt?: string;
  mixedComponents?: MealMixedComponent[];
}

export interface HealthLog {
  id: string;
  petId: string;
  date: string;
  type: 'vaccine' | 'deworming' | 'medication' | 'vet_visit' | 'symptom' | 'stool' | 'water' | 'energy' | 'glucose';
  title: string;
  notes: string;
  severity?: 'normal' | 'attention' | 'alert';
}

export interface VetGuideline {
  confirmedByGuardian?: boolean;
  needsReview?: boolean;
  prescribedKcal: number;
  prescribedFoodName: string;
  prescribedGramsPerMeal: number;
  mealsPerDay: number;
  vetName: string;
  clinicName: string;
  phone?: string;
  date: string;
  notes: string;
  locked: boolean;
}

export interface FamilyMember {
  id: string;
  name: string;
  role: 'feeder' | 'weighed_and_fed' | 'viewer';
  avatarColor: string;
}

export interface ToxicFood {
  id: string;
  nameEs: string;
  nameEn: string;
  speciesRisk: 'both' | 'dog' | 'cat';
  dangerLevel: 'high' | 'critical' | 'moderate';
  toxicSubstance: string;
  commonSymptomsEs: string;
  commonSymptomsEn: string;
  firstActionEs: string;
  firstActionEn: string;
}

export interface ReminderSettings {
  enabled: boolean;
  notifyMinutesBefore: number; // 0 = at exact time, 5, 10
  soundEnabled: boolean;
  vibrateEnabled: boolean;
}

export interface UserAccount {
  email: string;
  isLicensed: boolean;
  licenseKey?: string;
  licensedAt?: string;
  language: 'es' | 'en';
  units: 'metric' | 'imperial';
  theme?: 'light' | 'dark';
  city?: string;
  familyName: string;
  familyMembers: FamilyMember[];
  remindersEnabled: boolean;
  reminderSettings?: ReminderSettings;
  whatsappOptIn: boolean;
  whatsappPhone?: string;
}

export type CityRelation = 'in_city' | 'delivers_to_city' | 'national_coverage';
export type VerificationLevel = 'verified' | 'unverified_snippet' | 'requires_store_check';
export type ShippingClassification = 'free' | 'paid' | 'unconfirmed' | 'pickup_only';

export interface PriceOffer {
  id: string;
  merchantName: string;
  merchantLogo?: string;
  merchantDomain?: string;
  title: string;
  productUrl: string;
  imageUrl?: string;
  priceCop: number;
  extractedPrice: number;
  oldPriceCop?: number;
  shippingCostCop?: number | null;
  shippingStatus: ShippingClassification;
  shippingText?: string;
  totalCostCop: number | null; // null if shipping is unconfirmed
  hasConfirmedTotal: boolean;
  inStock: boolean;
  stockNote?: string;
  presentationWeightKg?: number;
  presentationUnit?: string;
  isExactPresentationMatch: boolean;
  packagingType?: EmpaqueTipo;
  unitCountMatched?: boolean;
  cityRelation: CityRelation;
  cityRelationNote: string;
  sourceEngine: 'google_shopping' | 'google_organic' | 'both';
  verificationStatus: VerificationLevel;
  verificationNote?: string;
  rating?: number;
  reviewsCount?: number;
  isBestOffer?: boolean;
  savingsCop?: number;
  retrievedAt: string;
  verifiedAt?: string;
}

export interface PriceComparisonResult {
  query: string;
  targetBrand: string;
  targetProductName: string;
  presentationWeightKg: number;
  presentationUnit: 'kg' | 'lb' | 'g';
  city: string;
  country: string;
  currency: 'COP';
  bestOffer: PriceOffer | null;
  lowestProductPriceOffer?: PriceOffer | null;
  offersWithConfirmedTotal: PriceOffer[];
  offersWithPendingShipping: PriceOffer[];
  unverifiedOffers: PriceOffer[];
  allOffers: PriceOffer[];
  totalOffersFound: number;
  inStockCount: number;
  provider: 'serpapi_dual_engine' | 'serpapi_google_shopping' | 'gemini_search_grounding' | 'unconfigured';
  providerName: string;
  searchEnginesUsed: string[];
  lastUpdated: string;
  cacheAgeMinutes?: number;
  isFromCache?: boolean;
  warningNotice?: string;
  errorCode?: 'quota_exceeded' | 'unconfigured' | 'network_error';
  strictPresentationEnforced: boolean;
  canExpandToNational: boolean;
}

export interface PriceComparatorConfigStatus {
  configured: boolean;
  provider: 'serpapi_google_shopping' | 'gemini_search_grounding' | 'unconfigured';
  providerName: string;
  currency: string;
  hasKey: boolean;
  providerDetails: {
    name: string;
    description: string;
    cost: string;
    limits: string;
    updateFrequency: string;
    setupGuide: string;
  };
}

export interface PriceHistoryPoint {
  date: string; // YYYY-MM-DD
  formattedDate: string; // "12 Oct"
  minPriceCop: number;
  merchantName: string;
  shippingCostCop: number | null;
  totalCostCop: number | null;
  productUrl: string;
  observationsCount: number;
}

export interface PriceHistorySummary {
  brand: string;
  productName: string;
  presentationWeightKg: number;
  city: string;
  daysWithData: number;
  hasSufficientData: boolean;
  currentPrice: number | null;
  minPrice: number | null;
  medianPrice: number | null;
  points: PriceHistoryPoint[];
  comparableBaseNote: string;
}

export interface TrackedProductAlert {
  id: string;
  userId: string;
  petId?: string;
  foodBrand: string;
  foodName: string;
  bagSizeKg: number;
  targetPriceCop: number;
  targetIncludesShipping: boolean;
  alertEnabled: boolean;
  lastCheckedPriceCop?: number;
  lastAlertSentAt?: string;
  createdAt: string;
}

export interface FamilyInviteRecord {
  id: string;
  inviteCode: string;
  ownerUid: string;
  ownerEmail: string;
  petIds: string[];
  role: 'feeder' | 'weighed_and_fed' | 'viewer';
  status: 'pending' | 'accepted' | 'revoked';
  acceptedByUid?: string;
  acceptedByEmail?: string;
  createdAt: string;
}

export interface SharedPetAccessRecord {
  id: string;
  petId: string;
  ownerUid: string;
  caregiverUid: string;
  caregiverEmail: string;
  role: 'feeder' | 'weighed_and_fed' | 'viewer';
  grantedAt: string;
}


