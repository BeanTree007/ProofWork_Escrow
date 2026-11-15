# ProofWork - One Day Hackathon

## Reality Check: 12 Hours Maximum

You have approximately **12 hours** from start to finish.

Subtract:
- Setup/troubleshooting: 1 hour
- Demo prep/testing: 1 hour
- Actual coding: **10 hours**

With one developer pair, that's **10 hours of combined work**.

---

## What's Already Done (Don't Rebuild)

✅ **Smart Contract**
- Deployed to Monad testnet
- All escrow logic working
- All tests passing
- This is your source of truth

✅ **Frontend Skeleton**
- React + Vite running
- 6 pages exist
- Routing works
- Just needs to be filled in

✅ **Backend Skeleton**
- Flask app running
- Route paths defined
- Just needs implementations

---

## The ONE Flow You Need to Demo

**This is the ONLY demo that matters:**

```
1. User connects wallet (MetaMask)
2. User creates a project (calls contract)
3. Dashboard shows the project
4. User "submits website" (calls contract)
5. Backend returns a report (mock/fast)
6. User approves (calls contract)
7. Done
```

That's it. This is your entire demo.

---

## What You Must Cut

❌ **Do NOT implement:**
- Multiple projects
- Real inspection pipeline (Playwright, BeautifulSoup, Lighthouse, GPT)
- User authentication
- Database migrations
- Extension requests
- Dispute workflow
- Complex error handling
- Production logging
- Multiple workflows

❌ **Do NOT spend time on:**
- Beautiful styling
- Detailed error messages
- Edge cases
- Input validation
- Performance optimization
- Security hardening

---

## The Minimum Viable Code

### Frontend (4-5 hours)

**wallet.js** (~40 lines)
```javascript
export async function connectWallet() {
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  return accounts[0];
}

export async function getWeb3() {
  const { ethers } = await import('ethers');
  return new ethers.BrowserProvider(window.ethereum);
}

export async function getSigner(web3) {
  return web3.getSigner();
}
```

**contract.js** (~80 lines)
```javascript
const CONTRACT_ADDR = "0x..."; // Your deployed address
const CONTRACT_ABI = [...]; // Export from Foundry

export async function getContractInstance(web3) {
  const { ethers } = await import('ethers');
  return new ethers.Contract(CONTRACT_ADDR, CONTRACT_ABI, await web3.getSigner());
}

export async function getProject(web3, projectId) {
  const contract = await getContractInstance(web3);
  return contract.getProject(projectId);
}

export async function createProject(web3, developer, deadline, amount) {
  const contract = await getContractInstance(web3);
  return contract.createProject(developer, deadline, "0x0000000000000000000000000000000000000000000000000000000000000000", { value: amount });
}

export async function submitWebsite(web3, projectId, url) {
  const contract = await getContractInstance(web3);
  return contract.submitWebsite(projectId, url);
}

export async function approveProject(web3, projectId) {
  const contract = await getContractInstance(web3);
  return contract.approveProject(projectId);
}
```

**Fill in 4 pages** (2-3 hours):

```jsx
// pages/Landing.jsx - Add connect button
export default function Landing() {
  return (
    <div>
      <h1>ProofWork Escrow</h1>
      <button onClick={connectWallet}>Connect Wallet</button>
    </div>
  );
}

// pages/CreateProject.jsx - Form that calls contract
export default function CreateProject() {
  return (
    <form onSubmit={handleCreateProject}>
      <input name="developer" placeholder="Developer address" />
      <input name="amount" placeholder="Escrow amount (MON)" />
      <button type="submit">Create Project</button>
    </form>
  );
}

// pages/Dashboard.jsx - Fetch and display project
export default function Dashboard() {
  const [project, setProject] = useState(null);
  
  useEffect(() => {
    getProject(web3, 1).then(setProject);
  }, []);
  
  return <div><h1>Project {project?.state}</h1></div>;
}

// pages/SubmitWebsite.jsx - Form that calls submitWebsite
export default function SubmitWebsite() {
  return (
    <form onSubmit={handleSubmit}>
      <input name="url" placeholder="Website URL" />
      <button type="submit">Submit</button>
    </form>
  );
}
```

### Backend (2-3 hours)

**Create one endpoint that returns mock inspection report** (~50 lines):

```python
# backend/app/routes/__init__.py
from flask import Blueprint, jsonify, request

api = Blueprint("api", __name__)

@api.get("/health")
def health():
    return jsonify({"status": "ok"})

@api.get("/projects/<int:project_id>/report")
def get_report(project_id):
    # Mock report - return instantly
    return jsonify({
        "projectId": project_id,
        "url": "https://example.com",
        "status": "Website loads successfully",
        "performance": "Good",
        "responsiveness": "Mobile-friendly",
        "summary": "Website meets requirements.",
        "timestamp": "2026-11-15T13:50:00Z"
    })
```

**That's it.** No database. No real inspection. Just return mock data.

### Contract ABI (~5 minutes)

Developer B exports the ABI from the deployment:

```bash
cd contracts
forge inspect ProofWorkEscrow abi > ../frontend/src/contract-abi.json
```

Then in `contract.js`:
```javascript
import CONTRACT_ABI from './contract-abi.json';
```

---

## The Demo Script (Practice This)

**Time in demo: 3-4 minutes**

1. Open app, click "Connect Wallet"
2. Sign MetaMask connect request
3. Go to Create Project
4. Fill in developer address (can be same wallet), amount
5. Click Create Project
6. Sign transaction
7. Go to Dashboard
8. Show project state updated to "Funded"
9. Go to Submit Website
10. Enter "https://example.com"
11. Click Submit
12. Sign transaction
13. Go back to Dashboard
14. Show state changed to "Submitted"
15. Click Approve
16. Sign transaction
17. Show state changed to "Approved"

**End of demo.** Judges see:
- Wallet integration ✓
- Contract calls work ✓
- State changes on-chain ✓
- Frontend reads contract ✓
- End-to-end flow works ✓

---

## Absolute Must-Haves (Non-negotiable)

1. ✅ Smart contract is deployed and has address
2. ✅ Contract ABI is exported
3. ✅ Frontend can import ethers.js
4. ✅ Wallet connects (MetaMask)
5. ✅ User can send ONE transaction successfully
6. ✅ Frontend displays updated state after transaction
7. ✅ Demo runs without errors for 3-4 minutes

If any of these don't work, the demo is dead.

---

## Hour-by-Hour Timeline

### Hour 0-0.5: Setup (30 min)
- Verify contract deployed and address noted
- Export contract ABI
- Verify both wallets funded with testnet MON
- Start frontend dev server, backend Flask server
- Test both servers are running

### Hour 0.5-2: Wallet Connection (90 min)
- Add MetaMask detection and connect button to Landing page
- Test wallet connects and address displays
- Add ethers.js import and setup

### Hour 2-5: Contract Integration (180 min)
- Create contract.js with getProject, createProject, submitWebsite, approveProject
- Update CreateProject page to call createProject()
- Update Dashboard page to fetch and display project
- Update SubmitWebsite page to call submitWebsite()
- Test each function individually in browser console

### Hour 5-6: Approval & Polish (60 min)
- Add approve button to Dashboard
- Wire approve button to approveProject()
- Test full demo flow once
- Fix any immediate errors

### Hour 6-6.5: Demo Dry Run (30 min)
- Run full demo from start to finish
- Time it (should be 3-4 minutes)
- Fix any bugs that block completion
- Clean up console logs if needed

### Hour 6.5-7: Contingency (30 min)
- Buffer for unexpected issues
- If no issues, optimize demo script or UI

---

## If You Run Out of Time

**Minimum Viable Demo (can complete in < 6 hours):**

1. Wallet connects and shows address in UI
2. Create Project form sends transaction to contract
3. Dashboard fetches project from contract via ethers.js
4. Show that state changed on-chain

You don't need:
- Submit website
- Approval
- Reports
- Backend at all

Just prove contract reads and writes work.

---

## Critical Gotchas (Avoid These)

❌ **Don't try to:**
- Build a database — no time, use mock data
- Implement full inspection — mock it (fast)
- Add user authentication — not needed
- Make it pretty — function over form
- Handle edge cases — just the happy path
- Test thoroughly — one end-to-end test is enough

❌ **Don't waste time on:**
- Git commits
- Comments in code
- Error messages
- Type annotations
- Linting
- Refactoring

✅ **Do focus on:**
- One working flow
- Contract reads and writes
- Wallet connection
- Transactions that succeed
- UI that displays results

---

## Success = One Demo That Works

At the end of the day, judges see one thing:

**A user wallet connects, creates an escrow project on-chain, submits a website on-chain, and approves payment on-chain. The contract state changes at each step. No crashes. Done in 3-4 minutes.**

Everything else is bonus.

---

## Go.

You have 12 hours. Start with wallet connection. Don't overthink it. Ship.
