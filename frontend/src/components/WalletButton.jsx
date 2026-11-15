import { useState } from "react";
import { useBlockchainWallet } from "../services/blockchain/useBlockchainWallet";
import { shortAddress } from "../lib/projectModel";

export default function WalletButton() {
  const { address, connect, disconnect } = useBlockchainWallet();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  if (address) {
    return (
      <div className="wallet">
        <span className="mono" title={address}>{shortAddress(address)}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <div className="wallet">
      {error && <span className="error" style={{ marginRight: '0.5rem' }}>{error}</span>}
      <button 
        type="button" 
        className="btn btn-sm" 
        onClick={handleConnect}
        disabled={loading}
      >
        {loading ? "Connecting..." : "Connect Wallet"}
      </button>
    </div>
  );
}

