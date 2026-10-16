import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  AgentAuthority,
  AgentEscrow,
  calculateFeeSplit,
  validateFeeRecipient,
  resolveFeeRecipient,
  verifyCapability,
  issueCapability,
  setDbPath,
  DEFAULT_FEE_ENS,
  ZERO_EVM_ADDRESS
} from '../src/index.js';

describe('Phase 2: Enterprise Security Boundary & Fee Settlement Engine', () => {
  let authority: AgentAuthority;
  let tempDir: string | null = null;

  beforeEach(() => {
    setDbPath(':memory:');
    authority = new AgentAuthority({ mode: 'pilot', dbPath: ':memory:' });
  });

  afterEach(() => {
    delete process.env.DMS_FEE_RECIPIENT_HEX;
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('1. rejects execution of tampered capability signatures', async () => {
    const request = {
      actionId: randomUUID(),
      agentId: 'agent-007',
      actionType: 'transfer',
      payload: { amount: 500 },
      requestedAt: Date.now(),
      expiresAt: Date.now() + 10000,
      confidence: 0.9,
      resource: 'wallet-main',
      permissions: ['write'],
      nonce: randomUUID(),
      idempotencyKey: randomUUID(),
      policyVersion: '1.0'
    };

    await authority.authorize(request);
    const capability = await authority.approve(request.actionId, 'admin-1');

    capability.resource = 'hacker-wallet';

    await expect(authority.execute(capability, request.payload)).rejects.toThrow(
      'SECURITY VIOLATION: Invalid or expired capability signature.'
    );
  });

  it('2. rejects malformed, truncated, odd-length, and non-hex capability signatures without throwing', () => {
    const cap = issueCapability('agent-1', randomUUID(), 'hash-1', 'transfer', 'wallet-1');
    expect(verifyCapability(cap)).toBe(true);

    expect(verifyCapability({ ...cap, signature: '' })).toBe(false);
    expect(verifyCapability({ ...cap, signature: 'abc' })).toBe(false); // odd length
    expect(verifyCapability({ ...cap, signature: 'deadbeef' })).toBe(false); // truncated
    expect(verifyCapability({ ...cap, signature: 'z'.repeat(64) })).toBe(false); // non-hex
    expect(verifyCapability({ ...cap, expiresAt: Date.now() - 1 })).toBe(false); // expired
    expect(verifyCapability(null as any)).toBe(false);
  });

  it('3. prevents replay attacks (Capability reuse)', async () => {
    const request = {
      actionId: randomUUID(),
      agentId: 'agent-008',
      actionType: 'refund',
      payload: { amount: 500 },
      requestedAt: Date.now(),
      expiresAt: Date.now() + 10000,
      confidence: 0.9,
      resource: 'stripe-api',
      permissions: ['write'],
      nonce: randomUUID(),
      idempotencyKey: randomUUID(),
      policyVersion: '1.0'
    };

    await authority.authorize(request);
    const capability = await authority.approve(request.actionId, 'admin-1');

    const result = await authority.execute(capability, request.payload);
    expect(result.status).toBe('success');

    await expect(authority.execute(capability, request.payload)).rejects.toThrow(
      'SECURITY VIOLATION: Capability has already been used.'
    );
  });

  it('4. supports configurable file-backed database paths across restarts', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'escrow-db-test-'));
    const customDbPath = join(tempDir, 'custom-escrow.db');
    setDbPath(customDbPath);

    const request = {
      actionId: randomUUID(),
      agentId: 'agent-persist',
      actionType: 'transfer',
      payload: { amount: 500 },
      requestedAt: Date.now(),
      expiresAt: Date.now() + 30000,
      confidence: 0.9,
      resource: 'vault',
      permissions: ['write'],
      nonce: randomUUID(),
      idempotencyKey: 'idem-persist-1',
      policyVersion: '1.0'
    };

    const sub1 = AgentEscrow.submitAction(request);
    expect(sub1.state).toBe('PENDING_REVIEW');

    // Re-initialize against the same file path and verify idempotency persists
    setDbPath(customDbPath);
    const sub2 = AgentEscrow.submitAction(request);
    expect(sub2.status).toBe('IDEMPOTENT_REPLAY');
    expect(sub2.hashId).toBe(sub1.hashId);
  });

  describe('Dynamic Fee Calculation Engine & Recipient Validation', () => {
    const validRecipient = '0x1111111111111111111111111111111111111111';
    const gross = 1_000_000_000n;

    it('5. calculates 50 bps for FREE, 25 bps for PRO, and 0 bps for ENTERPRISE', () => {
      const freeSplit = calculateFeeSplit(gross, { feeRecipient: validRecipient, tier: 'FREE' });
      expect(freeSplit.feeBps).toBe(50n);
      expect(freeSplit.protocolFee).toBe(5_000_000n);
      expect(freeSplit.netAmount).toBe(995_000_000n);
      expect(freeSplit.protocolFee + freeSplit.netAmount).toBe(gross);

      const proSplit = calculateFeeSplit(gross, { feeRecipient: validRecipient, tier: 'PRO' });
      expect(proSplit.feeBps).toBe(25n);
      expect(proSplit.protocolFee).toBe(2_500_000n);
      expect(proSplit.netAmount).toBe(997_500_000n);
      expect(proSplit.protocolFee + proSplit.netAmount).toBe(gross);

      const entSplit = calculateFeeSplit(gross, { feeRecipient: validRecipient, tier: 'ENTERPRISE' });
      expect(entSplit.feeBps).toBe(0n);
      expect(entSplit.protocolFee).toBe(0n);
      expect(entSplit.netAmount).toBe(gross);
    });

    it('6. enforces deterministic floor rounding, zero-value handling, and conservation of value', () => {
      const zeroSplit = calculateFeeSplit(0n, { feeRecipient: validRecipient, tier: 'FREE' });
      expect(zeroSplit.protocolFee).toBe(0n);
      expect(zeroSplit.netAmount).toBe(0n);

      // 199 wei * 50 / 10000 = 0 wei (floor); 200 wei * 50 / 10000 = 1 wei
      const subBoundary = calculateFeeSplit(199n, { feeRecipient: validRecipient, tier: 'FREE' });
      expect(subBoundary.protocolFee).toBe(0n);
      expect(subBoundary.netAmount).toBe(199n);

      const exactBoundary = calculateFeeSplit(200n, { feeRecipient: validRecipient, tier: 'FREE' });
      expect(exactBoundary.protocolFee).toBe(1n);
      expect(exactBoundary.netAmount).toBe(199n);
      expect(exactBoundary.protocolFee + exactBoundary.netAmount).toBe(200n);

      expect(() => calculateFeeSplit(-1n, { feeRecipient: validRecipient, tier: 'FREE' })).toThrow(
        'non-negative bigint'
      );
    });

    it('7. validates fee recipients and rejects zero or malformed addresses and unauthorized tiers', () => {
      expect(validateFeeRecipient(DEFAULT_FEE_ENS)).toBe(DEFAULT_FEE_ENS);
      expect(validateFeeRecipient('0xAbCdEf0123456789AbCdEf0123456789AbCdEf01')).toBe(
        '0xabcdef0123456789abcdef0123456789abcdef01'
      );

      expect(() => validateFeeRecipient('')).toThrow('Invalid fee recipient');
      expect(() => validateFeeRecipient(ZERO_EVM_ADDRESS)).toThrow('zero address is not permitted');
      expect(() => validateFeeRecipient('0x12345')).toThrow('Invalid fee recipient');
      expect(() => validateFeeRecipient('arbitrary.untrusted.domain')).toThrow('Invalid fee recipient');

      // DMS_FEE_RECIPIENT_HEX environment variable support and fail-closed validation
      process.env.DMS_FEE_RECIPIENT_HEX = '0x2222222222222222222222222222222222222222';
      expect(resolveFeeRecipient()).toBe('0x2222222222222222222222222222222222222222');

      process.env.DMS_FEE_RECIPIENT_HEX = 'not-a-valid-hex-address';
      expect(() => resolveFeeRecipient()).toThrow('Invalid DMS_FEE_RECIPIENT_HEX');
      delete process.env.DMS_FEE_RECIPIENT_HEX;

      // Unauthorized/unknown tier escalation rejected
      expect(() =>
        calculateFeeSplit(gross, { feeRecipient: validRecipient, tier: 'UNLIMITED_ZERO' as any })
      ).toThrow('Invalid fee tier');
      expect(() => new AgentAuthority({ mode: 'pilot', tier: 'HACKED_TIER' as any })).toThrow(
        'Invalid fee tier'
      );
    });

    it('8. AgentAuthority executes with validated PRO tier fee split metadata', async () => {
      const proAuth = new AgentAuthority({
        mode: 'pilot',
        tier: 'PRO',
        feeRecipientHex: '0x3333333333333333333333333333333333333333',
        dbPath: ':memory:'
      });
      const request = {
        actionId: randomUUID(),
        agentId: 'agent-pro',
        actionType: 'transfer',
        payload: { amount: 500 },
        requestedAt: Date.now(),
        expiresAt: Date.now() + 10000,
        confidence: 0.9,
        resource: 'payment-gateway',
        permissions: ['write'],
        nonce: randomUUID(),
        idempotencyKey: randomUUID(),
        policyVersion: '1.0'
      };
      await proAuth.authorize(request);
      const cap = await proAuth.approve(request.actionId, 'admin-pro');
      const res = await proAuth.execute(cap, request.payload, 20_000_000n);
      expect(res.status).toBe('success');
      expect(res.routing.feeTier).toBe('PRO');
      expect(res.routing.feeBps).toBe(25);
      expect(res.routing.feeEndpoint).toBe('0x3333333333333333333333333333333333333333');
      expect(res.routing.feeSplit?.protocolFee).toBe(50_000n);
      expect(res.routing.feeSplit?.netAmount).toBe(19_950_000n);
    });
  });
});
