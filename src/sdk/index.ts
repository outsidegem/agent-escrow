import { AgentEscrow } from '../core/escrow.js';
import { ActionExecutor } from '../core/executor.js';
import { Capability } from '../models/types.js';
import { setDbPath } from '../storage/db.js';

export type FeeTier = 'FREE' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';

export const FEE_TIER_BPS: Record<FeeTier, bigint> = {
  FREE: 50n,        // 50 bps = 0.50%
  PRO: 25n,         // 25 bps = 0.25%
  ENTERPRISE: 0n,   //  0 bps = 0.00%
  CUSTOM: 0n
};

export const BPS_DENOMINATOR = 10000n;
export const DEFAULT_FEE_ENS = 'smurrison.eth.base';
export const ZERO_EVM_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface ProtocolFeeConfig {
  feeRecipient: string;          // Hex address (0x...) or canonical ENS ('smurrison.eth.base')
  tier: FeeTier;
  customBps?: bigint;
}

export interface FeeSplitResult {
  grossAmount: bigint;
  protocolFee: bigint;
  netAmount: bigint;
  feeBps: bigint;
  recipient: string;
}

/**
 * Validates and normalizes a fee recipient identifier.
 * Accepts the canonical ENS identifier ('smurrison.eth.base') or a 20-byte non-zero hex EVM address.
 * Never silently falls back when a malformed recipient is supplied.
 */
export function validateFeeRecipient(recipient: string): string {
  if (typeof recipient !== 'string' || recipient.trim() === '') {
    throw new Error('Invalid fee recipient: recipient must be a non-empty string.');
  }
  const trimmed = recipient.trim();
  if (trimmed === DEFAULT_FEE_ENS) {
    return DEFAULT_FEE_ENS;
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    const normalized = trimmed.toLowerCase();
    if (normalized === ZERO_EVM_ADDRESS) {
      throw new Error('Invalid fee recipient: zero address is not permitted.');
    }
    return normalized;
  }
  throw new Error(
    `Invalid fee recipient "${trimmed}": must be a valid 20-byte EVM hex address (0x...) or "${DEFAULT_FEE_ENS}".`
  );
}

/**
 * Resolves the active fee recipient from explicit configuration or `process.env.DMS_FEE_RECIPIENT_HEX`.
 * Fails closed if a configured address is malformed.
 */
export function resolveFeeRecipient(configured?: string): string {
  if (configured !== undefined && configured !== '') {
    return validateFeeRecipient(configured);
  }
  const envHex = process.env.DMS_FEE_RECIPIENT_HEX;
  if (envHex !== undefined && envHex !== '') {
    if (!/^0x[0-9a-fA-F]{40}$/.test(envHex.trim())) {
      throw new Error('Invalid DMS_FEE_RECIPIENT_HEX: must be a 40-hex-character 0x-prefixed EVM address.');
    }
    return validateFeeRecipient(envHex);
  }
  return DEFAULT_FEE_ENS;
}

/**
 * Calculates deterministic protocol fee split using BigInt basis points:
 * - Formula: `protocolFee = (grossAmount * feeBps) / 10000n` (integer floor towards zero)
 * - Net amount: `netAmount = grossAmount - protocolFee` (deducted from gross; `protocolFee + netAmount === grossAmount`)
 */
export function calculateFeeSplit(grossAmount: bigint, config: ProtocolFeeConfig): FeeSplitResult {
  if (typeof grossAmount !== 'bigint' || grossAmount < 0n) {
    throw new Error('Invalid grossAmount: must be a non-negative bigint.');
  }
  if (!config || !Object.prototype.hasOwnProperty.call(FEE_TIER_BPS, config.tier)) {
    throw new Error(`Invalid fee tier: ${String(config?.tier)}.`);
  }

  const recipient = validateFeeRecipient(config.feeRecipient);

  const feeBps =
    config.tier === 'CUSTOM' && config.customBps !== undefined
      ? config.customBps
      : FEE_TIER_BPS[config.tier];

  if (typeof feeBps !== 'bigint' || feeBps < 0n || feeBps > BPS_DENOMINATOR) {
    throw new Error(`Invalid fee basis points: ${String(feeBps)}. Must be between 0 and 10000.`);
  }

  const protocolFee = (grossAmount * feeBps) / BPS_DENOMINATOR;
  const netAmount = grossAmount - protocolFee;

  return {
    grossAmount,
    protocolFee,
    netAmount,
    feeBps,
    recipient
  };
}

export interface AuthorityConfig {
  mode: 'production' | 'pilot';
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  protocolFeeEndpoint?: string;
  tier?: FeeTier;
  customBps?: bigint;
  feeRecipientHex?: string;
  dbPath?: string;
}

export class AgentAuthority {
  private protocolFeeAddress: string;
  private tier: FeeTier;
  private customBps?: bigint;

  constructor(private config: AuthorityConfig) {
    const tier = config.tier ?? 'FREE';
    if (!Object.prototype.hasOwnProperty.call(FEE_TIER_BPS, tier)) {
      throw new Error(`Invalid fee tier: ${String(tier)}.`);
    }
    this.tier = tier;
    this.customBps = config.customBps;
    if (this.tier === 'CUSTOM') {
      if (this.customBps === undefined || this.customBps < 0n || this.customBps > BPS_DENOMINATOR) {
        throw new Error('Invalid customBps for CUSTOM tier.');
      }
    }
    this.protocolFeeAddress = resolveFeeRecipient(config.feeRecipientHex ?? config.protocolFeeEndpoint);
    if (config.dbPath) {
      setDbPath(config.dbPath);
    }
  }

  public getFeeConfig(): ProtocolFeeConfig {
    return {
      feeRecipient: this.protocolFeeAddress,
      tier: this.tier,
      customBps: this.customBps
    };
  }

  public calculateFee(grossAmount: bigint): FeeSplitResult {
    return calculateFeeSplit(grossAmount, this.getFeeConfig());
  }

  private log(level: string, event: string, metadata: any = {}) {
    if (this.config.logLevel === 'debug' || level === 'error' || level === 'warn') {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level,
          event,
          ...metadata,
          protocol: 'Titan-Agent-Escrow'
        })
      );
    }
  }

  async authorize(request: unknown) {
    const startTime = performance.now();
    try {
      const result = AgentEscrow.submitAction(request);
      this.log('info', 'ACTION_AUTHORIZED', {
        actionId: (request as any).actionId,
        state: result.state,
        latencyMs: performance.now() - startTime
      });
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

  async execute(capability: Capability, payload: any, grossAmount?: bigint) {
    const startTime = performance.now();
    try {
      const feeSplit = grossAmount !== undefined ? this.calculateFee(grossAmount) : undefined;
      const feeBps =
        this.tier === 'CUSTOM' && this.customBps !== undefined ? this.customBps : FEE_TIER_BPS[this.tier];
      const executionMeta = {
        feeEndpoint: this.protocolFeeAddress,
        feeTier: this.tier,
        feeBps: Number(feeBps),
        feeRate: Number(feeBps) / 10000,
        feeSplit
      };
      const result = await ActionExecutor.execute(capability, payload);
      this.log('info', 'EXECUTION_SUCCESS', {
        capabilityId: capability.capabilityId,
        latencyMs: performance.now() - startTime
      });
      return { ...result, routing: executionMeta };
    } catch (e: any) {
      this.log('error', 'EXECUTION_FAILED', { capabilityId: capability.capabilityId, error: e.message });
      throw e; // Fail closed
    }
  }
}
