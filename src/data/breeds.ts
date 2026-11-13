import { BreedSize, Sex, Species } from '../types';

export type BreedMetabolismProfile =
  | 'standard'
  | 'small_high'
  | 'high_energy'
  | 'obesity_prone'
  | 'giant_low';

export interface BreedProfile {
  id: string;
  name: string;
  species: Species;
  size: BreedSize;
  maleWeightRangeKg: [number, number];
  femaleWeightRangeKg: [number, number];
  metabolismProfile: BreedMetabolismProfile;
  seniorAgeYears: number;
  growthMonths: number;
}

export const DOG_BREEDS: BreedProfile[] = [
  {
    id: 'dog-mixed-unknown',
    name: 'Mestizo / No sé',
    species: 'dog',
    size: 'medium',
    maleWeightRangeKg: [12, 24],
    femaleWeightRangeKg: [10, 21],
    metabolismProfile: 'standard',
    seniorAgeYears: 8,
    growthMonths: 12,
  },
  {
    id: 'dog-mixed-medium',
    name: 'Mestizo / Mixed',
    species: 'dog',
    size: 'medium',
    maleWeightRangeKg: [12, 24],
    femaleWeightRangeKg: [10, 21],
    metabolismProfile: 'standard',
    seniorAgeYears: 8,
    growthMonths: 12,
  },
  {
    id: 'dog-mixed-small',
    name: 'Mestizo Pequeño / Criollo Pequeño',
    species: 'dog',
    size: 'small',
    maleWeightRangeKg: [5, 10],
    femaleWeightRangeKg: [4, 9],
    metabolismProfile: 'small_high',
    seniorAgeYears: 10,
    growthMonths: 10,
  },
  {
    id: 'dog-mixed-large',
    name: 'Mestizo Grande / Criollo Grande',
    species: 'dog',
    size: 'large',
    maleWeightRangeKg: [25, 38],
    femaleWeightRangeKg: [22, 34],
    metabolismProfile: 'standard',
    seniorAgeYears: 7,
    growthMonths: 16,
  },
  {
    id: 'dog-labrador',
    name: 'Labrador Retriever',
    species: 'dog',
    size: 'large',
    maleWeightRangeKg: [29, 36],
    femaleWeightRangeKg: [25, 32],
    metabolismProfile: 'obesity_prone',
    seniorAgeYears: 7,
    growthMonths: 15,
  },
  {
    id: 'dog-golden',
    name: 'Golden Retriever',
    species: 'dog',
    size: 'large',
    maleWeightRangeKg: [30, 34],
    femaleWeightRangeKg: [25, 29],
    metabolismProfile: 'obesity_prone',
    seniorAgeYears: 7,
    growthMonths: 15,
  },
  {
    id: 'dog-german-shepherd',
    name: 'Pastor Alemán / German Shepherd',
    species: 'dog',
    size: 'large',
    maleWeightRangeKg: [30, 40],
    femaleWeightRangeKg: [22, 32],
    metabolismProfile: 'high_energy',
    seniorAgeYears: 7,
    growthMonths: 18,
  },
  {
    id: 'dog-french-bulldog',
    name: 'Bulldog Francés / French Bulldog',
    species: 'dog',
    size: 'small',
    maleWeightRangeKg: [10, 14],
    femaleWeightRangeKg: [8, 12],
    metabolismProfile: 'obesity_prone',
    seniorAgeYears: 9,
    growthMonths: 10,
  },
  {
    id: 'dog-english-bulldog',
    name: 'Bulldog Inglés / English Bulldog',
    species: 'dog',
    size: 'medium',
    maleWeightRangeKg: [23, 25],
    femaleWeightRangeKg: [18, 22],
    metabolismProfile: 'obesity_prone',
    seniorAgeYears: 7,
    growthMonths: 12,
  },
  {
    id: 'dog-beagle',
    name: 'Beagle',
    species: 'dog',
    size: 'medium',
    maleWeightRangeKg: [10, 14],
    femaleWeightRangeKg: [9, 12],
    metabolismProfile: 'obesity_prone',
    seniorAgeYears: 9,
    growthMonths: 12,
  },
  {
    id: 'dog-poodle-toy',
    name: 'Poodle Toy / Caniche Toy',
    species: 'dog',
    size: 'toy',
    maleWeightRangeKg: [3, 5],
    femaleWeightRangeKg: [2.5, 4.5],
    metabolismProfile: 'small_high',
    seniorAgeYears: 10,
    growthMonths: 9,
  },
  {
    id: 'dog-poodle',
    name: 'Poodle / Caniche',
    species: 'dog',
    size: 'medium',
    maleWeightRangeKg: [9, 15],
    femaleWeightRangeKg: [8, 13],
    metabolismProfile: 'standard',
    seniorAgeYears: 9,
    growthMonths: 12,
  },
  {
    id: 'dog-chihuahua',
    name: 'Chihuahua',
    species: 'dog',
    size: 'toy',
    maleWeightRangeKg: [1.8, 3],
    femaleWeightRangeKg: [1.5, 2.7],
    metabolismProfile: 'small_high',
    seniorAgeYears: 10,
    growthMonths: 9,
  },
  {
    id: 'dog-yorkie',
    name: 'Yorkshire Terrier',
    species: 'dog',
    size: 'toy',
    maleWeightRangeKg: [2.2, 3.5],
    femaleWeightRangeKg: [2, 3.2],
    metabolismProfile: 'small_high',
    seniorAgeYears: 10,
    growthMonths: 9,
  },
  {
    id: 'dog-pomeranian',
    name: 'Pomerania / Pomeranian',
    species: 'dog',
    size: 'toy',
    maleWeightRangeKg: [2, 3.5],
    femaleWeightRangeKg: [1.8, 3.2],
    metabolismProfile: 'small_high',
    seniorAgeYears: 10,
    growthMonths: 9,
  },
  {
    id: 'dog-pinscher',
    name: 'Pinscher Miniatura',
    species: 'dog',
    size: 'toy',
    maleWeightRangeKg: [4, 6],
    femaleWeightRangeKg: [3.5, 5],
    metabolismProfile: 'small_high',
    seniorAgeYears: 10,
    growthMonths: 9,
  },
  {
    id: 'dog-maltese',
    name: 'Maltés / Bichón Maltés',
    species: 'dog',
    size: 'toy',
    maleWeightRangeKg: [3, 4.5],
    femaleWeightRangeKg: [2.5, 4],
    metabolismProfile: 'small_high',
    seniorAgeYears: 10,
    growthMonths: 9,
  },
  {
    id: 'dog-boxer',
    name: 'Boxer',
    species: 'dog',
    size: 'large',
    maleWeightRangeKg: [29, 35],
    femaleWeightRangeKg: [24, 29],
    metabolismProfile: 'high_energy',
    seniorAgeYears: 7,
    growthMonths: 15,
  },
  {
    id: 'dog-dachshund',
    name: 'Dachshund / Teckel',
    species: 'dog',
    size: 'small',
    maleWeightRangeKg: [7, 11],
    femaleWeightRangeKg: [6, 9.5],
    metabolismProfile: 'obesity_prone',
    seniorAgeYears: 9,
    growthMonths: 10,
  },
  {
    id: 'dog-schnauzer-mini',
    name: 'Schnauzer Miniatura',
    species: 'dog',
    size: 'small',
    maleWeightRangeKg: [6, 9],
    femaleWeightRangeKg: [5, 8],
    metabolismProfile: 'standard',
    seniorAgeYears: 10,
    growthMonths: 10,
  },
  {
    id: 'dog-husky',
    name: 'Husky Siberiano',
    species: 'dog',
    size: 'large',
    maleWeightRangeKg: [21, 27],
    femaleWeightRangeKg: [16, 23],
    metabolismProfile: 'high_energy',
    seniorAgeYears: 8,
    growthMonths: 15,
  },
  {
    id: 'dog-rottweiler',
    name: 'Rottweiler',
    species: 'dog',
    size: 'giant',
    maleWeightRangeKg: [45, 58],
    femaleWeightRangeKg: [35, 48],
    metabolismProfile: 'giant_low',
    seniorAgeYears: 6,
    growthMonths: 20,
  },
  {
    id: 'dog-pug',
    name: 'Pug / Carlino',
    species: 'dog',
    size: 'small',
    maleWeightRangeKg: [6.5, 8.5],
    femaleWeightRangeKg: [6, 8],
    metabolismProfile: 'obesity_prone',
    seniorAgeYears: 9,
    growthMonths: 10,
  },
  {
    id: 'dog-border-collie',
    name: 'Border Collie',
    species: 'dog',
    size: 'medium',
    maleWeightRangeKg: [15, 22],
    femaleWeightRangeKg: [12, 19],
    metabolismProfile: 'high_energy',
    seniorAgeYears: 8,
    growthMonths: 12,
  },
  {
    id: 'dog-cocker',
    name: 'Cocker Spaniel',
    species: 'dog',
    size: 'medium',
    maleWeightRangeKg: [12.5, 15.5],
    femaleWeightRangeKg: [11, 14],
    metabolismProfile: 'obesity_prone',
    seniorAgeYears: 9,
    growthMonths: 12,
  },
  {
    id: 'dog-shih-tzu',
    name: 'Shih Tzu',
    species: 'dog',
    size: 'small',
    maleWeightRangeKg: [5, 7.5],
    femaleWeightRangeKg: [4.5, 6.8],
    metabolismProfile: 'obesity_prone',
    seniorAgeYears: 10,
    growthMonths: 10,
  },
  {
    id: 'dog-jack-russell',
    name: 'Jack Russell Terrier',
    species: 'dog',
    size: 'small',
    maleWeightRangeKg: [6, 8],
    femaleWeightRangeKg: [5, 7],
    metabolismProfile: 'high_energy',
    seniorAgeYears: 10,
    growthMonths: 10,
  },
  {
    id: 'dog-pitbull',
    name: 'Pitbull / American Pit Bull Terrier',
    species: 'dog',
    size: 'medium',
    maleWeightRangeKg: [20, 30],
    femaleWeightRangeKg: [16, 25],
    metabolismProfile: 'high_energy',
    seniorAgeYears: 8,
    growthMonths: 14,
  },
  {
    id: 'dog-great-dane',
    name: 'Gran Danés / Great Dane',
    species: 'dog',
    size: 'giant',
    maleWeightRangeKg: [54, 80],
    femaleWeightRangeKg: [45, 65],
    metabolismProfile: 'giant_low',
    seniorAgeYears: 6,
    growthMonths: 24,
  },
  {
    id: 'dog-bernese',
    name: 'Boyero de Berna / Bernese Mountain',
    species: 'dog',
    size: 'giant',
    maleWeightRangeKg: [40, 52],
    femaleWeightRangeKg: [36, 45],
    metabolismProfile: 'giant_low',
    seniorAgeYears: 6,
    growthMonths: 20,
  },
];

export const CAT_BREEDS: BreedProfile[] = [
  {
    id: 'cat-mixed',
    name: 'Mestizo / Criollo / Mixed',
    species: 'cat',
    size: 'medium',
    maleWeightRangeKg: [4, 5.5],
    femaleWeightRangeKg: [3.2, 4.5],
    metabolismProfile: 'standard',
    seniorAgeYears: 10,
    growthMonths: 12,
  },
  {
    id: 'cat-dsh',
    name: 'Europeo Común / Domestic Shorthair',
    species: 'cat',
    size: 'medium',
    maleWeightRangeKg: [4, 5.5],
    femaleWeightRangeKg: [3.2, 4.5],
    metabolismProfile: 'standard',
    seniorAgeYears: 10,
    growthMonths: 12,
  },
  {
    id: 'cat-siamese',
    name: 'Siamés / Siamese',
    species: 'cat',
    size: 'small',
    maleWeightRangeKg: [3.8, 5],
    femaleWeightRangeKg: [2.8, 4],
    metabolismProfile: 'high_energy',
    seniorAgeYears: 10,
    growthMonths: 12,
  },
  {
    id: 'cat-persian',
    name: 'Persa / Persian',
    species: 'cat',
    size: 'medium',
    maleWeightRangeKg: [4, 5.5],
    femaleWeightRangeKg: [3.2, 4.5],
    metabolismProfile: 'obesity_prone',
    seniorAgeYears: 10,
    growthMonths: 12,
  },
  {
    id: 'cat-maine-coon',
    name: 'Maine Coon',
    species: 'cat',
    size: 'large',
    maleWeightRangeKg: [6, 9],
    femaleWeightRangeKg: [4, 6],
    metabolismProfile: 'standard',
    seniorAgeYears: 9,
    growthMonths: 18,
  },
  {
    id: 'cat-bengal',
    name: 'Bengalí / Bengal',
    species: 'cat',
    size: 'medium',
    maleWeightRangeKg: [4.5, 6.8],
    femaleWeightRangeKg: [3.5, 5],
    metabolismProfile: 'high_energy',
    seniorAgeYears: 10,
    growthMonths: 12,
  },
  {
    id: 'cat-ragdoll',
    name: 'Ragdoll',
    species: 'cat',
    size: 'large',
    maleWeightRangeKg: [5.5, 8.5],
    femaleWeightRangeKg: [4, 6.2],
    metabolismProfile: 'obesity_prone',
    seniorAgeYears: 9,
    growthMonths: 16,
  },
  {
    id: 'cat-british-shorthair',
    name: 'British Shorthair',
    species: 'cat',
    size: 'medium',
    maleWeightRangeKg: [4.5, 7],
    femaleWeightRangeKg: [3.5, 5],
    metabolismProfile: 'obesity_prone',
    seniorAgeYears: 10,
    growthMonths: 12,
  },
  {
    id: 'cat-sphynx',
    name: 'Sphynx / Esfinge',
    species: 'cat',
    size: 'medium',
    maleWeightRangeKg: [4, 5.5],
    femaleWeightRangeKg: [3, 4.5],
    metabolismProfile: 'high_energy',
    seniorAgeYears: 10,
    growthMonths: 12,
  },
  {
    id: 'cat-russian-blue',
    name: 'Azul Ruso / Russian Blue',
    species: 'cat',
    size: 'medium',
    maleWeightRangeKg: [4, 5.5],
    femaleWeightRangeKg: [3, 4.2],
    metabolismProfile: 'standard',
    seniorAgeYears: 10,
    growthMonths: 12,
  },
  {
    id: 'cat-angora',
    name: 'Angora Turco',
    species: 'cat',
    size: 'small',
    maleWeightRangeKg: [3.5, 5],
    femaleWeightRangeKg: [2.5, 4],
    metabolismProfile: 'high_energy',
    seniorAgeYears: 10,
    growthMonths: 12,
  },
  {
    id: 'cat-norwegian',
    name: 'Bosque de Noruega',
    species: 'cat',
    size: 'large',
    maleWeightRangeKg: [5.5, 8.5],
    femaleWeightRangeKg: [4, 6],
    metabolismProfile: 'standard',
    seniorAgeYears: 9,
    growthMonths: 16,
  },
];

export function getBreedsBySpecies(species: Species): BreedProfile[] {
  return species === 'dog' ? DOG_BREEDS : CAT_BREEDS;
}

const SIZE_DEFAULT_PROFILES_DOG: Record<BreedSize, Omit<BreedProfile, 'id' | 'name'>> = {
  toy: {
    species: 'dog',
    size: 'toy',
    maleWeightRangeKg: [2, 4.5],
    femaleWeightRangeKg: [1.8, 4],
    metabolismProfile: 'small_high',
    seniorAgeYears: 10,
    growthMonths: 9,
  },
  small: {
    species: 'dog',
    size: 'small',
    maleWeightRangeKg: [5, 10],
    femaleWeightRangeKg: [4.5, 9],
    metabolismProfile: 'small_high',
    seniorAgeYears: 10,
    growthMonths: 10,
  },
  medium: {
    species: 'dog',
    size: 'medium',
    maleWeightRangeKg: [12, 24],
    femaleWeightRangeKg: [10, 21],
    metabolismProfile: 'standard',
    seniorAgeYears: 8,
    growthMonths: 12,
  },
  large: {
    species: 'dog',
    size: 'large',
    maleWeightRangeKg: [25, 40],
    femaleWeightRangeKg: [22, 35],
    metabolismProfile: 'standard',
    seniorAgeYears: 7,
    growthMonths: 16,
  },
  giant: {
    species: 'dog',
    size: 'giant',
    maleWeightRangeKg: [45, 70],
    femaleWeightRangeKg: [38, 60],
    metabolismProfile: 'giant_low',
    seniorAgeYears: 6,
    growthMonths: 22,
  },
};

export function findBreedProfile(
  breedName: string | undefined,
  species: Species,
  explicitSize?: BreedSize
): BreedProfile {
  const list = getBreedsBySpecies(species);
  const normalized = (breedName || '').trim().toLowerCase();

  let matched = list.find(
    (b) =>
      b.name.toLowerCase() === normalized ||
      b.name.toLowerCase().split('/').some((part) => part.trim() === normalized)
  );

  if (!matched && normalized) {
    matched = list.find(
      (b) =>
        b.name.toLowerCase().includes(normalized) ||
        normalized.includes(b.name.toLowerCase().split('/')[0].trim())
    );
  }

  if (matched) {
    if (
      explicitSize &&
      explicitSize !== matched.size &&
      (normalized.includes('mestizo') || normalized.includes('no sé') || normalized.includes('no se'))
    ) {
      const sizeDefaults = species === 'dog' ? SIZE_DEFAULT_PROFILES_DOG[explicitSize] : matched;
      return {
        ...matched,
        ...sizeDefaults,
        id: matched.id,
        name: matched.name,
        size: explicitSize,
      };
    }
    return matched;
  }

  if (species === 'dog') {
    const sizeToUse = explicitSize || 'medium';
    const def = SIZE_DEFAULT_PROFILES_DOG[sizeToUse];
    return {
      id: `dog-custom-${sizeToUse}`,
      name: breedName || 'Mestizo / Mixed',
      ...def,
    };
  }

  const catDefault = CAT_BREEDS[0];
  return {
    ...catDefault,
    name: breedName || catDefault.name,
    size: explicitSize || catDefault.size,
  };
}

export function getIdealWeightForBreedAndSex(
  breedName: string | undefined,
  species: Species,
  sex: Sex,
  explicitSize?: BreedSize
): { min: number; max: number; midpoint: number } {
  const profile = findBreedProfile(breedName, species, explicitSize);
  const range = sex === 'male' ? profile.maleWeightRangeKg : profile.femaleWeightRangeKg;
  const midpoint = Number(((range[0] + range[1]) / 2).toFixed(1));
  return { min: range[0], max: range[1], midpoint };
}

export function getBreedSizeLabel(size: BreedSize, lang: 'es' | 'en' = 'es'): string {
  const isEs = lang === 'es';
  switch (size) {
    case 'toy':
      return isEs ? 'Toy (< 5 kg)' : 'Toy (< 5 kg)';
    case 'small':
      return isEs ? 'Pequeña (5–10 kg)' : 'Small (5–10 kg)';
    case 'medium':
      return isEs ? 'Mediana (11–25 kg)' : 'Medium (11–25 kg)';
    case 'large':
      return isEs ? 'Grande (26–44 kg)' : 'Large (26–44 kg)';
    case 'giant':
      return isEs ? 'Gigante (45+ kg)' : 'Giant (45+ kg)';
    default:
      return isEs ? 'Mediana' : 'Medium';
  }
}
