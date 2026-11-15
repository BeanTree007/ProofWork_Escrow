# Architecture and handoff

## Scope and trust boundaries

The MVP supports one website development escrow workflow, not a marketplace,
bidding, messaging, reputation, or arbitration. The client and developer
interact with an eventual Monad contract through their wallets. The contract,
not the backend or AI, must control escrowed funds and enforce its transitions.
The backend will collect evidence and produce a report for human review; it
must never hold escrow or have authority to approve, resolve, or pay a project.
Evidence and AI summaries can be incomplete or wrong and are not a verdict.

```text
React UI -- wallet / transactions --> Monad escrow contract
    |
    +-- HTTP --> Flask API --> inspection pipeline --> report
                                Playwright: navigation, screenshots, responsive checks
                                BeautifulSoup: HTML, forms, headings, requirements
                                Lighthouse: performance, accessibility, SEO, best practices
                                GPT-4o: evidence-based human-readable summary
```

Only the health endpoint works today. Project routes, the inspection pipeline,
wallet integration, contract implementation and persistence are all TODOs.
The frontend does not call the project API or pretend transactions succeeded.

## Workflow and contract handoff

The client supplies project name, description, required pages and features,
developer wallet, amount and initial deadline. The intended creation
transaction deposits funds atomically. The developer accepts, builds, and
submits a URL by the deadline; the inspection system then gathers evidence.
The client reviews the URL and report and approves or disputes.

The final MVP states, transitions, permissions, validations, events, accounting
model, edge cases, and security considerations are in
[smart-contract-architecture.md](./smart-contract-architecture.md). That
document supersedes the earlier interface sketch as the design proposal; it is
not an implementation or security audit. The current Solidity interface
remains an outdated skeleton until both developers accept the design and
derive a tested ABI from it.

## Developer A: application and inspection

- `frontend/src/pages/`: build the six workflow screens. Show on-chain state,
  deadlines, submitted URL, reports and extension status; never imply a
  placeholder operation succeeded.
- `frontend/src/components/`: reusable UI; collaborate with B on wallet UI.
  `frontend/src/services/` is the integration boundary for API and wallet
  operations. The Vite proxy is for local development only.
- `backend/app/routes/`: replace explicit 501s with validated API endpoints.
  `backend/app/services/` owns orchestration and persistence integration.
- `backend/app/inspection/`: implement the stages in order, preserving raw
  evidence and source attribution alongside the report. Record failed and
  incomplete checks instead of treating them as passing. Do not infer a
  dispute outcome or payout decision.
- Before inspecting arbitrary URLs, design SSRF protection for redirects, DNS
  resolution and browser subresources, plus isolation, resource/time limits,
  and safe handling of screenshots and untrusted page content. Treat website
  content as untrusted input to the model, not instructions. Define API
  authentication and authorization before exposing project data or triggering
  costly inspections.

## Developer B: escrow, Monad, and wallet

- `contracts/`: implement and test the interface's behavior and security
  invariants; add deployment scripts and testnet configuration only after
  agreeing on the ABI, chain settings, token/native currency and review period.
- `frontend/src/services/`: implement wallet connection, network checking,
  transaction submission, event/state reads, and error handling. Coordinate
  page props and transaction lifecycle with A.
- Verify Monad RPC and chain details against current official network
  documentation when integrating. Keep private keys out of frontend code,
  committed files and logs.

## Configuration and integration

`frontend/.env.example` contains local Vite proxy configuration.
`backend/.env.example` lists future server-side configuration; Flask does not
automatically load this example. The contract has a Foundry configuration but
no network credentials or deployment configuration. Copy examples locally if
needed and set environment variables explicitly. Do not commit populated env
files.

The API route paths in this skeleton are provisional. Agree on project IDs,
request/response schemas, contract events, report provenance and failure
semantics before connecting the parts. Project details may require off-chain
storage; do not assume the backend is authoritative for escrow status.
