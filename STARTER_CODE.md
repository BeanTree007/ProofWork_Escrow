# One-Day Hackathon - Copy & Paste Starter Code

**DO NOT OVERTHINK THIS.** Copy these files. Fill in the blanks. Test. Done.

---

## Step 1: Get Your Contract Address & ABI

**Run this in contracts/ directory:**

```bash
forge inspect ProofWorkEscrow abi > ../frontend/src/contract-abi.json
```

Look up your deployed contract address from earlier. You'll need:
- Contract address (from Monad deployment output)
- Contract ABI (just created in frontend/src/)
- Monad testnet RPC: `https://testnet.monad.xyz/rpc`

---

## Step 2: Install ethers.js in Frontend

```bash
cd frontend
npm install ethers@6
```

---

## Step 3: Copy These Files to Frontend

### frontend/src/services/wallet.js

```javascript
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('MetaMask not installed');
  }
  
  try {
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });
    return accounts[0];
  } catch (error) {
    console.error('Failed to connect wallet:', error);
    throw error;
  }
}

export async function getWeb3() {
  const { ethers } = await import('ethers');
  
  if (!window.ethereum) {
    throw new Error('MetaMask not installed');
  }
  
  return new ethers.BrowserProvider(window.ethereum);
}

export async function getConnectedAddress() {
  const web3 = await getWeb3();
  const signer = await web3.getSigner();
  return signer.getAddress();
}
```

### frontend/src/services/contract.js

```javascript
import CONTRACT_ABI from '../contract-abi.json';

const CONTRACT_ADDRESS = '0x...'; // <-- FILL THIS IN
const MONAD_RPC = 'https://testnet.monad.xyz/rpc';

export async function getContractInstance(web3) {
  const { ethers } = await import('ethers');
  const signer = await web3.getSigner();
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}

export async function getProject(projectId) {
  const { ethers } = await import('ethers');
  const web3 = new ethers.JsonRpcProvider(MONAD_RPC);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, web3);
  return contract.getProject(projectId);
}

export async function createProject(web3, developer, deadline, escrowAmount) {
  const contract = await getContractInstance(web3);
  const tx = await contract.createProject(
    developer,
    BigInt(deadline),
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    { value: escrowAmount }
  );
  const receipt = await tx.wait();
  return receipt;
}

export async function submitWebsite(web3, projectId, websiteURL) {
  const contract = await getContractInstance(web3);
  const tx = await contract.submitWebsite(projectId, websiteURL);
  const receipt = await tx.wait();
  return receipt;
}

export async function approveProject(web3, projectId) {
  const contract = await getContractInstance(web3);
  const tx = await contract.approveProject(projectId);
  const receipt = await tx.wait();
  return receipt;
}
```

### frontend/src/services/index.js

```javascript
export * from './wallet.js';
export * from './contract.js';
```

---

## Step 4: Update Frontend Pages

### frontend/src/pages/Landing.jsx

```jsx
import { useState } from 'react';
import { connectWallet, getConnectedAddress } from '../services';
import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleConnect = async () => {
    try {
      setLoading(true);
      const addr = await connectWallet();
      setAccount(addr);
      navigate('/dashboard');
    } catch (error) {
      alert('Failed to connect wallet: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h1>ProofWork Escrow</h1>
      <p>Trustless escrow for freelance web development on Monad</p>
      <button onClick={handleConnect} disabled={loading}>
        {loading ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {account && <p>Connected: {account}</p>}
    </section>
  );
}
```

### frontend/src/pages/CreateProject.jsx

```jsx
import { useState } from 'react';
import { getWeb3, createProject } from '../services';
import { useNavigate } from 'react-router-dom';

export default function CreateProject() {
  const [developer, setDeveloper] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const web3 = await getWeb3();
      
      // Deadline: 7 days from now (in seconds)
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      
      // Amount in wei (assuming MON is like ETH, 18 decimals)
      const amountWei = BigInt(amount) * BigInt(10) ** BigInt(18);
      
      const receipt = await createProject(web3, developer, deadline, amountWei);
      alert('Project created! Tx: ' + receipt.transactionHash);
      navigate('/dashboard');
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h1>Create Project</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Developer Address"
          value={developer}
          onChange={(e) => setDeveloper(e.target.value)}
          required
        />
        <input
          type="number"
          placeholder="Escrow Amount (MON)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Project'}
        </button>
      </form>
    </section>
  );
}
```

### frontend/src/pages/Dashboard.jsx

```jsx
import { useState, useEffect } from 'react';
import { getProject } from '../services';
import { useNavigate } from 'react-router-dom';

const PROJECT_STATES = ['None', 'Funded', 'Submitted', 'Approved', 'AutoReleased', 'Disputed', 'Refunded'];

export default function Dashboard() {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState('1');
  const navigate = useNavigate();

  const loadProject = async () => {
    try {
      setLoading(true);
      const proj = await getProject(parseInt(projectId));
      setProject(proj);
    } catch (error) {
      console.error('Failed to load project:', error);
      setProject(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, []);

  if (loading) return <section><h1>Loading...</h1></section>;
  if (!project) return <section><h1>Project Not Found</h1><input type="number" value={projectId} onChange={(e) => setProjectId(e.target.value)} /><button onClick={loadProject}>Load</button></section>;

  return (
    <section>
      <h1>Project #{projectId}</h1>
      <p>State: <strong>{PROJECT_STATES[project.state]}</strong></p>
      <p>Client: {project.client}</p>
      <p>Developer: {project.developer}</p>
      <p>Escrow: {project.escrowAmount.toString()} wei</p>
      <p>Deadline: {new Date(project.deadline * 1000).toLocaleString()}</p>
      
      {project.state === 1 && (
        <button onClick={() => navigate('/submit-website')}>Submit Website</button>
      )}
      
      {project.state === 2 && (
        <button onClick={() => navigate('/approval')}>Review & Approve</button>
      )}
      
      <button onClick={loadProject}>Refresh</button>
    </section>
  );
}
```

### frontend/src/pages/SubmitWebsite.jsx

```jsx
import { useState } from 'react';
import { getWeb3, submitWebsite } from '../services';
import { useNavigate } from 'react-router-dom';

export default function SubmitWebsite() {
  const [projectId, setProjectId] = useState('1');
  const [url, setUrl] = useState('https://example.com');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const web3 = await getWeb3();
      const receipt = await submitWebsite(web3, parseInt(projectId), url);
      alert('Website submitted! Tx: ' + receipt.transactionHash);
      navigate('/dashboard');
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h1>Submit Website</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="number"
          placeholder="Project ID"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          required
        />
        <input
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Submitting...' : 'Submit Website'}
        </button>
      </form>
    </section>
  );
}
```

---

## Step 5: Update App Navigation (if needed)

Make sure your App.jsx routes to these pages:
- `/` → Landing
- `/dashboard` → Dashboard
- `/create-project` → CreateProject
- `/submit-website` → SubmitWebsite

Add links or buttons to navigate between them.

---

## Step 6: Update Backend (Optional - Only If Needed for Demo)

### backend/app/routes/__init__.py

```python
from flask import Blueprint, jsonify

api = Blueprint("api", __name__)

@api.get("/health")
def health():
    return jsonify({"status": "ok"})

@api.get("/projects/<int:project_id>/report")
def get_report(project_id):
    # Mock report - instant return
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

---

## Step 7: Test the Demo Flow

1. **Start frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

2. **Open in browser:** `http://localhost:5173`

3. **Click "Connect Wallet"** → Sign MetaMask popup

4. **Create Project:**
   - Use your own wallet address (paste it in)
   - Enter small amount (e.g., 0.1 MON)
   - Click Create Project
   - Sign transaction in MetaMask
   - Wait for confirmation

5. **View Dashboard:**
   - Should show project in "Funded" state
   - Note the Project ID

6. **Submit Website:**
   - Go to Submit Website page
   - Enter Project ID
   - Enter any URL (e.g., https://github.com)
   - Click Submit
   - Sign transaction

7. **Back to Dashboard:**
   - Refresh
   - Should show "Submitted" state

8. **Add Approval Button:**
   - Modify Dashboard to show an "Approve" button when state === 2
   - Wire it to `approveProject()`
   - Click it, sign transaction

---

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| "Contract address not found" | Fill in CONTRACT_ADDRESS in contract.js |
| "MetaMask not installed" | Install MetaMask extension |
| "Wrong network" | Switch MetaMask to Monad testnet |
| "Insufficient funds" | Get testnet MON from faucet |
| "Transaction reverted" | Check contract address, ABI, and parameters |
| "Page shows 'undefined'" | Check browser console for errors |

---

## That's It

You now have everything to make the demo work. Stop reading. Start coding. You have 12 hours.

Focus on:
1. ✅ Wallet connects
2. ✅ Create project works
3. ✅ Dashboard shows state
4. ✅ Submit works
5. ✅ Approve works

Don't worry about:
❌ Styling
❌ Error messages
❌ Edge cases
❌ Backend inspection

**Go.**
