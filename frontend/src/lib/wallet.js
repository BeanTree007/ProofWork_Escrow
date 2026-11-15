// MOCK WALLET for demo mode. The real implementation belongs in src/services/ (owned by the wallet developer).
// Page code only uses this interface, so the real version must provide the same shape:
//   useWallet() -> { address | null, connect(address), disconnect(), hasSigned(projectId), signToView(projectId) }
//   buildSignInMessage(projectId) -> the exact text the wallet signs (free signature, no gas)
// The backend verifies that signature and returns the brief only to the client or developer address.
import { useSyncExternalStore } from "react";

export const DEMO_CLIENT = "0x" + "c1".repeat(20);
export const DEMO_DEVELOPER = "0x" + "d2".repeat(20);
const KEY = "proofwork.demo.wallet";

function stored() {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

let state = { address: stored(), signed: [] }; // signed holds "address:projectId"
const listeners = new Set();

function update(next) {
  state = { ...state, ...next };
  try {
    if ("address" in next) next.address ? sessionStorage.setItem(KEY, next.address) : sessionStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}

const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const connect = (address) => update({ address });
export const disconnect = () => update({ address: null });

export function buildSignInMessage(projectId) {
  return `ProofWork sign-in\nProject: ${projectId}\nPurpose: view project brief\nNonce: demo-nonce\nThis signature is free and sends no transaction.`;
}

export async function signToView(projectId) {
  if (!state.address) throw new Error("Connect a wallet first.");
  await wait(400); // stands in for the wallet's signature prompt
  update({ signed: [...state.signed, `${state.address}:${projectId}`] });
}

export function useWallet() {
  const s = useSyncExternalStore(subscribe, () => state);
  return {
    address: s.address,
    connect,
    disconnect,
    signToView,
    hasSigned: (projectId) => s.signed.includes(`${s.address}:${projectId}`),
  };
}
