import { useSyncExternalStore } from 'react';
import {
  connectWallet as connectWalletImpl,
  getConnectedAccount,
  isConnected,
} from './wallet';

// External store for wallet state
let listeners = new Set();
let cachedAccount = null;

// Initialize with current account
(async () => {
  try {
    cachedAccount = await getConnectedAccount().catch(() => null);
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
    () => cachedAccount
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
