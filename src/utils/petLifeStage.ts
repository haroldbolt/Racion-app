import type { Pet } from '../types';
import { findBreedProfile } from '../data/breeds';

export function getPetAgeMonths(pet: Pet): number {
  if (typeof pet.ageMonths === 'number' && pet.ageMonths > 0) {
    return pet.ageMonths;
  }
  return Math.max(1, Math.round((pet.ageYears ?? 2) * 12));
}

export function isPetPuppy(pet: Pet): boolean {
  const profile = findBreedProfile(pet.breed, pet.species, pet.breedSize);
  const ageMonths = getPetAgeMonths(pet);
  return ageMonths < profile.growthMonths;
}

export function isPetSenior(pet: Pet): boolean {
  const profile = findBreedProfile(pet.breed, pet.species, pet.breedSize);
  const ageYears = getPetAgeMonths(pet) / 12;
  return ageYears >= profile.seniorAgeYears;
}
