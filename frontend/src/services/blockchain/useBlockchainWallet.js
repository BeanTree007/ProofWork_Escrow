import { useSyncExternalStore } from 'react';
import {
  connectWallet as connectWalletImpl,
  disconnectWallet,
  onAccountChange,
  restoreConnection,
} from './wallet';

// Test override: WalletButton can store an address to act as in demo mode (no MetaMask).
export const TEST_WALLET_KEY = 'proofwork.testWallet';

export function getTestWallet() {
  try {
    return localStorage.getItem(TEST_WALLET_KEY);
  } catch {
    return null;
  }
}

const listeners = new Set();
let cachedAccount = null;

function setAccount(account) {
  cachedAccount = account;
  listeners.forEach((listener) => listener());
}

onAccountChange(setAccount);
restoreConnection().then((account) => account && setAccount(account));

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => getTestWallet() || cachedAccount;

export function useBlockchainWallet() {
  const account = useSyncExternalStore(subscribe, snapshot);
  const testMode = !!getTestWallet();

  const connect = async () => {
    const result = await connectWalletImpl();
    setAccount(result);
    return result;
  };

  const disconnect = () => {
    disconnectWallet();
    setAccount(null);
  };

  return {
    address: account,
    connected: !!account,
    testMode,
    connect,
    disconnect,
  };
}

// Kept for callers that report account changes themselves.
export function notifyWalletChanged(newAccount) {
  setAccount(newAccount);
}
