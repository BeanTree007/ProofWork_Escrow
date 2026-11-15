#!/usr/bin/env python3
"""
Deploy ProofWorkEscrow to Monad testnet using web3.py
"""
import json
import sys
import time
from pathlib import Path

# Install web3 if needed
try:
    from web3 import Web3
    from eth_account import Account
except ImportError:
    print("Installing web3.py...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "web3", "eth-account"])
    from web3 import Web3
    from eth_account import Account

# Configuration
RPC_URL = "https://testnet-rpc.monad.xyz"
DEPLOYER_PRIVATE_KEY = "0xe158cf17f43b808e45157d1e628c23073b25e8a1f91fa573c4bca62375155176"
REVIEW_PERIOD = 604800  # 7 days

# Connect to Monad testnet
w3 = Web3(Web3.HTTPProvider(RPC_URL))

# Verify connection
if not w3.is_connected():
    print("[FAIL] Failed to connect to Monad testnet")
    sys.exit(1)

print("[OK] Connected to Monad testnet")

# Load compiled contract
contract_json_path = Path(__file__).parent / "out" / "ProofWorkEscrow.sol" / "ProofWorkEscrow.json"
if not contract_json_path.exists():
    print(f"[FAIL] Contract JSON not found at {contract_json_path}")
    sys.exit(1)

with open(contract_json_path) as f:
    contract_data = json.load(f)

abi = contract_data["abi"]
bytecode = contract_data["bytecode"]["object"]

print("[OK] Loaded contract ABI and bytecode")

# Get deployer account
deployer = Account.from_key(DEPLOYER_PRIVATE_KEY)
deployer_address = deployer.address

print(f"[OK] Deployer address: {deployer_address}")

# Get current gas price and balance
try:
    gas_price = w3.eth.gas_price
    balance = w3.eth.get_balance(deployer_address)
    print(f"[OK] Gas price: {w3.from_wei(gas_price, 'gwei')} Gwei")
    print(f"[OK] Deployer balance: {w3.from_wei(balance, 'ether')} MON")
    
    if balance == 0:
        print("[FAIL] Deployer account has no balance")
        sys.exit(1)
except Exception as e:
    print(f"[WARN] Could not retrieve gas price or balance: {e}")

# Create contract factory
Contract = w3.eth.contract(abi=abi, bytecode=bytecode)

# Build constructor transaction
print("\n[INFO] Building deployment transaction...")
print(f"[INFO] Review period: {REVIEW_PERIOD} seconds (7 days)")

constructor_tx = Contract.constructor(REVIEW_PERIOD)

# Estimate gas
try:
    estimated_gas = constructor_tx.estimate_gas({"from": deployer_address})
    print(f"[INFO] Estimated gas: {estimated_gas}")
except Exception as e:
    print(f"[WARN] Gas estimation failed: {e}")
    estimated_gas = 3000000

# Get nonce
nonce = w3.eth.get_transaction_count(deployer_address)
print(f"[INFO] Nonce: {nonce}")

# Build transaction
tx_dict = constructor_tx.build_transaction({
    "from": deployer_address,
    "gas": int(estimated_gas * 1.2),  # Add 20% buffer
    "gasPrice": gas_price,
    "nonce": nonce,
    "chainId": 10143,
})

print(f"[INFO] Gas limit: {tx_dict['gas']}")

# Sign transaction
print(f"\n[INFO] Signing transaction...")
signed_tx = w3.eth.account.sign_transaction(tx_dict, DEPLOYER_PRIVATE_KEY)
print(f"[OK] Transaction signed")
print(f"[INFO] TX Hash (signed): {signed_tx.hash.hex()}")

# Send transaction
print(f"\n[INFO] Sending transaction to Monad testnet...")
tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
print(f"[OK] Transaction sent: {tx_hash.hex()}")

# Wait for receipt
print(f"\n[INFO] Waiting for transaction confirmation...")
max_wait = 120  # 2 minutes
start_time = time.time()

while time.time() - start_time < max_wait:
    try:
        receipt = w3.eth.get_transaction_receipt(tx_hash)
        if receipt:
            print(f"[OK] Transaction confirmed!")
            print(f"[INFO] Block: {receipt['blockNumber']}")
            print(f"[INFO] Gas used: {receipt['gasUsed']}")
            
            if receipt['status'] == 0:
                print(f"[FAIL] Transaction reverted!")
                sys.exit(1)
            
            contract_address = receipt['contractAddress']
            print(f"\n[SUCCESS] CONTRACT DEPLOYED SUCCESSFULLY!")
            print(f"[OUTPUT] Contract address: {contract_address}")
            print(f"[OUTPUT] Transaction hash: {tx_hash.hex()}")
            print(f"[OUTPUT] Deployer: {deployer_address}")
            
            # Verify deployment
            print(f"\n[INFO] Verifying deployment...")
            
            # Create contract instance
            contract_instance = w3.eth.contract(address=contract_address, abi=abi)
            
            # Check projectCount
            try:
                project_count = contract_instance.functions.projectCount().call()
                print(f"[OUTPUT] projectCount(): {project_count}")
            except Exception as e:
                print(f"[FAIL] Could not call projectCount(): {e}")
                
            # Check reviewPeriod
            try:
                review_period = contract_instance.functions.reviewPeriod().call()
                print(f"[OUTPUT] reviewPeriod(): {review_period}")
                if review_period != REVIEW_PERIOD:
                    print(f"[WARN] Review period mismatch: expected {REVIEW_PERIOD}, got {review_period}")
            except Exception as e:
                print(f"[FAIL] Could not call reviewPeriod(): {e}")
            
            # Save deployment info
            deployment_info = {
                "contract_address": contract_address,
                "deployment_tx_hash": tx_hash.hex(),
                "deployer": deployer_address,
                "block_number": receipt['blockNumber'],
                "review_period": REVIEW_PERIOD,
                "chain_id": 10143,
                "rpc_url": RPC_URL,
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
            }
            
            print(f"\n[INFO] Deployment info:")
            for key, value in deployment_info.items():
                print(f"[INFO] {key}: {value}")
            
            # Write to file for frontend
            output_file = Path(__file__).parent.parent / "DEPLOYMENT_OUTPUT.json"
            with open(output_file, "w") as f:
                json.dump(deployment_info, f, indent=2)
            print(f"\n[OK] Saved deployment info to {output_file}")
            
            sys.exit(0)
    except Exception as e:
        pass
    
    time.sleep(2)

print(f"[FAIL] Transaction timeout after {max_wait} seconds")
print(f"[INFO] You can check status at: https://testnet.monadvision.com/tx/{tx_hash.hex()}")
sys.exit(1)
