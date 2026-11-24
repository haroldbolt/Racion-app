import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {PurchaseLedger, type LedgerStorage, type PurchaseNotice} from '../workers/billing/engine';

// Run the same SQL used by the SQLite-backed Cloudflare Durable Object.
function database() {
  const db = new DatabaseSync(':memory:');
  const storage: LedgerStorage = {
    sql: {exec(query, ...bindings) { return db.prepare(query).all(...bindings); }},
    transactionSync<T>(action: () => T) {
      db.exec('BEGIN');
      try {
        const result = action();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return storage;
}

const purchased = {amountCents:2500, currency:'USD', renewal:false, status:'paid', canAccess:true};
const approved: PurchaseNotice = {eventId:'checkout-approved', transaction:'HP123', state:'paid', buyerKey:'buyer-a'};

test('a one-time purchase persists after reopening storage and remains isolated from other buyers', () => {
  const storage = database();
  const ledger = new PurchaseLedger(storage);
  assert.deepEqual(ledger.status('buyer-a'), {...purchased, status:'not_purchased', canAccess:false});
  ledger.receive({...approved, state:'pending', eventId:'pending'});
  assert.equal(ledger.status('buyer-a').status, 'pending');
  ledger.receive(approved);
  ledger.receive(approved);
  const reloaded = new PurchaseLedger(storage);
  reloaded.receive({...approved, state:'pending', eventId:'delayed-replay'});
  assert.deepEqual(reloaded.status('buyer-a'), purchased);
  assert.equal(reloaded.status('buyer-b').canAccess, false);
  reloaded.receive({...approved, buyerKey:'buyer-b', eventId:'changed-buyer'});
  assert.equal(reloaded.status('buyer-b').canAccess, false);
});

test('revocations defeat earlier and delayed approvals and affect only that transaction', () => {
  const ledger = new PurchaseLedger(database());
  ledger.receive({eventId:'refund', transaction:'HP123', buyerKey:null, state:'revoked'});
  ledger.receive(approved);
  assert.deepEqual(ledger.status('buyer-a'), {...purchased, status:'revoked', canAccess:false});
  ledger.receive({...approved, eventId:'checkout-2-approved', transaction:'HP456'});
  assert.equal(ledger.status('buyer-a').canAccess, true);
  ledger.receive({...approved, eventId:'repeated-refund', state:'revoked'});
  assert.equal(ledger.status('buyer-a').canAccess, true);
  ledger.receive({eventId:'bank-chargeback', transaction:'HP456', buyerKey:'changed-email', state:'revoked'});
  ledger.receive({...approved, eventId:'complete-late', transaction:'HP456'});
  assert.equal(ledger.status('buyer-a').status, 'revoked');
});

test('old billing records cannot unlock the Hotmart workspace and duplicate event IDs do not add rights', () => {
  const storage = database();
  storage.sql.exec('CREATE TABLE legacy (trial_active INTEGER)');
  storage.sql.exec('INSERT INTO legacy VALUES (1)');
  const ledger = new PurchaseLedger(storage);
  assert.equal(ledger.status('buyer-a').canAccess, false);
  ledger.receive(approved);
  ledger.receive({...approved, buyerKey:'buyer-b', transaction:'HP456'});
  assert.equal(ledger.status('buyer-b').canAccess, false);
});
