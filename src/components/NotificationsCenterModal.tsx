import React, { useState, useEffect } from 'react';
import { Pet, FeedingPlan, TrackedProductAlert, UserAccount } from '../types';
import { formatCOP } from '../utils/i18n';
import {
  Bell,
  Check,
  X,
  Clock,
  TrendingDown,
  Shield,
  Settings,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface NotificationItem {
  id: string;
  type: 'reorder' | 'price_drop' | 'feeding' | 'system';
  title: string;
  message: string;
  timeAgo: string;
  read: boolean;
}

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
  userAccount,
  lang = 'es',
}) => {
  const isEs = lang === 'es';

  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showAdminCosts, setShowAdminCosts] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    if ('Notification' in window) {
      setPushPermission(Notification.permission);
    }

    // Build real contextual notifications based on pet feeding plan
    const items: NotificationItem[] = [];

    if (plan && plan.bagDaysRemaining !== undefined) {
      if (plan.bagDaysRemaining <= 7) {
        items.push({
          id: 'notif_reorder_urgent',
          type: 'reorder',
          title: isEs ? '¡Alimento por agotarse!' : 'Food running low!',
          message: isEs
            ? `Quedan ~${plan.bagDaysRemaining} días de comida para ${pet?.name || 'tu mascota'}. Es momento de comprar a tiempo.`
            : `~${plan.bagDaysRemaining} days remaining for ${pet?.name || 'your pet'}. Reorder soon.`,
          timeAgo: isEs ? 'Hoy' : 'Today',
          read: false,
        });
      } else if (plan.bagDaysRemaining <= 14) {
        items.push({
          id: 'notif_reorder_warn',
          type: 'reorder',
          title: isEs ? 'Recordatorio de reposición' : 'Reorder reminder',
          message: isEs
            ? `Quedan ~${plan.bagDaysRemaining} días de comida configurada.`
            : `~${plan.bagDaysRemaining} days remaining in bag.`,
          timeAgo: isEs ? 'Ayer' : 'Yesterday',
          read: true,
        });
      }
    }

    items.push({
      id: 'notif_system_welcome',
      type: 'system',
      title: isEs ? 'Sincronización en la nube lista' : 'Cloud sync active',
      message: isEs
        ? 'Tus mascotas, pautas veterinarias y pesajes están respaldados de forma segura.'
        : 'Your pets and vet guidelines are securely synchronized.',
      timeAgo: isEs ? 'Hace 2 días' : '2 days ago',
      read: true,
    });

    setNotifications(items);
  }, [plan, pet, isEs]);

  if (!isOpen) return null;

  const handleRequestPush = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm === 'granted') {
        new Notification('Ración App', {
          body: isEs ? '¡Notificaciones activadas con éxito!' : 'Notifications enabled successfully!',
          icon: '/assets/aistudio/Racio_n_App__Nutricio_n_con_carin_o_8fb59a2d.png',
        });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[#0B5D2E20] space-y-4 relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-extrabold text-base text-[#1C2B21]">
                {isEs ? 'Centro de Avisos' : 'Notification Center'}
              </h3>
              <p className="text-[11px] text-[#44544A]">
                {isEs ? 'Alertas de reposición, precios y alimentación' : 'Reorder, price drop and feeding alerts'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Web Push Permission Banner */}
        {'Notification' in window && pushPermission !== 'granted' && (
          <div className="p-3.5 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E20] space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0B5D2E] shrink-0" />
              <span className="text-xs font-bold text-[#0B5D2E]">
                {isEs ? 'Activar notificaciones en tu dispositivo' : 'Enable device push alerts'}
              </span>
            </div>
            <p className="text-[11px] text-[#44544A]">
              {isEs
                ? 'Recibe recordatorios de tomas de comida y avisos cuando baje el precio de tu alimento.'
                : 'Get feeding reminders and instant alerts when prices drop in your city.'}
            </p>
            <button
              type="button"
              onClick={handleRequestPush}
              className="py-2 px-3 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold hover:bg-[#094723] transition active:scale-95"
            >
              {isEs ? 'Permitir Notificaciones' : 'Enable Notifications'}
            </button>
          </div>
        )}

        {/* Notifications list */}
        <div className="space-y-2.5">
          {notifications.map((item) => (
            <div
              key={item.id}
              className={`p-3.5 rounded-2xl border transition ${
                !item.read
                  ? 'bg-amber-50/50 border-amber-200'
                  : 'bg-[#F8FAF8] border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {item.type === 'reorder' && <Clock className="w-4 h-4 text-[#F57C1A]" />}
                  {item.type === 'price_drop' && <TrendingDown className="w-4 h-4 text-[#0B5D2E]" />}
                  {item.type === 'system' && <CheckCircle2 className="w-4 h-4 text-[#0B5D2E]" />}
                  <span className="text-xs font-bold text-[#1C2B21]">{item.title}</span>
                </div>
                <span className="text-[10px] text-gray-400 shrink-0">{item.timeAgo}</span>
              </div>
              <p className="text-xs text-[#44544A] mt-1 pl-6 leading-relaxed">
                {item.message}
              </p>
            </div>
          ))}
        </div>

        {/* Operational Costs & Optimization Panel (Section 9) */}
        <div className="pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setShowAdminCosts(!showAdminCosts)}
            className="text-[11px] font-bold text-gray-500 hover:text-[#0B5D2E] flex items-center justify-between w-full py-1"
          >
            <span>ℹ️ {isEs ? 'Información técnica de consumo y caché' : 'Operational costs & cache info'}</span>
            <span>{showAdminCosts ? '▲' : '▼'}</span>
          </button>

          {showAdminCosts && (
            <div className="mt-2 p-3 bg-gray-50 rounded-2xl border border-gray-200 text-[11px] text-[#44544A] space-y-2 animate-in fade-in">
              <p>
                <strong>{isEs ? 'Optimización de llamadas SerpApi:' : 'SerpApi Call Optimization:'}</strong>{' '}
                {isEs
                  ? 'Las búsquedas se agrupan por producto exacto y ciudad con vencimiento de caché de 2 horas. Los resultados se reutilizan entre mascotas y miembros del hogar para proteger la cuota gratuita (100 consultas/mes) y evitar sobrecostos.'
                  : 'Queries are grouped by exact product and city with a 2-hour cache. Results are shared across pets to respect API quotas.'}
              </p>
              <p>
                <strong>{isEs ? 'Precio para el cliente:' : 'Customer price:'}</strong>{' '}
                {isEs
                  ? 'Se mantiene el pago único acordado de USD 20 sin cobros sorpresa.'
                  : 'Protected under the one-time $20 USD fee without extra charges.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
