import { DatabaseSync, StatementSync } from 'node:sqlite';
import { ActionState } from '../models/types.js';

export let db: DatabaseSync;

export const EscrowDB = {
  createAction: null as any as StatementSync,
  getAction: null as any as StatementSync,
  getActionByActionId: null as any as StatementSync,
  updateState: null as any as StatementSync,
  recordApproval: null as any as StatementSync,
  checkIdempotency: null as any as StatementSync,
  markCapabilityUsed: null as any as StatementSync,
  checkCapabilityUsed: null as any as StatementSync,
  getLastAuditEvent: null as any as StatementSync,
  appendAudit: null as any as StatementSync,
  expireStaleActions: null as any as StatementSync,
  getPendingActions: null as any as StatementSync
};

export function initDb(dbPath: string = process.env.ESCROW_DB_PATH || ':memory:'): DatabaseSync {
  if (db) {
    try {
      db.close();
    } catch {
      // Ignore error if already closed
    }
  }
  db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS actions (
      hashId TEXT PRIMARY KEY, actionId TEXT UNIQUE NOT NULL, agentId TEXT NOT NULL,
      actionType TEXT NOT NULL, state TEXT NOT NULL, riskLevel TEXT NOT NULL,
      expiresAt INTEGER NOT NULL, payload TEXT NOT NULL, policyVersion TEXT NOT NULL,
      idempotencyKey TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      approvalId TEXT PRIMARY KEY, hashId TEXT NOT NULL, reviewerId TEXT NOT NULL,
      decision TEXT NOT NULL, timestamp INTEGER NOT NULL,
      FOREIGN KEY(hashId) REFERENCES actions(hashId)
    );

    CREATE TABLE IF NOT EXISTS executed_capabilities (
      capabilityId TEXT PRIMARY KEY, timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      eventId INTEGER PRIMARY KEY AUTOINCREMENT,
      hashId TEXT NOT NULL, eventType TEXT NOT NULL,
      timestamp INTEGER NOT NULL, previousEventHash TEXT, eventHash TEXT NOT NULL,
      metadata TEXT
    );
  `);

  EscrowDB.createAction = db.prepare(`INSERT INTO actions (hashId, actionId, agentId, actionType, state, riskLevel, expiresAt, payload, policyVersion, idempotencyKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  EscrowDB.getAction = db.prepare(`SELECT * FROM actions WHERE hashId = ?`);
  EscrowDB.getActionByActionId = db.prepare(`SELECT * FROM actions WHERE actionId = ?`);
  EscrowDB.updateState = db.prepare(`UPDATE actions SET state = ? WHERE hashId = ? AND state = ?`);
  EscrowDB.recordApproval = db.prepare(`INSERT INTO approvals (approvalId, hashId, reviewerId, decision, timestamp) VALUES (?, ?, ?, ?, ?)`);
  EscrowDB.checkIdempotency = db.prepare(`SELECT hashId FROM actions WHERE idempotencyKey = ?`);
  EscrowDB.markCapabilityUsed = db.prepare(`INSERT INTO executed_capabilities (capabilityId, timestamp) VALUES (?, ?)`);
  EscrowDB.checkCapabilityUsed = db.prepare(`SELECT capabilityId FROM executed_capabilities WHERE capabilityId = ?`);
  EscrowDB.getLastAuditEvent = db.prepare(`SELECT eventHash FROM audit_log ORDER BY eventId DESC LIMIT 1`);
  EscrowDB.appendAudit = db.prepare(`INSERT INTO audit_log (hashId, eventType, timestamp, previousEventHash, eventHash, metadata) VALUES (?, ?, ?, ?, ?, ?)`);
  EscrowDB.expireStaleActions = db.prepare(`UPDATE actions SET state = '${ActionState.EXPIRED}' WHERE state IN ('${ActionState.CREATED}', '${ActionState.PENDING_REVIEW}', '${ActionState.APPROVED}') AND expiresAt < ?`);
  EscrowDB.getPendingActions = db.prepare(`SELECT * FROM actions WHERE state = '${ActionState.PENDING_REVIEW}'`);
  return db;
}

// Initialize default db
initDb();

export function setDbPath(path: string): DatabaseSync {
  return initDb(path);
}

export function transaction(cb: () => any) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = cb();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
