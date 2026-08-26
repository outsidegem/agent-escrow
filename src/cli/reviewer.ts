import readline from 'readline';
import { EscrowDB, transaction } from '../storage/db';
import { AgentEscrow } from '../core/escrow';
import { ActionState } from '../models/types';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const getPendingActions = db.prepare(`SELECT * FROM actions WHERE state = '${ActionState.PENDING_REVIEW}'`);

console.log("🛡️ Titan Escrow Interceptor active. Monitoring for high-stakes agent actions...\n");

function pollPending() {
  const pending = getPendingActions.all() as any[];
  
  if (pending.length === 0) {
    setTimeout(pollPending, 3000);
    return;
  }

  const action = pending[0];
  console.log(`\n==================================================`);
  console.log(`🛑 AGENT ESCROW: HUMAN INTERVENTION REQUIRED 🛑`);
  console.log(`==================================================`);
  console.log(`Action ID : ${action.actionId}`);
  console.log(`Agent ID  : ${action.agentId}`);
  console.log(`Type      : ${action.actionType}`);
  console.log(`Risk      : ${action.riskLevel}`);
  console.log(`Payload   : ${action.payload}`);
  console.log(`==================================================`);
  
  rl.question(`Do you authorize the agent to execute this transaction? (y/N): `, (answer) => {
    const isApproved = answer.toLowerCase() === 'y';
    const newState = isApproved ? ActionState.APPROVED : ActionState.DENIED;
    const reason = isApproved ? 'Human override: Approved' : 'Human override: Denied';
    
    try {
      AgentEscrow.advanceState(action.hashId, newState, reason);
      console.log(isApproved ? `✅ Authorization granted. Releasing signature.` : `❌ Authorization denied. Agent locked.`);
    } catch (e: any) {
      console.error(`Error processing decision: ${e.message}`);
    }
    
    setTimeout(pollPending, 1000);
  });
}

pollPending();
