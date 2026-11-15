# ProofWork

ProofWork is a proposed escrow workflow for freelance website development on
Monad. A client locks funds, a developer submits a website, and the client
reviews the site and an evidence report before approving or disputing the work.

**The MVP escrow contract and Foundry tests are implemented, but the project
has not been deployed.** The frontend and backend remain placeholders: there is
no wallet connection, inspection pipeline, AI reporting, or persistence yet.
The contract is a testnet MVP; disputed project funds remain locked
indefinitely, so do not use it to hold real funds.

AI is an evidence-generation and reporting tool, not a judge or arbitrator.
It cannot release funds or decide disputes. The contract will enforce the
agreed workflow, including a finite client review period.

## Repository

```text
frontend/src/components/  Shared UI and future wallet integration
frontend/src/pages/       Workflow page placeholders
frontend/src/services/    API and contract integration boundaries
backend/app/routes/       Flask API endpoints
backend/app/services/     Backend orchestration
backend/app/inspection/   Evidence collection and reporting pipeline
contracts/                Solidity escrow, Foundry tests, and deployment scripts
docs/                     Architecture and integration decisions
```

See [architecture](docs/architecture.md) for workflow, responsibilities,
security constraints, and the developer handoff.

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

Open the URL printed by Vite. Its development proxy forwards `/api` requests to
Flask on `http://127.0.0.1:5000`. `GET /api/health` verifies only that the
backend is running, not that escrow or inspections work. If the backend runs
elsewhere, set `VITE_BACKEND_PROXY_TARGET` before starting Vite.

To run the backend smoke tests from the repository root:

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

Do not add real keys to the repository. Example configuration files document
future integration points; the skeleton does not use or require any API keys.
