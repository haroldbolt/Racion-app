import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { PriceHistorySummary, PriceHistoryPoint } from '../types';
import { formatCOP } from '../utils/i18n';
import { TrendingDown, Calendar, Store, Info, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';

interface PriceHistoryChartProps {
  brand: string;
  productName: string;
  presentationWeightKg: number;
  city: string;
  lang?: 'es' | 'en';
}

export const PriceHistoryChart: React.FC<PriceHistoryChartProps> = ({
  brand,
  productName,
  presentationWeightKg,
  city,
  lang = 'es',
}) => {
  const isEs = lang === 'es';
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<PriceHistorySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        brand,
        product: productName,
        weight: String(presentationWeightKg),
        city,
        days: '30',
      });
      const res = await fetch(`/api/price-history?${params.toString()}`);
      if (res.ok) {
        const json: PriceHistorySummary = await res.json();
        setData(json);
      } else {
        setError(isEs ? 'No se pudo cargar el histórico.' : 'Could not load price history.');
      }
    } catch {
      setError(isEs ? 'Sin conexión al servidor.' : 'Offline or connection failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [brand, productName, presentationWeightKg, city]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const point: PriceHistoryPoint = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-sm p-3 rounded-2xl shadow-xl border border-[#0B5D2E30] text-xs space-y-1 z-50 max-w-[240px]">
          <div className="flex items-center gap-1.5 text-gray-500 font-medium">
            <Calendar className="w-3.5 h-3.5 text-[#0B5D2E]" />
            <span>{point.date}</span>
          </div>

          <div className="text-sm font-heading font-black text-[#0B5D2E]">
            {formatCOP(point.minPriceCop)}
          </div>

          <div className="flex items-center gap-1.5 text-[#1C2B21] font-semibold">
            <Store className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{point.merchantName}</span>
          </div>

          {point.shippingCostCop !== null && point.shippingCostCop !== undefined && (
            <div className="text-[11px] text-gray-500">
              {isEs ? 'Envío:' : 'Shipping:'}{' '}
              {point.shippingCostCop === 0
                ? (isEs ? 'Gratis' : 'Free')
                : formatCOP(point.shippingCostCop)}
            </div>
          )}

          <div className="pt-1 text-[10px] text-gray-400">
            {isEs
              ? `Menor precio verificado (${point.observationsCount} consultas)`
              : `Lowest verified price (${point.observationsCount} checks)`}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-[#0B5D2E]" />
            <h3 className="font-heading font-extrabold text-base text-[#1C2B21]">
              {isEs ? 'Histórico de Precios (Últimos 30 días)' : 'Price History (Last 30 days)'}
            </h3>
          </div>
          <p className="text-xs text-[#44544A] mt-0.5">
            {brand} {productName} • <strong>{presentationWeightKg} kg</strong> •{' '}
            <span className="text-[#0B5D2E] font-bold">{city}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={fetchHistory}
          disabled={loading}
          className="p-2 rounded-xl text-gray-400 hover:text-[#0B5D2E] hover:bg-[#EAF4EC] transition active:scale-95 shrink-0"
          title={isEs ? 'Actualizar histórico' : 'Refresh history'}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0B5D2E]' : ''}`} />
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
          <div className="w-8 h-8 border-3 border-[#0B5D2E]/20 border-t-[#0B5D2E] rounded-full animate-spin" />
          <span className="text-xs text-[#44544A]">
            {isEs ? 'Consultando histórico registrado...' : 'Loading recorded observations...'}
          </span>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <>
          {/* Key Stat Cards (Calculated over daily minimums) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-[#EAF4EC]/60 p-3 rounded-2xl border border-[#0B5D2E15]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#44544A] block">
                {isEs ? 'Precio actual' : 'Current price'}
              </span>
              <span className="font-heading font-extrabold text-base text-[#0B5D2E]">
                {data.currentPrice ? formatCOP(data.currentPrice) : '---'}
              </span>
            </div>

            <div className="bg-[#EAF4EC]/60 p-3 rounded-2xl border border-[#0B5D2E15]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#44544A] block">
                {isEs ? 'Mínimo del período' : '30d Minimum'}
              </span>
              <span className="font-heading font-extrabold text-base text-[#0B5D2E]">
                {data.minPrice ? formatCOP(data.minPrice) : '---'}
              </span>
            </div>

            <div className="bg-[#EAF4EC]/60 p-3 rounded-2xl border border-[#0B5D2E15]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#44544A] block">
                {isEs ? 'Mediana del período' : '30d Median'}
              </span>
              <span className="font-heading font-extrabold text-base text-[#1C2B21]">
                {data.medianPrice ? formatCOP(Math.round(data.medianPrice)) : '---'}
              </span>
            </div>

            <div className="bg-[#EAF4EC]/60 p-3 rounded-2xl border border-[#0B5D2E15]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#44544A] block">
                {isEs ? 'Días con datos' : 'Days with data'}
              </span>
              <span className="font-heading font-extrabold text-base text-[#1C2B21]">
                {data.daysWithData} {isEs ? 'días' : 'days'}
              </span>
            </div>
          </div>

          {/* Chart or Insufficient Data Message */}
          {!data.hasSufficientData ? (
            <div className="py-8 px-4 rounded-2xl bg-[#F8FAF8] border border-dashed border-gray-300 text-center space-y-2">
              <Info className="w-6 h-6 text-[#0B5D2E] mx-auto opacity-70" />
              <h4 className="font-heading font-bold text-sm text-[#1C2B21]">
                {isEs ? 'Todavía estamos construyendo el histórico' : 'Still building the price history'}
              </h4>
              <p className="text-xs text-[#44544A] max-w-sm mx-auto leading-relaxed">
                {isEs
                  ? `Se requieren al menos 2 días distintos de consultas verificadas para trazar la tendencia en ${city}. Cada vez que busques ofertas o verifiques tiendas, el menor precio del día se registrará automáticamente aquí sin inventar datos.`
                  : `At least 2 distinct days of verified checks are required to plot trendlines in ${city}. As real offers are observed, daily minimums are plotted automatically.`}
              </p>
              {data.points.length === 1 && (
                <div className="pt-2 text-xs text-[#0B5D2E] font-semibold">
                  {isEs ? 'Último registro verificado:' : 'Latest verified observation:'}{' '}
                  <strong>{formatCOP(data.points[0].minPriceCop)}</strong> en{' '}
                  {data.points[0].merchantName} ({data.points[0].date})
                </div>
              )}
            </div>
          ) : (
            <div className="h-60 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.points}
                  margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="formattedDate"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickLine={false}
                    axisLine={{ stroke: '#CBD5E1' }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val: number) => `$${Math.round(val / 1000)}k`}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="minPriceCop"
                    stroke="#0B5D2E"
                    strokeWidth={2.5}
                    dot={{ fill: '#0B5D2E', r: 4, strokeWidth: 2, stroke: '#FFFFFF' }}
                    activeDot={{ fill: '#F57C1A', r: 6, strokeWidth: 2, stroke: '#FFFFFF' }}
                    connectNulls={false}
                    isAnimationActive={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Comparable Base Explicit Note (Rule requirement) */}
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-[#44544A]">
            <span>
              ℹ️ <strong>{data.comparableBaseNote}</strong>
            </span>
            <span className="text-gray-400 text-[10px]">
              {isEs ? 'Sin datos inventados' : 'No synthetic data'}
            </span>
          </div>
        </>
      )}
    </div>
  );
};
