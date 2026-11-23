import React, { useState } from 'react';
import { Pet, FeedingPlan, WeightRecord, HealthLog, VetGuideline, UserAccount } from '../types';
import { formatWeight, formatRation } from '../utils/i18n';
import { readVetOrder, vetPhoneNumber } from '../utils/vetRecords';
import { localDateKey } from '../utils/localDate';
import { jsPDF } from 'jspdf';
import {
  Lock,
  Unlock,
  Share2,
  Phone,
  AlertTriangle,
  Download,
} from 'lucide-react';

const inputStyle = "mt-1 block min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[#1C2B21]";

interface VetViewProps {
  pet: Pet;
  plan?: FeedingPlan;
  weightRecords: WeightRecord[];
  healthLogs: HealthLog[];
  userAccount: UserAccount;
  onUpdatePetProfile: (pet: Pet) => void;
  onAddHealthLog: (log: HealthLog) => void;
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
  onUpdatePetProfile,
  onAddHealthLog,
}) => {
  const isEs = userAccount.language === 'es';
  const units = userAccount.units;

  // Subtabs: 'report' | 'guideline' | 'diabetes' | 'emergency'
  const [subTab, setSubTab] = useState<'report' | 'guideline' | 'diabetes' | 'emergency'>('report');

  const currentGuideline = pet.vetGuideline;
  const pending = isEs ? 'Pendiente' : 'Pending';
  const metric = (value: number | undefined, unit = '') => typeof value === 'number' && Number.isFinite(value) && value > 0 ? String(value) + unit : pending;
  const foodName = [plan?.foodBrand,plan?.foodName].filter(Boolean).join(' ') || pending;
  const confirmedPlan = plan?.rationConfirmed && !currentGuideline?.needsReview;
  const medicalLogs = healthLogs.filter(log => log.petId === pet.id && log.type === 'glucose');
  const savedContact = pet.vetContact;
  const savedPhone = savedContact && vetPhoneNumber(savedContact.phone);
  const [confirmed, setConfirmed] = useState(false);
  const [formError, setFormError] = useState('');
  const [contactError, setContactError] = useState('');

  const handleSaveGuideline = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const guideline = readVetOrder(new FormData(e.currentTarget));
    if (!guideline) {
      setFormError(isEs ? 'Revisa los datos de la orden y confirma su origen.' : 'Review the order and confirm its source.');
      return;
    }
    if (currentGuideline?.phone && vetPhoneNumber(currentGuideline.phone)) guideline.phone = currentGuideline.phone;
    setConfirmed(false);
    setFormError('');
    onUpdateVetGuideline(guideline);
  };

  const handleSaveObservation = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const glucose = Number(values.get('glucose'));
    const insulin = String(values.get('insulin') ?? '').trim();
    const ate = values.get('ate');
    if (!Number.isFinite(glucose) || glucose <= 0 || (insulin && (!Number.isFinite(Number(insulin)) || Number(insulin) < 0))) return;
    const time = new Date();
    const hour = time.toLocaleTimeString(isEs ? 'es-CO' : 'en', {hour:'2-digit',minute:'2-digit'});
    const notes = [hour, glucose + ' mg/dL', insulin && insulin + (isEs ? ' U de insulina administrada' : ' U of insulin administered'),
      ate === 'yes' ? (isEs ? 'Comió todo' : 'Ate all') : ate === 'no' ? (isEs ? 'No comió todo' : 'Did not eat all') : ''].filter(Boolean).join(' · ');
    onAddHealthLog({id:crypto.randomUUID(),petId:pet.id,date:localDateKey(time),type:'glucose',title:isEs ? 'Medición de glucosa' : 'Glucose reading',notes});
    form.reset();
  };

  const handleSaveContact = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('contact') ?? '').trim();
    const phone = vetPhoneNumber(String(data.get('phone') ?? ''));
    if (!name || !phone) {
      setContactError(isEs ? 'Revisa el nombre y el teléfono de tu contacto.' : 'Check the contact name and phone number.');
      return;
    }
    onUpdatePetProfile({...pet,vetContact:{name,phone}});
    setContactError('');
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
    const age = pet.ageMonths != null ? pet.ageMonths + ' meses' : pet.ageYears != null ? pet.ageYears + ' años' : pending;
    doc.text(`Edad: ${age} | Peso actual: ${metric(pet.currentWeightKg,' kg')} | Meta: ${metric(pet.targetWeightKg || pet.idealWeightKg,' kg')} | BCS: ${metric(pet.bcs,'/9')}`, 14, 57);
    doc.text(`Condición registrada: ${pet.specialState === 'none' ? 'Ninguna declarada' : pet.specialState || pending}`, 14, 64);

    doc.setDrawColor(11, 93, 46);
    doc.setLineWidth(0.5);
    doc.line(14, 70, 196, 70);
    doc.setFontSize(12);
    doc.text('Requerimientos energéticos y alimentación actual', 14, 78);
    doc.setFontSize(10);
    doc.text(`RER: ${metric(plan?.rer,' kcal/día')}  |  Factor aplicado: ${metric(plan?.factor)}`, 14, 86);
    doc.text(`MER: ${metric(plan?.mer,' kcal/día')}`, 14, 93);
    doc.text(`Alimento actual: ${foodName}`, 14, 100);
    doc.text('Ración: ' + (confirmedPlan ? `${plan?.gramsPerMeal} g por toma · ${plan?.mealsPerDay} comidas · ${plan?.gramsPerDay} g/día` : pending), 14, 107);
    if (plan && Number.isFinite(plan.treatsBudgetKcal)) doc.text(`Presupuesto de premios: ${plan.treatsBudgetKcal} kcal`, 14, 114);

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
      `• Peso actual: ${metric(pet.currentWeightKg,' kg')} (Meta: ${metric(pet.targetWeightKg || pet.idealWeightKg,' kg')}, BCS ${metric(pet.bcs,'/9')})\n` +
      `• Ración: ${confirmedPlan ? metric(plan?.gramsPerMeal,' g por comida') : pending}\n` +
      `• Alimento: ${foodName}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
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
                  {formatWeight(pet.currentWeightKg, units)} → {pet.targetWeightKg || pet.idealWeightKg ? formatWeight(pet.targetWeightKg || pet.idealWeightKg, units) : pending}
                </strong>
              </div>
              <div>
                <span className="text-[#44544A] block">{isEs ? 'RER / MER diario:' : 'Daily RER / MER:'}</span>
                <strong className="text-sm font-bold text-[#0B5D2E]">
                  {metric(plan?.rer)} / {metric(plan?.mer,' kcal')}
                </strong>
              </div>
            </div>

            <div>
              <span className="text-[#44544A] block">{isEs ? 'Alimento y porción:' : 'Food & Portion:'}</span>
              <p className="font-semibold text-[#1C2B21]">
                {foodName} · {confirmedPlan && plan ? formatRation(plan.gramsPerMeal, units, userAccount.language) + (isEs ? ' por toma' : ' per meal') : pending}
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
              <span>{isEs ? 'Descargar informe PDF' : 'Download PDF report'}</span>
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="w-full min-h-[48px] bg-[#25D366] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#1eb857] transition shadow-xs"
            >
              <Share2 className="w-4 h-4" />
              <span>{isEs ? 'Compartir por WhatsApp' : 'Share via WhatsApp'}</span>
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
              {currentGuideline?.needsReview && <p role="status" className="rounded-xl bg-amber-50 p-3">{isEs
                ? 'Esta pauta antigua incluía campos de ejemplo. Confirma los datos con la orden original antes de volver a fijarla.'
                : 'This older order contained sample fields. Check the original order before locking it again.'}</p>}
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 font-bold">{isEs ? 'Nombre del veterinario' : 'Vet name'}
                  <input name="vet" required defaultValue={currentGuideline?.vetName ?? ''} className={inputStyle} />
                </label>
                <label className="space-y-1 font-bold">{isEs ? 'Clínica / Hospital' : 'Clinic / Hospital'}
                  <input name="clinic" required defaultValue={currentGuideline?.clinicName ?? ''} className={inputStyle} />
                </label>
              </div>
              <label className="block space-y-1 font-bold">{isEs ? 'Alimento prescrito / Dieta terapéutica' : 'Prescribed food / diet'}
                <input name="food" required defaultValue={currentGuideline?.prescribedFoodName ?? ''} className={inputStyle} />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="font-bold">{isEs ? 'Kcal / día' : 'Kcal / day'}
                  <input type="number" name="kcal" required min="0" step="any" defaultValue={currentGuideline?.needsReview ? '' : currentGuideline?.prescribedKcal ?? ''} className={inputStyle} />
                </label>
                <label className="font-bold">{isEs ? 'Gramos por toma' : 'Grams per meal'}
                  <input type="number" name="grams" required min="0" step="any" defaultValue={currentGuideline?.needsReview ? '' : currentGuideline?.prescribedGramsPerMeal ?? ''} className={inputStyle} />
                </label>
                <label className="font-bold">{isEs ? 'Tomas al día' : 'Meals per day'}
                  <input type="number" name="meals" required min="1" max="6" step="1" defaultValue={currentGuideline?.needsReview ? '' : currentGuideline?.mealsPerDay ?? ''} className={inputStyle} />
                </label>
              </div>
              <label className="block space-y-1 font-bold">{isEs ? 'Indicaciones médicas especiales' : 'Clinical instructions'}
                <textarea name="notes" defaultValue={currentGuideline?.notes ?? ''} className={inputStyle} />
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" name="confirmed" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />
                {isEs ? 'Confirmo que copié la orden de mi veterinario' : "I confirm that I copied my veterinarian's order"}
              </label>
              {formError && <p role="alert" className="text-red-800">{formError}</p>}
              <button type="submit" disabled={!confirmed} className="w-full min-h-[50px] rounded-xl bg-[#0B5D2E] font-bold text-white disabled:opacity-50">
                {isEs ? 'Fijar y Bloquear Plan a esta Pauta' : 'Lock Plan to this Vet Guideline'}
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

          <form onSubmit={handleSaveObservation} className="space-y-3 rounded-2xl bg-[#EAF4EC] p-3.5 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <label className="font-semibold">{isEs ? 'Glucosa (mg/dL)' : 'Glucose (mg/dL)'}
                <input name="glucose" type="number" required min="0.01" step="any" className={inputStyle} />
              </label>
              <label className="font-semibold">{isEs ? 'Insulina administrada (U)' : 'Insulin administered (U)'}
                <input name="insulin" type="number" min="0" step="any" className={inputStyle} />
              </label>
            </div>
            <label className="block font-semibold">{isEs ? '¿Comió todo?' : 'Ate the whole meal?'}
              <select name="ate" defaultValue="" className={inputStyle}>
                <option value="">{isEs ? 'Sin registrar' : 'Unrecorded'}</option>
                <option value="yes">{isEs ? 'Sí' : 'Yes'}</option>
                <option value="no">No</option>
              </select>
            </label>
            <button type="submit" className="min-h-11 w-full rounded-xl bg-[#0B5D2E] font-bold text-white">
              {isEs ? 'Añadir al registro médico' : 'Add to medical log'}
            </button>
          </form>

          <div aria-live="polite" className="space-y-2">
            {medicalLogs.length === 0 && <p>{isEs ? 'Aún no hay mediciones de glucosa para esta mascota.' : 'No glucose readings for this pet yet.'}</p>}
            {medicalLogs.map(log => <div key={log.id} className="space-y-1 rounded-xl border p-3 text-xs">
              <span className="font-bold">{log.date}</span><p>{log.notes}</p>
            </div>)}
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

          <div className="space-y-3 rounded-2xl border border-[#C0392B]/30 p-4">
            <h4 className="font-bold">{isEs ? 'Contacto de urgencias' : 'Emergency contact'}</h4>
            {savedPhone && savedContact ? (
              <a href={'tel:' + savedPhone} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#C0392B] font-bold text-white">
                <Phone className="h-4 w-4" />{isEs ? 'Llamar a ' : 'Call '}{savedContact.name} ({savedPhone})
              </a>
            ) : <p className="text-sm">{isEs ? 'Guarda el contacto de tu veterinario o de una clínica de urgencias.' : 'Save the contact details for your vet or emergency clinic.'}</p>}
            <form onSubmit={handleSaveContact} className="space-y-2 text-xs">
              <label className="block font-semibold">{isEs ? 'Nombre del contacto de urgencias' : 'Emergency contact name'}
                <input name="contact" required defaultValue={savedContact?.name || currentGuideline?.clinicName || ''} className={inputStyle} />
              </label>
              <label className="block font-semibold">{isEs ? 'Teléfono de urgencias' : 'Emergency phone number'}
                <input name="phone" type="tel" required defaultValue={savedPhone || currentGuideline?.phone || ''} className={inputStyle} />
              </label>
              {contactError && <p role="alert">{contactError}</p>}
              <button type="submit" className="min-h-11 w-full rounded-xl border font-bold text-[#0B5D2E]">{isEs ? 'Guardar contacto de urgencias' : 'Save emergency contact'}</button>
            </form>
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
              {userAccount.email && <p><strong>{isEs ? 'Contacto tutor:' : 'Owner email:'}</strong> {userAccount.email}</p>}
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
