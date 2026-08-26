import Database, { Statement } from 'better-sqlite3';
import { ActionState } from '../models/types.js';

const db = new Database('escrow.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS actions (
    hashId TEXT PRIMARY KEY,
    actionId TEXT UNIQUE NOT NULL,
    agentId TEXT NOT NULL,
    actionType TEXT NOT NULL,
    state TEXT NOT NULL,
    riskLevel TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    payload TEXT NOT NULL,
    policyVersion TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hashId TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    previousState TEXT,
    newState TEXT NOT NULL,
    reason TEXT,
    FOREIGN KEY(hashId) REFERENCES actions(hashId)
  );
`);

export const EscrowDB = {
  createAction: db.prepare(`INSERT INTO actions (hashId, actionId, agentId, actionType, state, riskLevel, expiresAt, payload, policyVersion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  getAction: db.prepare(`SELECT * FROM actions WHERE hashId = ?`),
  updateState: db.prepare(`UPDATE actions SET state = ? WHERE hashId = ? AND state = ?`),
  logAudit: db.prepare(`INSERT INTO audit_log (hashId, timestamp, previousState, newState, reason) VALUES (?, ?, ?, ?, ?)`),
  expireStaleActions: db.prepare(`UPDATE actions SET state = '${ActionState.EXPIRED}' WHERE state IN ('${ActionState.CREATED}', '${ActionState.PENDING_REVIEW}', '${ActionState.APPROVED}') AND expiresAt < ?`),
  getPendingActions: db.prepare(`SELECT * FROM actions WHERE state = '${ActionState.PENDING_REVIEW}'`)
};

export function transaction(cb: () => void) {
  return db.transaction(cb)();
}
