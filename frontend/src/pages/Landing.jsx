import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import * as blockchain from "../services/blockchain";

export default function Landing() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if already connected
    const account = blockchain.getConnectedAccount();
    if (account) {
      setAccount(account);
    }
  }, []);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const account = await blockchain.connectWallet();
      setAccount(account);
    } catch (err) {
      setError(err.message || "Failed to connect wallet");
      console.error("Wallet connection error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h1>ProofWork</h1>
      <p>Website escrow secured by Monad, with evidence for human review.</p>
      <p>AI reports evidence; it does not judge disputes or control funds.</p>
      
      {error && (
        <div className="card error" style={{ marginTop: "1rem", padding: "1rem", color: "var(--error)" }}>
          <p><strong>Error:</strong> {error}</p>
        </div>
      )}

      {account ? (
        <div className="card stack" style={{ marginTop: "2rem" }}>
          <div style={{ padding: "1rem", backgroundColor: "var(--surface-alt)", borderRadius: "0.5rem" }}>
            <p><strong>Connected:</strong> <code>{account.slice(0, 6)}...{account.slice(-4)}</code></p>
          </div>
          <div className="actions">
            <Link className="btn" to="/create">Create a project</Link>
            <Link className="btn btn-secondary" to="/dashboard">View dashboard</Link>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "2rem" }}>
          <button className="btn" onClick={handleConnect} disabled={loading}>
            {loading ? "Connecting..." : "Connect Wallet (MetaMask)"}
          </button>
        </div>
      )}
    </section>
  );
}
