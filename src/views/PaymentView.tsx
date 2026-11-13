import React, { useState } from 'react';
import { UserAccount, MonetizationInfo } from '../types';
import {
  ShieldCheck,
  Check,
  CreditCard,
  Lock,
  RefreshCw,
  KeyRound,
  Clock,
  AlertTriangle,
  Sparkles,
  XCircle,
  HelpCircle,
  FastForward,
  RotateCcw,
} from 'lucide-react';

interface PaymentViewProps {
  userAccount: UserAccount;
  monetization?: MonetizationInfo | null;
  onActivateLicense: (licenseKey: string) => void;
  onRefreshMonetization?: () => Promise<void>;
  onClose: () => void;
}

export const PaymentView: React.FC<PaymentViewProps> = ({
  userAccount,
  monetization,
  onActivateLicense,
  onRefreshMonetization,
  onClose,
}) => {
  const isEs = userAccount.language === 'es';

  // Form fields for card tokenization (Rule 10: NEVER store card numbers or CVV)
  const [cardholderName, setCardholderName] = useState(
    userAccount.familyName ? `${userAccount.familyName} Titular` : 'María González'
  );
  const [cardBrand, setCardBrand] = useState<'Visa' | 'Mastercard' | 'Amex'>('Visa');
  const [mockCardEnding, setMockCardEnding] = useState('4242');
  const [expMonth, setExpMonth] = useState('08');
  const [expYear, setExpYear] = useState('28');

  // Interactive states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // License manual input
  const [licenseInput, setLicenseInput] = useState('');
  const [licenseError, setLicenseError] = useState('');

  // 1. Register Trial with pre-authorized delayed single charge (Rule 1, 3, 5, 10)
  const handleRegisterTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardholderName.trim()) {
      setFeedbackMessage({
        text: isEs ? 'Ingresa el nombre del titular.' : 'Enter cardholder name.',
        type: 'error',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMessage(null);

    try {
      const res = await fetch('/api/monetization/register-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardholderName: cardholderName.trim(),
          cardBrand,
          last4: mockCardEnding,
          expMonth,
          expYear,
          email: userAccount.email || 'usuario@racionapp.com',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage({
          text: isEs
            ? '✓ ¡Prueba de 72 horas iniciada con éxito! Todas las funciones están desbloqueadas.'
            : '✓ 72-hour free trial started successfully! All features are unlocked.',
          type: 'success',
        });
        if (onRefreshMonetization) await onRefreshMonetization();
      } else {
        setFeedbackMessage({ text: data.error || 'Error al iniciar prueba', type: 'error' });
      }
    } catch (err) {
      setFeedbackMessage({
        text: isEs ? 'Error de conexión con el servidor.' : 'Server connection error.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Cancel trial before 72 hours with 0 charge (Rule 6)
  const handleCancelTrial = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/monetization/cancel-trial', { method: 'POST' });
      const data = await res.json();
      setFeedbackMessage({
        text: isEs
          ? '✓ Prueba cancelada con éxito. Cobro final de $ 0 COP. Se ha revocado la autorización de pago.'
          : '✓ Trial canceled successfully. $0 charge. Payment authorization revoked.',
        type: 'success',
      });
      if (onRefreshMonetization) await onRefreshMonetization();
    } catch (err) {
      setFeedbackMessage({
        text: isEs ? 'Error al cancelar la prueba.' : 'Error canceling trial.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Simulation endpoints (Rule 11)
  const handleAdvanceHours = async (hours: number) => {
    setIsSubmitting(true);
    try {
      await fetch('/api/monetization/simulate/advance-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      });
      if (onRefreshMonetization) await onRefreshMonetization();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulatePaymentFail = async () => {
    setIsSubmitting(true);
    try {
      await fetch('/api/monetization/simulate/fail-payment', { method: 'POST' });
      if (onRefreshMonetization) await onRefreshMonetization();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulateUnlockLifetime = async () => {
    setIsSubmitting(true);
    try {
      await fetch('/api/monetization/simulate/unlock-lifetime', { method: 'POST' });
      const key = `RACION-PRO-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      onActivateLicense(key);
      if (onRefreshMonetization) await onRefreshMonetization();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSimulation = async () => {
    setIsSubmitting(true);
    try {
      await fetch('/api/monetization/simulate/reset', { method: 'POST' });
      if (onRefreshMonetization) await onRefreshMonetization();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manual license activation
  const handleManualKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = licenseInput.trim().toUpperCase();
    if (clean.length < 6) {
      setLicenseError(isEs ? 'Introduce una clave de licencia válida.' : 'Please enter a valid license key.');
      return;
    }
    onActivateLicense(clean);
    handleSimulateUnlockLifetime();
  };

  const currentStatus = monetization?.status || (userAccount.isLicensed ? 'charged_lifetime' : 'unregistered');

  return (
    <div className="p-4 space-y-5 pb-28 max-w-lg mx-auto">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="w-20 mx-auto mb-1">
          <img
            src="/assets/aistudio/Racio_n_App__Nutricio_n_con_carin_o_8fb59a2d.png"
            alt="Ración App"
            className="w-full h-auto drop-shadow-xs"
          />
        </div>
        <h2 className="font-heading font-black text-2xl text-[#0B5D2E]">
          {isEs ? 'Monetización y Licencia Permanente' : 'Monetization & Lifetime License'}
        </h2>
        <p className="text-xs text-[#1C2B21] font-semibold leading-relaxed">
          {isEs
            ? 'Prueba gratuita de 72 horas con método de pago registrado. Al finalizar, cobro único de $ 80.000 COP (~20 USD) sin suscripciones recurrentes.'
            : '72-hour free trial with payment method registered. Single $ 80,000 COP charge (~$20 USD) upon completion, zero recurring subscriptions.'}
        </p>
      </div>

      {/* Feedback banner */}
      {feedbackMessage && (
        <div
          className={`p-3 rounded-2xl text-xs font-bold text-center animate-in fade-in ${
            feedbackMessage.type === 'success'
              ? 'bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E30]'
              : 'bg-[#FEF2F2] text-[#C0392B] border border-red-200'
          }`}
        >
          {feedbackMessage.text}
        </div>
      )}

      {/* STATUS 1: LIFETIME LICENSE ACTIVE */}
      {currentStatus === 'charged_lifetime' && (
        <div className="bg-white rounded-3xl p-6 text-center border-2 border-[#0B5D2E] shadow-xl space-y-4">
          <div className="w-14 h-14 rounded-full bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center text-3xl mx-auto">
            ✓
          </div>
          <div className="space-y-1">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-[#EAF4EC] text-[#0B5D2E] uppercase tracking-wider inline-block">
              {isEs ? 'Licencia Permanente Activa' : 'Lifetime License Active'}
            </span>
            <h3 className="font-heading font-black text-xl text-[#1C2B21]">
              {isEs ? 'Cobro único completado: $ 80.000 COP' : 'Single charge completed: $ 80,000 COP'}
            </h3>
            <p className="text-xs text-[#44544A] leading-relaxed">
              {isEs
                ? 'Regla de Oro: Prohibido cualquier cobro posterior o renovación. Tu acceso es vitalicio para todas tus mascotas presentes y futuras.'
                : 'No future renewals or charges. Lifetime access for all your pets.'}
            </p>
          </div>

          <div className="p-3 bg-[#F8FAF8] rounded-2xl border border-gray-200 text-xs text-left space-y-1 font-mono">
            <div className="flex justify-between">
              <span className="text-gray-500">{isEs ? 'ID Transacción:' : 'Tx ID:'}</span>
              <span className="font-bold text-[#0B5D2E]">
                {monetization?.chargeTransactionId || userAccount.licenseKey || 'TXN_LIFETIME_COP'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{isEs ? 'Monto Cobrado:' : 'Amount Charged:'}</span>
              <span className="font-bold text-[#1C2B21]">$ 80.000 COP (~20 USD Único)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{isEs ? 'Suscripción Recurrente:' : 'Recurring Subscription:'}</span>
              <span className="font-bold text-[#0B5D2E]">0 (Ninguna)</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm hover:bg-[#094723] transition"
          >
            {isEs ? 'Volver a la aplicación' : 'Return to app'}
          </button>
        </div>
      )}

      {/* STATUS 2: TRIAL IN PROGRESS (ACTIVE OR EXPIRING SOON) */}
      {(currentStatus === 'trial_active' || currentStatus === 'trial_expiring_soon') && (
        <div
          className={`bg-white rounded-3xl p-6 border-2 shadow-xl space-y-4 ${
            currentStatus === 'trial_expiring_soon' ? 'border-[#F57C1A]' : 'border-[#0B5D2E]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#0B5D2E]" />
              <h3 className="font-heading font-black text-lg text-[#1C2B21]">
                {isEs ? 'Prueba Gratuita en Curso' : 'Free Trial in Progress'}
              </h3>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-black ${
                currentStatus === 'trial_expiring_soon'
                  ? 'bg-[#FFF7ED] text-[#F57C1A] border border-[#F57C1A]'
                  : 'bg-[#EAF4EC] text-[#0B5D2E]'
              }`}
            >
              {monetization?.hoursLeft ?? 72}h {monetization?.minutesLeft ?? 0}m
            </span>
          </div>

          {currentStatus === 'trial_expiring_soon' ? (
            <div className="p-3 bg-[#FFF7ED] rounded-2xl border border-[#F57C1A]/40 text-xs text-[#7C2D12] space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-[#F57C1A]" />
                <span>{isEs ? 'Aviso 24 horas antes del vencimiento:' : '24h Expiration Reminder:'}</span>
              </div>
              <p>
                {isEs
                  ? 'Mañana concluyen tus 72 horas. Se ejecutará el cobro único autorizado de $ 80.000 COP (~20 USD) para conservar la licencia vitalicia. Si no deseas continuar, cancela ahora sin costo alguno.'
                  : 'Tomorrow your 72 hours will end. The single authorized charge of $ 80,000 COP (~$20 USD) will be executed. Cancel now for $0 if you do not wish to continue.'}
              </p>
            </div>
          ) : (
            <div className="p-3 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E20] text-xs text-[#1C2B21] space-y-1">
              <p>
                {isEs
                  ? 'Tienes acceso total a todas las funciones. Cuando concluyan las 72h, se realizará un único cobro de $ 80.000 COP para tu licencia de por vida.'
                  : 'You have unrestricted access. Once 72h end, a single $ 80,000 COP charge unlocks your lifetime license.'}
              </p>
            </div>
          )}

          {/* Registered Card Details (Tokenized) */}
          <div className="bg-[#F8FAF8] p-3.5 rounded-2xl border border-gray-200 text-xs space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-gray-500 block">
              {isEs ? 'Método de pago pre-autorizado:' : 'Pre-authorized payment method:'}
            </span>
            <div className="flex items-center justify-between font-medium">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#0B5D2E]" />
                <span>
                  {monetization?.paymentMethod?.brand || 'Visa'} ••••{' '}
                  {monetization?.paymentMethod?.last4 || '4242'}
                </span>
              </div>
              <span className="text-[11px] text-gray-500 font-mono">
                {monetization?.paymentMethod?.token || 'pm_tok_demo'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              {isEs ? 'Titular:' : 'Holder:'}{' '}
              <strong>{monetization?.paymentMethod?.cardholderName || 'María González'}</strong>
            </p>
          </div>

          {/* Cancel button before 72 hours (Rule 6) */}
          <button
            type="button"
            onClick={handleCancelTrial}
            disabled={isSubmitting}
            className="w-full py-3 bg-white border border-[#C0392B] text-[#C0392B] rounded-2xl font-heading font-extrabold text-xs hover:bg-red-50 transition min-h-[46px]"
          >
            {isSubmitting
              ? isEs
                ? 'Cancelando...'
                : 'Canceling...'
              : isEs
              ? 'Cancelar prueba antes de las 72h (Cobro $ 0 COP)'
              : 'Cancel trial before 72h ($0 Charge)'}
          </button>
        </div>
      )}

      {/* STATUS 3: UNREGISTERED, CANCELED, OR PAYMENT FAILED */}
      {(currentStatus === 'unregistered' || currentStatus === 'canceled' || currentStatus === 'payment_failed') && (
        <div className="bg-white rounded-3xl p-6 border-2 border-[#0B5D2E30] shadow-xl space-y-5">
          {currentStatus === 'canceled' && (
            <div className="p-3 bg-[#FEF2F2] rounded-2xl border border-red-200 text-xs text-[#991B1B]">
              <strong>{isEs ? 'Prueba cancelada:' : 'Trial canceled:'}</strong>{' '}
              {isEs
                ? 'Se revocó la autorización previa con cobro final de $ 0 COP. Puedes registrar un método nuevo o adquirir la licencia directamente.'
                : 'Prior authorization revoked with $0 charge. Register again or unlock lifetime directly.'}
            </div>
          )}

          {currentStatus === 'payment_failed' && (
            <div className="p-3 bg-[#FEF2F2] rounded-2xl border border-red-200 text-xs text-[#991B1B]">
              <strong>{isEs ? 'Fallo en cobro diferido:' : 'Deferred charge failed:'}</strong>{' '}
              {isEs
                ? 'El banco emisor declinó el cobro de $ 80.000 COP al vencer la prueba. Registra otra tarjeta para restaurar el acceso.'
                : 'Issuer declined the $ 80,000 COP charge. Please register an alternate card.'}
            </div>
          )}

          {/* Pricing Highlight */}
          <div className="text-center py-2 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E20]">
            <span className="font-heading font-extrabold text-base text-[#0B5D2E] block">
              {isEs ? 'Prueba gratuita de 72 horas' : '72-Hour Free Trial'}
            </span>
            <span className="text-[11px] text-[#44544A]">
              {isEs ? 'Luego cobro único de $ 80.000 COP (~20 USD) • Licencia vitalicia para siempre' : 'Then single $ 80,000 COP (~$20 USD) charge • Lifetime license'}
            </span>
          </div>

          {/* Card Registration Form (Rule 1 & 10) */}
          <form onSubmit={handleRegisterTrial} className="space-y-3.5">
            <span className="text-xs font-black uppercase tracking-wider text-[#0B5D2E] block">
              {isEs ? 'Registro de método de pago:' : 'Payment method registration:'}
            </span>

            {/* Cardholder Name */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1C2B21] block">
                {isEs ? 'Nombre del titular de la tarjeta:' : 'Cardholder name:'}
              </label>
              <input
                type="text"
                required
                value={cardholderName}
                onChange={(e) => setCardholderName(e.target.value)}
                placeholder="Nombre y apellido"
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold"
              />
            </div>

            {/* Card Brand & Mock Ending */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1C2B21] block">
                  {isEs ? 'Tipo de tarjeta:' : 'Card brand:'}
                </label>
                <select
                  value={cardBrand}
                  onChange={(e) => setCardBrand(e.target.value as any)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold"
                >
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                  <option value="Amex">American Express</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1C2B21] block">
                  {isEs ? 'Últimos 4 dígitos:' : 'Last 4 digits:'}
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={mockCardEnding}
                  onChange={(e) => setMockCardEnding(e.target.value.replace(/\D/g, ''))}
                  placeholder="4242"
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-semibold"
                />
              </div>
            </div>

            {/* Expiry */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1C2B21] block">
                  {isEs ? 'Mes vencimiento:' : 'Exp. Month:'}
                </label>
                <select
                  value={expMonth}
                  onChange={(e) => setExpMonth(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold"
                >
                  {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1C2B21] block">
                  {isEs ? 'Año vencimiento:' : 'Exp. Year:'}
                </label>
                <select
                  value={expYear}
                  onChange={(e) => setExpYear(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold"
                >
                  {['25', '26', '27', '28', '29', '30'].map((y) => (
                    <option key={y} value={y}>
                      20{y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Rule 10 Security Guarantee */}
            <div className="p-2.5 bg-[#F8FAF8] rounded-xl border border-gray-200 flex items-start gap-2 text-[11px] text-[#44544A]">
              <ShieldCheck className="w-4 h-4 text-[#0B5D2E] shrink-0 mt-0.5" />
              <span>
                {isEs
                  ? 'Seguridad PCI-DSS: Nunca almacenamos el número completo de tu tarjeta ni tu código CVV. Solo se conserva un identificador de tokenización seguro para el cobro diferido único.'
                  : 'PCI-DSS Compliance: Full card numbers and CVV codes are never stored. Tokenization handles the one-time delayed charge.'}
              </span>
            </div>

            {/* Submit CTA */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[52px] bg-[#F57C1A] text-white rounded-2xl font-heading font-extrabold text-base flex items-center justify-center gap-2 hover:bg-[#e06d12] transition active:scale-98 shadow-md"
            >
              {isSubmitting ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  <span>
                    {isEs
                      ? 'Confirmar e Iniciar Prueba de 72 Horas'
                      : 'Confirm & Start 72-Hour Free Trial'}
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Legal / Policy points */}
          <div className="space-y-1.5 text-[11px] text-[#44544A] pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[#0B5D2E]" />
              <span>{isEs ? '72 horas completas con todas las funciones' : '72 full hours with all features'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[#0B5D2E]" />
              <span>{isEs ? 'Cancela antes de las 72h sin costo alguno ($ 0 COP)' : 'Cancel anytime before 72h for $0'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[#0B5D2E]" />
              <span>{isEs ? 'Un único cobro de $ 80.000 COP al finalizar (cero suscripciones)' : 'Single $ 80,000 COP charge at end (zero recurring fees)'}</span>
            </div>
          </div>
        </div>
      )}

      {/* PROTOTYPE SIMULATION BAR (Rule 11) */}
      <div className="bg-[#FFFBEB] rounded-3xl p-5 border-2 border-[#D97706]/40 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-[#92400E]">
          <FastForward className="w-5 h-5 text-[#D97706]" />
          <div>
            <h4 className="font-heading font-extrabold text-sm">
              {isEs ? 'Simulador de Monetización (Prototipo)' : 'Monetization Simulator (Prototype)'}
            </h4>
            <p className="text-[11px] text-[#B45309]">
              {isEs
                ? 'Permite verificar todos los estados obligatorios sin transacciones reales:'
                : 'Verify all required states without real money transactions:'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleAdvanceHours(24)}
            className="p-2.5 bg-white border border-[#D97706]/40 text-[#92400E] rounded-xl font-bold hover:bg-amber-50 transition text-center"
          >
            ⏩ {isEs ? 'Avanzar 24 horas' : 'Advance 24 hours'}
          </button>

          <button
            type="button"
            onClick={() => handleAdvanceHours(49)}
            className="p-2.5 bg-white border border-[#D97706]/40 text-[#92400E] rounded-xl font-bold hover:bg-amber-50 transition text-center"
          >
            ⏰ {isEs ? 'Avanzar a alerta (<24h)' : 'Advance to alert (<24h)'}
          </button>

          <button
            type="button"
            onClick={() => handleAdvanceHours(73)}
            className="p-2.5 bg-white border border-[#0B5D2E]/40 text-[#0B5D2E] rounded-xl font-bold hover:bg-green-50 transition text-center"
          >
            🏁 {isEs ? 'Vencer 72h (Cobro $ 80.000 COP)' : 'End 72h (Charge $80,000 COP)'}
          </button>

          <button
            type="button"
            onClick={handleSimulatePaymentFail}
            className="p-2.5 bg-white border border-[#C0392B]/40 text-[#C0392B] rounded-xl font-bold hover:bg-red-50 transition text-center"
          >
            ❌ {isEs ? 'Simular fallo de cobro' : 'Simulate payment fail'}
          </button>

          <button
            type="button"
            onClick={handleCancelTrial}
            className="p-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition text-center"
          >
            🚫 {isEs ? 'Simular cancelación ($ 0 COP)' : 'Simulate cancel ($0)'}
          </button>

          <button
            type="button"
            onClick={handleResetSimulation}
            className="p-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition text-center flex items-center justify-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isEs ? 'Reiniciar prueba' : 'Reset trial'}</span>
          </button>
        </div>
      </div>

      {/* Manual License Key Activation */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[#0B5D2E]" />
          <h3 className="font-heading font-extrabold text-sm text-[#1C2B21]">
            {isEs ? '¿Tienes un código de compra directa?' : 'Have a direct license code?'}
          </h3>
        </div>

        <form onSubmit={handleManualKeySubmit} className="flex gap-2">
          <input
            type="text"
            value={licenseInput}
            onChange={(e) => setLicenseInput(e.target.value)}
            placeholder="RACION-PRO-XXXX"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono uppercase"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold shrink-0 min-h-[44px]"
          >
            {isEs ? 'Activar' : 'Activate'}
          </button>
        </form>

        {licenseError && <p className="text-xs text-[#C0392B]">{licenseError}</p>}
      </div>
    </div>
  );
};
