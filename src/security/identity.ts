import stringify from 'fast-json-stable-stringify';
import { createHash } from 'crypto';
import { ActionRequest } from '../models/types.js';

export function generateCanonicalHash(request: ActionRequest): string {
  const canonicalString = stringify({
    actionId: request.actionId,
    agentId: request.agentId,
    actionType: request.actionType,
    payload: request.payload,
    resource: request.resource,
    permissions: request.permissions,
    nonce: request.nonce
  });

  return createHash('sha256').update(canonicalString).digest('hex');
}
