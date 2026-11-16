import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import WalletButton from "../components/WalletButton";
import { buildSignInMessage, useWallet } from "../lib/wallet";
import { acceptProject, canWork, cancelProject, getBrief, getProject } from "../lib/gateway";
import { STATUS, roleFor, shortAddress, statusTone } from "../lib/projectModel";
import { useBlockchainWallet } from "../services/blockchain/useBlockchainWallet";

export default function Project() {
  const { id } = useParams();
  const blockchainWallet = useBlockchainWallet();
  const address = blockchainWallet.address;
  const [project, setProject] = useState(undefined); // undefined = loading, null = not found
  const [brief, setBrief] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    getProject(id).then((p) => live && setProject(p));
    return () => { live = false; };
  }, [id]);

  const role = project && address ? roleFor(project, address) : null;
  const canRead = role === "client" || role === "developer";
  const loaded = !!project;

  useEffect(() => {
    setBrief(null);
    if (!loaded || !canRead) return;
    let live = true;
    getBrief(id, address).then((b) => live && setBrief(b)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [id, address, canRead, loaded]);

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      setProject(await action());
      setConfirmCancel(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    // Signing is handled transparently by blockchain wallet
    // No-op for blockchain integration
  }

  if (project === undefined) return <p>Loading project...</p>;
  if (project === null) {
    return (
      <section>
        <PageHeader title="Project not found" lede="Check the link you were sent, or create a new project." />
        <Link className="btn" to="/create">Create a project</Link>
      </section>
    );
  }

  const working = canWork(project);
  const awaiting = project.status === STATUS.FUNDED && !working; // demo projects wait for the developer to accept
  const submitted = project.status === STATUS.SUBMITTED;

  return (
    <section>
      <PageHeader title={project.name} lede={`Project ${project.id}`} actions={<span className={`badge badge-${statusTone(project.status)}`}>{project.status}</span>} />

      <div className="card stack">
        <dl className="summary">
          <dt>Escrow</dt><dd>{project.amount} MON</dd>
          <dt>Deadline</dt><dd>{new Date(project.deadline).toLocaleString()}</dd>
          <dt>Client</dt><dd className="mono" title={project.clientAddress}>{shortAddress(project.clientAddress)}</dd>
          <dt>Developer</dt><dd className="mono" title={project.developerAddress}>{shortAddress(project.developerAddress)}</dd>
          {project.websiteURL && (<><dt>Submitted site</dt><dd className="mono wrap"><a href={project.websiteURL} target="_blank" rel="noreferrer noopener">{project.websiteURL}</a></dd></>)}
          {role && role !== "other" && (<><dt>You are the</dt><dd>{role}</dd></>)}
        </dl>
        {project.escrowSimulated && <p className="hint-note">Demo mode: escrow is simulated in this browser.</p>}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {canRead && !address && (
        <div className="card stack">
          <h2>Connect your wallet to view the brief</h2>
          <p>The requirements are visible only to the client and the developer wallet for this project.</p>
          <WalletButton />
        </div>
      )}

      {address && role === "other" && (
        <div className="card stack">
          <h2>This wallet is not part of the project</h2>
          <p>Connected as <span className="mono">{shortAddress(address)}</span>. Switch to the client or developer wallet to see the brief.</p>
          <WalletButton />
        </div>
      )}

      {canRead && !brief && (
        <div className="card stack">
          <h2>Loading project brief...</h2>
          <p>Getting requirements for this project.</p>
        </div>
      )}

      {brief && (
        <div className="card stack">
          <div className="row-between">
            <h2>Project brief</h2>
            <span className={`badge badge-${brief.hashMatches ? "ok" : "bad"}`}>{brief.hashMatches ? "Matches the contract" : "Does not match the contract"}</span>
          </div>
          <p>{brief.description}</p>
          <div><h3>Required pages</h3><ul className="chips">{brief.pages.map((x) => <li key={x} className="chip chip-static">{x}</li>)}</ul></div>
          <div><h3>Required features</h3><ul className="chips">{brief.features.map((x) => <li key={x} className="chip chip-static">{x}</li>)}</ul></div>
        </div>
      )}

      {role === "developer" && awaiting && brief && (
        <div className="card stack">
          <h2>Accept this project</h2>
          <p>Accepting starts the work. You can submit a deliverable and request extensions only after you accept.</p>
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I have read the requirements and agree to deliver by {new Date(project.deadline).toLocaleString()} for {project.amount} MON.</span>
          </label>
          {!brief.hashMatches && <p className="error" role="alert">The brief does not match the contract, so it cannot be accepted.</p>}
          <div className="actions">
            <button className="btn" type="button" disabled={!agreed || !brief.hashMatches || busy} onClick={() => run(() => acceptProject(id, address, project.briefHash))}>
              {busy ? "Confirming..." : "Accept project"}
            </button>
          </div>
        </div>
      )}

      {role === "developer" && !awaiting && (
        <div className="card stack">
          <h2>Your actions</h2>
          {working ? (
            <div className="actions">
              <Link className="btn" to={`/submit?project=${id}`}>Submit deliverable</Link>
              <Link className="btn btn-secondary" to={`/extensions?project=${id}`}>Request extension</Link>
            </div>
          ) : submitted ? (
            <>
              <p>Your website is with the client for review.</p>
              <div className="actions"><Link className="btn btn-secondary" to={`/report?project=${id}`}>View verification report</Link></div>
            </>
          ) : (
            <p className="hint-note">No developer actions are available while the project is {project.status.toLowerCase()}.</p>
          )}
        </div>
      )}

      {role === "developer" && awaiting && (
        <div className="card stack">
          <h2>Your actions</h2>
          <div className="actions">
            <button className="btn" type="button" disabled>Submit deliverable</button>
            <button className="btn btn-secondary" type="button" disabled>Request extension</button>
          </div>
          <p className="hint-note">Available after you accept the project.</p>
        </div>
      )}

      {role === "client" && awaiting && (
        <div className="card stack">
          <h2>Waiting for the developer to accept</h2>
          <p>Your funds are locked. Send the developer this page link; they must connect the wallet you entered to see and accept the brief.</p>
          {confirmCancel ? (
            <div className="actions">
              <button className="btn btn-danger" type="button" disabled={busy} onClick={() => run(() => cancelProject(id, address))}>{busy ? "Refunding..." : "Yes, cancel and refund"}</button>
              <button className="btn btn-secondary" type="button" onClick={() => setConfirmCancel(false)}>Keep project</button>
            </div>
          ) : (
            <div className="actions"><button className="btn btn-secondary" type="button" onClick={() => setConfirmCancel(true)}>Cancel and refund</button></div>
          )}
        </div>
      )}

      {role === "client" && working && (
        <div className="card"><h2>Work in progress</h2><p>{project.onChain ? "The developer is working on the project." : "The developer accepted the project."} You will be able to review their submission here.</p></div>
      )}

      {role === "client" && submitted && (
        <div className="card stack">
          <h2>Review the submission</h2>
          <p>The developer submitted a website. Run the inspector, review the evidence and the site itself, then approve or raise a dispute.</p>
          <div className="actions"><Link className="btn" to={`/report?project=${id}`}>Open verification report</Link></div>
        </div>
      )}
    </section>
  );
}
