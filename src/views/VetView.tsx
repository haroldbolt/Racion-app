import React, { useState } from 'react';
import { Pet, FeedingPlan, WeightRecord, HealthLog, VetGuideline, UserAccount } from '../types';
import { formatWeight, formatRation } from '../utils/i18n';
import { jsPDF } from 'jspdf';
import {
  FileText,
  Lock,
  Unlock,
  Share2,
  Phone,
  AlertTriangle,
  HeartHandshake,
  Download,
  Copy,
  Check,
  Search,
  Activity,
  Plus,
} from 'lucide-react';

interface VetViewProps {
  pet: Pet;
  plan?: FeedingPlan;
  weightRecords: WeightRecord[];
  healthLogs: HealthLog[];
  userAccount: UserAccount;
  onUpdateVetGuideline: (guideline: VetGuideline | undefined) => void;
  onNavigateTab?: (tab: any) => void;
}

export const VetView: React.FC<VetViewProps> = ({
  pet,
  plan,
  weightRecords,
  healthLogs,
  userAccount,
  onUpdateVetGuideline,
}) => {
  const isEs = userAccount.language === 'es';
  const units = userAccount.units;

  // Subtabs: 'report' | 'guideline' | 'diabetes' | 'emergency'
  const [subTab, setSubTab] = useState<'report' | 'guideline' | 'diabetes' | 'emergency'>('report');

  // Vet guideline inputs
  const currentGuideline = pet.vetGuideline;
  const [vetName, setVetName] = useState(currentGuideline?.vetName || 'Dra. Sofía Valenzuela');
  const [clinicName, setClinicName] = useState(currentGuideline?.clinicName || 'Clínica Veterinaria San Francisco');
  const [vetPhone, setVetPhone] = useState(currentGuideline?.phone || '+54 9 11 4567-8900');
  const [prescribedKcal, setPrescribedKcal] = useState(currentGuideline?.prescribedKcal || (plan?.mer || 500));
  const [prescribedFoodName, setPrescribedFoodName] = useState(currentGuideline?.prescribedFoodName || (plan?.foodName || 'Alimento Terapéutico Prescrito'));
  const [prescribedGramsMeal, setPrescribedGramsMeal] = useState(currentGuideline?.prescribedGramsPerMeal || (plan?.gramsPerMeal || 70));
  const [prescribedMealsDay, setPrescribedMealsDay] = useState(currentGuideline?.mealsPerDay || 2);
  const [vetNotes, setVetNotes] = useState(currentGuideline?.notes || 'Control de glucosa y peso cada 15 días.');

  // Diabetes / condition tracking state
  const [glucoseLogs, setGlucoseLogs] = useState<Array<{ time: string; value: number; insulinUnits: number; ate: boolean }>>([
    { time: '08:00', value: 125, insulinUnits: 2, ate: true },
    { time: '19:30', value: 138, insulinUnits: 2, ate: true },
  ]);
  const [newGlucoseValue, setNewGlucoseValue] = useState(130);
  const [newInsulinUnits, setNewInsulinUnits] = useState(2);
  const [newDidEat, setNewDidEat] = useState(true);

  // Link copy toast
  const [copiedLink, setCopiedLink] = useState(false);

  // Handle Save Guideline (LOCKS THE PLAN)
  const handleSaveGuideline = (e: React.FormEvent) => {
    e.preventDefault();
    const guideline: VetGuideline = {
      prescribedKcal: Number(prescribedKcal),
      prescribedFoodName,
      prescribedGramsPerMeal: Number(prescribedGramsMeal),
      mealsPerDay: Number(prescribedMealsDay),
      vetName,
      clinicName,
      phone: vetPhone,
      date: new Date().toISOString().split('T')[0],
      notes: vetNotes,
      locked: true,
    };
    onUpdateVetGuideline(guideline);
  };

  const handleUnlockGuideline = () => {
    onUpdateVetGuideline(undefined);
  };

  // Generate real PDF for veterinarian
  const handleDownloadVetPDF = () => {
    const doc = new jsPDF();

    // Brand header
    doc.setFillColor(11, 93, 46); // #0B5D2E
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('Ración App - Informe Clínico Nutricional', 14, 18);
    doc.setFontSize(10);
    doc.text('Guía educativa basada en estándares NRC 2006, WSAVA y AAHA', 14, 25);

    doc.setTextColor(28, 43, 33); // #1C2B21
    doc.setFontSize(14);
    doc.text(`Ficha de la Mascota: ${pet.name}`, 14, 42);

    doc.setFontSize(10);
    doc.text(`Especie: ${pet.species === 'dog' ? 'Canino' : 'Felino'} | Raza: ${pet.breed} | Sexo: ${pet.sex} (${pet.isNeutered ? 'Castrado' : 'Entero'})`, 14, 50);
    doc.text(`Edad: ${pet.ageYears || 1} años | Peso Actual: ${pet.currentWeightKg} kg | Meta: ${pet.targetWeightKg || pet.idealWeightKg} kg | BCS: ${pet.bcs}/9`, 14, 57);
    doc.text(`Condición médica especial: ${pet.specialState !== 'none' ? pet.specialState.toUpperCase() : 'Ninguna / Sano'}`, 14, 64);

    // Plan & Calculations
    doc.setDrawColor(11, 93, 46);
    doc.setLineWidth(0.5);
    doc.line(14, 70, 196, 70);

    doc.setFontSize(12);
    doc.text('Requerimientos Energéticos y Alimentación Actual:', 14, 78);
    doc.setFontSize(10);
    doc.text(`RER (Energía en Reposo): ${plan?.rer || 0} kcal/día  |  Factor aplicado: ${plan?.factor || 1.6}`, 14, 86);
    doc.text(`MER (Energía Mantenimiento): ${plan?.mer || 0} kcal/día`, 14, 93);
    doc.text(`Alimento actual: ${plan?.foodBrand || ''} ${plan?.foodName || ''} (${plan?.foodType || 'seco'})`, 14, 100);
    doc.text(`Ración recomendada: ${plan?.gramsPerMeal || 0} g en cada una de las ${plan?.mealsPerDay || 2} comidas (${plan?.gramsPerDay || 0} g/día)`, 14, 107);
    doc.text(`Presupuesto de premios: máx ${plan?.treatsBudgetKcal || 0} kcal (descontado de la comida)`, 14, 114);

    // Weight history
    doc.line(14, 122, 196, 122);
    doc.setFontSize(12);
    doc.text('Historial Reciente de Pesajes:', 14, 130);
    doc.setFontSize(9);
    let y = 138;
    weightRecords.slice(-5).forEach((rec) => {
      doc.text(`• Fecha: ${rec.date} - Peso: ${rec.weightKg} kg ${rec.notes ? `(${rec.notes})` : ''}`, 16, y);
      y += 6;
    });

    // Medical disclaimer (Page 2: "Ese aviso va visible en el resultado del cálculo y en cada PDF.")
    doc.setFillColor(234, 244, 236); // #EAF4EC
    doc.rect(14, 250, 182, 30, 'F');
    doc.setTextColor(68, 84, 74);
    doc.setFontSize(8);
    doc.text('AVISO VETERINARIO OBLIGATORIO:', 18, 258);
    doc.text('Ración App es una guía educativa de alimentación basada en NRC 2006, guías WSAVA y AAHA.', 18, 264);
    doc.text('No diagnostica, no prescribe dietas terapéuticas y no sustituye al veterinario con licencia.', 18, 270);
    doc.text(`Generado el: ${new Date().toLocaleDateString()} para consulta veterinaria de ${pet.name}.`, 18, 276);

    doc.save(`Informe_Veterinario_${pet.name}.pdf`);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Hola! Te comparto el informe nutricional y registro de peso de ${pet.name} desde Ración App:\n` +
      `• Peso actual: ${pet.currentWeightKg} kg (Meta: ${pet.targetWeightKg} kg, BCS ${pet.bcs}/9)\n` +
      `• Ración: ${plan?.gramsPerMeal || 0} g por comida (${plan?.mer || 0} kcal/día)\n` +
      `• Alimento: ${plan?.foodBrand} ${plan?.foodName}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleCopyExpiringLink = () => {
    navigator.clipboard?.writeText(window.location.origin + `?vet_report=${pet.id}&token=exp_${Date.now() + 86400000}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
      {/* Subtab navigation */}
      <div className="flex bg-[#EAF4EC] p-1 rounded-2xl overflow-x-auto scrollbar-none">
        {[
          { id: 'report', label: isEs ? 'Informe PDF' : 'PDF Report' },
          { id: 'guideline', label: isEs ? 'Pauta del Vet' : 'Vet Guideline' },
          { id: 'diabetes', label: isEs ? 'Monitoreo Médico' : 'Medical Tracking' },
          { id: 'emergency', label: isEs ? 'Emergencias 24h' : '24h Emergency' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id as any)}
            className={`py-2 px-3 rounded-xl text-xs font-bold shrink-0 transition min-h-[44px] ${
              subTab === tab.id
                ? 'bg-[#0B5D2E] text-white shadow-xs'
                : 'text-[#44544A] hover:text-[#0B5D2E]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ================= SUBTAB 1: PDF REPORT FOR VET ================= */}
      {subTab === 'report' && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-5 animate-in fade-in">
          <div>
            <h3 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
              {isEs ? `Informe para el Veterinario de ${pet.name}` : `Vet Report for ${pet.name}`}
            </h3>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs
                ? 'Historial de pesajes, fórmulas RER/MER, BCS y alimentación actual listo para exportar o compartir.'
                : 'Weight logs, RER/MER equations, BCS and current feeding ready to export.'}
            </p>
          </div>

          {/* Report Preview Card */}
          <div className="bg-[#F8FAF8] rounded-2xl p-4 border border-gray-200 space-y-3 text-xs">
            <div className="flex justify-between items-center border-b border-gray-200 pb-2">
              <span className="font-heading font-extrabold text-sm text-[#1C2B21]">
                {pet.name} ({pet.breed})
              </span>
              <span className="font-bold text-[#0B5D2E]">BCS {pet.bcs}/9</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[#44544A] block">{isEs ? 'Peso actual vs meta:' : 'Current vs target:'}</span>
                <strong className="text-sm font-bold text-[#1C2B21]">
                  {formatWeight(pet.currentWeightKg, units)} → {formatWeight(pet.targetWeightKg || pet.idealWeightKg, units)}
                </strong>
              </div>
              <div>
                <span className="text-[#44544A] block">{isEs ? 'RER / MER diario:' : 'Daily RER / MER:'}</span>
                <strong className="text-sm font-bold text-[#0B5D2E]">
                  {plan?.rer || 0} / {plan?.mer || 0} kcal
                </strong>
              </div>
            </div>

            <div>
              <span className="text-[#44544A] block">{isEs ? 'Alimento y porción:' : 'Food & Portion:'}</span>
              <p className="font-semibold text-[#1C2B21]">
                {plan?.foodBrand} {plan?.foodName} — <strong className="text-[#0B5D2E]">{formatRation(plan?.gramsPerMeal || 0, units)}</strong> en {plan?.mealsPerDay} tomas
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleDownloadVetPDF}
              className="w-full min-h-[52px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-base flex items-center justify-center gap-2 hover:bg-[#094723] transition active:scale-98 shadow-md"
            >
              <Download className="w-5 h-5" />
              <span>{isEs ? 'Descargar Informe PDF Oficial' : 'Download Official PDF Report'}</span>
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="w-full min-h-[48px] bg-[#25D366] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#1eb857] transition shadow-xs"
            >
              <Share2 className="w-4 h-4" />
              <span>{isEs ? 'Compartir por WhatsApp' : 'Share via WhatsApp'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyExpiringLink}
              className="w-full min-h-[44px] bg-white border border-[#0B5D2E30] text-[#0B5D2E] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#EAF4EC]"
            >
              <Copy className="w-4 h-4" />
              <span>
                {copiedLink
                  ? (isEs ? '¡Enlace temporal copiado al portapapeles!' : 'Temporary link copied!')
                  : (isEs ? 'Copiar enlace temporal de visualización (24h)' : 'Copy temporary expiring link (24h)')}
              </span>
            </button>
          </div>

          <p className="text-[11px] text-[#44544A] bg-[#EAF4EC] p-3 rounded-2xl border border-[#0B5D2E15]">
            ⚖️ {isEs ? 'Aviso presente en el PDF:' : 'Notice included in PDF:'} Ración App es una guía educativa de alimentación y no sustituye al veterinario.
          </p>
        </div>
      )}

      {/* ================= SUBTAB 2: VET GUIDELINE LOCK MODE ================= */}
      {subTab === 'guideline' && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-5 animate-in fade-in">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#0B5D2E]" />
              <h3 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
                {isEs ? 'Pauta Médica Prescrita por el Veterinario' : 'Prescribed Veterinary Guideline'}
              </h3>
            </div>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs
                ? 'Ingresa los valores exactos indicados por tu veterinario. Al guardar, el plan de la app queda BLOQUEADO a esa pauta.'
                : 'Enter the exact targets ordered by your vet to LOCK the feeding plan to that guideline.'}
            </p>
          </div>

          {currentGuideline?.locked ? (
            <div className="bg-[#EAF4EC] p-4 rounded-2xl border-2 border-[#0B5D2E] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-heading font-extrabold text-sm text-[#0B5D2E] flex items-center gap-1.5">
                  <Lock className="w-4 h-4" />
                  {isEs ? 'PLAN BLOQUEADO POR PAUTA MÉDICA' : 'PLAN LOCKED BY VET'}
                </span>
                <span className="text-xs text-[#44544A]">{currentGuideline.date}</span>
              </div>

              <div className="space-y-1 text-xs text-[#1C2B21]">
                <p><strong>{isEs ? 'Médico:' : 'Doctor:'}</strong> {currentGuideline.vetName} ({currentGuideline.clinicName})</p>
                <p><strong>{isEs ? 'Alimento prescrito:' : 'Prescribed food:'}</strong> {currentGuideline.prescribedFoodName}</p>
                <p><strong>{isEs ? 'Ración fijada:' : 'Fixed ration:'}</strong> {currentGuideline.prescribedGramsPerMeal} g ({currentGuideline.mealsPerDay} comidas al día) • {currentGuideline.prescribedKcal} kcal/día</p>
                {currentGuideline.notes && (
                  <p className="text-[#44544A] italic">"{currentGuideline.notes}"</p>
                )}
              </div>

              <button
                type="button"
                onClick={handleUnlockGuideline}
                className="w-full py-2.5 bg-white border border-[#0B5D2E40] text-[#0B5D2E] rounded-xl text-xs font-bold hover:bg-gray-50 flex items-center justify-center gap-1.5 min-h-[44px]"
              >
                <Unlock className="w-4 h-4" />
                <span>{isEs ? 'Desbloquear y volver al cálculo libre' : 'Unlock and return to standard calculator'}</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveGuideline} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-[#1C2B21]">{isEs ? 'Nombre del veterinario:' : 'Vet name:'}</label>
                  <input
                    type="text"
                    required
                    value={vetName}
                    onChange={(e) => setVetName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[#1C2B21]">{isEs ? 'Clínica / Hospital:' : 'Clinic:'}</label>
                  <input
                    type="text"
                    required
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1C2B21]">{isEs ? 'Alimento prescrito / Dieta terapéutica:' : 'Prescribed diet:'}</label>
                <input
                  type="text"
                  required
                  value={prescribedFoodName}
                  onChange={(e) => setPrescribedFoodName(e.target.value)}
                  placeholder="Ej. Hill's k/d Renal o Royal Canin Hepatic"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl font-semibold"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-[#1C2B21]">{isEs ? 'Kcal / día:' : 'Kcal / day:'}</label>
                  <input
                    type="number"
                    required
                    value={prescribedKcal}
                    onChange={(e) => setPrescribedKcal(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-center font-bold text-[#0B5D2E]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[#1C2B21]">{isEs ? 'Gramos por toma:' : 'Grams/meal:'}</label>
                  <input
                    type="number"
                    required
                    value={prescribedGramsMeal}
                    onChange={(e) => setPrescribedGramsMeal(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-center font-bold text-[#0B5D2E]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[#1C2B21]">{isEs ? 'Tomas al día:' : 'Meals/day:'}</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={prescribedMealsDay}
                    onChange={(e) => setPrescribedMealsDay(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-center font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1C2B21]">{isEs ? 'Indicaciones médicas especiales:' : 'Clinical instructions:'}</label>
                <textarea
                  value={vetNotes}
                  onChange={(e) => setVetNotes(e.target.value)}
                  placeholder="Instrucciones sobre medicamentos o administración..."
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl h-18"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[50px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#094723] transition active:scale-98 shadow-md mt-2"
              >
                <Lock className="w-4 h-4" />
                <span>{isEs ? 'Fijar y Bloquear Plan a esta Pauta' : 'Lock Plan to this Vet Guideline'}</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* ================= SUBTAB 3: DIABETES & MEDICAL TRACKING ================= */}
      {subTab === 'diabetes' && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4 animate-in fade-in">
          <div>
            <h3 className="font-heading font-extrabold text-lg text-[#0B5D2E]">
              {isEs ? 'Seguimiento para Diabetes y Condiciones Especiales' : 'Diabetes & Special Condition Tracking'}
            </h3>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs
                ? 'Monitoreo diario de glucosa, dosis de insulina y "¿comió su comida?" bajo estricta indicación de tu veterinario.'
                : 'Daily glucose, insulin units and food intake monitoring.'}
            </p>
          </div>

          <div className="bg-[#FFFBEB] p-3 rounded-2xl border border-[#D97706]/30 text-xs text-[#92400E]">
            ⚠️ {isEs
              ? 'Ración App no dosifica medicamentos ni diagnostica. Esta herramienta registra datos para presentarle a tu médico.'
              : 'Ración App does not dose medications. This logs observations for your doctor.'}
          </div>

          {/* Quick add glucose check */}
          <div className="bg-[#EAF4EC] p-3.5 rounded-2xl border border-[#0B5D2E20] space-y-3 text-xs">
            <span className="font-bold text-[#0B5D2E] block">
              {isEs ? '+ Registrar toma de hoy' : '+ Log new entry'}
            </span>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[#44544A] font-semibold">{isEs ? 'Glucosa (mg/dL):' : 'Glucose:'}</label>
                <input
                  type="number"
                  value={newGlucoseValue}
                  onChange={(e) => setNewGlucoseValue(Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-center font-bold"
                />
              </div>
              <div>
                <label className="text-[#44544A] font-semibold">{isEs ? 'Insulina (U):' : 'Insulin (U):'}</label>
                <input
                  type="number"
                  step="0.5"
                  value={newInsulinUnits}
                  onChange={(e) => setNewInsulinUnits(Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-center font-bold"
                />
              </div>
              <div>
                <label className="text-[#44544A] font-semibold">{isEs ? '¿Comió todo?:' : 'Ate meal?:'}</label>
                <button
                  type="button"
                  onClick={() => setNewDidEat(!newDidEat)}
                  className={`w-full py-1.5 rounded-lg font-bold border transition ${
                    newDidEat ? 'bg-[#0B5D2E] text-white border-[#0B5D2E]' : 'bg-white text-gray-400 border-gray-200'
                  }`}
                >
                  {newDidEat ? 'Sí ✓' : 'No'}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setGlucoseLogs([
                  {
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    value: newGlucoseValue,
                    insulinUnits: newInsulinUnits,
                    ate: newDidEat,
                  },
                  ...glucoseLogs,
                ]);
              }}
              className="w-full py-2 bg-[#0B5D2E] text-white rounded-xl font-bold min-h-[44px]"
            >
              {isEs ? 'Añadir al registro médico' : 'Add to medical log'}
            </button>
          </div>

          {/* Log list */}
          <div className="space-y-2">
            {glucoseLogs.map((item, idx) => (
              <div
                key={idx}
                className="p-3 bg-[#F8FAF8] rounded-xl border border-gray-200 flex justify-between items-center text-xs"
              >
                <div>
                  <span className="font-bold text-[#1C2B21]">{item.time}</span>
                  <span className="text-[#44544A] ml-2">
                    {item.ate ? '🥣 Comió su comida' : '⚠️ No comió'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="bg-[#EAF4EC] text-[#0B5D2E] px-2 py-0.5 rounded-md font-bold">
                    {item.value} mg/dL
                  </span>
                  <span className="bg-[#FFF7ED] text-[#F57C1A] px-2 py-0.5 rounded-md font-bold">
                    {item.insulinUnits} U Insulina
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= SUBTAB 4: EMERGENCY SCREEN (Section 7) ================= */}
      {subTab === 'emergency' && (
        <div className="bg-white rounded-3xl p-5 border-2 border-[#C0392B]/40 shadow-sm space-y-4 animate-in fade-in">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-[#C0392B]" />
              <h3 className="font-heading font-extrabold text-xl text-[#C0392B]">
                {isEs ? 'Pantalla de Emergencia y Urgencias' : '24h Emergency Screen'}
              </h3>
            </div>
            <p className="text-xs text-[#44544A] mt-0.5">
              {isEs ? 'Acceso rápido cuando cada segundo importa' : 'Fast access when every second counts'}
            </p>
          </div>

          {/* My Vet Contact Card */}
          <div className="bg-[#FEF2F2] p-4 rounded-2xl border border-[#C0392B]/30 space-y-3">
            <span className="text-xs font-black text-[#991B1B] uppercase tracking-wide block">
              {isEs ? 'Mi Veterinario de Cabecera:' : 'My Primary Veterinarian:'}
            </span>
            <div>
              <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">{vetName}</h4>
              <p className="text-xs text-[#44544A]">{clinicName}</p>
            </div>

            <a
              href={`tel:${vetPhone}`}
              className="w-full min-h-[50px] bg-[#C0392B] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#a3281c] transition active:scale-95 shadow-md"
            >
              <Phone className="w-5 h-5" />
              <span>{isEs ? `Llamar a Urgencias (${vetPhone})` : `Call Emergency (${vetPhone})`}</span>
            </a>
          </div>

          {/* Pet ID Digital Emergency Card */}
          <div className="bg-[#EAF4EC] p-4 rounded-2xl border border-[#0B5D2E20] space-y-2 text-xs">
            <span className="font-bold text-[#0B5D2E] block text-sm">
              🪪 {isEs ? 'Tarjeta de Identificación Rápida' : 'Pet Emergency ID Card'}
            </span>
            <div className="grid grid-cols-2 gap-2 text-[#1C2B21]">
              <p><strong>{isEs ? 'Mascota:' : 'Pet:'}</strong> {pet.name}</p>
              <p><strong>{isEs ? 'Especie/Raza:' : 'Species:'}</strong> {pet.species === 'dog' ? 'Perro' : 'Gato'} ({pet.breed})</p>
              <p><strong>{isEs ? 'Peso:' : 'Weight:'}</strong> {pet.currentWeightKg} kg</p>
              <p><strong>{isEs ? 'Contacto tutor:' : 'Owner email:'}</strong> {userAccount.email}</p>
            </div>
          </div>

          {/* Toxic First Steps Protocol */}
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 text-xs space-y-2">
            <span className="font-bold text-[#1C2B21] block">
              🚨 {isEs ? 'Primeros auxilios si ingirió un tóxico:' : 'First steps if toxic item ingested:'}
            </span>
            <ol className="list-decimal list-inside space-y-1 text-[#44544A] font-medium">
              <li>{isEs ? 'Guarda el empaque o resto del tóxico consumido.' : 'Keep the wrapper or sample of ingested item.'}</li>
              <li>{isEs ? '¡NO provoques el vómito sin autorización médica!' : 'Do NOT induce vomiting without doctor orders!'}</li>
              <li>{isEs ? 'Calcula la hora aproximada y acude de inmediato a una clínica 24 horas.' : 'Note exact time and head to 24h emergency clinic.'}</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};
