import * as crypto from 'crypto';

export interface EscrowConfig {
  confidenceThreshold: number; // e.g., 0.85 (85% confidence required to bypass human)
}

export interface EscrowReceipt {
  actionHash: string;
  status: 'APPROVED' | 'DENIED' | 'PENDING';
  payload: any;
  timestamp: number;
}

export class EscrowRouter {
  private config: EscrowConfig;
  private pendingEscrows: Map<string, EscrowReceipt> = new Map();

  constructor(config: EscrowConfig) {
    this.config = config;
  }

  /**
   * Evaluates an agent's intended action.
   * @returns `true` if authorized, or a `string` (the hash) if placed in escrow.
   */
  public evaluateAction(agentConfidence: number, actionPayload: any): true | string {
    if (agentConfidence >= this.config.confidenceThreshold) {
      return true; // Agent is highly confident, auto-approve
    }

    // Confidence too low. Hash the payload and lock it in Escrow.
    const payloadString = JSON.stringify(actionPayload);
    const actionHash = crypto.createHash('sha256').update(payloadString).digest('hex');
    
    this.pendingEscrows.set(actionHash, {
      actionHash,
      status: 'PENDING',
      payload: actionPayload,
      timestamp: Date.now()
    });

    return actionHash;
  }

  /**
   * The 1-bit human override. Resolves the pending escrow.
   */
  public resolveEscrow(actionHash: string, decision: boolean): boolean {
    const escrow = this.pendingEscrows.get(actionHash);
    if (!escrow) {
      throw new Error(`[ESCROW-ROUTER] INVALID HASH: No pending action found for ${actionHash}`);
    }
    if (escrow.status !== 'PENDING') {
      throw new Error(`[ESCROW-ROUTER] ACTION ALREADY RESOLVED: Current status is ${escrow.status}`);
    }

    escrow.status = decision ? 'APPROVED' : 'DENIED';
    return decision;
  }

  public getPendingAction(actionHash: string): EscrowReceipt | undefined {
    return this.pendingEscrows.get(actionHash);
  }
}
