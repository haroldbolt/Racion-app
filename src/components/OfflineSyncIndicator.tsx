import React, { useEffect, useState } from 'react';
import { SyncQueue, SyncStatus } from '../services/syncQueueService';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle, Wifi, WifiOff } from 'lucide-react';

interface OfflineSyncIndicatorProps {
  idToken?: string | null;
  className?: string;
  isCompact?: boolean;
}

export const OfflineSyncIndicator: React.FC<OfflineSyncIndicatorProps> = ({
  idToken,
  className = '',
  isCompact = false,
}) => {
  const [status, setStatus] = useState<SyncStatus>(SyncQueue.getStatus());
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [justSynced, setJustSynced] = useState<boolean>(false);

  useEffect(() => {
    SyncQueue.setIdToken(idToken || null);
    const unsubscribe = SyncQueue.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    return () => unsubscribe();
  }, [idToken]);

  const handleManualSync = async () => {
    if (status.isSyncing) return;
    const res = await SyncQueue.processQueue();
    if (res.success && res.syncedCount > 0) {
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 3000);
    }
  };

  const formattedLastSync = status.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  // Compact Mode (for Header / Navbar)
  if (isCompact) {
    if (!status.isOnline) {
      return (
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold cursor-pointer hover:bg-amber-500/20 transition"
          title="Modo sin conexión: Los cambios se guardan localmente y se sincronizarán al reconectar"
        >
          <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="hidden sm:inline">Sin conexión</span>
          {status.pendingCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-amber-600 text-white text-[9px] flex items-center justify-center font-mono">
              {status.pendingCount}
            </span>
          )}
        </button>
      );
    }

    if (status.isSyncing) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E25] text-[11px] font-bold">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0B5D2E] shrink-0" />
          <span className="hidden sm:inline">Sincronizando...</span>
        </div>
      );
    }

    if (status.pendingCount > 0) {
      return (
        <button
          type="button"
          onClick={handleManualSync}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold cursor-pointer hover:bg-blue-100 transition"
          title={`${status.pendingCount} cambios pendientes de sincronizar. Clic para sincronizar.`}
        >
          <Cloud className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>{status.pendingCount} pend.</span>
        </button>
      );
    }

    // Fully synced online state
    return (
      <div
        className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold text-gray-400 hover:text-[#0B5D2E] transition cursor-pointer"
        onClick={() => setShowDetails(!showDetails)}
        title={formattedLastSync ? `Sincronizado con servidor (${formattedLastSync})` : 'Sincronizado'}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        <span className="hidden md:inline text-[10px] font-medium text-gray-500">En línea</span>
      </div>
    );
  }

  // Full Banner / Status Bar Mode
  return (
    <div className={`relative ${className}`}>
      {/* Offline Alert Strip */}
      {!status.isOnline && (
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-white px-4 py-2 text-xs font-semibold shadow-sm flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              <strong>Modo sin conexión activo:</strong> La app funciona al 100%. Tus registros y planes se guardan en tu dispositivo y se sincronizarán al reconectar.
            </span>
          </div>
          {status.pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-mono font-bold shrink-0">
              {status.pendingCount} cambios guardados
            </span>
          )}
        </div>
      )}

      {/* Syncing Activity Banner */}
      {status.isOnline && status.isSyncing && (
        <div className="bg-[#EAF4EC] border-b border-[#0B5D2E20] px-4 py-1.5 text-xs font-bold text-[#0B5D2E] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0B5D2E]" />
            <span>Sincronizando cambios locales con Cloud SQL...</span>
          </div>
          <span className="text-[11px] font-mono text-[#0B5D2E]">
            {status.pendingCount} en cola
          </span>
        </div>
      )}

      {/* Reconnected & Synced notification */}
      {justSynced && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-1.5 text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>¡Todos tus cambios sin conexión han sido sincronizados con el servidor!</span>
        </div>
      )}

      {/* Details Modal / Dropdown */}
      {showDetails && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in"
          onClick={() => setShowDetails(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                    status.isOnline ? 'bg-[#EAF4EC] text-[#0B5D2E]' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {status.isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                </div>
                <div>
                  <h4 className="font-heading font-extrabold text-sm text-[#1C2B21]">
                    {status.isOnline ? 'Conexión Activa' : 'Modo Fuera de Línea'}
                  </h4>
                  <span className="text-[10px] text-gray-500">
                    Almacenamiento local resiliente
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                <span className="text-gray-600">Estado de red:</span>
                <span className={`font-bold ${status.isOnline ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {status.isOnline ? '● En línea (Internet disponible)' : '● Sin conexión'}
                </span>
              </div>

              <div className="flex justify-between items-center p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                <span className="text-gray-600">Cambios pendientes:</span>
                <span className="font-mono font-bold text-gray-800">
                  {status.pendingCount} {status.pendingCount === 1 ? 'operación' : 'operaciones'}
                </span>
              </div>

              {formattedLastSync && (
                <div className="flex justify-between items-center p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                  <span className="text-gray-600">Última sincronización:</span>
                  <span className="font-mono text-gray-800">{formattedLastSync}</span>
                </div>
              )}

              {status.lastError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px]">
                  <strong>Último aviso:</strong> {status.lastError} (se reintentará automáticamente)
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1">
              {status.isOnline && (
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={status.isSyncing}
                  className="w-full min-h-[44px] bg-[#0B5D2E] text-white rounded-xl font-heading font-extrabold text-xs flex items-center justify-center gap-2 hover:bg-[#094723] transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${status.isSyncing ? 'animate-spin' : ''}`} />
                  <span>{status.isSyncing ? 'Sincronizando...' : 'Sincronizar con el servidor ahora'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="w-full py-2 text-xs text-gray-500 font-bold hover:underline text-center cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
