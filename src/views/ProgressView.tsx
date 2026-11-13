import React, { useState } from 'react';
import { Pet, WeightRecord, HealthLog, FeedingPlan, UserAccount } from '../types';
import { StorageService } from '../utils/storage';
import { formatWeight, formatRation } from '../utils/i18n';
import { calculateRER, determineFactor } from '../utils/calculator';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { jsPDF } from 'jspdf';
import {
  TrendingUp,
  Plus,
  Scale,
  Calendar,
  Check,
  AlertCircle,
  Sparkles,
  Camera,
  Activity,
  HeartPulse,
  Pill,
  Shield,
  FileSpreadsheet,
  FileText,
  Download,
  Share2,
  Stethoscope,
  CheckCircle2,
  Target,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { BCSSelector, BCS_PHOTOS } from '../components/BCSSelector';

interface ProgressViewProps {
  pet: Pet;
  plan?: FeedingPlan;
  weightRecords: WeightRecord[];
  healthLogs: HealthLog[];
  onAddWeightRecord: (record: WeightRecord) => void;
  onAddHealthLog: (log: HealthLog) => void;
  onUpdatePlanRation: (newGramsPerDay: number, newGramsPerMeal: number) => void;
  userAccount: UserAccount;
}

export const ProgressView: React.FC<ProgressViewProps> = ({
  pet,
  plan,
  weightRecords,
  healthLogs,
  onAddWeightRecord,
  onAddHealthLog,
  onUpdatePlanRation,
  userAccount,
}) => {
  const isEs = userAccount.language === 'es';
  const units = userAccount.units;

  // Modals
  const [showWeighModal, setShowWeighModal] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showBCSModal, setShowBCSModal] = useState(false);
  const [previewBcs, setPreviewBcs] = useState(pet.bcs);
  const [vetNameInput, setVetNameInput] = useState('');
  const [pdfDownloaded, setPdfDownloaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'weight' | 'growth' | 'health'>('weight');

  // Weighing inputs
  const [inputWeight, setInputWeight] = useState<number>(pet.currentWeightKg);
  const [inputDate, setInputDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [inputWaist, setInputWaist] = useState<string>('');
  const [inputNotes, setInputNotes] = useState<string>('');
  const [inputPhoto, setInputPhoto] = useState<string>('');

  // Auto-recalculation proposal modal (Section 5: Propose new ration, NEVER silently change it!)
  const [recalcProposal, setRecalcProposal] = useState<{
    oldGrams: number;
    newGrams: number;
    newGramsPerMeal: number;
  } | null>(null);

  // Health log form inputs
  const [healthType, setHealthType] = useState<HealthLog['type']>('vaccine');
  const [healthTitle, setHealthTitle] = useState('');
  const [healthNotes, setHealthNotes] = useState('');
  const [healthSeverity, setHealthSeverity] = useState<'normal' | 'attention' | 'alert'>('normal');

  // Sort weight records by date
  const sortedWeights = [...weightRecords].sort((a, b) => a.date.localeCompare(b.date));
  const latestWeight = sortedWeights[sortedWeights.length - 1]?.weightKg || pet.currentWeightKg;
  const previousWeight = sortedWeights.length >= 2 ? sortedWeights[sortedWeights.length - 2]?.weightKg : null;

  // Weight difference calculation
  const weightDiff = previousWeight !== null ? Number((latestWeight - previousWeight).toFixed(2)) : 0;
  const targetWeight = pet.targetWeightKg || pet.idealWeightKg || pet.currentWeightKg;
  const diffToTarget = Number((latestWeight - targetWeight).toFixed(2));

  // Determine warm human status (Brand Manual Page 9: "Vas bien", "Revisemos", "Alerta")
  const getStatus = () => {
    if (Math.abs(diffToTarget) <= 0.3) {
      return {
        word: isEs ? 'Vas bien' : 'On track',
        color: '#1E8A49',
        desc: isEs ? `En peso ideal meta (${formatWeight(targetWeight, units)})` : 'At ideal goal weight',
      };
    } else if (diffToTarget > 0 && weightDiff <= 0) {
      return {
        word: isEs ? 'Vas bien' : 'On track',
        color: '#1E8A49',
        desc: isEs ? `Bajó ${Math.abs(weightDiff * 1000)} g hacia su meta` : `Lost ${Math.abs(weightDiff)} kg towards goal`,
      };
    } else if (diffToTarget > 0 && weightDiff > 0.4) {
      return {
        word: isEs ? 'Revisemos' : "Let's review",
        color: '#D97706',
        desc: isEs ? `Subió ${weightDiff * 1000} g esta semana` : `Gained ${weightDiff} kg this week`,
      };
    } else {
      return {
        word: isEs ? 'Vas bien' : 'On track',
        color: '#1E8A49',
        desc: isEs ? 'Avanzando de forma constante' : 'Steady progress',
      };
    }
  };

  const status = getStatus();

  // Handle Save New Weight
  const handleSaveWeight = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputWeight || inputWeight <= 0) return;

    const newRecord: WeightRecord = {
      id: 'weight_' + Date.now(),
      petId: pet.id,
      date: inputDate,
      weightKg: Number(inputWeight),
      waistCm: inputWaist ? Number(inputWaist) : undefined,
      photoUrl: inputPhoto,
      notes: inputNotes,
    };

    onAddWeightRecord(newRecord);
    setShowWeighModal(false);

    // AUTO-RECALCULATION LOGIC:
    // When a new weight is saved, calculate what the new ration would be.
    // If it differs, PROPOSE it to the user with confirm/dismiss modal! (Never change silently).
    if (plan && plan.foodId) {
      const isOverweight = pet.bcs >= 7;
      const weightForCalc = isOverweight ? (pet.targetWeightKg || inputWeight * 0.9) : inputWeight;
      const newRer = calculateRER(weightForCalc);
      const { factor } = determineFactor(pet, pet.bcs >= 7 ? 'lose' : 'maintain', pet.bcs);
      const newMer = Math.round(newRer * factor);

      // Kcal per gram from dry food or default
      const kcalPerKg = plan.dryFood?.kcalPerKg || (plan.mer / (plan.gramsPerDay || 200) * 1000);
      const kcalPerG = kcalPerKg / 1000;
      const newGramsDay = Math.round(newMer / kcalPerG);
      const newGramsMeal = Math.round(newGramsDay / plan.mealsPerDay);

      if (Math.abs(newGramsDay - plan.gramsPerDay) >= 3) {
        setRecalcProposal({
          oldGrams: plan.gramsPerDay,
          newGrams: newGramsDay,
          newGramsPerMeal: newGramsMeal,
        });
      }
    }
  };

  const handleApplyRecalc = () => {
    if (recalcProposal) {
      onUpdatePlanRation(recalcProposal.newGrams, recalcProposal.newGramsPerMeal);
      setRecalcProposal(null);
    }
  };

  const handleSaveHealthLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!healthTitle.trim()) return;

    const newLog: HealthLog = {
      id: 'hl_' + Date.now(),
      petId: pet.id,
      date: new Date().toISOString().split('T')[0],
      type: healthType,
      title: healthTitle.trim(),
      notes: healthNotes.trim(),
      severity: healthSeverity,
    };

    onAddHealthLog(newLog);
    setHealthTitle('');
    setHealthNotes('');
    setShowHealthModal(false);
  };

  // Generate Comprehensive Clinical & Health PDF Report for Veterinarian
  const handleGenerateVetReportPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 14;
    const contentWidth = pageWidth - margin * 2; // 182mm

    let y = 0;

    // 1. Top Branded Header
    doc.setFillColor(11, 93, 46); // Brand Green #0B5D2E
    doc.rect(0, 0, pageWidth, 26, 'F');

    // Subtle Brand Orange Accent Line #F57C1A
    doc.setFillColor(245, 124, 26);
    doc.rect(0, 26, pageWidth, 2.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(
      isEs ? 'Ración App • Informe Clínico y Nutricional' : 'Ración App • Clinical & Nutritional Report',
      margin,
      13
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      isEs
        ? 'Historial de peso, condición corporal (BCS), plan nutricional y diario de salud'
        : 'Weight history, body condition score (BCS), nutritional plan & health log',
      margin,
      20
    );

    const nowFormatted = new Date().toLocaleDateString(isEs ? 'es-ES' : 'en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    doc.text(
      `${isEs ? 'Fecha:' : 'Date:'} ${nowFormatted}`,
      pageWidth - margin - 35,
      13
    );

    y = 35;

    // Optional customized Vet / Clinic recipient banner
    if (vetNameInput.trim()) {
      doc.setFillColor(234, 244, 236); // #EAF4EC
      doc.roundedRect(margin, y, contentWidth, 8, 2, 2, 'F');
      doc.setTextColor(11, 93, 46);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(
        `${isEs ? 'Profesional / Clínica destinataria:' : 'Recipient Veterinarian / Clinic:'} ${vetNameInput.trim()}`,
        margin + 4,
        y + 5.5
      );
      y += 12;
    }

    // 2. Patient Profile Box
    doc.setFillColor(248, 250, 248);
    doc.setDrawColor(11, 93, 46);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, contentWidth, 34, 3, 3, 'FD');

    doc.setTextColor(11, 93, 46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const speciesLabel = pet.species === 'dog' ? (isEs ? 'Canino' : 'Canine') : (isEs ? 'Felino' : 'Feline');
    doc.text(`${pet.name} (${speciesLabel})`, margin + 4, y + 7);

    doc.setTextColor(68, 84, 74);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    const sexStr = pet.sex === 'male' ? (isEs ? 'Macho' : 'Male') : (isEs ? 'Hembra' : 'Female');
    const neuteredStr = pet.isNeutered ? (isEs ? 'Castrado/a' : 'Neutered') : (isEs ? 'Entero/a' : 'Intact');
    const ageStr = pet.ageYears ? `${pet.ageYears} ${isEs ? 'años' : 'years'}` : (isEs ? 'Adulto' : 'Adult');
    doc.text(
      `${isEs ? 'Raza:' : 'Breed:'} ${pet.breed || 'Mestizo'}  |  ${sexStr} (${neuteredStr})  |  ${isEs ? 'Edad:' : 'Age:'} ${ageStr}`,
      margin + 4,
      y + 14
    );

    // Weight & Body Condition Score
    const currentWtStr = formatWeight(latestWeight, units);
    const targetWtStr = formatWeight(targetWeight, units);
    const bcsDesc =
      pet.bcs <= 3
        ? (isEs ? 'Bajo peso' : 'Underweight')
        : pet.bcs <= 5
        ? (isEs ? 'Peso ideal' : 'Ideal weight')
        : pet.bcs <= 6
        ? (isEs ? 'Leve sobrepeso' : 'Slight overweight')
        : (isEs ? 'Sobrepeso / Obesidad' : 'Overweight');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(28, 43, 33);
    doc.text(`${isEs ? 'Peso Actual:' : 'Current Weight:'} ${currentWtStr}`, margin + 4, y + 22);
    doc.text(`${isEs ? 'Meta / Ideal:' : 'Target / Ideal:'} ${targetWtStr}`, margin + 60, y + 22);
    doc.text(`BCS (WSAVA): ${pet.bcs}/9 (${bcsDesc})`, margin + 115, y + 22);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(68, 84, 74);
    const conditionStr =
      pet.specialState && pet.specialState !== 'none'
        ? pet.specialState.toUpperCase()
        : (isEs ? 'Sano / Sin patología declarada' : 'Healthy / None');
    doc.text(
      `${isEs ? 'Condición Médica:' : 'Medical State:'} ${conditionStr}  |  ${isEs ? 'Nivel Actividad:' : 'Activity Level:'} ${pet.activityLevel}`,
      margin + 4,
      y + 29
    );

    y += 39;

    // 3. Nutritional Plan Summary
    if (plan) {
      doc.setFillColor(11, 93, 46);
      doc.rect(margin, y, contentWidth, 6, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(
        isEs ? 'PLAN DE ALIMENTACIÓN ACTIVO (Estándares NRC 2006 / WSAVA)' : 'ACTIVE NUTRITIONAL PLAN (NRC 2006 / WSAVA)',
        margin + 3,
        y + 4.2
      );
      y += 8;

      doc.setFillColor(250, 252, 250);
      doc.setDrawColor(200, 215, 204);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, contentWidth, 18, 'FD');

      doc.setTextColor(28, 43, 33);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(
        `${isEs ? 'Alimento configurado:' : 'Configured Food:'} ${plan.foodBrand || ''} ${plan.foodName || ''} (${plan.foodType || 'seco'})`,
        margin + 3,
        y + 5
      );

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(68, 84, 74);
      const rationStr = `${plan.gramsPerDay || 0} g/día (repartido en ${plan.mealsPerDay || 2} comidas de ${plan.gramsPerMeal || 0} g)`;
      doc.text(`${isEs ? 'Ración recomendada:' : 'Daily Ration:'} ${rationStr}`, margin + 3, y + 10);
      doc.text(
        `RER: ${plan.rer || 0} kcal/día  |  Factor: ${plan.factor || 1.6}  |  MER: ${plan.mer || 0} kcal/día  |  ${isEs ? 'Límite premios:' : 'Treats budget:'} ${plan.treatsBudgetKcal || 0} kcal/día`,
        margin + 3,
        y + 15
      );

      y += 23;
    }

    // 4. Weight History Table
    doc.setFillColor(11, 93, 46);
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(isEs ? 'HISTORIAL CRONOLÓGICO DE PESAJES' : 'CHRONOLOGICAL WEIGHT LOG', margin + 3, y + 4.2);
    y += 7;

    // Table header
    doc.setFillColor(234, 244, 236);
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setTextColor(11, 93, 46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(isEs ? 'Fecha' : 'Date', margin + 3, y + 4.2);
    doc.text(isEs ? 'Peso Medido' : 'Weight', margin + 35, y + 4.2);
    doc.text(isEs ? 'Var. Ant.' : 'Diff', margin + 65, y + 4.2);
    doc.text(isEs ? 'Cintura' : 'Waist', margin + 90, y + 4.2);
    doc.text(isEs ? 'Observaciones / Notas' : 'Notes', margin + 115, y + 4.2);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(28, 43, 33);
    doc.setFontSize(8);

    const displayWeights = sortedWeights.slice(-10);
    displayWeights.forEach((rec, idx) => {
      if (y > 260) {
        doc.addPage();
        y = 15;
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 248);
        doc.rect(margin, y - 4, contentWidth, 5.5, 'F');
      }

      const prevRec = idx > 0 ? displayWeights[idx - 1] : null;
      const diffVal = prevRec ? (rec.weightKg - prevRec.weightKg).toFixed(2) : '-';
      const diffStr = diffVal === '-' ? '-' : (Number(diffVal) > 0 ? `+${diffVal} kg` : `${diffVal} kg`);

      doc.text(rec.date, margin + 3, y);
      doc.text(formatWeight(rec.weightKg, units), margin + 35, y);
      doc.text(diffStr, margin + 65, y);
      doc.text(rec.waistCm ? `${rec.waistCm} cm` : '-', margin + 90, y);
      doc.text(rec.notes ? rec.notes.substring(0, 38) : '-', margin + 115, y);

      y += 5.5;
    });

    y += 5;

    // 5. Health Log Table (Vaccines, Medications, Vet Visits, Symptoms)
    if (y > 230) {
      doc.addPage();
      y = 15;
    }

    doc.setFillColor(11, 93, 46);
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(isEs ? 'DIARIO DE SALUD, VACUNAS Y EVENTOS CLÍNICOS' : 'HEALTH, VACCINES & CLINICAL EVENTS', margin + 3, y + 4.2);
    y += 7;

    // Table header
    doc.setFillColor(234, 244, 236);
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setTextColor(11, 93, 46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(isEs ? 'Fecha' : 'Date', margin + 3, y + 4.2);
    doc.text(isEs ? 'Tipo de Evento' : 'Event Type', margin + 35, y + 4.2);
    doc.text(isEs ? 'Título / Diagnóstico' : 'Title / Event', margin + 70, y + 4.2);
    doc.text(isEs ? 'Notas Clínicas' : 'Clinical Notes', margin + 120, y + 4.2);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(28, 43, 33);
    doc.setFontSize(8);

    const displayHealth = healthLogs.slice(-8);
    if (displayHealth.length === 0) {
      doc.text(isEs ? 'Sin eventos de salud adicionales registrados recientemente.' : 'No additional health events logged.', margin + 3, y);
      y += 6;
    } else {
      displayHealth.forEach((hl, idx) => {
        if (y > 260) {
          doc.addPage();
          y = 15;
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 248);
          doc.rect(margin, y - 4, contentWidth, 5.5, 'F');
        }

        const typeLabel =
          hl.type === 'vaccine'
            ? (isEs ? 'Vacuna' : 'Vaccine')
            : hl.type === 'deworming'
            ? (isEs ? 'Desparasitación' : 'Deworming')
            : hl.type === 'medication'
            ? (isEs ? 'Medicación' : 'Medication')
            : hl.type === 'vet_visit'
            ? (isEs ? 'Visita Vet' : 'Vet Visit')
            : hl.type === 'symptom'
            ? (isEs ? 'Síntoma' : 'Symptom')
            : (isEs ? 'Digestión' : 'Stool/Digestion');

        doc.text(hl.date, margin + 3, y);
        doc.text(typeLabel, margin + 35, y);
        doc.text(hl.title.substring(0, 30), margin + 70, y);
        doc.text(hl.notes ? hl.notes.substring(0, 35) : '-', margin + 120, y);

        y += 5.5;
      });
    }

    y += 5;

    // 6. Section for Veterinarian Notes and Stamp
    if (y > 240) {
      doc.addPage();
      y = 15;
    }

    doc.setDrawColor(200, 215, 204);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'D');

    doc.setTextColor(11, 93, 46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(isEs ? 'OBSERVACIONES Y AJUSTES DEL MÉDICO VETERINARIO:' : 'VETERINARIAN OBSERVATIONS & PRESCRIPTIONS:', margin + 3, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 190, 185);
    doc.text('..........................................................................................................................................................................', margin + 3, y + 11);
    doc.text('..........................................................................................................................................................................', margin + 3, y + 17);

    doc.setTextColor(68, 84, 74);
    doc.setFontSize(7.5);
    doc.text(
      isEs
        ? 'Firma y Sello del Profesional: __________________________   Fecha: _____/_____/_________'
        : 'Doctor Signature & Stamp: __________________________   Date: _____/_____/_________',
      margin + 3,
      y + 22
    );

    // 7. Clinical Disclaimer at Bottom
    doc.setFillColor(234, 244, 236);
    doc.roundedRect(margin, pageHeight - 19, contentWidth, 12, 2, 2, 'F');
    doc.setTextColor(68, 84, 74);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.text(
      isEs
        ? 'AVISO CLÍNICO: Ración App es una herramienta de cálculo nutricional y seguimiento basada en NRC 2006, WSAVA y AAHA.'
        : 'CLINICAL NOTICE: Ración App is an educational nutrition and monitoring tool based on NRC 2006, WSAVA, and AAHA.',
      margin + 3,
      pageHeight - 14
    );
    doc.text(
      isEs
        ? 'Este informe no reemplaza el examen clínico presencial ni la prescripción médica de un médico veterinario con matrícula vigente.'
        : 'This report does not replace clinical physical examination or prescriptions by a licensed veterinarian.',
      margin + 3,
      pageHeight - 9.5
    );

    const cleanName = pet.name.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Informe_Veterinario_${cleanName}_${new Date().toISOString().split('T')[0]}.pdf`);
    setPdfDownloaded(true);
    setTimeout(() => setPdfDownloaded(false), 4000);
  };

  const handleShareVetReportWhatsApp = () => {
    const currentWtStr = formatWeight(latestWeight, units);
    const targetWtStr = formatWeight(targetWeight, units);
    const text = encodeURIComponent(
      isEs
        ? `Hola doctor/a! Le comparto el historial de peso y salud de ${pet.name} desde Ración App:\n` +
          `🐾 Mascota: ${pet.name} (${pet.species === 'dog' ? 'Canino' : 'Felino'}, ${pet.breed})\n` +
          `⚖️ Peso actual: ${currentWtStr} | Meta: ${targetWtStr} | BCS: ${pet.bcs}/9\n` +
          `🥣 Ración actual: ${plan?.gramsPerDay || 0} g/día (${plan?.foodBrand || ''} ${plan?.foodName || ''})\n` +
          `📅 Pesajes registrados: ${sortedWeights.length} mediciones\n` +
          `🩺 Eventos de salud: ${healthLogs.length} registros (vacunas/visitas/síntomas)`
        : `Hello Doctor! Sharing weight & health history for ${pet.name} from Ración App:\n` +
          `🐾 Pet: ${pet.name} (${pet.breed})\n` +
          `⚖️ Current weight: ${currentWtStr} | Target: ${targetWtStr} | BCS: ${pet.bcs}/9\n` +
          `🥣 Daily ration: ${plan?.gramsPerDay || 0} g/day\n` +
          `📅 Weight records: ${sortedWeights.length} entries\n` +
          `🩺 Health events: ${healthLogs.length} entries`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  // Recharts data preparation: mapping records into formatted timeline points with delta calculation
  const currentDeltaToIdeal = Number((latestWeight - targetWeight).toFixed(2));
  const currentDeltaPercent = Number((((latestWeight - targetWeight) / targetWeight) * 100).toFixed(1));

  const chartData = React.useMemo(() => {
    const records: WeightRecord[] = sortedWeights.length > 0
      ? sortedWeights
      : [{ id: 'init', petId: pet.id, date: new Date().toISOString().split('T')[0], weightKg: pet.currentWeightKg }];

    const mapped = records.map((w) => {
      const d = new Date(w.date + 'T12:00:00');
      const formattedDate = isNaN(d.getTime())
        ? w.date
        : d.toLocaleDateString(isEs ? 'es-ES' : 'en-US', { day: 'numeric', month: 'short' });

      const pesoVal = Number(w.weightKg.toFixed(2));
      const targetVal = Number(targetWeight.toFixed(2));
      const delta = Number((pesoVal - targetVal).toFixed(2));
      const deltaPct = targetVal > 0 ? Number(((delta / targetVal) * 100).toFixed(1)) : 0;

      return {
        date: formattedDate,
        fullDate: w.date,
        peso: pesoVal,
        pesoIdeal: targetVal,
        deltaToIdeal: delta,
        deltaPercent: deltaPct,
        waist: w.waistCm,
        notes: w.notes,
      };
    });

    // If there is only 1 entry, synthesize a baseline starting point 14 days earlier
    // so Recharts Area/Line renders a visible path across the timeline
    if (mapped.length === 1) {
      const single = mapped[0];
      const singleDate = new Date(records[0].date + 'T12:00:00');
      const baseDate = new Date(singleDate.getTime() - 14 * 86400000);
      const baseLabel = isNaN(baseDate.getTime())
        ? (isEs ? 'Inicio' : 'Start')
        : baseDate.toLocaleDateString(isEs ? 'es-ES' : 'en-US', { day: 'numeric', month: 'short' });

      return [
        {
          ...single,
          date: baseLabel,
          notes: isEs ? 'Punto de partida' : 'Starting baseline',
        },
        single,
      ];
    }

    return mapped;
  }, [sortedWeights, targetWeight, pet.currentWeightKg, isEs]);

  // Target Date Calculator: Linear Regression (OLS) over historical weightRecords
  const targetDateProjection = React.useMemo(() => {
    const sorted = [...sortedWeights];
    const n = sorted.length;
    const latestRec = sorted[n - 1];
    const latestWt = latestRec ? latestRec.weightKg : pet.currentWeightKg;
    const targetWt = targetWeight;
    const neededChange = Number((targetWt - latestWt).toFixed(2));

    // Case 1: Target reached (within 0.15 kg)
    if (Math.abs(neededChange) <= 0.15) {
      return {
        state: 'already_reached' as const,
        slopePerDay: 0,
        weeklyRateKg: 0,
        rSquared: 1,
        targetDate: null,
        daysRemaining: 0,
        weeksRemaining: 0,
        targetWeightKg: targetWt,
        latestWeightKg: latestWt,
        neededChangeKg: neededChange,
        recordsCount: n,
      };
    }

    // Case 2: Insufficient historical records (< 2 entries)
    if (n < 2) {
      return {
        state: 'insufficient_data' as const,
        slopePerDay: 0,
        weeklyRateKg: 0,
        rSquared: 0,
        targetDate: null,
        daysRemaining: null,
        weeksRemaining: null,
        targetWeightKg: targetWt,
        latestWeightKg: latestWt,
        neededChangeKg: neededChange,
        recordsCount: n,
      };
    }

    // Convert dates into days elapsed from earliest weigh-in
    const t0 = new Date(sorted[0].date + 'T12:00:00').getTime();
    const points = sorted.map((r) => {
      const d = new Date(r.date + 'T12:00:00').getTime();
      return {
        t: (d - t0) / 86400000, // days elapsed
        y: r.weightKg,
      };
    });

    const meanT = points.reduce((acc, p) => acc + p.t, 0) / n;
    const meanY = points.reduce((acc, p) => acc + p.y, 0) / n;

    let ssTT = 0;
    let ssTY = 0;
    let ssYY = 0;

    for (const p of points) {
      const dt = p.t - meanT;
      const dy = p.y - meanY;
      ssTT += dt * dt;
      ssTY += dt * dy;
      ssYY += dy * dy;
    }

    // If all records were recorded on the same date
    if (ssTT === 0) {
      return {
        state: 'insufficient_data' as const,
        slopePerDay: 0,
        weeklyRateKg: 0,
        rSquared: 0,
        targetDate: null,
        daysRemaining: null,
        weeksRemaining: null,
        targetWeightKg: targetWt,
        latestWeightKg: latestWt,
        neededChangeKg: neededChange,
        recordsCount: n,
      };
    }

    // Slope m (kg / day) and intercept b (kg)
    const slope = ssTY / ssTT;
    const intercept = meanY - slope * meanT;
    const rSquared = ssYY > 0 ? Math.max(0, Math.min(1, (ssTY * ssTY) / (ssTT * ssYY))) : 1;

    const weeklyRateKg = Number((slope * 7).toFixed(3));
    const isVirtuallyFlat = Math.abs(slope) < 0.0007; // < ~5g / week

    const latestT = points[n - 1].t;
    // Solve targetWt = slope * targetT + intercept => targetT = (targetWt - intercept) / slope
    const targetT = (targetWt - intercept) / slope;
    const daysRemaining = Math.round(targetT - latestT);

    // Direction verification:
    // If neededChange < 0 (needs to lose weight), slope must be negative (< -0.0007).
    // If neededChange > 0 (needs to gain weight), slope must be positive (> 0.0007).
    const isMovingTowards =
      (neededChange < 0 && slope < -0.0007) ||
      (neededChange > 0 && slope > 0.0007);

    if (isVirtuallyFlat) {
      return {
        state: 'stable' as const,
        slopePerDay: slope,
        weeklyRateKg,
        rSquared,
        targetDate: null,
        daysRemaining: null,
        weeksRemaining: null,
        targetWeightKg: targetWt,
        latestWeightKg: latestWt,
        neededChangeKg: neededChange,
        recordsCount: n,
      };
    }

    if (!isMovingTowards || daysRemaining <= 0) {
      return {
        state: 'moving_away' as const,
        slopePerDay: slope,
        weeklyRateKg,
        rSquared,
        targetDate: null,
        daysRemaining: null,
        weeksRemaining: null,
        targetWeightKg: targetWt,
        latestWeightKg: latestWt,
        neededChangeKg: neededChange,
        recordsCount: n,
      };
    }

    // Valid projected target date
    const latestDateTimestamp = new Date(sorted[n - 1].date + 'T12:00:00').getTime();
    const projectedTargetDate = new Date(latestDateTimestamp + daysRemaining * 86400000);
    const weeksRemaining = Math.max(1, Math.round(daysRemaining / 7));

    return {
      state: 'on_track' as const,
      slopePerDay: slope,
      weeklyRateKg,
      rSquared,
      targetDate: projectedTargetDate,
      daysRemaining,
      weeksRemaining,
      targetWeightKg: targetWt,
      latestWeightKg: latestWt,
      neededChangeKg: neededChange,
      recordsCount: n,
    };
  }, [sortedWeights, targetWeight, pet.currentWeightKg]);

  return (
    <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
      {/* View Switcher: Peso / Crecimiento / Salud */}
      <div className="flex bg-[#EAF4EC] p-1 rounded-2xl">
        {[
          { id: 'weight', label: isEs ? 'Control de peso' : 'Weight tracking' },
          { id: 'growth', label: isEs ? 'Crecimiento' : 'Growth' },
          { id: 'health', label: isEs ? 'Salud y vacunas' : 'Health log' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition min-h-[44px] ${
              activeTab === tab.id
                ? 'bg-[#0B5D2E] text-white shadow-xs'
                : 'text-[#44544A] hover:text-[#0B5D2E]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action Card: Generar Reporte PDF para el Veterinario */}
      <div className="bg-white rounded-3xl p-4 border border-[#0B5D2E20] shadow-sm flex items-center justify-between gap-3 transition-all">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-[#EAF4EC] text-[#0B5D2E] shrink-0">
            <Stethoscope className="w-5 h-5 text-[#0B5D2E]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading font-extrabold text-base text-[#1C2B21]">
                {isEs ? 'Informe para el Veterinario' : 'Veterinarian Report'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E20]">
                PDF
              </span>
            </div>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs
                ? 'Historial de peso, plan de comida y vacunas listo para consulta'
                : 'Weight logs, nutrition plan & health events ready for clinic'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowPdfModal(true)}
          className="px-3.5 py-2.5 bg-[#0B5D2E] text-white rounded-xl font-heading font-extrabold text-xs flex items-center gap-1.5 shadow-sm hover:bg-[#094723] transition shrink-0 min-h-[44px] active:scale-95"
        >
          <FileText className="w-4 h-4" />
          <span>{isEs ? 'Reporte PDF' : 'PDF Report'}</span>
        </button>
      </div>

      {/* ================= TAB 1: WEIGHT TRACKING & CHART ================= */}
      {activeTab === 'weight' && (
        <div className="space-y-4">
          {/* Hero weight card */}
          <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-[#44544A] uppercase tracking-wider">
                  {isEs ? 'Peso actual' : 'Current weight'}
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="font-heading font-black text-4xl text-[#1C2B21]">
                    {formatWeight(latestWeight, units)}
                  </span>
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-extrabold text-white"
                    style={{ backgroundColor: status.color }}
                  >
                    {status.word}
                  </span>
                </div>
                <p className="text-xs text-[#44544A] mt-1">{status.desc}</p>
              </div>

              {/* Big [+ Pesar hoy] button (Rule 5: One big primary button) */}
              <button
                type="button"
                onClick={() => setShowWeighModal(true)}
                className="min-h-[52px] px-4 py-2.5 bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center gap-1.5 shadow-md hover:bg-[#094723] transition active:scale-95"
              >
                <Plus className="w-5 h-5" />
                <span>{isEs ? '+ Pesar hoy' : '+ Weigh today'}</span>
              </button>
            </div>

            {/* Target line & frequency guidance */}
            <div className="flex justify-between items-center bg-[#EAF4EC] p-3 rounded-2xl text-xs">
              <span className="font-semibold text-[#0B5D2E]">
                🎯 {isEs ? 'Meta veterinaria:' : 'Target:'} <strong>{formatWeight(targetWeight, units)}</strong>
              </span>
              <span className="text-[#44544A]">
                {isEs ? 'Frecuencia: cada 2-4 sem' : 'Weigh every 2-4 wks'}
              </span>
            </div>

            {/* Recharts Data Visualization Component with Delta Highlighting */}
            <div className="border border-gray-100 rounded-3xl p-4 bg-[#F8FAF8] shadow-xs space-y-3.5">
              {/* Header with Title and Visual Legend */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-[#44544A] uppercase tracking-wider block">
                    {isEs ? 'Tendencia Temporal vs Peso Ideal' : 'Weight Trend vs Ideal Weight'}
                  </span>
                  <span className="text-xs text-[#0B5D2E] font-semibold">
                    {isEs ? 'Evolución con Recharts y cálculo diferencial (Delta)' : 'Recharts evolution & differential calculation (Delta)'}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 text-[11px]">
                  <div className="flex items-center gap-1.5 font-bold text-[#0B5D2E]">
                    <span className="w-3 h-1 bg-[#0B5D2E] rounded-full inline-block" />
                    <span>{isEs ? 'Registrado' : 'Recorded'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-[#1E8A49]">
                    <span className="w-3 h-0.5 border-t-2 border-dashed border-[#1E8A49] inline-block" />
                    <span>{isEs ? 'Ideal' : 'Ideal'}</span>
                  </div>
                </div>
              </div>

              {/* Prominent Delta Highlight Card */}
              <div className="bg-white p-3.5 rounded-2xl border border-[#0B5D2E20] shadow-2xs grid grid-cols-3 gap-2 text-center">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-gray-500 block">
                    {isEs ? 'Peso Actual' : 'Current'}
                  </span>
                  <span className="font-heading font-black text-base text-[#1C2B21]">
                    {formatWeight(latestWeight, units)}
                  </span>
                </div>

                <div className="space-y-0.5 border-x border-gray-100">
                  <span className="text-[10px] uppercase font-bold text-gray-500 block">
                    {isEs ? 'Peso Ideal' : 'Ideal Target'}
                  </span>
                  <span className="font-heading font-black text-base text-[#1E8A49]">
                    {formatWeight(targetWeight, units)}
                  </span>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-gray-500 block">
                    {isEs ? 'Diferencia (Delta)' : 'Delta to Ideal'}
                  </span>
                  <span
                    className={`font-heading font-black text-base inline-flex items-center justify-center gap-0.5 ${
                      Math.abs(currentDeltaToIdeal) <= 0.2
                        ? 'text-[#1E8A49]'
                        : currentDeltaToIdeal > 0
                        ? 'text-[#F57C1A]'
                        : 'text-[#3B82F6]'
                    }`}
                  >
                    {currentDeltaToIdeal > 0 ? `+${currentDeltaToIdeal}` : currentDeltaToIdeal} {units === 'imperial' ? 'lb' : 'kg'}
                  </span>
                </div>
              </div>

              {/* Responsive Container with Recharts Chart */}
              <div className="w-full h-56 pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 16, right: 12, left: -18, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0B5D2E" stopOpacity={0.30} />
                        <stop offset="95%" stopColor="#0B5D2E" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0B5D2E15" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#44544A', fontWeight: 600 }}
                      axisLine={{ stroke: '#0B5D2E20' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[
                        (dataMin: number) => Math.max(0, Math.floor(Math.min(dataMin, targetWeight) - 0.5)),
                        (dataMax: number) => Math.ceil(Math.max(dataMax, targetWeight) + 0.5),
                      ]}
                      tick={{ fontSize: 10, fill: '#44544A', fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      unit={units === 'imperial' ? 'lb' : 'kg'}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const delta = data.deltaToIdeal;
                          const isIdeal = Math.abs(delta) <= 0.2;
                          return (
                            <div className="bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-[#0B5D2E20] text-xs space-y-1.5 min-w-[170px]">
                              <div className="flex items-center justify-between border-b border-gray-100 pb-1">
                                <span className="font-heading font-black text-sm text-[#0B5D2E]">
                                  {formatWeight(data.peso, units)}
                                </span>
                                <span className="text-[10px] text-[#44544A] font-semibold">{data.date}</span>
                              </div>
                              <div className="space-y-1 pt-0.5 text-[11px]">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">{isEs ? 'Peso Ideal:' : 'Ideal Target:'}</span>
                                  <span className="font-bold text-[#1E8A49]">{formatWeight(data.pesoIdeal, units)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-500">{isEs ? 'Diferencia (Δ):' : 'Delta (Δ):'}</span>
                                  <span
                                    className={`font-black px-1.5 py-0.5 rounded text-[10px] ${
                                      isIdeal
                                        ? 'bg-[#EAF4EC] text-[#1E8A49]'
                                        : delta > 0
                                        ? 'bg-[#FFF7ED] text-[#D97706]'
                                        : 'bg-[#EFF6FF] text-[#3B82F6]'
                                    }`}
                                  >
                                    {delta > 0 ? `+${delta}` : delta} kg ({data.deltaPercent > 0 ? `+${data.deltaPercent}%` : `${data.deltaPercent}%`})
                                  </span>
                                </div>
                                {data.waist && (
                                  <div className="flex justify-between text-gray-600">
                                    <span>{isEs ? 'Cintura:' : 'Waist:'}</span>
                                    <span className="font-semibold">{data.waist} cm</span>
                                  </div>
                                )}
                                {data.notes && (
                                  <p className="text-[10px] text-[#0B5D2E] italic pt-1 border-t border-gray-50">
                                    "{data.notes}"
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine
                      y={targetWeight}
                      stroke="#1E8A49"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      label={{
                        value: `${isEs ? '🎯 Meta Ideal' : '🎯 Ideal Goal'} (${formatWeight(targetWeight, units)})`,
                        position: 'insideTopRight',
                        fill: '#1E8A49',
                        fontSize: 10,
                        fontWeight: 'bold',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="peso"
                      name={isEs ? 'Peso Registrado' : 'Recorded Weight'}
                      stroke="#0B5D2E"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#weightGradient)"
                      activeDot={{ r: 6, fill: '#F57C1A', stroke: '#FFFFFF', strokeWidth: 2 }}
                      dot={{ r: 4, fill: '#0B5D2E', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Progress Bar & Delta Summary Footer */}
              <div className="bg-[#EAF4EC] p-3 rounded-2xl border border-[#0B5D2E15] space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-[#0B5D2E]">
                    {Math.abs(currentDeltaToIdeal) <= 0.2
                      ? (isEs ? '🎉 ¡Mascota en su peso ideal exacto!' : '🎉 Pet is at exact ideal weight!')
                      : currentDeltaToIdeal > 0
                      ? (isEs ? `Faltan ${currentDeltaToIdeal} kg para alcanzar el peso ideal` : `${currentDeltaToIdeal} kg left to reach ideal weight`)
                      : (isEs ? `${Math.abs(currentDeltaToIdeal)} kg por debajo del peso ideal recomendado` : `${Math.abs(currentDeltaToIdeal)} kg below recommended ideal weight`)}
                  </span>
                  <span className="text-[11px] font-extrabold text-[#44544A]">
                    {sortedWeights.length} {isEs ? 'registros' : 'records'}
                  </span>
                </div>

                {/* Visual Delta Scale Bar */}
                <div className="w-full bg-white/80 h-2.5 rounded-full overflow-hidden p-0.5 border border-[#0B5D2E20]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(10, 100 - Math.abs(currentDeltaToIdeal / targetWeight) * 100))}%`,
                      backgroundColor: Math.abs(currentDeltaToIdeal) <= 0.2 ? '#1E8A49' : '#F57C1A',
                    }}
                  />
                </div>
              </div>

              {/* Informative 'Target Date' Label / Calculator based on Linear Regression */}
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  targetDateProjection.state === 'on_track'
                    ? 'bg-gradient-to-br from-[#EAF4EC] via-white to-[#EAF4EC]/40 border-[#1E8A49]/30 shadow-xs'
                    : targetDateProjection.state === 'already_reached'
                    ? 'bg-gradient-to-br from-[#EAF4EC] via-white to-[#F0FDF4] border-[#0B5D2E]/30 shadow-xs'
                    : targetDateProjection.state === 'moving_away'
                    ? 'bg-gradient-to-br from-[#FFF7ED] via-white to-[#FEF3C7] border-[#F57C1A]/30 shadow-xs'
                    : targetDateProjection.state === 'stable'
                    ? 'bg-gradient-to-br from-[#F8FAF8] to-white border-gray-200'
                    : 'bg-[#F8FAF8] border-dashed border-[#0B5D2E30]'
                }`}
              >
                {/* Header row: Icon, Title, and Badges */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                        targetDateProjection.state === 'on_track'
                          ? 'bg-[#1E8A49] text-white'
                          : targetDateProjection.state === 'already_reached'
                          ? 'bg-[#0B5D2E] text-white'
                          : targetDateProjection.state === 'moving_away'
                          ? 'bg-[#F57C1A] text-white'
                          : targetDateProjection.state === 'stable'
                          ? 'bg-[#44544A] text-white'
                          : 'bg-[#0B5D2E15] text-[#0B5D2E]'
                      }`}
                    >
                      {targetDateProjection.state === 'on_track' ? (
                        <Target className="w-4 h-4" />
                      ) : targetDateProjection.state === 'already_reached' ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : targetDateProjection.state === 'moving_away' ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : targetDateProjection.state === 'stable' ? (
                        <Scale className="w-4 h-4" />
                      ) : (
                        <Calendar className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-heading font-extrabold text-xs text-[#1C2B21]">
                          {isEs ? 'Fecha estimada para peso ideal' : 'Target Date Projection'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-white/90 text-[#0B5D2E] border border-[#0B5D2E20]">
                          {isEs ? 'Regresión Lineal' : 'Linear Regression'}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#44544A] font-medium block">
                        {targetDateProjection.state === 'insufficient_data'
                          ? (isEs ? 'Modelo predictivo por mínimos cuadrados (OLS)' : 'Ordinary least squares predictive model')
                          : (isEs
                              ? `Mínimos cuadrados (OLS) • ${targetDateProjection.recordsCount} pesajes analizados`
                              : `OLS regression • ${targetDateProjection.recordsCount} weigh-ins analyzed`)}
                      </span>
                    </div>
                  </div>

                  {/* Status Pills */}
                  {targetDateProjection.state === 'on_track' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#1E8A49] text-white shadow-2xs">
                      {isEs ? 'En trayectoria' : 'On Track'}
                    </span>
                  )}
                  {targetDateProjection.state === 'already_reached' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#0B5D2E] text-white">
                      {isEs ? '¡Meta Lograda!' : 'Goal Reached!'}
                    </span>
                  )}
                  {targetDateProjection.state === 'moving_away' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#F57C1A] text-white">
                      {isEs ? 'Divergente' : 'Divergent'}
                    </span>
                  )}
                  {targetDateProjection.state === 'stable' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gray-500 text-white">
                      {isEs ? 'Estable' : 'Stable'}
                    </span>
                  )}
                </div>

                {/* State: ON TRACK */}
                {targetDateProjection.state === 'on_track' && targetDateProjection.targetDate && (
                  <div className="space-y-2.5">
                    <div className="bg-white/90 p-3 rounded-xl border border-[#1E8A49]/20 shadow-2xs">
                      <div className="flex items-baseline justify-between flex-wrap gap-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-gray-500 block">
                            {isEs ? 'Fecha proyectada de llegada a la meta:' : 'Estimated Target Date:'}
                          </span>
                          <span className="font-heading font-black text-lg text-[#0B5D2E] flex items-center gap-1.5 mt-0.5">
                            <Calendar className="w-4 h-4 text-[#1E8A49] shrink-0" />
                            {targetDateProjection.targetDate.toLocaleDateString(isEs ? 'es-ES' : 'en-US', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-black text-[#1E8A49] block">
                            {isEs
                              ? `En ~${targetDateProjection.weeksRemaining} ${targetDateProjection.weeksRemaining === 1 ? 'semana' : 'semanas'} (${targetDateProjection.daysRemaining} días)`
                              : `In ~${targetDateProjection.weeksRemaining} ${targetDateProjection.weeksRemaining === 1 ? 'week' : 'weeks'} (${targetDateProjection.daysRemaining} days)`}
                          </span>
                          <span className="text-[10px] font-bold text-[#44544A] block">
                            {isEs ? 'Ritmo estimado:' : 'Estimated rate:'}{' '}
                            <span className="text-[#0B5D2E] font-black">
                              {units === 'imperial'
                                ? `${(targetDateProjection.weeklyRateKg * 2.20462).toFixed(2)} lb/${isEs ? 'sem' : 'wk'}`
                                : `${Math.round(targetDateProjection.weeklyRateKg * 1000)} g/${isEs ? 'sem' : 'wk'}`}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-1.5 text-[11px] text-[#44544A] leading-relaxed">
                      <Sparkles className="w-3.5 h-3.5 text-[#1E8A49] shrink-0 mt-0.5" />
                      <span>
                        {isEs
                          ? `Al ritmo constante de regresión de ${Math.abs(Math.round(targetDateProjection.weeklyRateKg * 1000))} g por semana, ${pet.name} alcanzará su meta de ${formatWeight(targetWeight, units)} de forma gradual y segura.`
                          : `At the continuous linear rate of ${Math.abs(Number((targetDateProjection.weeklyRateKg * (units === 'imperial' ? 2.20462 : 1)).toFixed(2)))} ${units === 'imperial' ? 'lb' : 'kg'} per week, ${pet.name} is on course to reach ${formatWeight(targetWeight, units)}.`}
                      </span>
                    </div>
                  </div>
                )}

                {/* State: ALREADY REACHED */}
                {targetDateProjection.state === 'already_reached' && (
                  <div className="bg-white/90 p-3 rounded-xl border border-[#0B5D2E]/20 space-y-1">
                    <p className="font-heading font-black text-sm text-[#0B5D2E] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#1E8A49]" />
                      {isEs ? `¡${pet.name} ya alcanzó su peso ideal!` : `¡${pet.name} is at ideal target weight!`}
                    </p>
                    <p className="text-[11px] text-[#44544A] leading-relaxed">
                      {isEs
                        ? `El peso registrado actual (${formatWeight(targetDateProjection.latestWeightKg, units)}) coincide plenamente con la meta veterinaria (${formatWeight(targetWeight, units)}). ¡Gran trabajo en familia!`
                        : `Current recorded weight (${formatWeight(targetDateProjection.latestWeightKg, units)}) matches the veterinary goal (${formatWeight(targetWeight, units)}). Excellent family care!`}
                    </p>
                  </div>
                )}

                {/* State: MOVING AWAY */}
                {targetDateProjection.state === 'moving_away' && (
                  <div className="bg-white/90 p-3 rounded-xl border border-[#F57C1A]/20 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-[#D97706] flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-[#F57C1A]" />
                        {isEs ? 'Tendencia divergente respecto a la meta' : 'Divergent trend from target'}
                      </span>
                      <span className="text-[11px] font-black text-[#F57C1A]">
                        {units === 'imperial'
                          ? `${targetDateProjection.weeklyRateKg > 0 ? '+' : ''}${(targetDateProjection.weeklyRateKg * 2.20462).toFixed(2)} lb/${isEs ? 'sem' : 'wk'}`
                          : `${targetDateProjection.weeklyRateKg > 0 ? '+' : ''}${Math.round(targetDateProjection.weeklyRateKg * 1000)} g/${isEs ? 'sem' : 'wk'}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#44544A] leading-relaxed">
                      {isEs
                        ? `La regresión lineal indica que el peso se está moviendo en sentido contrario a la meta de ${formatWeight(targetWeight, units)}. Te sugerimos revisar las porciones de premios o comida con el veterinario.`
                        : `Linear regression indicates the weight is shifting away from the ${formatWeight(targetWeight, units)} goal. Consider checking extra treats or consulting with your vet.`}
                    </p>
                  </div>
                )}

                {/* State: STABLE */}
                {targetDateProjection.state === 'stable' && (
                  <div className="bg-white/90 p-3 rounded-xl border border-gray-200 space-y-1">
                    <span className="font-heading font-extrabold text-xs text-[#1C2B21] flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-[#44544A]" />
                      {isEs ? 'Peso en meseta / mantenimiento' : 'Weight plateau / maintenance'}
                    </span>
                    <p className="text-[11px] text-[#44544A] leading-relaxed">
                      {isEs
                        ? `La regresión muestra una variación cercana a 0 g/semana en los últimos registros hacia la meta de ${formatWeight(targetWeight, units)}. Para reactivar el progreso, consulta con el veterinario un ajuste leve de ración o ejercicio.`
                        : `Regression shows nearly zero change per week towards the ${formatWeight(targetWeight, units)} target. To restart progress, consider consulting your vet about a slight food or exercise adjustment.`}
                    </p>
                  </div>
                )}

                {/* State: INSUFFICIENT DATA */}
                {targetDateProjection.state === 'insufficient_data' && (
                  <div className="bg-white/90 p-2.5 rounded-xl border border-[#0B5D2E15] text-center">
                    <p className="text-[11px] text-[#44544A] leading-relaxed">
                      {isEs
                        ? `Registra al menos 2 pesajes en fechas distintas para que la regresión lineal calcule automáticamente la fecha estimada de llegada a ${formatWeight(targetWeight, units)}.`
                        : `Log at least 2 weigh-ins on different dates for linear regression to estimate the target arrival date for ${formatWeight(targetWeight, units)}.`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Historical Weighing List */}
          <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
            <h3 className="font-heading font-extrabold text-base text-[#1C2B21]">
              {isEs ? 'Historial de pesajes' : 'Weighing history'}
            </h3>

            <div className="space-y-2">
              {sortedWeights.slice().reverse().map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#EAF4EC]/60 border border-[#0B5D2E15]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white text-[#0B5D2E] flex items-center justify-center font-bold text-xs border border-[#0B5D2E20]">
                      <Scale className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-heading font-extrabold text-sm text-[#1C2B21]">
                        {formatWeight(rec.weightKg, units)}
                        {rec.waistCm && (
                          <span className="text-xs text-[#44544A] ml-2 font-normal">
                            (Cintura: {rec.waistCm} cm)
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#44544A]">{rec.date}</span>
                    </div>
                  </div>

                  {rec.notes && (
                    <span className="text-xs text-[#0B5D2E] font-semibold max-w-[140px] truncate text-right">
                      {rec.notes}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* WSAVA Photographic Body Condition Reference Card */}
          <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-[11px] font-bold text-[#0B5D2E] uppercase tracking-wider block">
                  {isEs ? 'Condición Corporal WSAVA • Fotos Reales' : 'WSAVA Body Condition • Real Photos'}
                </span>
                <h3 className="font-heading font-extrabold text-base text-[#1C2B21]">
                  {isEs ? `Evaluación visual de ${pet.name}: BCS ${pet.bcs}/9` : `${pet.name}'s visual assessment: BCS ${pet.bcs}/9`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBCSModal(true)}
                className="px-3.5 py-2 bg-[#EAF4EC] hover:bg-[#0B5D2E] text-[#0B5D2E] hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-[#0B5D2E20] cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>{isEs ? 'Ver fotos reales y comparar' : 'View real photos'}</span>
              </button>
            </div>

            {/* Side-by-side card with the pet's photo and palpation check */}
            <div className="flex flex-col sm:flex-row gap-4 items-center bg-[#F8FAF8] p-3.5 rounded-2xl border border-gray-100">
              <div
                className="w-full sm:w-44 aspect-[4/3] rounded-xl overflow-hidden shrink-0 border border-gray-200 relative group cursor-pointer"
                onClick={() => setShowBCSModal(true)}
              >
                <img
                  src={
                    pet.species === 'dog'
                      ? pet.bcs <= 3
                        ? BCS_PHOTOS.dog.underweight
                        : pet.bcs <= 5
                        ? BCS_PHOTOS.dog.ideal
                        : BCS_PHOTOS.dog.overweight
                      : pet.bcs <= 3
                      ? BCS_PHOTOS.cat.underweight
                      : pet.bcs <= 5
                      ? BCS_PHOTOS.cat.ideal
                      : BCS_PHOTOS.cat.overweight
                  }
                  alt={`BCS ${pet.bcs}/9 ${pet.name}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded text-[10px] font-black text-white bg-black/60 backdrop-blur-xs">
                  {pet.species === 'dog' ? '🐶 Perro' : '🐱 Gato'} • BCS {pet.bcs}/9
                </span>
              </div>

              <div className="space-y-2 text-xs flex-1">
                <div>
                  <span className="font-extrabold text-[#1C2B21] block">
                    {pet.bcs <= 3
                      ? (isEs ? 'Bajo peso / Delgado (Costillas y columna prominentes)' : 'Underweight (Prominent ribs & spine)')
                      : pet.bcs <= 5
                      ? (isEs ? 'Peso y Condición Ideal (Cintura en reloj de arena)' : 'Ideal Condition (Visible hourglass waist)')
                      : (isEs ? 'Sobrepeso / Obesidad (Depósito graso abdominal)' : 'Overweight (Thick fat cover)')}
                  </span>
                  <p className="text-[#44544A] text-[11px] mt-0.5 leading-relaxed">
                    {pet.bcs <= 3
                      ? (isEs ? 'Costillas y huesos pélvicos visibles sin palpación. Requiere plan calórico de recuperación.' : 'Ribs and pelvic bones visible without palpation. Caloric recovery advised.')
                      : pet.bcs <= 5
                      ? (isEs ? 'Costillas palpables con leve presión sin grasa excesiva; cintura visible desde arriba.' : 'Ribs palpable with gentle pressure and no excess fat; visible waistline.')
                      : (isEs ? 'Costillas difíciles de palpar bajo el manto adiposo y abdomen redondeado.' : 'Ribs hard to feel under thick fat pad with rounded abdomen.')}
                  </p>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowBCSModal(true)}
                    className="text-[11px] text-[#0B5D2E] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>{isEs ? '🔍 Ver fotos reales de perros y gatos para diferenciar' : '🔍 See real dog and cat photos to compare'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: GROWTH CURVES FOR PUPPY / KITTEN ================= */}
      {activeTab === 'growth' && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
          <div className="space-y-1">
            <h3 className="font-heading font-extrabold text-lg text-[#0B5D2E]">
              {isEs ? 'Curvas de crecimiento y predictor adulto' : 'Growth curves & adult predictor'}
            </h3>
            <p className="text-xs text-[#44544A]">
              {isEs
                ? `Estimación según especie (${pet.species === 'dog' ? 'Canina' : 'Felina'}) y peso esperado de adulto.`
                : 'Estimations based on species and expected adult size.'}
            </p>
          </div>

          <div className="bg-[#EAF4EC] p-4 rounded-2xl border border-[#0B5D2E15] space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-[#1C2B21]">
              <span>{isEs ? 'Peso estimado de adulto:' : 'Predicted adult weight:'}</span>
              <span className="text-base text-[#0B5D2E] font-heading font-black">
                {formatWeight(pet.idealWeightKg, units)}
              </span>
            </div>
            <p className="text-[11px] text-[#44544A]">
              {isEs
                ? 'Los cachorros de razas medianas alcanzan el 50% de su peso adulto a los 4-5 meses, y el 100% a los 12-14 meses.'
                : 'Medium dog puppies reach 50% adult weight at 4-5 months and mature at 12-14 months.'}
            </p>
          </div>

          {/* Growth Milestone Table */}
          <div className="border border-gray-100 rounded-2xl overflow-hidden text-xs">
            <div className="grid grid-cols-3 bg-[#0B5D2E] text-white p-2.5 font-bold">
              <span>{isEs ? 'Edad' : 'Age'}</span>
              <span>{isEs ? '% Peso Adulto' : '% Adult Wt'}</span>
              <span>{isEs ? 'Peso Estimado' : 'Target Wt'}</span>
            </div>
            {[
              { age: isEs ? '2 meses' : '2 months', pct: 20 },
              { age: isEs ? '4 meses' : '4 months', pct: 45 },
              { age: isEs ? '6 meses' : '6 months', pct: 70 },
              { age: isEs ? '9 meses' : '9 months', pct: 88 },
              { age: isEs ? '12 meses (Adulto)' : '12 months', pct: 100 },
            ].map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-3 p-2.5 border-t border-gray-100 font-semibold text-[#1C2B21] odd:bg-[#F8FAF8]"
              >
                <span>{row.age}</span>
                <span>{row.pct}%</span>
                <span className="text-[#0B5D2E] font-bold">
                  {formatWeight(Number((pet.idealWeightKg * (row.pct / 100)).toFixed(1)), units)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= TAB 3: HEALTH LOG & VACCINES ================= */}
      {activeTab === 'health' && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-heading font-extrabold text-lg text-[#0B5D2E]">
                {isEs ? 'Diario de salud y vacunas' : 'Health & vaccination log'}
              </h3>
              <p className="text-xs text-[#44544A]">
                {isEs ? 'Vacunas, desparasitaciones, síntomas y visitas' : 'Vaccines, deworming & symptoms'}
              </p>
            </div>
            <button
              onClick={() => setShowHealthModal(true)}
              className="min-h-[44px] px-3 bg-[#0B5D2E] text-white rounded-xl font-bold text-xs flex items-center gap-1 hover:bg-[#094723]"
            >
              <Plus className="w-4 h-4" />
              <span>{isEs ? '+ Registrar' : '+ Add'}</span>
            </button>
          </div>

          <div className="space-y-2">
            {healthLogs.length === 0 ? (
              <p className="text-xs text-center text-[#44544A] py-6">
                {isEs ? 'Aún no hay eventos registrados.' : 'No events logged yet.'}
              </p>
            ) : (
              healthLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 rounded-2xl bg-[#EAF4EC]/50 border border-[#0B5D2E15] space-y-1"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-heading font-bold text-sm text-[#1C2B21]">
                      {log.title}
                    </span>
                    <span className="text-[11px] text-[#44544A] font-semibold">{log.date}</span>
                  </div>
                  {log.notes && <p className="text-xs text-[#44544A]">{log.notes}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: AUTO-RECALCULATION PROPOSAL (Section 5) ================= */}
      {recalcProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border-2 border-[#0B5D2E]">
            <div className="w-12 h-12 rounded-full bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center text-2xl mx-auto">
              🥣
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
                {isEs ? 'Proponer nueva ración' : 'Propose new ration'}
              </h3>
              <p className="text-sm text-[#1C2B21] font-semibold">
                {isEs
                  ? `Su ración cambia de ${recalcProposal.oldGrams} g a ${recalcProposal.newGrams} g al día. ¿Aplicar?`
                  : `Their ration changes from ${recalcProposal.oldGrams} g to ${recalcProposal.newGrams} g per day. Apply?`}
              </p>
              <p className="text-xs text-[#44544A] pt-1">
                {isEs
                  ? `Corresponde a ${recalcProposal.newGramsPerMeal} g en cada comida.`
                  : `Equals ${recalcProposal.newGramsPerMeal} g per meal.`}
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setRecalcProposal(null)}
                className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-xs text-[#44544A]"
              >
                {isEs ? 'Mantener actual' : 'Keep current'}
              </button>
              <button
                onClick={handleApplyRecalc}
                className="flex-1 py-3 bg-[#0B5D2E] text-white rounded-xl font-bold text-xs shadow-md"
              >
                {isEs ? 'Sí, aplicar' : 'Yes, apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: LOG WEIGHT ================= */}
      {showWeighModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveWeight}
            className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-[#0B5D2E20]"
          >
            <h3 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
              {isEs ? `Pesar a ${pet.name}` : `Weigh ${pet.name}`}
            </h3>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Peso medido hoy (kg)' : 'Weight today (kg)'}
              </label>
              <input
                type="number"
                step="0.05"
                min="0.5"
                max="100"
                required
                value={inputWeight}
                onChange={(e) => setInputWeight(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-3 bg-[#EAF4EC]/60 border border-[#0B5D2E40] rounded-xl text-center font-extrabold text-2xl text-[#0B5D2E] min-h-[50px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Fecha' : 'Date'}
              </label>
              <input
                type="date"
                required
                value={inputDate}
                onChange={(e) => setInputDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#44544A]">
                {isEs ? 'Medida de cintura (cm, opcional)' : 'Waist measure (cm, optional)'}
              </label>
              <input
                type="number"
                step="0.5"
                value={inputWaist}
                onChange={(e) => setInputWaist(e.target.value)}
                placeholder="Ej. 42"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#44544A]">
                {isEs ? 'Notas del pesaje' : 'Notes'}
              </label>
              <input
                type="text"
                value={inputNotes}
                onChange={(e) => setInputNotes(e.target.value)}
                placeholder={isEs ? 'Ej. Ayunas por la mañana' : 'e.g. Fasting in the morning'}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowWeighModal(false)}
                className="flex-1 py-3 bg-gray-100 rounded-xl text-xs font-bold text-[#44544A]"
              >
                {isEs ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold shadow-md"
              >
                {isEs ? 'Guardar pesaje' : 'Save weight'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================= MODAL: ADD HEALTH EVENT ================= */}
      {showHealthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveHealthLog}
            className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-[#0B5D2E20]"
          >
            <h3 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
              {isEs ? 'Registrar Evento de Salud' : 'Log Health Event'}
            </h3>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Tipo de evento' : 'Event type'}
              </label>
              <select
                value={healthType}
                onChange={(e) => setHealthType(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold"
              >
                <option value="vaccine">{isEs ? 'Vacuna' : 'Vaccine'}</option>
                <option value="deworming">{isEs ? 'Desparasitación' : 'Deworming'}</option>
                <option value="medication">{isEs ? 'Medicación' : 'Medication'}</option>
                <option value="vet_visit">{isEs ? 'Visita al veterinario' : 'Vet visit'}</option>
                <option value="symptom">{isEs ? 'Síntoma observado' : 'Symptom'}</option>
                <option value="stool">{isEs ? 'Heces / Digestión' : 'Stool / Digestion'}</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Título' : 'Title'}
              </label>
              <input
                type="text"
                required
                value={healthTitle}
                onChange={(e) => setHealthTitle(e.target.value)}
                placeholder={isEs ? 'Ej. Vacuna antirrábica anual' : 'e.g. Annual Rabies Vaccine'}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21]">
                {isEs ? 'Observaciones / Notas' : 'Notes'}
              </label>
              <textarea
                value={healthNotes}
                onChange={(e) => setHealthNotes(e.target.value)}
                placeholder={isEs ? 'Detalles de la clínica o reacción...' : 'Details...'}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs h-20"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowHealthModal(false)}
                className="flex-1 py-3 bg-gray-100 rounded-xl text-xs font-bold text-[#44544A]"
              >
                {isEs ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold"
              >
                {isEs ? 'Guardar' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================= MODAL: GENERAR REPORTE PDF VETERINARIO ================= */}
      {showPdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-[#0B5D2E20] animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-[#EAF4EC] text-[#0B5D2E]">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-lg text-[#0B5D2E]">
                    {isEs ? 'Informe Veterinario' : 'Veterinarian Report'}
                  </h3>
                  <span className="text-[11px] text-[#44544A] block">
                    {pet.name} • {pet.breed || (isEs ? 'Mascota' : 'Pet')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Content summary chips */}
            <div className="bg-[#EAF4EC] p-3 rounded-2xl border border-[#0B5D2E15] space-y-2 text-xs">
              <span className="font-bold text-[#0B5D2E] uppercase text-[10px] block tracking-wide">
                {isEs ? 'Contenido incluido en el informe:' : 'Included in this report:'}
              </span>
              <div className="space-y-1.5 text-[#1C2B21]">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#1E8A49] shrink-0" />
                  <span>
                    {isEs
                      ? `Historial de ${sortedWeights.length} pesajes y curva vs meta`
                      : `Log of ${sortedWeights.length} weigh-ins vs target goal`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#1E8A49] shrink-0" />
                  <span>
                    {isEs
                      ? `Condición corporal BCS ${pet.bcs}/9 y medidas de cintura`
                      : `Body Condition Score BCS ${pet.bcs}/9 & waist`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#1E8A49] shrink-0" />
                  <span>
                    {isEs
                      ? `Plan nutricional NRC 2006 (RER ${plan?.rer || 0} / MER ${plan?.mer || 0} kcal)`
                      : `NRC 2006 nutrition plan (RER ${plan?.rer || 0} / MER ${plan?.mer || 0} kcal)`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#1E8A49] shrink-0" />
                  <span>
                    {isEs
                      ? `Diario clínico (${healthLogs.length} eventos: vacunas, visitas, notas)`
                      : `Health log (${healthLogs.length} events: vaccines, visits, notes)`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#1E8A49] shrink-0" />
                  <span>
                    {isEs
                      ? 'Espacio para indicaciones y firma del médico veterinario'
                      : 'Space for veterinarian prescriptions and signature'}
                  </span>
                </div>
              </div>
            </div>

            {/* Custom vet name input */}
            <div className="space-y-1 text-xs">
              <label className="font-bold text-[#1C2B21] block">
                {isEs ? 'Nombre del veterinario o clínica (opcional):' : 'Doctor or Clinic name (optional):'}
              </label>
              <input
                type="text"
                value={vetNameInput}
                onChange={(e) => setVetNameInput(e.target.value)}
                placeholder={isEs ? 'Ej. Dra. Sofía Valenzuela - Clínica San Francisco' : 'e.g. Dr. Smith - Animal Hospital'}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0B5D2E]"
              />
            </div>

            {/* Success toast if downloaded */}
            {pdfDownloaded && (
              <div className="p-3 bg-[#EAF4EC] border border-[#1E8A49]/40 rounded-xl flex items-center gap-2 text-xs text-[#0B5D2E] font-bold animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-[#1E8A49] shrink-0" />
                <span>
                  {isEs
                    ? '✓ ¡PDF generado y descargado con éxito!'
                    : '✓ PDF report generated and downloaded!'}
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleGenerateVetReportPDF}
                className="w-full min-h-[50px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#094723] transition shadow-md active:scale-98 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{isEs ? 'Descargar Informe PDF' : 'Download PDF Report'}</span>
              </button>

              <button
                type="button"
                onClick={handleShareVetReportWhatsApp}
                className="w-full min-h-[46px] bg-[#25D366] text-white rounded-2xl font-heading font-extrabold text-xs flex items-center justify-center gap-2 hover:bg-[#20ba5a] transition active:scale-98 shadow-xs cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>{isEs ? 'Compartir resumen por WhatsApp' : 'Share summary on WhatsApp'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPdfModal(false)}
                className="w-full py-2.5 text-xs text-[#44544A] font-bold hover:underline text-center cursor-pointer"
              >
                {isEs ? 'Cerrar' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: WSAVA PHOTOGRAPHIC BODY CONDITION GUIDE ================= */}
      {showBCSModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setShowBCSModal(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full p-5 space-y-4 shadow-2xl border border-gray-100 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
                  {isEs ? 'Guía de Fotos Reales • Condición Corporal' : 'Real Photo Guide • Body Condition'}
                </h4>
                <p className="text-xs text-[#44544A]">
                  {isEs
                    ? 'Aprende a diferenciar bajo peso, ideal y sobrepeso con fotos reales de perros y gatos'
                    : 'Learn to differentiate underweight, ideal & overweight with real photos of dogs and cats'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBCSModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <BCSSelector
              species={pet.species}
              value={previewBcs}
              onChange={(val) => setPreviewBcs(val)}
              lang={userAccount.language}
            />

            <div className="pt-2 border-t border-gray-100 text-center">
              <button
                type="button"
                onClick={() => setShowBCSModal(false)}
                className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-xs hover:bg-[#094723] transition shadow-xs cursor-pointer"
              >
                {isEs ? 'Entendido / Cerrar guía' : 'Understood / Close guide'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
