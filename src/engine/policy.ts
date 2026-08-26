import { ActionRequest, RiskLevel, ActionState } from '../models/types.js';

export interface PolicyDecision {
  state: ActionState.APPROVED | ActionState.PENDING_REVIEW | ActionState.DENIED;
  riskLevel: RiskLevel;
  reason: string;
}

export function evaluatePolicy(request: ActionRequest): PolicyDecision {
  const amount = Number(request.payload?.amount) || 0;

  if (request.actionType.includes('delete') && request.resource.includes('production')) {
    return { state: ActionState.DENIED, riskLevel: RiskLevel.CRITICAL, reason: 'Production deletion prohibited.' };
  }
  if (request.actionType === 'modify_iam') {
    return { state: ActionState.PENDING_REVIEW, riskLevel: RiskLevel.CRITICAL, reason: 'IAM modifications require HITL.' };
  }
  if (request.actionType === 'refund' || request.actionType === 'transfer') {
    if (amount > 1000) return { state: ActionState.DENIED, riskLevel: RiskLevel.HIGH, reason: 'Exceeds maximum.' };
    if (amount > 50) return { state: ActionState.PENDING_REVIEW, riskLevel: RiskLevel.MEDIUM, reason: 'Requires review.' };
  }
  if (request.confidence < 0.85) {
    return { state: ActionState.PENDING_REVIEW, riskLevel: RiskLevel.MEDIUM, reason: 'Confidence below threshold.' };
  }

  return { state: ActionState.APPROVED, riskLevel: RiskLevel.LOW, reason: 'Passed policies.' };
}
