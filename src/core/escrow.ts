import { ActionRequestSchema, ActionRequest, ActionState, Capability } from '../models/types.js';
import { generateCanonicalHash } from '../security/identity.js';
import { evaluatePolicy } from '../engine/policy.js';
import { isValidTransition } from '../engine/state.js';
import { EscrowDB, transaction } from '../storage/db.js';
import { issueCapability } from '../security/capability.js';
import { createHash, randomUUID } from 'crypto';

export class AgentEscrow {
  static logAudit(hashId: string, eventType: string, metadata: string) {
    const lastEvent = EscrowDB.getLastAuditEvent.get() as any;
    const previousHash = lastEvent ? lastEvent.eventHash : 'GENESIS';
    const timestamp = Date.now();
    const eventHash = createHash('sha256').update(`${hashId}${eventType}${timestamp}${previousHash}`).digest('hex');
    EscrowDB.appendAudit.run(hashId, eventType, timestamp, previousHash, eventHash, metadata);
  }

  static submitAction(rawRequest: unknown) {
    const request = ActionRequestSchema.parse(rawRequest);
    if (Date.now() > request.expiresAt) throw new Error('Cannot submit expired request.');
    
    // Phase 16: Idempotency Check
    const existing = EscrowDB.checkIdempotency.get(request.idempotencyKey) as any;
    if (existing) return { hashId: existing.hashId, status: 'IDEMPOTENT_REPLAY' };

    const hashId = generateCanonicalHash(request);
    const decision = evaluatePolicy(request);
    
    transaction(() => {
      EscrowDB.createAction.run(
        hashId, request.actionId, request.agentId, request.actionType, 
        decision.state, decision.riskLevel, request.expiresAt, 
        JSON.stringify(request.payload), request.policyVersion, request.idempotencyKey
      );
      this.logAudit(hashId, 'ACTION_CREATED', `Risk: ${decision.riskLevel}`);
    });

    return { hashId, state: decision.state, actionId: request.actionId };
  }

  static approveAction(actionId: string, reviewerId: string): Capability {
    return transaction(() => {
      const action = EscrowDB.getActionByActionId.get(actionId) as any;
      if (!action) throw new Error('Action not found.');
      
      this.advanceState(action.hashId, ActionState.APPROVED, 'Approved by Reviewer');
      EscrowDB.recordApproval.run(randomUUID(), action.hashId, reviewerId, 'APPROVE', Date.now());
      this.logAudit(action.hashId, 'ACTION_APPROVED', `Reviewer: ${reviewerId}`);
      
      // Phase 11: Issue Capability
      const capability = issueCapability(action.agentId, action.actionId, action.hashId, action.actionType, action.resource);
      this.logAudit(action.hashId, 'CAPABILITY_ISSUED', `CapID: ${capability.capabilityId}`);
      return capability;
    });
  }

  static advanceState(hashId: string, newState: ActionState, reason: string) {
      EscrowDB.expireStaleActions.run(Date.now());
      const action = EscrowDB.getAction.get(hashId) as any;
      if (!action) throw new Error('Action not found.');
      if (!isValidTransition(action.state as ActionState, newState)) throw new Error(`Invalid transition from ${action.state} to ${newState}`);
      
      const info = EscrowDB.updateState.run(newState, hashId, action.state);
      if (info.changes === 0) throw new Error('Concurrency conflict or action mutated.');
  }
}
