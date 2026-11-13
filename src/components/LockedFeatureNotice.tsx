import React from 'react';
import { MonetizationStatus } from '../types';
import { Lock, ShieldAlert, CreditCard, Settings, Download, Trash2, ArrowRight } from 'lucide-react';

interface LockedFeatureNoticeProps {
  status: MonetizationStatus;
  lang: 'es' | 'en';
  onOpenPayment: () => void;
  onOpenSettings: () => void;
}

export const LockedFeatureNotice: React.FC<LockedFeatureNoticeProps> = ({
  status,
  lang,
  onOpenPayment,
  onOpenSettings,
}) => {
  const isEs = lang === 'es';

  const isFailed = status === 'payment_failed';

  return (
    <div className="p-4 max-w-md mx-auto my-4 space-y-4">
      <div className="bg-white rounded-3xl p-6 border-2 border-[#C0392B]/40 shadow-xl space-y-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#FEF2F2] text-[#C0392B] flex items-center justify-center text-2xl mx-auto shadow-inner">
          <Lock className="w-7 h-7" />
        </div>

        <div className="space-y-1.5">
          <h3 className="font-heading font-black text-xl text-[#991B1B]">
            {isFailed
              ? (isEs ? 'El cobro autorizado no pudo completarse' : 'Authorized charge could not be processed')
              : (isEs ? 'Funcionalidades avanzadas bloqueadas' : 'Advanced features locked')}
          </h3>
          <p className="text-xs text-[#44544A] leading-relaxed">
            {isFailed
              ? (isEs
                  ? 'La entidad bancaria rechazó el cobro único de USD 20 al finalizar tu prueba de 72h. Actualiza tu método de pago para restablecer el acceso permanente.'
                  : 'Your payment institution rejected the single $20 USD charge upon 72h trial completion. Please update your card.')
              : (isEs
                  ? 'La prueba gratuita fue cancelada o finalizó. Puedes desbloquear el acceso completo permanente mediante el pago único de USD 20 (sin suscripciones recurrentes).'
                  : 'The free trial was canceled or ended. You can unlock full lifetime access via a single $20 USD payment.')}
          </p>
        </div>

        {/* Primary CTA: Unlock Lifetime License */}
        <button
          type="button"
          onClick={onOpenPayment}
          className="w-full min-h-[50px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#094723] transition shadow-md active:scale-98"
        >
          <CreditCard className="w-4 h-4" />
          <span>
            {isEs ? 'Reactivar Licencia Permanente — USD 20' : 'Activate Lifetime License — $20 USD'}
          </span>
        </button>

        {/* Indispensable Access Section (Rule 9) */}
        <div className="pt-4 border-t border-gray-100 text-left space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block">
            {isEs ? 'Accesos indispensables conservados:' : 'Preserved essential access:'}
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={onOpenPayment}
              className="p-2.5 bg-[#F8FAF8] border border-gray-200 rounded-xl font-bold text-[#0B5D2E] hover:bg-[#EAF4EC] transition text-left flex items-center gap-2"
            >
              <CreditCard className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{isEs ? 'Gestionar pagos' : 'Manage payment'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2.5 bg-[#F8FAF8] border border-gray-200 rounded-xl font-bold text-[#44544A] hover:bg-gray-100 transition text-left flex items-center gap-2"
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{isEs ? 'Ajustes y privacidad' : 'Settings & privacy'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2.5 bg-[#F8FAF8] border border-gray-200 rounded-xl font-bold text-[#44544A] hover:bg-gray-100 transition text-left flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{isEs ? 'Exportar mis datos' : 'Export my data'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2.5 bg-[#FEF2F2] border border-red-200 rounded-xl font-bold text-[#C0392B] hover:bg-red-100 transition text-left flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{isEs ? 'Eliminar cuenta' : 'Delete account'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
