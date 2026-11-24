import { purchaseTerms } from '../../src/utils/hotmart.mjs';

export type PurchaseState = 'paid' | 'pending' | 'revoked';
export type AccessState = PurchaseState | 'not_purchased';
export interface PurchaseNotice {
  eventId: string;
  transaction: string;
  buyerKey: string | null;
  state: PurchaseState;
}

export interface LedgerStorage {
  sql: { exec(query: string, ...bindings: (string | null)[]): Iterable<Record<string, unknown>> };
  transactionSync<T>(callback: () => T): T;
}

export function normalizedEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const value = email.trim().toLowerCase();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value) ? value : null;
}

export async function buyerKey(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// One SQLite ledger per Hotmart product. Each transaction can revoke only its own
// purchase; a buyer with another approved purchase retains access.
export class PurchaseLedger {
  constructor(private storage: LedgerStorage) {
    storage.sql.exec('CREATE TABLE IF NOT EXISTS hotmart_sales (tx TEXT PRIMARY KEY, buyer TEXT, state TEXT NOT NULL)');
    storage.sql.exec('CREATE INDEX IF NOT EXISTS hotmart_buyer_state ON hotmart_sales(buyer, state)');
    storage.sql.exec('CREATE TABLE IF NOT EXISTS hotmart_events (id TEXT PRIMARY KEY)');
  }

  receive(notice: PurchaseNotice): void {
    const { sql } = this.storage;
    this.storage.transactionSync(() => {
      const accepted = [...sql.exec('INSERT OR IGNORE INTO hotmart_events (id) VALUES (?) RETURNING id', notice.eventId)];
      if (!accepted.length) return;
      // A cancellation or refund can arrive before approval, including without
      // buyer details. Keep its tombstone when an old approval is delivered later.
      sql.exec(`
        INSERT INTO hotmart_sales(tx, buyer, state) VALUES (?, ?, ?)
        ON CONFLICT(tx) DO UPDATE SET
          buyer = COALESCE(hotmart_sales.buyer, excluded.buyer),
          state = CASE
            WHEN hotmart_sales.state = 'revoked' OR excluded.state = 'revoked' THEN 'revoked'
            WHEN hotmart_sales.state = 'paid' OR excluded.state = 'paid' THEN 'paid'
            ELSE 'pending'
          END
        WHERE excluded.state = 'revoked' OR hotmart_sales.buyer IS NULL OR hotmart_sales.buyer = excluded.buyer
      `, notice.transaction, notice.buyerKey, notice.state);
    });
  }

  status(buyer: string) {
    const states = new Set([...this.storage.sql.exec(
      'SELECT DISTINCT state FROM hotmart_sales WHERE buyer = ?', buyer,
    )].map(row => row.state));
    let status: AccessState = 'not_purchased';
    if (states.has('paid')) status = 'paid';
    else if (states.has('pending')) status = 'pending';
    else if (states.has('revoked')) status = 'revoked';
    return {status, canAccess: status === 'paid', ...purchaseTerms};
  }
}
