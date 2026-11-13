import React, { createContext, useContext, useState, useEffect } from 'react';
import { StorageService } from '../utils/storage';

export const PRIMARY_CITIES = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla'] as const;
export type PrimaryCity = (typeof PRIMARY_CITIES)[number];

export const ALL_CITIES = [
  'Bogotá',
  'Medellín',
  'Cali',
  'Barranquilla',
  'Bucaramanga',
  'Pereira',
  'Cartagena',
  'Cobertura Nacional (Colombia)',
] as const;

interface CityContextType {
  selectedCity: string;
  setCity: (city: string) => void;
  isDetecting: boolean;
  detectLocation: () => Promise<string | null>;
  primaryCities: readonly string[];
  allCities: readonly string[];
}

const CityContext = createContext<CityContextType>({
  selectedCity: 'Bogotá',
  setCity: () => {},
  isDetecting: false,
  detectLocation: async () => null,
  primaryCities: PRIMARY_CITIES,
  allCities: ALL_CITIES,
});

export const CityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedCity, setSelectedCityState] = useState<string>(() => {
    return StorageService.getUserCity() || 'Bogotá';
  });
  const [isDetecting, setIsDetecting] = useState<boolean>(false);

  // Sync to StorageService whenever city changes
  const setCity = (city: string) => {
    setSelectedCityState(city);
    StorageService.setUserCity(city);
  };

  const detectLocation = async (): Promise<string | null> => {
    if (!navigator.geolocation) {
      return null;
    }

    setIsDetecting(true);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsDetecting(false);
          const { latitude, longitude } = pos.coords;

          let detected = 'Bogotá';
          // Bogotá region: ~4.4 to 4.9 lat, -74.3 to -73.9 lon
          if (latitude >= 4.4 && latitude <= 4.9 && longitude >= -74.3 && longitude <= -73.9) {
            detected = 'Bogotá';
          }
          // Medellín & Valle de Aburrá: ~6.0 to 6.45 lat, -75.7 to -75.4 lon
          else if (latitude >= 6.0 && latitude <= 6.45 && longitude >= -75.7 && longitude <= -75.4) {
            detected = 'Medellín';
          }
          // Cali: ~3.3 to 3.6 lat, -76.6 to -76.4 lon
          else if (latitude >= 3.3 && latitude <= 3.6 && longitude >= -76.6 && longitude <= -76.4) {
            detected = 'Cali';
          }
          // Barranquilla: ~10.8 to 11.1 lat, -74.9 to -74.7 lon
          else if (latitude >= 10.8 && latitude <= 11.1 && longitude >= -74.9 && longitude <= -74.7) {
            detected = 'Barranquilla';
          } else {
            detected = 'Bogotá';
          }

          setCity(detected);
          resolve(detected);
        },
        () => {
          setIsDetecting(false);
          resolve(null);
        },
        { timeout: 8000 }
      );
    });
  };

  return (
    <CityContext.Provider
      value={{
        selectedCity,
        setCity,
        isDetecting,
        detectLocation,
        primaryCities: PRIMARY_CITIES,
        allCities: ALL_CITIES,
      }}
    >
      {children}
    </CityContext.Provider>
  );
};

export const useCity = () => useContext(CityContext);
