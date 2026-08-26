import { Capability, ActionState } from '../models/types.js';
import { verifyCapability } from '../security/capability.js';
import { EscrowDB, transaction } from '../storage/db.js';
import { AgentEscrow } from './escrow.js';

export class ActionExecutor {
  static async execute(capability: Capability, actualPayload: any): Promise<any> {
    // 1. Cryptographic Signature & Expiration Check
    if (!verifyCapability(capability)) throw new Error('SECURITY VIOLATION: Invalid or expired capability signature.');

    return transaction(() => {
      // 2. Replay Protection (Phase 16)
      if (EscrowDB.checkCapabilityUsed.get(capability.capabilityId)) {
        AgentEscrow.logAudit(capability.actionHash, 'SECURITY_VIOLATION', 'Capability reuse attempted.');
        throw new Error('SECURITY VIOLATION: Capability has already been used.');
      }

      // 3. State & Resource Verification
      const action = EscrowDB.getAction.get(capability.actionHash) as any;
      if (!action || action.state !== ActionState.APPROVED) {
        throw new Error(`SECURITY VIOLATION: Action is in state ${action?.state || 'UNKNOWN'}, expected APPROVED.`);
      }

      // 4. Concurrency-Safe Execution Handoff
      AgentEscrow.advanceState(capability.actionHash, ActionState.EXECUTING, 'Capability verified. Executing.');
      EscrowDB.markCapabilityUsed.run(capability.capabilityId, Date.now());

      // --- MOCK REAL EXECUTION BOUNDARY ---
      const success = true; 

      if (success) {
        AgentEscrow.advanceState(capability.actionHash, ActionState.EXECUTED, 'Execution successful.');
        return { status: 'success', executedAt: Date.now() };
      } else {
        AgentEscrow.advanceState(capability.actionHash, ActionState.FAILED, 'Execution failed.');
        throw new Error('Execution failed at resource layer.');
      }
    });
  }
}
