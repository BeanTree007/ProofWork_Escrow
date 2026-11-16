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

const accountListeners = new Set();

/** Subscribe to MetaMask account switches. Returns an unsubscribe function. */
export function onAccountChange(listener) {
  accountListeners.add(listener);
  return () => accountListeners.delete(listener);
}

/** Restore a connection the user already authorized, without prompting. */
export async function restoreConnection() {
  if (typeof window === 'undefined' || !window.ethereum) return null;
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accounts?.length) {
      currentAccount = accounts[0];
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = null;
    }
  } catch {
    /* wallet locked or unavailable */
  }
  return currentAccount;
}

/** Forget the connection in this app (MetaMask keeps its own site permission). */
export function disconnectWallet() {
  currentAccount = null;
  signer = null;
}

if (typeof window !== 'undefined' && window.ethereum?.on) {
  window.ethereum.on('accountsChanged', (accounts) => {
    currentAccount = accounts.length ? accounts[0] : null;
    signer = null; // recreated for the new account on next use
    accountListeners.forEach((listener) => listener(currentAccount));
  });

  window.ethereum.on('chainChanged', () => {
    location.reload();
  });
}
