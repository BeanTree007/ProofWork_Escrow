import { useRef, useState } from "react";
import { DEMO_CLIENT, DEMO_DEVELOPER, useWallet } from "../lib/wallet";
import { shortAddress } from "../lib/projectModel";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const labelFor = (a) => (a === DEMO_CLIENT ? "Demo client" : a === DEMO_DEVELOPER ? "Demo developer" : "");

export default function WalletButton() {
  const { address, connect, disconnect } = useWallet();
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const menu = useRef(null);

  function choose(a) {
    connect(a);
    setCustom("");
    setError("");
    if (menu.current) menu.current.open = false;
  }

  if (address) {
    return (
      <div className="wallet">
        <span className="mono" title={address}>{shortAddress(address)}</span>
        {labelFor(address) && <span className="badge">{labelFor(address)}</span>}
        <button type="button" className="btn btn-secondary btn-sm" onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <details className="wallet-menu" ref={menu}>
      <summary className="btn btn-sm">Connect wallet</summary>
      <div className="wallet-panel stack">
        <p className="hint-note">Demo mode: pick an identity to try each side of the flow.</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => choose(DEMO_CLIENT)}>Connect as demo client</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => choose(DEMO_DEVELOPER)}>Connect as demo developer</button>
        <div className="field">
          <label htmlFor="wallet-custom">Or paste an address</label>
          <input id="wallet-custom" className="input mono" value={custom} onChange={(e) => { setCustom(e.target.value); setError(""); }} placeholder="0x..." spellCheck="false" aria-invalid={!!error || undefined} />
          {error && <span className="error" role="alert">{error}</span>}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => (ADDRESS.test(custom.trim()) ? choose(custom.trim()) : setError("Enter 0x followed by 40 hex characters."))}>Connect address</button>
      </div>
    </details>
  );
}
