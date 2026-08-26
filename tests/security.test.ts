import { describe, it, expect } from 'vitest';
import { AgentAuthority } from '../src/sdk/index.js';
import { randomUUID } from 'crypto';

describe('Phase 2: Enterprise Security Boundary', () => {
  const authority = new AgentAuthority({ mode: 'pilot' });

  it('Should reject execution of tampered capability signatures', async () => {
    const request = {
      actionId: randomUUID(), agentId: 'agent-007', actionType: 'transfer',
      payload: { amount: 500 }, // Adjusted to 500 to trigger PENDING_REVIEW
      requestedAt: Date.now(), expiresAt: Date.now() + 10000,
      confidence: 0.9, resource: 'wallet-main', permissions: ['write'],
      nonce: randomUUID(), idempotencyKey: randomUUID(), policyVersion: '1.0'
    };

    await authority.authorize(request);
    const capability = await authority.approve(request.actionId, 'admin-1');

    // Tamper with the capability
    capability.resource = 'hacker-wallet';

    await expect(authority.execute(capability, request.payload))
      .rejects.toThrow('SECURITY VIOLATION: Invalid or expired capability signature.');
  });

  it('Should prevent replay attacks (Capability reuse)', async () => {
    const request = {
      actionId: randomUUID(), agentId: 'agent-008', actionType: 'refund',
      payload: { amount: 500 }, // Adjusted to 500 to trigger PENDING_REVIEW
      requestedAt: Date.now(), expiresAt: Date.now() + 10000,
      confidence: 0.9, resource: 'stripe-api', permissions: ['write'],
      nonce: randomUUID(), idempotencyKey: randomUUID(), policyVersion: '1.0'
    };

    await authority.authorize(request);
    const capability = await authority.approve(request.actionId, 'admin-1');

    // First execution succeeds
    const result = await authority.execute(capability, request.payload);
    expect(result.status).toBe('success');

    // Replay attack fails
    await expect(authority.execute(capability, request.payload))
      .rejects.toThrow('SECURITY VIOLATION: Capability has already been used.');
  });
});
