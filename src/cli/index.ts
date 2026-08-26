#!/usr/bin/env node
import { Command } from 'commander';
import { AgentAuthority } from '../sdk/index.js';
import { EscrowDB } from '../storage/db.js';

const program = new Command();
const authority = new AgentAuthority({ mode: 'production' });

program
  .name('agent-escrow')
  .description('Titan Stack: Enterprise Agent Escrow CLI')
  .version('1.0.0');

program.command('authorize <payload>')
  .description('Authorize a new agent action via JSON payload')
  .option('--json', 'Output in JSON format')
  .action(async (payloadStr, options) => {
    try {
      const payload = JSON.parse(payloadStr);
      const result = await authority.authorize(payload);
      if (options.json) console.log(JSON.stringify(result));
      else console.log(`✅ Action Authorized: ${result.state} | HashId: ${result.hashId}`);
    } catch (e: any) {
      if (options.json) console.log(JSON.stringify({ error: e.message }));
      else console.error(`❌ Error: ${e.message}`);
      process.exit(1);
    }
  });

program.command('approve <actionId> <reviewerId>')
  .description('Approve a pending action and issue a cryptographic capability')
  .option('--json', 'Output in JSON format')
  .action(async (actionId, reviewerId, options) => {
    try {
      const capability = await authority.approve(actionId, reviewerId);
      if (options.json) console.log(JSON.stringify(capability));
      else console.log(`✅ Capability Issued: ${capability.capabilityId}`);
    } catch (e: any) {
      if (options.json) console.log(JSON.stringify({ error: e.message }));
      else console.error(`❌ Error: ${e.message}`);
      process.exit(1);
    }
  });

program.command('audit')
  .description('Verify the tamper-evident audit log')
  .option('--json', 'Output in JSON format')
  .action((options) => {
    const logs = EscrowDB.getLastAuditEvent.all();
    if (options.json) console.log(JSON.stringify(logs));
    else console.log('🛡️  Audit Log:\n', logs);
  });

program.parse(process.argv);
