import { ethers } from 'ethers';
import { getConfig } from './contractConfig';

const MONAD_CHAIN_ID = 10143;

// Store the current provider and signer
let provider = null;
let signer = null;
let currentAccount = null;

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed');
  }

  try {
    // Request account access
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });

    if (!accounts || accounts.length === 0) {
      throw new Error('No wallet accounts found');
    }

    currentAccount = accounts[0];
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();

    // Verify we're on Monad testnet
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== MONAD_CHAIN_ID) {
      // Try to switch to Monad
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${MONAD_CHAIN_ID.toString(16)}` }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          // Chain not found, try to add it
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${MONAD_CHAIN_ID.toString(16)}`,
                chainName: 'Monad Testnet',
                rpcUrls: ['https://testnet-rpc.monad.xyz'],
                nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
                blockExplorerUrls: ['https://testnet.monadvision.com'],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }
    }

    return currentAccount;
  } catch (error) {
    console.error('Wallet connection failed:', error);
    throw error;
  }
}

export async function getProvider() {
  if (!provider) {
    if (window.ethereum) {
      provider = new ethers.BrowserProvider(window.ethereum);
    } else {
      throw new Error('MetaMask not available');
    }
  }
  return provider;
}

export async function getSigner() {
  if (!signer) {
    const prov = await getProvider();
    signer = await prov.getSigner();
  }
  return signer;
}

export async function getCurrentAccount() {
  if (!currentAccount) {
    // Try to get the current account from the provider
    const prov = await getProvider();
    const sig = await prov.getSigner();
    currentAccount = await sig.getAddress();
  }
  return currentAccount;
}

export function isConnected() {
  return !!currentAccount;
}

export function getConnectedAccount() {
  return currentAccount;
}

// Listen for account changes
if (window.ethereum) {
  window.ethereum.on('accountsChanged', (accounts) => {
    if (accounts.length === 0) {
      currentAccount = null;
      signer = null;
    } else {
      currentAccount = accounts[0];
      signer = null; // Will be recreated on next use
    }
  });

  window.ethereum.on('chainChanged', () => {
    // Reload on chain change
    location.reload();
  });
}
