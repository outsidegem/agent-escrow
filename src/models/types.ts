import { z } from 'zod';

// Phase 14: RBAC Roles
export enum Role { AGENT = 'AGENT', REVIEWER = 'REVIEWER', ADMIN = 'ADMIN', AUDITOR = 'AUDITOR' }

export enum ActionState {
  CREATED = 'CREATED', PENDING_REVIEW = 'PENDING_REVIEW', APPROVED = 'APPROVED',
  DENIED = 'DENIED', EXECUTING = 'EXECUTING', EXECUTED = 'EXECUTED',
  FAILED = 'FAILED', EXPIRED = 'EXPIRED', CANCELLED = 'CANCELLED'
}

export enum RiskLevel { LOW = 'LOW', MEDIUM = 'MEDIUM', HIGH = 'HIGH', CRITICAL = 'CRITICAL' }

// Phase 18: Strict Input Security Limits
export const ActionRequestSchema = z.object({
  actionId: z.string().uuid(),
  agentId: z.string().max(100),
  actionType: z.string().max(50),
  payload: z.record(z.string(), z.any()), // Prevent massive payloads
  requestedAt: z.number(),
  expiresAt: z.number(),
  confidence: z.number().min(0).max(1),
  resource: z.string().max(255),
  permissions: z.array(z.string()).max(10),
  nonce: z.string().max(64),
  idempotencyKey: z.string().max(64),
  policyVersion: z.string()
});

export type ActionRequest = z.infer<typeof ActionRequestSchema>;

export interface Capability {
  capabilityId: string;
  agentId: string;
  actionId: string;
  actionHash: string;
  actionType: string;
  resource: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  signature?: string;
}
