import React, { useState } from 'react';
import { MonetizationInfo } from '../types';
import { Clock, AlertTriangle, ShieldCheck, XCircle, CreditCard, Sparkles, ChevronRight } from 'lucide-react';

interface TrialCountdownBannerProps {
  monetization: MonetizationInfo | null;
  onOpenPaymentModal: () => void;
  onCancelTrial: () => Promise<void>;
  lang: 'es' | 'en';
}

export const TrialCountdownBanner: React.FC<TrialCountdownBannerProps> = ({
  monetization,
  onOpenPaymentModal,
  onCancelTrial,
  lang,
}) => {
  const isEs = lang === 'es';
  const [isCanceling, setIsCanceling] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  if (!monetization) return null;

  const { status, hoursLeft, minutesLeft, is24hReminderDue, paymentMethod } = monetization;

  // Only show when in trial or expiring soon
  if (status !== 'trial_active' && status !== 'trial_expiring_soon') {
    return null;
  }

  const handleCancelClick = async () => {
    setIsCanceling(true);
    try {
      await onCancelTrial();
      setShowConfirmCancel(false);
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-3 pt-2">
      <div
        className={`rounded-2xl p-3.5 border transition-all shadow-sm ${
          is24hReminderDue
            ? 'bg-[#FFF7ED] border-[#F57C1A] text-[#7C2D12]'
            : 'bg-white border-[#0B5D2E40] text-[#1C2B21]'
        }`}
      >
        {/* Header line */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {is24hReminderDue ? (
              <AlertTriangle className="w-4 h-4 text-[#F57C1A] shrink-0 animate-pulse" />
            ) : (
              <Clock className="w-4 h-4 text-[#0B5D2E] shrink-0" />
            )}
            <span className="font-heading font-extrabold text-xs">
              {is24hReminderDue
                ? (isEs ? '⚠️ Recordatorio: Vence en menos de 24h' : '⚠️ Alert: Expires in under 24h')
                : (isEs ? 'Prueba gratuita de 72 horas activa' : '72h Free Trial Active')}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/80 border border-current text-[11px] font-mono font-bold">
            <span className="text-[#0B5D2E]">
              {hoursLeft}h {minutesLeft}m
            </span>
            <span className="text-gray-400 font-normal">
              {isEs ? 'restantes' : 'left'}
            </span>
          </div>
        </div>

        {/* Detailed Explanation according to Rules 1-7 */}
        <p className="text-[11px] mt-1.5 leading-snug">
          {is24hReminderDue ? (
            isEs ? (
              <>
                <strong>Mañana se cobrará USD 20 una sola vez</strong> para tu licencia permanente (sin renovaciones ni cobros posteriores). Si prefieres no continuar, cancela ahora sin ningún costo.
              </>
            ) : (
              <>
                <strong>Tomorrow a single authorized charge of $20 USD</strong> will unlock your lifetime license (no subscriptions or renewals). Cancel now for $0 if you choose not to continue.
              </>
            )
          ) : (
            isEs ? (
              <>
                Disfrutas de todas las funciones sin restricciones. Al culminar las 72h se realizará un <strong>único cobro de USD 20</strong> (licencia permanente, cero suscripciones).
              </>
            ) : (
              <>
                All features unlocked. After 72h, a <strong>single one-time payment of $20 USD</strong> grants lifetime access (zero recurring fees).
              </>
            )
          )}
        </p>

        {/* Payment method summary */}
        {paymentMethod && (
          <div className="mt-2 pt-2 border-t border-black/5 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-gray-600">
              <CreditCard className="w-3.5 h-3.5 text-[#0B5D2E]" />
              <span>
                {paymentMethod.brand} •••• {paymentMethod.last4}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {showConfirmCancel ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCancelClick}
                    disabled={isCanceling}
                    className="text-[10px] font-bold text-white bg-[#C0392B] px-2 py-1 rounded-lg hover:bg-red-700 transition"
                  >
                    {isCanceling ? (isEs ? 'Cancelando...' : 'Canceling...') : (isEs ? 'Confirmar cancelar ($0)' : 'Confirm cancel ($0)')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmCancel(false)}
                    className="text-[10px] text-gray-500 hover:underline px-1"
                  >
                    {isEs ? 'Atrás' : 'Back'}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowConfirmCancel(true)}
                    className="text-[11px] font-bold text-[#C0392B] hover:underline"
                  >
                    {isEs ? 'Cancelar prueba ($0)' : 'Cancel trial ($0)'}
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={onOpenPaymentModal}
                    className="text-[11px] font-bold text-[#0B5D2E] hover:underline flex items-center"
                  >
                    {isEs ? 'Gestionar' : 'Manage'}
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
