# ProofWork Monad testnet deployment

This guide deploys the existing `ProofWorkEscrow` contract and exercises its
MVP flow directly with Foundry. It does not change the contract workflow.
The contract has no admin recovery or dispute settlement: a disputed project's
escrow remains locked indefinitely. Use testnet funds only.

## Network and tool requirements

- Monad Testnet chain ID: `10143`
- Native currency: `MON`
- Public RPC: `https://testnet-rpc.monad.xyz`
- Explorer: [MonadVision](https://testnet.monadvision.com/) or
  [Monadscan](https://testnet.monadscan.com/)
- Faucet: [Monad testnet faucet](https://faucet.monad.xyz/)
- Foundry: **v1.8.0 or later**, for Monad execution support

The repository's [Foundry configuration](../contracts/foundry.toml) selects
the Monad execution environment and testnet RPC. Confirm the RPC's chain ID
before deploying:

```powershell
Set-Location contracts
cast chain-id --rpc-url https://testnet-rpc.monad.xyz
```

The result must be `10143`. For an alternate RPC, pass it with `--rpc-url` to
the relevant `forge` or `cast` command; `MONAD_TESTNET_RPC_URL` in `.env`
documents the selected endpoint.

## Wallet and environment setup

Create separate testnet-only wallets for deployment, client, and developer.
Fund the deployer with MON for deployment gas. The client needs enough MON for
the project escrow and transaction gas; the developer needs MON for gas.

From `contracts`, create a local environment file and fill it in locally:

```powershell
Copy-Item .env.example .env
notepad .env
```

After saving `.env`, load its entries into the current PowerShell process so
the RPC URL can be passed to Foundry (this does not print the values):

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}
```

Set the following values:

| Variable | Purpose |
|---|---|
| `MONAD_TESTNET_RPC_URL` | Testnet RPC URL; the Foundry config defaults to the official endpoint. |
| `DEPLOYER_PRIVATE_KEY` | Testnet-only deployment signer key. |
| `REVIEW_PERIOD` | Review window in seconds; defaults to `604800` (7 days) in the deployment script. |
| `ESCROW_ADDRESS` | Deployed contract address, required by the interaction script. |
| `CLIENT_PRIVATE_KEY` | Testnet-only client key, used to create and fund the project and approve an extension. |
| `DEVELOPER_PRIVATE_KEY` | Testnet-only developer key, used to request the extension and submit the website. |
| `PROJECT_AMOUNT_WEI` | Escrow amount in wei; `10000000000000000` is `0.01 MON`. |
| `DEADLINE_OFFSET` | Seconds from script execution to the initial deadline; defaults to 30 days. |
| `EXTENSION_SECONDS` | Seconds added to the requested deadline; defaults to 7 days. |
| `DETAILS_HASH` | Nonzero bytes32 hash of the agreed off-chain requirements. |
| `WEBSITE_URL` | Nonempty submitted URL no longer than 2048 UTF-8 bytes. |

Never commit `contracts/.env`, paste private keys into chat, or use a wallet
that holds valuable assets. The repository ignores `.env`; keep the example
file's placeholders in place in version control. Foundry also writes broadcast
records and sensitive script values under `contracts/broadcast/` and
`contracts/cache/`; both are ignored by Git and should not be shared.

## Build and tests

From `contracts`:

```powershell
forge --version
forge build
forge test
```

Confirm Foundry is v1.8.0 or later. These commands do not deploy anything.

## Deploy

From `contracts`, after setting `DEPLOYER_PRIVATE_KEY` and funding the wallet:

```powershell
forge script script/DeployProofWorkEscrow.s.sol:DeployProofWorkEscrow `
  --rpc-url $env:MONAD_TESTNET_RPC_URL `
  --broadcast -vvvv
```

The script refuses to run on a chain other than ID `10143`. It deploys with
the configured `REVIEW_PERIOD`, or seven days when that variable is unset. On
success, Foundry prints the deployed contract address and transaction hash.
Copy that address to `ESCROW_ADDRESS` in `.env`.

The constructor rejects a zero review period. The script's default is
`604800` seconds; read the deployed `reviewPeriod()` value back before use.

## Direct interaction

Set the deployed address, distinct client/developer keys, and remaining
interaction values in `contracts/.env`. Ensure both wallets have gas and the
client can cover `PROJECT_AMOUNT_WEI`. From `contracts`, run:

```powershell
forge script script/InteractProofWorkEscrow.s.sol:InteractProofWorkEscrow `
  --rpc-url $env:MONAD_TESTNET_RPC_URL `
  --broadcast -vvvv
```

The script performs the requested sequence:

1. Client creates and funds a project for the developer.
2. Script reads and prints the new project's ID, escrow amount, and deadline.
3. Developer requests a deadline extension.
4. Client approves the extension.
5. Developer submits `WEBSITE_URL`.

The initial deadline is 30 days after execution by default; the requested
extension is 7 days by default. Change these via `DEADLINE_OFFSET` and
`EXTENSION_SECONDS` if needed. The script uses a new project each time it runs.
It does not approve the website, dispute it, or withdraw funds.

Use the printed project ID and contract address to inspect transactions on
[MonadVision](https://testnet.monadvision.com/) or
[Monadscan](https://testnet.monadscan.com/). You can also read a project via
`cast call` using the contract ABI produced under `out/`.

## Optional source verification

Monad's Foundry guide supports Sourcify verification with this command from
`contracts` (replace the address):

```powershell
$constructorArgs = cast abi-encode "constructor(uint256)" 604800
forge verify-contract `
  0x<deployed-contract-address> `
  src/ProofWorkEscrow.sol:ProofWorkEscrow `
  --chain 10143 `
  --verifier sourcify `
  --verifier-url https://sourcify-api-monad.blockvision.org/ `
  --constructor-args $constructorArgs
```

Use the actual deployed constructor value if `REVIEW_PERIOD` was customized.
Verification is optional and may take time to appear on the explorer.

## Deployment status

Deployment is not performed automatically by this repository. Before a
broadcast, configure testnet credentials locally and confirm the chain ID.
