# ProofWork Frontend - Setup & Demo

## Prerequisites

- Node.js 18+
- npm
- MetaMask browser extension
- Monad testnet account with MON funds

## Setup (5 minutes)

### 1. Install Dependencies

```bash
cd frontend
npm install
```

This will install ethers.js and all other required packages.

### 2. Configure Contract Address

Get your deployed contract address from the Foundry deployment:

```bash
cd contracts
forge script script/DeployProofWorkEscrow.s.sol:DeployProofWorkEscrow \
  --rpc-url $env:MONAD_TESTNET_RPC_URL --broadcast
```

Then create `frontend/.env`:

```bash
# frontend/.env
VITE_MONAD_RPC=https://testnet-rpc.monad.xyz
VITE_CONTRACT_ADDRESS=0x<your-contract-address>
```

Replace `0x<your-contract-address>` with the actual address from deployment output.

### 3. Start Development Server

```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

## Demo Flow (3-4 minutes)

The demo demonstrates the complete escrow workflow end-to-end on Monad testnet.

### Step 1: Connect Wallet
- Click "Connect Wallet (MetaMask)" on landing page
- Approve MetaMask connection
- Wallet address appears in navigation header

### Step 2: Create Project
- Go to "Create Project"
- Fill in form:
  - Project name: anything
  - Description: anything
  - Developer address: paste your own address or another test account
  - Amount: 0.01-0.1 MON (testnet is cheap)
  - Deadline: set to tomorrow or later
  - Pages/features: add whatever
- Click "Create project and fund escrow"
- Approve MetaMask transaction
- Wait for confirmation (~10-30 seconds on testnet)
- You receive projectId (e.g., "1")

### Step 3: View Dashboard
- Go to "Dashboard"
- Project shows in "Funded" state
- Shows: amount, client address, developer address, deadline

### Step 4: Submit Website (as Developer)
- Go to "Submit Website"
- Enter Project ID (from step 2)
- Enter website URL (e.g., https://example.com or https://github.com)
- Click "Submit Website"
- Approve MetaMask transaction
- Wait for confirmation
- Return to Dashboard, refresh to see state change to "Submitted"

### Step 5: Approve Project (as Client)
- Dashboard shows "Submitted" state
- Click "Approve Project"
- Approve MetaMask transaction
- Wait for confirmation
- State changes to "Approved"
- Developer can now withdraw escrow

## Demo Mode (No Contract Needed)

If VITE_CONTRACT_ADDRESS is not set, the frontend runs in demo mode:
- All projects are stored in browser localStorage
- Transactions are simulated instantly
- No blockchain calls are made
- Perfect for testing UI without a deployed contract

Just run:
```bash
cd frontend
npm run dev
```

No .env file needed.

## Troubleshooting

### "MetaMask not installed"
- Install MetaMask: https://metamask.io

### "Wrong network" error
- MetaMask should prompt to add Monad testnet automatically
- If not, add manually:
  - Network name: Monad Testnet
  - RPC: https://testnet-rpc.monad.xyz
  - Chain ID: 10143
  - Currency: MON

### "CONTRACT_ADDRESS not configured"
- Check VITE_CONTRACT_ADDRESS is set in .env
- Restart dev server after changing .env

### "Insufficient funds"
- Get testnet MON from: https://faucet.monad.xyz

### Contract errors (InvalidEscrowAmount, InvalidDeveloper, etc.)
- Check that developer address is different from your address
- Check that amount is > 0
- Check that deadline is in the future

### Transaction fails or hangs
- Check testnet RPC is working: https://testnet.monadvision.com
- Verify you have MON for gas + escrow amount
- Try refreshing page

## Files Modified/Created

### New Blockchain Service Layer
- `frontend/src/services/blockchain/wallet.js` — MetaMask integration
- `frontend/src/services/blockchain/contract.js` — Contract wrappers
- `frontend/src/services/blockchain/contractConfig.js` — Configuration
- `frontend/src/contract-abi.json` — Contract ABI

### Updated Pages
- `frontend/src/pages/Landing.jsx` — Wallet connection
- `frontend/src/pages/Dashboard.jsx` — Project state display
- `frontend/src/pages/SubmitWebsite.jsx` — Website submission
- `frontend/src/lib/gateway.js` — Blockchain integration

### Configuration
- `frontend/.env.example` — Template
- `frontend/package.json` — Added ethers dependency

## Success Criteria

✅ You successfully ran the demo if:
1. You connected wallet to Monad testnet
2. You created a project on-chain (transaction confirmed)
3. You viewed project on Dashboard (state shows "Funded")
4. You submitted a website (state changed to "Submitted")
5. You approved project (state changed to "Approved")

All transactions visible on testnet explorer: https://testnet.monadvision.com

## Questions?

Read IMPLEMENTATION_SUMMARY.md for full technical details.

Good luck! 🚀
