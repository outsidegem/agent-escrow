import { ActionState } from '../models/types.js';

const VALID_TRANSITIONS: Record<ActionState, ActionState[]> = {
  [ActionState.CREATED]: [ActionState.PENDING_REVIEW, ActionState.APPROVED, ActionState.DENIED, ActionState.EXPIRED],
  [ActionState.PENDING_REVIEW]: [ActionState.APPROVED, ActionState.DENIED, ActionState.EXPIRED, ActionState.CANCELLED],
  [ActionState.APPROVED]: [ActionState.EXECUTING, ActionState.EXPIRED, ActionState.CANCELLED],
  [ActionState.DENIED]: [],
  [ActionState.EXECUTING]: [ActionState.EXECUTED, ActionState.FAILED],
  [ActionState.EXECUTED]: [],
  [ActionState.FAILED]: [],
  [ActionState.EXPIRED]: [],
  [ActionState.CANCELLED]: []
};

export function isValidTransition(current: ActionState, target: ActionState): boolean {
  return VALID_TRANSITIONS[current]?.includes(target) ?? false;
}
