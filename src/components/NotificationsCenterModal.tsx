import React from 'react';
import { Bell, Clock, X } from 'lucide-react';
import { Pet, FeedingPlan, UserAccount } from '../types';

interface NotificationsCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  pet?: Pet;
  plan?: FeedingPlan;
  userAccount?: UserAccount;
  lang?: 'es' | 'en';
}

export const NotificationsCenterModal: React.FC<NotificationsCenterModalProps> = ({
  isOpen,
  onClose,
  pet,
  plan,
  lang = 'es',
}) => {
  if (!isOpen) return null;

  const isEs = lang === 'es';
  const daysRemaining = plan?.bagDaysRemaining;
  const showRestock = daysRemaining !== undefined && daysRemaining <= 14;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reorder-alerts-title"
        className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[#0B5D2E20] space-y-4"
      >
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-[#0B5D2E]" aria-hidden="true" />
            <h3 id="reorder-alerts-title" className="font-heading font-extrabold text-base text-[#1C2B21]">
              {isEs ? 'Avisos de reposición' : 'Reorder alerts'}
            </h3>
          </div>
          <button
            type="button"
            aria-label={isEs ? 'Cerrar' : 'Close'}
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        {showRestock ? (
          <div className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50/50">
            <p className="flex items-center gap-2 text-xs font-bold text-[#1C2B21]">
              <Clock className="w-4 h-4 text-[#F57C1A]" aria-hidden="true" />
              {isEs ? 'Revisa cuánto alimento queda' : 'Check your food supply'}
            </p>
            <p className="text-xs text-[#44544A] mt-1 pl-6">
              {isEs
                ? `Según el plan de ${pet?.name || 'tu mascota'}, el bulto dura unos ${daysRemaining} días.`
                : `According to ${pet?.name || 'your pet'}’s plan, one bag lasts about ${daysRemaining} days.`}
            </p>
          </div>
        ) : (
          <p className="text-xs text-[#44544A]">{isEs ? 'No hay avisos de reposición.' : 'No reorder alerts.'}</p>
        )}
      </div>
    </div>
  );
};
