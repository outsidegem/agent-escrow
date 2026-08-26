import { ActionRequestSchema, ActionState } from '../models/types.js';
import { generateCanonicalHash } from '../security/identity.js';
import { evaluatePolicy } from '../engine/policy.js';
import { isValidTransition } from '../engine/state.js';
import { EscrowDB, transaction } from '../storage/db.js';

export class AgentEscrow {
  static submitAction(rawRequest: unknown): { hashId: string; state: ActionState } {
    const request = ActionRequestSchema.parse(rawRequest);
    if (Date.now() > request.expiresAt) throw new Error('Cannot submit expired action request.');
    const hashId = generateCanonicalHash(request);
    const decision = evaluatePolicy(request);
    
    transaction(() => {
      EscrowDB.createAction.run(
        hashId, request.actionId, request.agentId, request.actionType, 
        decision.state, decision.riskLevel, request.expiresAt, 
        JSON.stringify(request.payload), request.policyVersion
      );
      EscrowDB.logAudit.run(hashId, Date.now(), null, decision.state, decision.reason);
    });

    return { hashId, state: decision.state };
  }

  static advanceState(hashId: string, newState: ActionState, reason: string) {
    transaction(() => {
      EscrowDB.expireStaleActions.run(Date.now());
      const action = EscrowDB.getAction.get(hashId) as any;
      if (!action) throw new Error('Action not found.');
      if (!isValidTransition(action.state as ActionState, newState)) throw new Error(`Invalid transition`);
      
      const info = EscrowDB.updateState.run(newState, hashId, action.state);
      if (info.changes === 0) throw new Error('Concurrency conflict.');
      EscrowDB.logAudit.run(hashId, Date.now(), action.state, newState, reason);
    });
  }
}
