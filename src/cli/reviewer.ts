import readline from 'readline';
import { EscrowDB } from '../storage/db.js';
import { AgentEscrow } from '../core/escrow.js';
import { ActionState } from '../models/types.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("🛡️ Titan Escrow Interceptor active. Monitoring for high-stakes agent actions...\n");

function pollPending() {
  const pending = EscrowDB.getPendingActions.all() as any[];
  
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
  console.log(`==================================================`);
  
  rl.question(`Authorize this transaction? (y/N): `, (answer) => {
    const isApproved = answer.toLowerCase() === 'y';
    const newState = isApproved ? ActionState.APPROVED : ActionState.DENIED;
    
    try {
      AgentEscrow.advanceState(action.hashId, newState, 'Human override applied');
      console.log(isApproved ? `✅ Authorization granted.` : `❌ Authorization denied.`);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
    }
    setTimeout(pollPending, 1000);
  });
}

pollPending();
