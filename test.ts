import { EscrowRouter } from './src/index.js';

// Initialize the router: Requires 85% confidence to bypass human
const router = new EscrowRouter({
  confidenceThreshold: 0.85
});

console.log("=============================================");
console.log("🛡️ TITAN ESCROW: ROUTER ONLINE");
console.log("=============================================");

// Scenario 1: Safe, High-Confidence Action
console.log("[AGENT]: Attempting routine data sync (Confidence: 0.99)...");
const syncAuth = router.evaluateAction(0.99, { action: "sync_data", target: "local_db" });

if (syncAuth === true) {
  console.log("✅ ROUTER: Action Auto-Approved. No human needed.");
}

// Scenario 2: Risky, Low-Confidence Action
console.log("\n[AGENT]: Attempting $500 Client Refund (Confidence: 0.60)...");
const refundAuth = router.evaluateAction(0.60, { action: "refund", amount: 500, clientId: "12345" });

if (typeof refundAuth === 'string') {
  console.log("⏸️ ROUTER ENGAGED: Confidence too low. Execution Halted.");
  console.log(`🔒 ESCROW LOCKED. Cryptographic Hash: ${refundAuth}`);
  
  // Simulate the Human-in-the-Loop receiving the page
  console.log("\n[HUMAN]: Paged. Reviewing action payload...");
  const pendingInfo = router.getPendingAction(refundAuth);
  console.log("   -> Intended Action:", pendingInfo?.payload);
  
  // Human denies the action
  console.log("\n[HUMAN]: Error found in payload. Overriding... DENYING action.");
  router.resolveEscrow(refundAuth, false);
  
  console.log(`❌ ESCROW RESOLVED: Final status is [ ${router.getPendingAction(refundAuth)?.status} ]`);
}

console.log("=============================================");
