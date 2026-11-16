import { useEffect, useState } from "react";
import { getClaimable, withdraw } from "../lib/gateway";

// Approved, auto-released and refunded escrow becomes a credit in the contract for the
// receiving wallet; it reaches the wallet only when that wallet withdraws it.
export default function WithdrawCard({ address }) {
  const [amount, setAmount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    let live = true;
    setAmount(null);
    getClaimable(address).then((a) => live && setAmount(a)).catch(() => live && setAmount(null));
    return () => { live = false; };
  }, [address, done]);

  if (!amount || Number(amount) === 0) {
    return done ? <p className="hint-note" role="status">Withdrawn in transaction <span className="mono">{done}</span>.</p> : null;
  }

  async function onWithdraw() {
    setBusy(true);
    setError("");
    try {
      const { txHash } = await withdraw(address);
      setDone(txHash);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <div className="row-between">
        <h2>Funds ready to withdraw</h2>
        <span className="badge badge-ok">{amount} MON</span>
      </div>
      <p>The escrow contract holds {amount} MON for this wallet from settled projects. Withdraw it to send it to your wallet.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn" type="button" disabled={busy} onClick={onWithdraw}>{busy ? "Confirm in your wallet..." : `Withdraw ${amount} MON`}</button>
      </div>
    </div>
  );
}
