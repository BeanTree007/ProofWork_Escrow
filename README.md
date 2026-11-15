# ProofWork - One Day Hackathon

**Trustless escrow platform for freelance website development on Monad.**

A client locks funds → developer submits website → client reviews & approves → funds release.

**Status:** Smart contract deployed and tested. Frontend & backend skeletons ready. **12 hours to integration.**

---

## 🚀 Quick Start (Read These)

**Start here. In order:**

1. **[QUICK_REF.txt](QUICK_REF.txt)** (2 min) — One-page cheat sheet
2. **[ONE_DAY_HACKATHON.md](ONE_DAY_HACKATHON.md)** (10 min) — Hour-by-hour plan  
3. **[STARTER_CODE.md](STARTER_CODE.md)** (implement now) — Copy-paste code

Then build. That's it.

---

## 📋 Reference (If Things Break)

- **[docs/smart-contract-architecture.md](docs/smart-contract-architecture.md)** — Contract state machine
- **[docs/monad-deployment.md](docs/monad-deployment.md)** — Deployment instructions
- **[PROJECT_PLAN.md](PROJECT_PLAN.md)** — Original project goals

## Repository Structure

```text
frontend/src/
  ├── pages/              6 workflow pages (placeholders)
  ├── components/        UI components
  ├── services/
  │   ├── blockchain/    ← Wallet & contract integration (TO BUILD)
  │   └── api.js         ← Backend API client (TO BUILD)
  └── lib/               Validation and demo helpers

backend/app/
  ├── routes/            15 API endpoints (placeholders → TO IMPLEMENT)
  ├── services/          ← Service layer (TO BUILD)
  │   ├── blockchain_service.py
  │   ├── inspection_service.py
  │   └── project_service.py
  └── inspection/        ← Inspection pipeline (TO BUILD)
      ├── playwright_stage.py
      ├── beautifulsoup_stage.py
      ├── lighthouse_stage.py
      └── gpt_stage.py

contracts/
  ├── src/
  │   └── ProofWorkEscrow.sol    ✅ Implemented & deployed
  ├── test/                      ✅ 100+ tests passing
  └── script/                    ✅ Deployment working

docs/
  ├── architecture.md            Architecture overview
  ├── smart-contract-architecture.md  State machine & design
  └── monad-deployment.md        Deployment instructions
```

## What's Done ✅

- Smart contract: Fully implemented, tested, deployed
- Frontend skeleton: 6 pages, routing, validation
- Backend skeleton: Flask app, all route paths defined

## What's Missing 🔲

- Frontend: Wallet connection
- Frontend: Contract integration
- Backend: Contract reads & writes
- Backend: Database persistence
- Backend: Inspection pipeline
- Backend: Authentication

See [INTEGRATION_AUDIT.md](INTEGRATION_AUDIT.md) for complete assessment.

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
