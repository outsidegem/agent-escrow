import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Capability } from '../models/types.js';
import stringify from 'fast-json-stable-stringify';

// In production, this must be injected via KMS or secure env.
const CAPABILITY_SECRET = process.env.ESCROW_SECRET || 'TITAN_LOCAL_DEV_SECRET_2026';

export function issueCapability(
  agentId: string,
  actionId: string,
  actionHash: string,
  actionType: string,
  resource: string,
  ttlMs: number = 60000
): Capability {
  const capability: Capability = {
    capabilityId: randomUUID(),
    agentId,
    actionId,
    actionHash,
    actionType,
    resource,
    issuedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    nonce: randomUUID()
  };

  const payloadString = stringify(capability);
  capability.signature = createHmac('sha256', CAPABILITY_SECRET).update(payloadString).digest('hex');
  return capability;
}

export function verifyCapability(capability: Capability): boolean {
  if (!capability || typeof capability !== 'object') return false;
  if (typeof capability.expiresAt !== 'number' || Date.now() > capability.expiresAt) return false;

  const { signature, ...rawCapability } = capability;
  if (!signature || typeof signature !== 'string') return false;
  // HMAC-SHA256 hex digest must be a valid 64-character even-length hexadecimal string
  if (signature.length !== 64 || signature.length % 2 !== 0 || !/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }

  const payloadString = stringify(rawCapability);
  const expectedSignature = createHmac('sha256', CAPABILITY_SECRET).update(payloadString).digest('hex');

  const provided = Buffer.from(signature, 'hex');
  const expected = Buffer.from(expectedSignature, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
