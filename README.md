# @digital-mineral/agent-escrow 🛑

**Deterministic runtime authorization and governance layer for autonomous AI agent actions.**

When building with autonomous coding agents, developers face a massive trust gap. Nobody wants an AI agent to hallucinate a transfer or deploy a broken smart contract using a funded dev wallet. 

The **Agent Escrow** acts as a cryptographic circuit breaker. It intercepts high-stakes AI commands, stages them natively in the terminal or via a REST API, and demands a 1-bit human-in-the-loop override before issuing a cryptographically signed execution capability.

### 📦 Installation
npm install @digital-mineral/agent-escrow

### 🚀 Core Features
* **Cryptographic Capability Tokens:** Agents do not execute based on database states. They must possess an HMAC-SHA256 signed, short-lived, single-use capability token.
* **Tamper-Evident Audit Chaining:** All state transitions and human approvals are permanently chained in a local SQLite WAL database.
* **Red-Team Hardened:** Built-in protection against Replay Attacks, Confused Deputy (Capability Theft), and Payload Tampering.
* **Zero Cloud Dependencies:** Runs entirely on edge-native hardware (ARM64, Android, Raspberry Pi) using Node's native `node:sqlite` engine.

### 💰 The Protocol Fee (Sovereign Yield)
To maintain and scale this decentralized infrastructure, Outside Gem operates on a standard protocol fee model. When external agents utilize this escrow middleware to execute on-chain transactions, the system enforces an automated fee split:
* **95%** is routed directly to the host developer.
* **5%** is routed to the Digital Mineral Treasury (`smurrison.eth.base`) as a maintenance tax.

**Built with vision by [Outside Gem](https://github.com/outsidegem).**
