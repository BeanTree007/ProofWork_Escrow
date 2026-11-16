# ProofWork

**Trustless escrow for freelance website development on Monad.**

A client locks funds → the developer submits a website → an inspector gathers evidence →
the client approves or disputes → the developer (or, after a missed deadline, the client) withdraws.

**Status:** end-to-end MVP. The escrow contract is deployed on Monad testnet
(`0x50b128b6d9b9AE9A2599540553Da17443bA78988`), the frontend drives every contract action,
and the backend shares project briefs and runs the website inspection.

## How it fits together

```text
React UI ── wallet transactions / public RPC reads ──> ProofWorkEscrow (Monad testnet)
   │
   └── /api ──> Flask ──> brief store      PUT/GET /api/briefs/<detailsHash>
                      └─> inspection       POST /api/projects/<id>/inspection
                                           GET  /api/projects/<id>/report, /screenshots/<file>
```

- **The contract is the source of truth** for status, deadlines, extensions and payouts.
  The backend never holds funds or decides anything.
- **Briefs** (description, pages, features) are stored off-chain under their SHA-256, which is
  the contract's `detailsHash`, so a stored brief can never disagree with the contract.
- **Inspection** (Playwright, BeautifulSoup, Lighthouse, optional Claude summary) produces an
  evidence report; see [docs/report-contract.md](docs/report-contract.md).
- **Demo mode:** connect with "paste address" (a test wallet) and projects are simulated in
  the browser's localStorage. Everything on-chain needs MetaMask on Monad testnet.

## Workflow in the app

| Step | Who | Where |
|------|-----|-------|
| Create and fund the project | Client | Create Project |
| Read the brief, start work (no accept step on-chain) | Developer | Project page |
| Request / approve a later deadline | Developer / Client | Extension Requests |
| Submit the website URL before the deadline | Developer | Submit Website |
| Run the inspector, approve or dispute within the review window (7 days) | Client | Verification Report |
| Release escrow after an unanswered review window | Anyone (developer UI) | Project page |
| Refund escrow after a missed deadline | Anyone (client UI) | Project page |
| Withdraw settled funds | Developer / Client | Dashboard or Project page |

Disputed escrow stays locked: the MVP contract has no arbitration.

## Repository structure

```text
frontend/src/
  pages/                 Workflow screens
  components/            Shared UI (wallet button, withdraw card, ...)
  lib/gateway.js         The one seam pages use: on-chain or demo project actions
  lib/briefApi.js        Brief store client
  lib/reportApi.js       Inspection/report client
  services/blockchain/   Wallet connection, contract reads and transactions
backend/app/
  routes/                Flask API
  services/              Brief store and report store (file based, backend/data/)
  inspection/            Inspection pipeline
contracts/               Foundry project: escrow contract, tests, deploy scripts
docs/                    Architecture, contract design, report contract, deployment
```

## Known limits

- Briefs are readable by anyone who knows the project's `detailsHash` (it is public on-chain);
  there is no signed-request authentication on the API yet. Do not put secrets in a brief.
- The inspection endpoint is unauthenticated, so anyone who can reach the API can trigger an
  inspection. Put it behind auth or a rate limit before exposing it publicly.
- The GitHub Pages build is static: it has no Flask backend, so brief sharing and inspections
  work only where `/api` reaches the Flask server.
- The dashboard scans the 200 most recent on-chain projects.

## Developer Handoff

| Developer | Owns |
|-----------|------|
| **A** | React frontend, Flask backend, inspection pipeline, AI reporting |
| **B** | Smart contract, Monad integration, wallet connectivity |

Coordinate on wallet UI boundaries and API contracts.

## Run locally

Requirements: Node.js 20.19+ or 22.12+, npm, and Python 3.10+.
These commands are written for PowerShell from the repository root.

Backend:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements.txt
Set-Location backend
..\.venv\Scripts\python -m flask --app app run
```

In another terminal, start the frontend:

```powershell
Set-Location frontend
npm install
npm run dev
```

To use the deployed contract, copy `frontend/.env.example` to `frontend/.env` (it sets
`VITE_CONTRACT_ADDRESS`). Without it the app runs in demo mode only.

Open the URL printed by Vite. Its development proxy forwards `/api` requests to
Flask on `http://127.0.0.1:5000`. `GET /api/health` verifies only that the
backend is running, not that escrow or inspections work. If the backend runs
elsewhere, set `VITE_BACKEND_PROXY_TARGET` before starting Vite.

Frontend checks (project model and demo-mode gateway rules): `npm run check` in `frontend/`.

To run the backend tests from the repository root:

```powershell
Set-Location backend
..\.venv\Scripts\python -m unittest discover -s tests
```

For Solidity tests and Monad testnet deployment, install Foundry v1.8 or later.
See the [Monad deployment guide](docs/monad-deployment.md) for configuration,
deployment, verification, and direct interaction instructions.

## Parallel ownership

- **Developer A:** frontend pages and Flask API, inspection pipeline, and
  evidence report. Coordinate wallet-related UI boundaries with Developer B.
- **Developer B:** escrow contract, Monad network configuration and deployment,
  and wallet connectivity. Coordinate transaction and event integration with
  Developer A.

Do not add real keys to the repository. `backend/.env.example` lists the server
settings; `ANTHROPIC_API_KEY` is optional (without it reports use a template summary).
