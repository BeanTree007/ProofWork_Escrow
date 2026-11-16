import { useSyncExternalStore } from 'react';
import {
  connectWallet as connectWalletImpl,
  getConnectedAccount,
  isConnected,
} from './wallet';

// External store for wallet state
let listeners = new Set();
let cachedAccount = null;

// Initialize with current account or test override
(async () => {
  try {
    // Check for test wallet override first
    const testWallet = localStorage.getItem("proofwork.testWallet");
    if (testWallet) {
      cachedAccount = testWallet;
    } else {
      cachedAccount = await getConnectedAccount().catch(() => null);
    }
  } catch {
    cachedAccount = null;
  }
})();

function notifyListeners() {
  listeners.forEach(listener => listener());
}

export function useBlockchainWallet() {
  const account = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => {
      // Check for test wallet override on every read
      const testWallet = localStorage.getItem("proofwork.testWallet");
      return testWallet || cachedAccount;
    }
  );

  const connect = async () => {
    try {
      const result = await connectWalletImpl();
      cachedAccount = result;
      notifyListeners();
      return result;
    } catch (error) {
      throw error;
    }
  };

  const disconnect = () => {
    cachedAccount = null;
    notifyListeners();
  };

  return {
    address: account,
    connected: !!account,
    connect,
    disconnect,
  };
}

// Manual notify for external changes (e.g., MetaMask account switch)
export function notifyWalletChanged(newAccount) {
  cachedAccount = newAccount;
  notifyListeners();
}
