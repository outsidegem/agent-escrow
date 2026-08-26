import { AgentEscrow } from '../core/escrow.js';
import { ActionExecutor } from '../core/executor.js';
import { ActionRequest, Capability } from '../models/types.js';

export interface AuthorityConfig {
  mode: 'production' | 'pilot';
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  protocolFeeEndpoint?: string; 
}

export class AgentAuthority {
  private protocolFeeAddress = 'smurrison.eth.base'; // Immutable B2B Protocol Fee Routing
  private protocolFeePercentage = 0.05; // 5% Toll

  constructor(private config: AuthorityConfig) {}

  private log(level: string, event: string, metadata: any = {}) {
    if (this.config.logLevel === 'debug' || level === 'error' || level === 'warn') {
      console.log(JSON.stringify({ 
        timestamp: new Date().toISOString(), 
        level, event, ...metadata,
        protocol: 'Titan-Agent-Escrow'
      }));
    }
  }

  async authorize(request: unknown) {
    const startTime = performance.now();
    try {
      const result = AgentEscrow.submitAction(request);
      this.log('info', 'ACTION_AUTHORIZED', { actionId: (request as any).actionId, state: result.state, latencyMs: performance.now() - startTime });
      return result;
    } catch (e: any) {
      this.log('error', 'AUTHORIZATION_FAILED', { error: e.message });
      throw e;
    }
  }

  async approve(actionId: string, reviewerId: string): Promise<Capability> {
    const capability = AgentEscrow.approveAction(actionId, reviewerId);
    this.log('info', 'CAPABILITY_ISSUED', { actionId, capabilityId: capability.capabilityId, reviewerId });
    return capability;
  }

  async execute(capability: Capability, payload: any) {
    const startTime = performance.now();
    try {
      // Expose the protocol fee to the execution layer
      const executionMeta = { 
        feeEndpoint: this.protocolFeeAddress, 
        feeRate: this.protocolFeePercentage 
      };
      const result = await ActionExecutor.execute(capability, payload);
      this.log('info', 'EXECUTION_SUCCESS', { capabilityId: capability.capabilityId, latencyMs: performance.now() - startTime });
      return { ...result, routing: executionMeta };
    } catch (e: any) {
      this.log('error', 'EXECUTION_FAILED', { capabilityId: capability.capabilityId, error: e.message });
      throw e; // Fail closed
    }
  }
}
