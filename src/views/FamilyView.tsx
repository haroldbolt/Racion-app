import React, { useState, useEffect } from 'react';
import { Pet, FeedingPlan, FamilyMember, UserAccount, SharedPetAccessRecord, FamilyInviteRecord } from '../types';
import { jsPDF } from 'jspdf';
import { useAuth } from '../contexts/AuthContext';
import {
  Users,
  UserPlus,
  Shield,
  FileText,
  Download,
  Share2,
  Copy,
  Check,
  Heart,
  Key,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Lock,
} from 'lucide-react';

interface FamilyViewProps {
  pet: Pet;
  pets?: Pet[];
  plan?: FeedingPlan;
  userAccount: UserAccount;
  onUpdateAccount: (updated: Partial<UserAccount>) => void;
  onRefreshSharedPets?: () => void;
}

export const FamilyView: React.FC<FamilyViewProps> = ({
  pet,
  pets = [],
  plan,
  userAccount,
  onUpdateAccount,
  onRefreshSharedPets,
}) => {
  const isEs = userAccount.language === 'es';
  const { user, idToken, openAuthModal } = useAuth();

  const [activeTab, setActiveTab] = useState<'owner' | 'caregiver' | 'pdf'>('owner');

  // Owner invite creation state
  const availablePets = pets.length > 0 ? pets : [pet];
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([pet.id]);
  const [selectedRole, setSelectedRole] = useState<'feeder' | 'weighed_and_fed' | 'viewer'>('feeder');
  const [generatedInvite, setGeneratedInvite] = useState<FamilyInviteRecord | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);

  // Caregiver management state
  const [caregiversList, setCaregiversList] = useState<SharedPetAccessRecord[]>([]);
  const [pendingInvites, setPendingInvites] = useState<FamilyInviteRecord[]>([]);

  // Accept invite state
  const [inputInviteCode, setInputInviteCode] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptFeedback, setAcceptFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load existing caregivers for owner
  const loadCaregivers = async () => {
    if (!idToken) return;
    try {
      const res = await fetch('/api/family/caregivers', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCaregiversList(data.activeCaregivers || []);
        setPendingInvites(data.pendingInvites || []);
      }
    } catch {
      // offline
    }
  };

  useEffect(() => {
    loadCaregivers();
  }, [idToken]);

  const handleTogglePetSelection = (id: string) => {
    if (selectedPetIds.includes(id)) {
      if (selectedPetIds.length > 1) {
        setSelectedPetIds(selectedPetIds.filter((p) => p !== id));
      }
    } else {
      setSelectedPetIds([...selectedPetIds, id]);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken) {
      openAuthModal('login');
      return;
    }

    setIsCreatingInvite(true);
    try {
      const res = await fetch('/api/family/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          petIds: selectedPetIds,
          role: selectedRole,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setGeneratedInvite(json.invite);
        await loadCaregivers();
      }
    } catch (e) {
      console.error('Failed to create invite:', e);
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken) {
      openAuthModal('login');
      return;
    }
    if (!inputInviteCode.trim()) return;

    setIsAccepting(true);
    setAcceptFeedback(null);
    try {
      const res = await fetch('/api/family/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          inviteCode: inputInviteCode.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAcceptFeedback({
          type: 'success',
          text: isEs
            ? `¡Acceso aceptado! Ahora puedes consultar y alimentar a las mascotas compartidas de ${data.ownerEmail}.`
            : `Access accepted! You can now care for shared pets from ${data.ownerEmail}.`,
        });
        setInputInviteCode('');
        onRefreshSharedPets?.();
      } else {
        setAcceptFeedback({
          type: 'error',
          text: data.error || (isEs ? 'Código no válido o expirado.' : 'Invalid or expired code.'),
        });
      }
    } catch {
      setAcceptFeedback({
        type: 'error',
        text: isEs ? 'Error de conexión.' : 'Connection error.',
      });
    } finally {
      setIsAccepting(false);
    }
  };

  const handleRevoke = async (caregiverUid: string, petId?: string) => {
    if (!idToken) return;
    try {
      const res = await fetch('/api/family/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ caregiverUid, petId }),
      });
      if (res.ok) {
        await loadCaregivers();
      }
    } catch (e) {
      console.error('Failed to revoke access:', e);
    }
  };

  // Export 1-page Caregiver / Daycare sheet
  const handleExportCaregiverSheet = () => {
    const doc = new jsPDF();

    doc.setFillColor(11, 93, 46);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text(`Hoja de Cuidados y Guarderia: ${pet.name}`, 14, 17);

    doc.setTextColor(28, 43, 33);
    doc.setFontSize(12);
    doc.text('Instrucciones claras de alimentacion y seguridad para cuidadores:', 14, 38);

    doc.setFontSize(10);
    doc.text(`• Mascota: ${pet.name} (${pet.species === 'dog' ? 'Perro' : 'Gato'}, ${pet.breed})`, 14, 48);
    doc.text(`• Alimento oficial: ${plan?.foodBrand || ''} ${plan?.foodName || 'Alimento balanceado'}`, 14, 56);
    doc.text(`• RACION EXACTA: ${plan?.gramsPerMeal || 90} g en cada comida`, 14, 64);
    doc.text(`• Tomas al dia: ${plan?.mealsPerDay || 2} tomas (${plan?.mealTimes.join(', ') || '08:00, 20:00'})`, 14, 72);
    doc.text(`• AGUA FRESCA: Meta diaria de ${Math.round(pet.currentWeightKg * 55)} ml de agua disponible siempre.`, 14, 80);
    doc.text(`• PREMIOS: Maximo ${plan?.treatsBudgetKcal || 50} kcal al dia. ¡NO dar comida de humanos!`, 14, 88);

    doc.setDrawColor(200, 200, 200);
    doc.line(14, 98, 196, 98);

    doc.setFontSize(12);
    doc.setTextColor(192, 57, 43);
    doc.text('ALIMENTOS TOTALMENTE PROHIBIDOS (TOXICOS):', 14, 108);
    doc.setFontSize(9);
    doc.setTextColor(68, 84, 74);
    doc.text('Chocolate, cafe, uvas, pasas, cebolla, ajo, chicles con xilitol, aguacate y huesos cocidos.', 14, 116);

    doc.setFontSize(12);
    doc.setTextColor(11, 93, 46);
    doc.text('Contactos de Urgencia:', 14, 130);
    doc.setFontSize(10);
    doc.setTextColor(28, 43, 33);
    doc.text(`• Tutor: ${userAccount.email}`, 14, 138);
    doc.text(`• Clinica Veterinaria habitual: ${pet.vetGuideline?.clinicName || 'Clinica Veterinaria'} (${pet.vetGuideline?.phone || '24 Horas'})`, 14, 146);

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Racion App - Fecha de generacion: ${new Date().toLocaleDateString()}. Sin diagnosticos medicos.`, 14, 270);

    doc.save(`Hoja_Cuidador_${pet.name}.pdf`);
  };

  return (
    <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
      <div>
        <h3 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
          {isEs ? 'Acceso Familiar y Cuidadores' : 'Family Access & Caregivers'}
        </h3>
        <p className="text-xs text-[#44544A] mt-0.5">
          {isEs
            ? 'Invita a cuidadores con su propia cuenta sin costo adicional. Protege tus pagos y datos privados.'
            : 'Invite caregivers with their own account at zero extra fee. Protect your payments and private data.'}
        </p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 p-1 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E15]">
        <button
          type="button"
          onClick={() => setActiveTab('owner')}
          className={`py-2 text-xs font-heading font-extrabold rounded-xl transition ${
            activeTab === 'owner' ? 'bg-white text-[#0B5D2E] shadow-xs' : 'text-[#44544A]'
          }`}
        >
          {isEs ? 'Mis Invitaciones' : 'My Invites'}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('caregiver')}
          className={`py-2 text-xs font-heading font-extrabold rounded-xl transition ${
            activeTab === 'caregiver' ? 'bg-white text-[#0B5D2E] shadow-xs' : 'text-[#44544A]'
          }`}
        >
          {isEs ? 'Unirme como Cuidador' : 'Join as Caregiver'}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pdf')}
          className={`py-2 text-xs font-heading font-extrabold rounded-xl transition ${
            activeTab === 'pdf' ? 'bg-white text-[#0B5D2E] shadow-xs' : 'text-[#44544A]'
          }`}
        >
          {isEs ? 'Hoja Guardería' : 'Caregiver PDF'}
        </button>
      </div>

      {/* TAB 1: OWNER (Invite Caregiver & Manage) */}
      {activeTab === 'owner' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#0B5D2E]" />
              <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
                {isEs ? 'Crear nueva invitación de cuidador' : 'Create Caregiver Invitation'}
              </h4>
            </div>

            <form onSubmit={handleCreateInvite} className="space-y-3.5">
              {/* Pet selection checkboxes */}
              <div>
                <label className="block text-xs font-bold text-[#1C2B21] mb-1.5">
                  {isEs ? 'Selecciona las mascotas que deseas compartir:' : 'Select pets to share:'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {availablePets.map((p) => {
                    const isSelected = selectedPetIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleTogglePetSelection(p.id)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-[#EAF4EC] border-[#0B5D2E] text-[#0B5D2E]'
                            : 'bg-gray-50 border-gray-200 text-gray-600'
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-[#0B5D2E]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Role selection */}
              <div>
                <label className="block text-xs font-bold text-[#1C2B21] mb-1.5">
                  {isEs ? 'Nivel de permiso del cuidador:' : 'Caregiver permission level:'}
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as any)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold outline-none focus:border-[#0B5D2E]"
                >
                  <option value="feeder">
                    {isEs ? '🥣 Registrar comidas ("¿Ya comió?")' : 'Log meals only'}
                  </option>
                  <option value="weighed_and_fed">
                    {isEs ? '⚖️ Registrar comidas y registrar pesajes' : 'Log meals & record weight'}
                  </option>
                  <option value="viewer">
                    {isEs ? '👀 Solo lectura (consultar ración y pautas)' : 'Viewer only'}
                  </option>
                </select>
              </div>

              <div className="bg-[#F8FAF8] p-3 rounded-xl border border-gray-100 flex items-center gap-2 text-[11px] text-[#44544A]">
                <Shield className="w-4 h-4 text-[#0B5D2E] shrink-0" />
                <span>
                  {isEs
                    ? 'Compartir una mascota no da acceso a tus métodos de pago, compras ni a otras mascotas.'
                    : 'Sharing a pet never grants access to payment methods or unshared pets.'}
                </span>
              </div>

              <button
                type="submit"
                disabled={isCreatingInvite}
                className="w-full min-h-[46px] bg-[#0B5D2E] text-white rounded-xl font-heading font-extrabold text-xs flex items-center justify-center gap-1.5 hover:bg-[#094723] transition active:scale-98 shadow-xs disabled:opacity-50"
              >
                <span>{isCreatingInvite ? (isEs ? 'Generando...' : 'Generating...') : isEs ? 'Generar Código de Invitación' : 'Generate Invite Code'}</span>
              </button>
            </form>

            {/* Generated Invite Display */}
            {generatedInvite && (
              <div className="mt-3 p-4 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E30] space-y-2 animate-in fade-in">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#0B5D2E]">
                    {isEs ? '¡Código listo para compartir!' : 'Invite code ready to share!'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(generatedInvite.inviteCode)}
                    className="flex items-center gap-1 text-xs font-bold text-[#0B5D2E] hover:underline"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? (isEs ? 'Copiado' : 'Copied') : (isEs ? 'Copiar' : 'Copy')}</span>
                  </button>
                </div>

                <div className="bg-white p-3 rounded-xl border border-[#0B5D2E20] text-center font-mono font-black text-xl text-[#0B5D2E] tracking-widest">
                  {generatedInvite.inviteCode}
                </div>

                <p className="text-[11px] text-[#44544A] text-center">
                  {isEs
                    ? 'Pídele al cuidador que abra Ración App con su propia cuenta e ingrese este código en "Unirme como Cuidador".'
                    : 'Ask the caregiver to sign in with their own account and enter this code under "Join as Caregiver".'}
                </p>
              </div>
            )}
          </div>

          {/* Active Caregivers & Revoke */}
          <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
            <h4 className="font-heading font-extrabold text-sm text-[#1C2B21]">
              {isEs ? 'Cuidadores con acceso activo:' : 'Active Caregivers:'}
            </h4>

            {caregiversList.length === 0 ? (
              <p className="text-xs text-gray-400 py-3 text-center">
                {isEs ? 'Aún no has compartido mascotas con cuidadores.' : 'No active caregivers yet.'}
              </p>
            ) : (
              <div className="space-y-2">
                {caregiversList.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#1C2B21] block truncate max-w-[200px]">
                        {c.caregiverEmail}
                      </span>
                      <span className="text-[11px] text-[#0B5D2E] font-semibold">
                        {c.role === 'feeder'
                          ? (isEs ? '🥣 Puede dar comida' : 'Feeder')
                          : c.role === 'weighed_and_fed'
                          ? (isEs ? '⚖️ Comida y peso' : 'Feeds & Weighs')
                          : (isEs ? '👀 Solo lectura' : 'Viewer')}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRevoke(c.caregiverUid, c.petId)}
                      className="px-2.5 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 transition active:scale-95"
                    >
                      {isEs ? 'Revocar' : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CAREGIVER (Join with Invite Code) */}
      {activeTab === 'caregiver' && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-[#0B5D2E]" />
            <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
              {isEs ? 'Unirme como cuidador a un hogar' : 'Join a household as caregiver'}
            </h4>
          </div>

          <p className="text-xs text-[#44544A] leading-relaxed">
            {isEs
              ? 'Si el tutor de la mascota te compartió un código de invitación (ej. RACION-ABCDE), ingrésalo aquí con tu propia cuenta para sincronizar los registros de alimentación sin costo alguno.'
              : 'Enter the invite code shared by the pet owner to access meal feeding without extra fees.'}
          </p>

          {acceptFeedback && (
            <div
              className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
                acceptFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {acceptFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{acceptFeedback.text}</span>
            </div>
          )}

          <form onSubmit={handleAcceptInvite} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#1C2B21] mb-1">
                {isEs ? 'Código de invitación:' : 'Invitation code:'}
              </label>
              <input
                type="text"
                required
                value={inputInviteCode}
                onChange={(e) => setInputInviteCode(e.target.value.toUpperCase())}
                placeholder="RACION-XXXXX"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-mono font-bold text-center text-sm outline-none focus:border-[#0B5D2E]"
              />
            </div>

            <button
              type="submit"
              disabled={isAccepting}
              className="w-full min-h-[46px] bg-[#0B5D2E] text-white rounded-xl font-heading font-extrabold text-xs flex items-center justify-center gap-1.5 hover:bg-[#094723] transition active:scale-98 shadow-xs disabled:opacity-50"
            >
              <span>{isAccepting ? (isEs ? 'Verificando...' : 'Verifying...') : isEs ? 'Aceptar y Sincronizar' : 'Accept & Sync'}</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: PDF CAREGIVER SHEET */}
      {activeTab === 'pdf' && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#0B5D2E]" />
            <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
              {isEs ? 'Hoja para Cuidador o Guardería (1 página)' : 'Caregiver / Daycare Sheet (1 page)'}
            </h4>
          </div>
          <p className="text-xs text-[#44544A] leading-relaxed">
            {isEs
              ? 'Genera una hoja oficial en PDF con los gramos exactos por comida de ' +
                pet.name +
                ', horarios, lista de alimentos tóxicos prohibidos y teléfonos de emergencia cuando dejes a tu mascota al cuidado de alguien.'
              : 'Generates a 1-page printable summary with exact meal grams, times, toxic foods and emergency numbers.'}
          </p>

          <button
            onClick={handleExportCaregiverSheet}
            className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#094723] transition active:scale-95 shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>{isEs ? 'Descargar Hoja de Guardería en PDF' : 'Download Caregiver Sheet (PDF)'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
