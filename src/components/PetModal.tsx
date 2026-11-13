import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Pet, Species, Sex, ActivityLevel, SpecialState, BreedSize, DietType } from '../types';
import { BCSSelector } from './BCSSelector';
import { X, Check, Camera, RefreshCw, Trash2, Upload, AlertCircle, Sparkles } from 'lucide-react';
import {
  getBreedsBySpecies,
  findBreedProfile,
  getIdealWeightForBreedAndSex,
  getBreedSizeLabel,
} from '../data/breeds';

interface PetModalProps {
  isOpen: boolean;
  petToEdit?: Pet | null;
  onClose: () => void;
  onSave: (pet: Pet) => void;
  lang?: 'es' | 'en';
}

const SIZE_OPTIONS: Array<{ id: BreedSize; es: string; en: string }> = [
  { id: 'toy', es: 'Toy', en: 'Toy' },
  { id: 'small', es: 'Pequeña', en: 'Small' },
  { id: 'medium', es: 'Mediana', en: 'Medium' },
  { id: 'large', es: 'Grande', en: 'Large' },
  { id: 'giant', es: 'Gigante', en: 'Giant' },
];

export const PetModal: React.FC<PetModalProps> = ({
  isOpen,
  petToEdit,
  onClose,
  onSave,
  lang = 'es',
}) => {
  const isEs = lang === 'es';

  const [name, setName] = useState(petToEdit?.name || '');
  const [species, setSpecies] = useState<Species>(petToEdit?.species || 'dog');
  const [breed, setBreed] = useState(petToEdit?.breed || 'Mestizo / Mixed');
  const [breedSize, setBreedSize] = useState<BreedSize>(
    petToEdit?.breedSize || findBreedProfile(petToEdit?.breed, petToEdit?.species || 'dog').size
  );
  const [breedQuery, setBreedQuery] = useState('');
  const [sex, setSex] = useState<Sex>(petToEdit?.sex || 'male');
  const [isNeutered, setIsNeutered] = useState<boolean>(petToEdit ? petToEdit.isNeutered : true);
  const [ageYears, setAgeYears] = useState<number>(petToEdit?.ageYears ?? 3);
  const [currentWeightKg, setCurrentWeightKg] = useState<number>(petToEdit?.currentWeightKg ?? 12);
  const [idealWeightKg, setIdealWeightKg] = useState<number>(petToEdit?.idealWeightKg ?? 11);
  const [bcs, setBcs] = useState<number>(petToEdit?.bcs ?? 5);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(petToEdit?.activityLevel || 'moderate');
  const [specialState, setSpecialState] = useState<SpecialState>(petToEdit?.specialState || 'none');
  const [expectedAdultWeightKg, setExpectedAdultWeightKg] = useState<string>(
    petToEdit?.expectedAdultWeightKg ? String(petToEdit.expectedAdultWeightKg) : ''
  );
  const [dietType, setDietType] = useState<DietType>(petToEdit?.dietType || 'commercial');
  const [restrictionNotes, setRestrictionNotes] = useState<string>(petToEdit?.restrictionNotes || '');
  const [photoUrl, setPhotoUrl] = useState(petToEdit?.photoUrl || '');

  // Camera & Snapshot states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [showManualUrlInput, setShowManualUrlInput] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync form fields whenever modal opens or petToEdit changes
  useEffect(() => {
    if (!isOpen) return;
    const sp: Species = petToEdit?.species || 'dog';
    const br = petToEdit?.breed || (sp === 'dog' ? 'Mestizo / No sé' : 'Mestizo / Criollo / Mixed');
    setName(petToEdit?.name || '');
    setSpecies(sp);
    setBreed(br);
    setBreedSize(petToEdit?.breedSize || findBreedProfile(br, sp).size);
    setBreedQuery('');
    setSex(petToEdit?.sex || 'male');
    setIsNeutered(petToEdit ? petToEdit.isNeutered : true);
    setAgeYears(petToEdit?.ageYears ?? 3);
    setCurrentWeightKg(petToEdit?.currentWeightKg ?? (sp === 'dog' ? 12 : 4));
    setIdealWeightKg(petToEdit?.idealWeightKg ?? (sp === 'dog' ? 11 : 4));
    setExpectedAdultWeightKg(
      petToEdit?.expectedAdultWeightKg ? String(petToEdit.expectedAdultWeightKg) : ''
    );
    setBcs(petToEdit?.bcs ?? 5);
    setActivityLevel(petToEdit?.activityLevel || 'moderate');
    setSpecialState(petToEdit?.specialState || 'none');
    setDietType(petToEdit?.dietType || 'commercial');
    setRestrictionNotes(petToEdit?.restrictionNotes || '');
    setPhotoUrl(petToEdit?.photoUrl || '');
    setShowManualUrlInput(false);
  }, [isOpen, petToEdit]);

  const breedList = useMemo(() => getBreedsBySpecies(species), [species]);
  const filteredBreeds = useMemo(() => {
    const q = breedQuery.trim().toLowerCase();
    if (!q) return breedList;
    return breedList.filter((b) => b.name.toLowerCase().includes(q));
  }, [breedList, breedQuery]);

  const idealWeightRef = useMemo(
    () => getIdealWeightForBreedAndSex(breed, species, sex, breedSize),
    [breed, species, sex, breedSize]
  );

  // Stop active camera stream tracks
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setCameraError(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  if (!isOpen) return null;

  const handleModalClose = () => {
    stopCamera();
    onClose();
  };

  // Launch camera
  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    stopCamera();
    setCameraError(null);
    setIsCameraActive(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia not supported in this browser');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Camera access issue:', err);
      setCameraError(
        isEs
          ? 'No se pudo iniciar la cámara en vivo (revisa los permisos de cámara en tu navegador). También puedes tomar la foto usando el selector de archivos.'
          : 'Could not start live camera (check camera permissions in your browser). You can also capture a photo using the file picker.'
      );
    }
  };

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Capture photo from video to canvas
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    // Crop to square for profile picture
    const size = Math.min(video.videoWidth, video.videoHeight);
    const startX = (video.videoWidth - size) / 2;
    const startY = (video.videoHeight - size) / 2;

    const targetDimension = Math.min(size, 480);
    canvas.width = targetDimension;
    canvas.height = targetDimension;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      video,
      startX,
      startY,
      size,
      size,
      0,
      0,
      targetDimension,
      targetDimension
    );

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setPhotoUrl(dataUrl);
    stopCamera();
  };

  // Native file input fallback
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const result = loadEvent.target?.result as string;
      if (result) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = Math.min(img.width, img.height);
          const startX = (img.width - size) / 2;
          const startY = (img.height - size) / 2;
          const targetDim = Math.min(size, 480);
          canvas.width = targetDim;
          canvas.height = targetDim;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, startX, startY, size, size, 0, 0, targetDim, targetDim);
            setPhotoUrl(canvas.toDataURL('image/jpeg', 0.85));
          } else {
            setPhotoUrl(result);
          }
          stopCamera();
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    stopCamera();

    const safeSpecialState: SpecialState =
      sex === 'male' && (specialState === 'pregnancy' || specialState === 'lactation')
        ? 'none'
        : specialState;

    const parsedExpectedAdult = parseFloat(expectedAdultWeightKg);
    const cleanYears = Number(ageYears) || 1;
    const computedMonths = Math.max(1, Math.round(cleanYears * 12));

    const newPet: Pet = {
      id: petToEdit ? petToEdit.id : 'pet_' + Date.now(),
      name: name.trim(),
      species,
      breed: breed || 'Mestizo / No sé',
      breedSize,
      sex,
      isNeutered,
      ageYears: cleanYears,
      ageMonths: computedMonths,
      currentWeightKg: Number(currentWeightKg) || 5,
      idealWeightKg: Number(idealWeightKg) || Number(currentWeightKg) || 5,
      targetWeightKg: Number(idealWeightKg) || Number(currentWeightKg) || 5,
      expectedAdultWeightKg:
        Number.isFinite(parsedExpectedAdult) && parsedExpectedAdult > 0
          ? parsedExpectedAdult
          : undefined,
      bcs,
      activityLevel,
      specialState: safeSpecialState,
      dietType,
      restrictions: petToEdit?.restrictions,
      restrictionNotes: restrictionNotes.trim() || undefined,
      profileRefinementPending: {
        adultWeight: false,
        activity: false,
        bcs: false,
      },
      photoUrl: photoUrl || '',
      hasVetGuideline: petToEdit?.hasVetGuideline,
      vetGuideline: petToEdit?.vetGuideline,
      createdAt: petToEdit ? petToEdit.createdAt : new Date().toISOString(),
    };

    onSave(newPet);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[92dvh] sm:max-h-[90dvh] flex flex-col shadow-2xl border border-[#0B5D2E20] relative overflow-hidden">
        {/* Sticky Header */}
        <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0 bg-white">
          <div className="min-w-0">
            <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-[#0B5D2E] leading-tight truncate">
              {petToEdit
                ? isEs
                  ? `Editar perfil de ${petToEdit.name}`
                  : `Edit ${petToEdit.name}`
                : isEs
                ? 'Nueva Mascota'
                : 'New Pet'}
            </h2>
            <p className="text-xs sm:text-sm text-[#44544A] mt-0.5">
              {isEs
                ? 'Datos esenciales para el cálculo de su requerimiento calórico'
                : 'Essential information for accurate caloric calculation'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            className="p-2 rounded-full text-[#44544A] hover:bg-[#EAF4EC] hover:text-[#0B5D2E] transition shrink-0"
            aria-label={isEs ? 'Cerrar' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4">
          {/* Pet Photo & Camera Section */}
          <div className="bg-[#F8FAF8] rounded-3xl p-4 border border-[#0B5D2E15] space-y-3">
            <label className="text-sm font-bold text-[#1C2B21] block">
              {isEs ? 'Foto de perfil de la mascota' : 'Pet Profile Photo'}
            </label>

            {/* Live Camera Viewfinder if active */}
            {isCameraActive ? (
              <div className="space-y-3 animate-in fade-in">
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-square max-w-[280px] mx-auto border-2 border-[#0B5D2E] shadow-md">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* Framing Reticle */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-dashed border-white/70 rounded-full" />
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      type="button"
                      onClick={toggleFacingMode}
                      className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition"
                      title={isEs ? 'Cambiar cámara' : 'Switch camera'}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition"
                      title={isEs ? 'Cancelar cámara' : 'Cancel camera'}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {cameraError ? (
                  <div className="bg-[#FFFBEB] p-3 rounded-xl border border-[#D97706]/30 text-xs text-[#92400E] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p>{cameraError}</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="font-bold underline text-[#0B5D2E]"
                      >
                        {isEs ? 'Tomar foto con la cámara del dispositivo' : 'Take photo with device camera'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-[#44544A] bg-gray-100 hover:bg-gray-200 transition min-h-[44px]"
                    >
                      {isEs ? 'Cancelar' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="px-5 py-2.5 bg-[#0B5D2E] text-white rounded-xl font-heading font-extrabold text-sm flex items-center gap-2 hover:bg-[#094723] transition shadow-md active:scale-95 min-h-[44px]"
                    >
                      <Camera className="w-5 h-5 stroke-[2.5]" />
                      <span>{isEs ? 'Tomar foto ahora' : 'Capture photo'}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Photo Preview & Triggers */
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-[#EAF4EC] border-2 border-[#0B5D2E30] flex items-center justify-center text-2xl sm:text-3xl shrink-0 shadow-xs relative group">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={name || 'Mascota'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{species === 'dog' ? '🐶' : '🐱'}</span>
                  )}
                  {photoUrl && (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl('')}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white"
                      title={isEs ? 'Eliminar foto' : 'Delete photo'}
                    >
                      <Trash2 className="w-5 h-5 text-red-300" />
                    </button>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {/* Primary Button: Open Camera */}
                    <button
                      type="button"
                      onClick={() => startCamera()}
                      className="min-h-[44px] px-3.5 py-2 bg-[#0B5D2E] text-white rounded-xl font-heading font-extrabold text-xs flex items-center gap-2 hover:bg-[#094723] transition shadow-xs active:scale-95"
                    >
                      <Camera className="w-4 h-4 stroke-[2.5]" />
                      <span>{isEs ? 'Tomar foto con la cámara' : 'Take photo with camera'}</span>
                    </button>

                    {/* Secondary Button: Gallery / Device capture fallback */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[44px] px-3 py-2 bg-white text-[#0B5D2E] border border-[#0B5D2E30] hover:bg-[#EAF4EC] rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isEs ? 'Subir imagen' : 'Upload image'}</span>
                    </button>

                    {photoUrl && (
                      <button
                        type="button"
                        onClick={() => setPhotoUrl('')}
                        className="min-h-[44px] px-2.5 py-2 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isEs ? 'Quitar' : 'Remove'}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#44544A]">
                    <span>
                      {photoUrl
                        ? (isEs ? '✓ Foto guardada para su perfil' : '✓ Photo set for pet profile')
                        : (isEs ? 'Usa la cámara para personalizar su perfil' : 'Use camera to personalize their profile')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowManualUrlInput(!showManualUrlInput)}
                      className="text-[#0B5D2E] hover:underline font-semibold"
                    >
                      {showManualUrlInput ? (isEs ? 'Ocultar URL' : 'Hide URL') : (isEs ? 'O ingresar URL' : 'Or enter URL')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Hidden native input for direct file/camera capture */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Optional URL input */}
            {showManualUrlInput && !isCameraActive && (
              <div className="pt-2 animate-in fade-in">
                <input
                  type="url"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="https://ejemplo.com/foto.jpg"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E]"
                />
              </div>
            )}
          </div>

          {/* Species */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setSpecies('dog');
                setBreed('Mestizo / Mixed');
                setBreedSize('medium');
              }}
              className={`p-3 rounded-2xl flex items-center justify-center gap-3 border-2 min-h-[52px] ${
                species === 'dog'
                  ? 'border-[#0B5D2E] bg-[#EAF4EC] font-bold text-[#0B5D2E]'
                  : 'border-gray-200 bg-white text-[#1C2B21]'
              }`}
            >
              <span className="text-2xl">🐶</span>
              <span className="font-heading font-bold text-base">{isEs ? 'Perro' : 'Dog'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSpecies('cat');
                setBreed('Mestizo / Criollo / Mixed');
                setBreedSize('medium');
              }}
              className={`p-3 rounded-2xl flex items-center justify-center gap-3 border-2 min-h-[52px] ${
                species === 'cat'
                  ? 'border-[#0B5D2E] bg-[#EAF4EC] font-bold text-[#0B5D2E]'
                  : 'border-gray-200 bg-white text-[#1C2B21]'
              }`}
            >
              <span className="text-2xl">🐱</span>
              <span className="font-heading font-bold text-base">{isEs ? 'Gato' : 'Cat'}</span>
            </button>
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label className="text-sm font-bold text-[#1C2B21]">
              {isEs ? 'Nombre' : 'Name'}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Milo"
              className="w-full px-4 py-3 bg-[#EAF4EC]/60 border border-[#0B5D2E20] rounded-xl text-base text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] focus:outline-none min-h-[48px]"
            />
          </div>

          {/* Breed with search, quick chips & size selector */}
          <div className="space-y-2 bg-[#F8FAF8] p-3.5 rounded-2xl border border-[#0B5D2E15]">
            <label className="text-sm font-bold text-[#1C2B21] flex justify-between items-center">
              <span>{isEs ? 'Raza' : 'Breed'}</span>
              <span className="text-xs font-semibold text-[#0B5D2E] truncate max-w-[220px]">{breed}</span>
            </label>
            <input
              type="text"
              value={breedQuery}
              onChange={(e) => {
                setBreedQuery(e.target.value);
                if (e.target.value.trim().length > 1) {
                  setBreed(e.target.value);
                }
              }}
              placeholder={isEs ? 'Buscar raza o escribe libremente...' : 'Search breed...'}
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] focus:outline-none"
            />
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
              {filteredBreeds.slice(0, 10).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBreed(b.name);
                    setBreedSize(b.size);
                    setBreedQuery('');
                  }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                    breed === b.name
                      ? 'bg-[#0B5D2E] text-white border-[#0B5D2E] font-bold'
                      : 'bg-white text-[#1C2B21] border-[#0B5D2E15] hover:bg-[#EAF4EC]'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>

            {species === 'dog' && (
              <div className="pt-2 border-t border-gray-200/70 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#44544A]">
                    {isEs ? 'Tamaño de raza:' : 'Breed size:'}
                  </span>
                  <span className="font-semibold text-[#0B5D2E]">
                    {getBreedSizeLabel(breedSize, isEs ? 'es' : 'en')}
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {SIZE_OPTIONS.map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setBreedSize(sz.id)}
                      className={`py-2 rounded-xl text-[11px] font-bold border transition ${
                        breedSize === sz.id
                          ? 'bg-[#0B5D2E] text-white border-[#0B5D2E] shadow-xs'
                          : 'bg-white text-[#44544A] border-gray-200 hover:bg-[#EAF4EC]'
                      }`}
                    >
                      {isEs ? sz.es : sz.en}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sex & Neutered */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs sm:text-sm font-bold text-[#1C2B21] block">
                {isEs ? 'Sexo' : 'Sex'}
              </label>
              <div className="grid grid-cols-2 gap-1.5 bg-[#EAF4EC] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setSex('male');
                    if (specialState === 'pregnancy' || specialState === 'lactation') {
                      setSpecialState('none');
                    }
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition ${
                    sex === 'male' ? 'bg-[#0B5D2E] text-white shadow-xs' : 'text-[#44544A]'
                  }`}
                >
                  {isEs ? '♂ Macho' : '♂ Male'}
                </button>
                <button
                  type="button"
                  onClick={() => setSex('female')}
                  className={`py-2 rounded-lg text-xs font-bold transition ${
                    sex === 'female' ? 'bg-[#0B5D2E] text-white shadow-xs' : 'text-[#44544A]'
                  }`}
                >
                  {isEs ? '♀ Hembra' : '♀ Female'}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs sm:text-sm font-bold text-[#1C2B21] block">
                {isEs ? '¿Castrado / Esterilizado?' : 'Neutered / Spayed?'}
              </label>
              <div className="grid grid-cols-2 gap-1.5 bg-[#EAF4EC] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setIsNeutered(true)}
                  className={`py-2 rounded-lg text-xs font-bold transition ${
                    isNeutered ? 'bg-[#0B5D2E] text-white shadow-xs' : 'text-[#44544A]'
                  }`}
                >
                  {isEs ? 'Sí' : 'Yes'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsNeutered(false)}
                  className={`py-2 rounded-lg text-xs font-bold transition ${
                    !isNeutered ? 'bg-[#0B5D2E] text-white shadow-xs' : 'text-[#44544A]'
                  }`}
                >
                  {isEs ? 'No' : 'No'}
                </button>
              </div>
            </div>
          </div>

          {/* Age & Weights */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="flex flex-col justify-between gap-1">
              <label className="text-xs font-bold text-[#1C2B21] leading-tight">
                {isEs ? 'Peso Actual (kg)' : 'Current Wt (kg)'}
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="100"
                value={currentWeightKg}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 1;
                  setCurrentWeightKg(val);
                }}
                className="w-full px-3 py-2.5 bg-white border border-[#0B5D2E40] rounded-xl text-center font-extrabold text-base text-[#0B5D2E] focus:ring-2 focus:ring-[#0B5D2E] min-h-[46px]"
              />
            </div>

            <div className="flex flex-col justify-between gap-1">
              <label className="text-xs font-bold text-[#1C2B21] leading-tight">
                {isEs ? 'Peso Ideal (kg)' : 'Ideal Wt (kg)'}
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="100"
                value={idealWeightKg}
                onChange={(e) => setIdealWeightKg(parseFloat(e.target.value) || 1)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-center font-bold text-base text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] min-h-[46px]"
              />
            </div>

            <div className="col-span-2 sm:col-span-1 flex flex-col justify-between gap-1">
              <label className="text-xs font-bold text-[#1C2B21] leading-tight">
                {isEs ? 'Edad (años)' : 'Age (years)'}
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="25"
                value={ageYears}
                onChange={(e) => setAgeYears(parseFloat(e.target.value) || 1)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-center font-bold text-base text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] min-h-[46px]"
              />
            </div>
          </div>

          {/* Breed + Sex ideal weight reference helper */}
          <div className="bg-[#EAF4EC]/70 px-3 py-2.5 rounded-xl border border-[#0B5D2E15] flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[#1C2B21]">
              <Sparkles className="w-3.5 h-3.5 text-[#0B5D2E] inline mr-1" />
              {isEs
                ? `Referencia ${breed.split('/')[0].trim()} (${sex === 'male' ? 'Macho' : 'Hembra'}): `
                : `Ref. ${breed.split('/')[0].trim()} (${sex === 'male' ? 'Male' : 'Female'}): `}
              <strong className="text-[#0B5D2E]">
                {idealWeightRef.min}–{idealWeightRef.max} kg
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setIdealWeightKg(idealWeightRef.midpoint)}
              className="px-2.5 py-1 bg-white text-[#0B5D2E] border border-[#0B5D2E30] rounded-lg font-bold hover:bg-[#0B5D2E] hover:text-white transition shrink-0 text-[11px]"
            >
              {isEs ? `Usar ${idealWeightRef.midpoint} kg` : `Use ${idealWeightRef.midpoint} kg`}
            </button>
          </div>

          {/* Activity Level with plain examples */}
          <div className="space-y-1.5">
            <label className="text-xs sm:text-sm font-bold text-[#1C2B21] block">
              {isEs ? 'Nivel de actividad' : 'Activity level'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  id: 'low',
                  title: isEs ? 'Bajo' : 'Low',
                  desc: isEs ? 'Paseos cortos <30 min o gato de sofá' : 'Short walks or indoor couch cat',
                },
                {
                  id: 'moderate',
                  title: isEs ? 'Moderado' : 'Moderate',
                  desc: isEs ? '1 a 2 horas de paseo/juego activo' : '1-2 hrs active walks/play',
                },
                {
                  id: 'high',
                  title: isEs ? 'Alto' : 'High',
                  desc: isEs ? 'Agility, campo, senderismo o trabajo' : 'Working dog, hiking, intense play',
                },
              ].map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => setActivityLevel(act.id as ActivityLevel)}
                  className={`p-3 rounded-xl border text-left flex flex-row sm:flex-col items-center sm:items-start justify-between gap-2 transition min-h-[48px] sm:min-h-[76px] ${
                    activityLevel === act.id
                      ? 'border-[#0B5D2E] bg-[#EAF4EC] ring-1 ring-[#0B5D2E]'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <span className="font-heading font-bold text-xs text-[#0B5D2E] shrink-0">
                    {act.title}
                  </span>
                  <span className="text-[11px] text-[#44544A] leading-snug text-right sm:text-left">
                    {act.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Body condition score */}
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <label className="text-sm font-bold text-[#1C2B21]">
              {isEs ? 'Condición corporal actual (BCS 1 a 9)' : 'Body Condition Score (BCS 1-9)'}
            </label>
            <BCSSelector
              species={species}
              value={bcs}
              onChange={setBcs}
              lang={lang}
            />
          </div>

          {/* Optional expected adult weight & Diet type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Peso adulto esperado (opcional, kg)' : 'Expected adult weight (optional, kg)'}
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="100"
                value={expectedAdultWeightKg}
                onChange={(e) => setExpectedAdultWeightKg(e.target.value)}
                placeholder={isEs ? 'Ej. 15 kg (para cachorros/mestizos)' : 'e.g. 15 kg'}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#1C2B21] min-h-[46px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Tipo de alimentación' : 'Diet type'}
              </label>
              <select
                value={dietType}
                onChange={(e) => setDietType(e.target.value as DietType)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#1C2B21] min-h-[46px]"
              >
                <option value="commercial">{isEs ? 'Concentrado / Húmedo comercial' : 'Commercial food'}</option>
                <option value="barf">{isEs ? 'BARF / Dieta cruda natural' : 'BARF / Raw diet'}</option>
                <option value="therapeutic">{isEs ? 'Dieta veterinaria / terapéutica' : 'Therapeutic vet diet'}</option>
              </select>
            </div>
          </div>

          {/* Special conditions warning */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-[#1C2B21]">
              {isEs ? '¿Tiene alguna condición médica especial?' : 'Any special medical condition?'}
            </label>
            <select
              value={specialState}
              onChange={(e) => setSpecialState(e.target.value as SpecialState)}
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-[#1C2B21] focus:ring-2 focus:ring-[#0B5D2E] min-h-[48px]"
            >
              <option value="none">{isEs ? 'Ninguna (Mascota sana)' : 'None (Healthy pet)'}</option>
              <option value="diabetes">{isEs ? 'Diabetes (Requiere seguimiento vet)' : 'Diabetes'}</option>
              <option value="kidney">{isEs ? 'Enfermedad renal' : 'Kidney disease'}</option>
              <option value="pancreatitis">{isEs ? 'Pancreatitis' : 'Pancreatitis'}</option>
              <option value="allergy">{isEs ? 'Alergia alimentaria' : 'Food allergy'}</option>
              {sex === 'female' && (
                <>
                  <option value="pregnancy">{isEs ? 'Gestación (solo hembra)' : 'Pregnancy'}</option>
                  <option value="lactation">{isEs ? 'Lactancia (solo hembra)' : 'Lactation'}</option>
                </>
              )}
              <option value="hospitalised">{isEs ? 'Hospitalizado / Recuperación' : 'Hospitalized / Convalescent'}</option>
            </select>

            <input
              type="text"
              value={restrictionNotes}
              onChange={(e) => setRestrictionNotes(e.target.value)}
              placeholder={isEs ? 'Restricciones conocidas (ej. sin pollo, dieta renal...)' : 'Known restrictions...'}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-[#1C2B21] min-h-[42px]"
            />
          </div>

          {specialState !== 'none' && (
            <div className="bg-[#FFFBEB] p-3 rounded-xl border border-[#D97706]/30 text-xs text-[#92400E] space-y-1">
              <span className="font-bold">⚠️ {isEs ? 'Aviso médico de seguridad:' : 'Medical safety note:'}</span>
              <p>
                {isEs
                  ? 'Ración App no genera dietas terapéuticas para patologías. Podrás ingresar la pauta calórica prescrita por tu veterinario para bloquear el plan y generar el informe clínico.'
                  : 'Ración App does not formulate therapeutic diets. You can enter the exact calorie guideline prescribed by your vet to lock the plan and print reports.'}
              </p>
            </div>
          )}

          </div>

          {/* Sticky Footer Submit */}
          <div className="px-4 sm:px-6 py-3 border-t border-gray-100 bg-white shrink-0">
            <button
              type="submit"
              className="w-full min-h-[48px] sm:min-h-[52px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 hover:bg-[#094723] transition active:scale-98 shadow-md"
            >
              <Check className="w-5 h-5" />
              <span>{isEs ? 'Guardar mascota' : 'Save pet'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
