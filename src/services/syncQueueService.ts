export type SyncOperationType =
  | 'upsert_pet'
  | 'delete_pet'
  | 'save_plan'
  | 'save_weight'
  | 'save_meal'
  | 'save_purchase'
  | 'delete_purchase';

export interface SyncOperation {
  id: string;
  type: SyncOperationType;
  payload: any;
  timestamp: string;
  attempts: number;
  lastAttempt?: string;
  error?: string;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const QUEUE_STORAGE_KEY = 'racion_sync_queue_v2';
const LAST_SYNC_KEY = 'racion_last_sync_timestamp_v2';

type SyncListener = (status: SyncStatus) => void;

class SyncQueueManager {
  private queue: SyncOperation[] = [];
  private isSyncing: boolean = false;
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private listeners: Set<SyncListener> = new Set();
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private syncTimeout: number | null = null;
  private cachedIdToken: string | null = null;

  constructor() {
    this.loadQueue();
    this.loadLastSync();
    this.setupNetworkListeners();
  }

  private loadQueue() {
    if (typeof window === 'undefined') return;
    try {
      const data = localStorage.getItem(QUEUE_STORAGE_KEY);
      this.queue = data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('[SyncQueue] Error loading queue from localStorage:', e);
      this.queue = [];
    }
  }

  private saveQueue() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.error('[SyncQueue] Error saving queue to localStorage:', e);
    }
    this.notify();
  }

  private loadLastSync() {
    if (typeof window === 'undefined') return;
    try {
      this.lastSyncedAt = localStorage.getItem(LAST_SYNC_KEY);
    } catch {
      this.lastSyncedAt = null;
    }
  }

  private setLastSync(time: string) {
    this.lastSyncedAt = time;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LAST_SYNC_KEY, time);
      } catch {
        // ignore
      }
    }
    this.notify();
  }

  private setupNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      console.log('[SyncQueue] Browser reports ONLINE connection restored');
      this.isOnline = true;
      this.lastError = null;
      this.notify();
      // Trigger automatic sync immediately with exponential retry
      this.triggerDebouncedSync(800);
    });

    window.addEventListener('offline', () => {
      console.log('[SyncQueue] Browser reports OFFLINE mode');
      this.isOnline = false;
      this.notify();
    });

    // Check on visibility change (e.g. mobile user returns to app)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        this.isOnline = true;
        this.triggerDebouncedSync(1000);
      }
    });

    // Periodic heartbeat sync every 45s when online
    setInterval(() => {
      if (this.isOnline && this.queue.length > 0 && !this.isSyncing) {
        this.processQueue();
      }
    }, 45000);
  }

  public setIdToken(token: string | null) {
    this.cachedIdToken = token;
    if (token && this.queue.length > 0 && this.isOnline) {
      this.triggerDebouncedSync(500);
    }
  }

  /**
   * Enqueues an offline mutation and triggers background sync if online
   */
  public enqueue(type: SyncOperationType, payload: any) {
    const operation: SyncOperation = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type,
      payload,
      timestamp: new Date().toISOString(),
      attempts: 0,
    };

    // Coalesce operations when possible (e.g. updating the same pet multiple times)
    if (type === 'upsert_pet' && payload?.id) {
      const existingIdx = this.queue.findIndex(
        (op) => op.type === 'upsert_pet' && op.payload?.id === payload.id
      );
      if (existingIdx >= 0) {
        this.queue[existingIdx] = operation;
        this.saveQueue();
        this.triggerDebouncedSync(1500);
        return;
      }
    }

    if (type === 'save_plan' && payload?.petId) {
      const existingIdx = this.queue.findIndex(
        (op) => op.type === 'save_plan' && op.payload?.petId === payload.petId
      );
      if (existingIdx >= 0) {
        this.queue[existingIdx] = operation;
        this.saveQueue();
        this.triggerDebouncedSync(1500);
        return;
      }
    }

    this.queue.push(operation);
    this.saveQueue();
    console.log(`[SyncQueue] Enqueued operation ${type}. Queue size: ${this.queue.length}`);

    // If online, attempt to drain queue
    if (this.isOnline) {
      this.triggerDebouncedSync(1200);
    }
  }

  private triggerDebouncedSync(delayMs: number = 1000) {
    if (this.syncTimeout) {
      window.clearTimeout(this.syncTimeout);
    }
    this.syncTimeout = window.setTimeout(() => {
      this.processQueue();
    }, delayMs);
  }

  /**
   * Processes all pending items in the queue
   */
  public async processQueue(overrideToken?: string): Promise<{ success: boolean; syncedCount: number }> {
    const token = overrideToken || this.cachedIdToken;

    if (this.isSyncing) {
      return { success: false, syncedCount: 0 };
    }

    if (this.queue.length === 0) {
      return { success: true, syncedCount: 0 };
    }

    if (!navigator.onLine) {
      this.isOnline = false;
      this.notify();
      return { success: false, syncedCount: 0 };
    }

    // If user is not authenticated yet, we retain the queue in localStorage safely
    if (!token) {
      console.log('[SyncQueue] No auth token available yet. Retaining operations in queue.');
      return { success: false, syncedCount: 0 };
    }

    this.isSyncing = true;
    this.lastError = null;
    this.notify();

    console.log(`[SyncQueue] Draining sync queue (${this.queue.length} pending items)...`);

    try {
      // Send operations in batch
      const operationsToSend = this.queue.slice(0, 30); // batch up to 30 items per request

      const res = await fetch('/api/sync/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ operations: operationsToSend }),
      });

      if (!res.ok) {
        throw new Error(`Server sync error: HTTP ${res.status}`);
      }

      const result = await res.json();
      const processedIds: string[] = result.processedIds || [];

      // Remove successfully processed operations from the queue
      this.queue = this.queue.filter((op) => !processedIds.includes(op.id));
      this.saveQueue();

      this.setLastSync(new Date().toISOString());
      console.log(`[SyncQueue] Successfully synced ${processedIds.length} items. Remaining: ${this.queue.length}`);

      // If more items remain, trigger next batch
      if (this.queue.length > 0) {
        this.triggerDebouncedSync(500);
      }

      return { success: true, syncedCount: processedIds.length };
    } catch (err: any) {
      console.warn('[SyncQueue] Sync failed, will retry automatically:', err);
      this.lastError = err.message || 'Sync failed';

      // Increment attempt counter on sent items
      this.queue.forEach((op) => {
        op.attempts = (op.attempts || 0) + 1;
        op.lastAttempt = new Date().toISOString();
      });
      this.saveQueue();

      return { success: false, syncedCount: 0 };
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  public getStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: this.queue.length,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    };
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const status = this.getStatus();
    this.listeners.forEach((l) => {
      try {
        l(status);
      } catch (e) {
        console.error('[SyncQueue] Error notifying listener:', e);
      }
    });
  }

  public clearQueue() {
    this.queue = [];
    this.saveQueue();
  }
}

export const SyncQueue = new SyncQueueManager();
