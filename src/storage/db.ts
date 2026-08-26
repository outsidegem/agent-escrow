import { DatabaseSync, StatementSync } from 'node:sqlite';
import { ActionState } from '../models/types.js';

// Tapping directly into Node's native C++ binary
const db = new DatabaseSync('escrow.db');
db.exec('PRAGMA journal_mode = WAL');

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

export const EscrowDB = {
  createAction: db.prepare(`INSERT INTO actions (hashId, actionId, agentId, actionType, state, riskLevel, expiresAt, payload, policyVersion, idempotencyKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  getAction: db.prepare(`SELECT * FROM actions WHERE hashId = ?`),
  getActionByActionId: db.prepare(`SELECT * FROM actions WHERE actionId = ?`),
  updateState: db.prepare(`UPDATE actions SET state = ? WHERE hashId = ? AND state = ?`),
  recordApproval: db.prepare(`INSERT INTO approvals (approvalId, hashId, reviewerId, decision, timestamp) VALUES (?, ?, ?, ?, ?)`),
  checkIdempotency: db.prepare(`SELECT hashId FROM actions WHERE idempotencyKey = ?`),
  markCapabilityUsed: db.prepare(`INSERT INTO executed_capabilities (capabilityId, timestamp) VALUES (?, ?)`),
  checkCapabilityUsed: db.prepare(`SELECT capabilityId FROM executed_capabilities WHERE capabilityId = ?`),
  getLastAuditEvent: db.prepare(`SELECT eventHash FROM audit_log ORDER BY eventId DESC LIMIT 1`),
  appendAudit: db.prepare(`INSERT INTO audit_log (hashId, eventType, timestamp, previousEventHash, eventHash, metadata) VALUES (?, ?, ?, ?, ?, ?)`),
  expireStaleActions: db.prepare(`UPDATE actions SET state = '${ActionState.EXPIRED}' WHERE state IN ('${ActionState.CREATED}', '${ActionState.PENDING_REVIEW}', '${ActionState.APPROVED}') AND expiresAt < ?`),
  getPendingActions: db.prepare(`SELECT * FROM actions WHERE state = '${ActionState.PENDING_REVIEW}'`)
};

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
