import { useState } from "react";
import { useBlockchainWallet } from "../services/blockchain/useBlockchainWallet";
import { shortAddress } from "../lib/projectModel";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export default function WalletButton() {
  const { address, connect, disconnect } = useBlockchainWallet();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [customAddress, setCustomAddress] = useState("");

  async function handleConnect() {
    setLoading(true);
    setError("");
    try {
      await connect();
    } catch (err) {
      setError(err.message || "Failed to connect wallet");
    } finally {
      setLoading(false);
    }
  }

  function handleManualConnect() {
    const trimmed = customAddress.trim();
    if (!ADDRESS.test(trimmed)) {
      setError("Enter a valid wallet address (0x followed by 40 hex characters)");
      return;
    }
    // Store in localStorage as override for testing
    localStorage.setItem("proofwork.testWallet", trimmed);
    window.location.reload();
  }

  function handleManualDisconnect() {
    localStorage.removeItem("proofwork.testWallet");
    disconnect();
  }

  if (address) {
    return (
      <div className="wallet">
        <span className="mono" title={address}>{shortAddress(address)}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleManualDisconnect}>Disconnect</button>
      </div>
    );
  }

  if (showManualInput) {
    return (
      <div className="wallet" style={{ flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
        <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
          <input
            type="text"
            className="input"
            value={customAddress}
            onChange={(e) => {
              setCustomAddress(e.target.value);
              setError("");
            }}
            placeholder="0x..."
            spellCheck="false"
            style={{ flex: 1, padding: "0.5rem" }}
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleManualConnect}
            disabled={!customAddress.trim()}
          >
            Use
          </button>
        </div>
        {error && <span className="error" style={{ fontSize: "0.875rem" }}>{error}</span>}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setShowManualInput(false);
            setCustomAddress("");
            setError("");
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="wallet" style={{ gap: "0.5rem" }}>
      {error && <span className="error" style={{ marginRight: '0.5rem', fontSize: "0.875rem" }}>{error}</span>}
      <button 
        type="button" 
        className="btn btn-sm" 
        onClick={handleConnect}
        disabled={loading}
      >
        {loading ? "Connecting..." : "Connect Wallet"}
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setShowManualInput(true)}
        title="Paste a wallet address to test different roles"
      >
        Or paste address
      </button>
    </div>
  );
}

