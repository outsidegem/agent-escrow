import { createHmac, randomUUID } from 'crypto';
import { Capability } from '../models/types.js';
import stringify from 'fast-json-stable-stringify';

// In production, this must be injected via KMS or secure env.
const CAPABILITY_SECRET = process.env.ESCROW_SECRET || 'TITAN_LOCAL_DEV_SECRET_2026';

export function issueCapability(agentId: string, actionId: string, actionHash: string, actionType: string, resource: string, ttlMs: number = 60000): Capability {
  const capability: Capability = {
    capabilityId: randomUUID(),
    agentId, actionId, actionHash, actionType, resource,
    issuedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    nonce: randomUUID()
  };

  const payloadString = stringify(capability);
  capability.signature = createHmac('sha256', CAPABILITY_SECRET).update(payloadString).digest('hex');
  return capability;
}

export function verifyCapability(capability: Capability): boolean {
  if (Date.now() > capability.expiresAt) return false;
  
  const { signature, ...rawCapability } = capability;
  const payloadString = stringify(rawCapability);
  const expectedSignature = createHmac('sha256', CAPABILITY_SECRET).update(payloadString).digest('hex');
  
  // Prevent timing attacks
  return signature === expectedSignature;
}
