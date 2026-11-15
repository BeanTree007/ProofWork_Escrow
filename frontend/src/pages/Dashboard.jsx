import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import WalletButton from "../components/WalletButton";
import { listProjectsForAddress } from "../lib/gateway";
import { roleFor, statusTone } from "../lib/projectModel";
import { useWallet } from "../lib/wallet";

export default function Dashboard() {
  const { address } = useWallet();
  const [items, setItems] = useState(null);

  useEffect(() => {
    setItems(null);
    if (!address) return;
    let live = true;
    listProjectsForAddress(address).then((l) => live && setItems(l));
    return () => { live = false; };
  }, [address]);

  return (
    <section>
      <PageHeader title="My projects" lede="Projects where your connected wallet is the client or the developer." actions={<Link className="btn" to="/create">Create a project</Link>} />
      {!address ? (
        <div className="card stack"><h2>Connect your wallet</h2><p>Your projects are found by wallet address. No sign-up is needed.</p><WalletButton /></div>
      ) : items === null ? (
        <p>Loading projects...</p>
      ) : items.length === 0 ? (
        <div className="card"><h2>No projects for this wallet yet</h2><p>Create a project as the client, or ask your client for the project link.</p></div>
      ) : (
        <ul className="project-list">
          {items.map((p) => (
            <li key={p.id} className="card row-between">
              <div>
                <h3><Link to={`/projects/${p.id}`}>{p.name}</Link></h3>
                <p className="hint-note">{p.amount} MON as {roleFor(p, address)}, due {new Date(p.deadline).toLocaleDateString()}</p>
              </div>
              <span className={`badge badge-${statusTone(p.status)}`}>{p.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
