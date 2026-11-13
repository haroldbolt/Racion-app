import React from 'react';
import { X, ShieldCheck, Scale, Truck, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';

interface HowWeCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: 'es' | 'en';
}

export const HowWeCompareModal: React.FC<HowWeCompareModalProps> = ({
  isOpen,
  onClose,
  lang = 'es',
}) => {
  if (!isOpen) return null;
  const isEs = lang === 'es';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[#0B5D2E20] space-y-4 relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-black text-lg text-[#1C2B21]">
                {isEs ? 'Cómo comparamos' : 'How We Compare'}
              </h3>
              <p className="text-[11px] text-[#44544A]">
                {isEs ? 'Metodología transparente y honesta' : 'Transparent and honest methodology'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Principles */}
        <div className="space-y-3.5 text-xs text-[#1C2B21]">
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center shrink-0 mt-0.5">
              <Scale className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <h4 className="font-heading font-extrabold text-sm text-[#0B5D2E]">
                {isEs ? '1. Mismo producto y gramaje exacto' : '1. Same exact product and weight'}
              </h4>
              <p className="text-[#44544A] leading-relaxed">
                {isEs
                  ? 'Comparamos exactamente la misma marca, línea, variedad y peso de bolsa. Nunca mezclamos presentaciones diferentes ni calculamos precios promedio ficticios.'
                  : 'We compare the exact same brand, variety, and bag weight. We never mix different package sizes.'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center shrink-0 mt-0.5">
              <Truck className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <h4 className="font-heading font-extrabold text-sm text-[#0B5D2E]">
                {isEs ? '2. Cobertura comprobada por ciudad' : '2. Verified delivery by city'}
              </h4>
              <p className="text-[#44544A] leading-relaxed">
                {isEs
                  ? 'Distingue entre tiendas con sede física o entrega express en tu ciudad y tiendas nacionales con despacho comprobado. No mostramos comercios sin entrega confirmada en tu ubicación.'
                  : 'Distinguishes between local stores with in-city presence and national stores with verified delivery.'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <h4 className="font-heading font-extrabold text-sm text-[#0B5D2E]">
                {isEs ? '3. Orden por costo total real' : '3. Sorted by real total cost'}
              </h4>
              <p className="text-[#44544A] leading-relaxed">
                {isEs
                  ? 'Destacamos "Menor total verificado" solo cuando el costo de flete está confirmado. Si falta el envío, se señala como "Envío por confirmar" y no se declara ganador absoluto.'
                  : 'Sorted by total known cost (product + verified shipping). If shipping is pending, it is clearly noted.'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <h4 className="font-heading font-extrabold text-sm text-[#0B5D2E]">
                {isEs ? '4. Sin datos inventados ni sesgos' : '4. Real data, zero synthetic prices'}
              </h4>
              <p className="text-[#44544A] leading-relaxed">
                {isEs
                  ? 'Los precios e imágenes provienen de consultas reales en Google Shopping y tiendas autorizadas. Mostramos la fecha y hora de la consulta, y revalidamos antes de que abras la tienda.'
                  : 'Prices and images come directly from verified real-time sources. We display the check timestamp.'}
              </p>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-[#0B5D2E] text-white rounded-xl font-heading font-extrabold text-xs shadow-xs hover:bg-[#094723] transition active:scale-98"
          >
            {isEs ? 'Entendido' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
};
