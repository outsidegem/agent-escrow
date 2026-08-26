import { z } from 'zod';

export const ActionRequestSchema = z.object({
  actionId: z.string().uuid(),
  agentId: z.string(),
  actionType: z.string(),
  payload: z.record(z.string(), z.any()),
  requestedAt: z.number(),
  expiresAt: z.number(),
  confidence: z.number().min(0).max(1),
  resource: z.string(),
  permissions: z.array(z.string()),
  nonce: z.string(),
  idempotencyKey: z.string(),
  policyVersion: z.string()
});

export type ActionRequest = z.infer<typeof ActionRequestSchema>;

export enum ActionState {
  CREATED = 'CREATED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
  EXECUTING = 'EXECUTING',
  EXECUTED = 'EXECUTED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED'
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}
