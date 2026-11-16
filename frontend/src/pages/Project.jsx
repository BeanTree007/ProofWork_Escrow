import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import WalletButton from "../components/WalletButton";
import WithdrawCard from "../components/WithdrawCard";
import {
  acceptProject, canRefund, canRelease, canReview, canWork, cancelProject, getBrief, getProject,
  refundAfterDeadline, releaseAfterReview,
} from "../lib/gateway";
import { STATUS, roleFor, shortAddress, statusTone } from "../lib/projectModel";
import { useBlockchainWallet } from "../services/blockchain/useBlockchainWallet";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "");

export default function Project() {
  const { id } = useParams();
  const { address } = useBlockchainWallet();
  const [project, setProject] = useState(undefined); // undefined = loading, null = not found
  const [loadError, setLoadError] = useState("");
  const [brief, setBrief] = useState(null);
  const [briefError, setBriefError] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setProject(undefined);
    setLoadError("");
    getProject(id).then((p) => live && setProject(p)).catch((e) => { if (live) { setProject(null); setLoadError(e.message); } });
    return () => { live = false; };
  }, [id]);

  const role = project && address ? roleFor(project, address) : null;
  const canRead = role === "client" || role === "developer";
  const briefHash = project?.briefHash;

  useEffect(() => {
    setBrief(null);
    setBriefError("");
    if (!briefHash || !canRead) return;
    let live = true;
    getBrief(id, address).then((b) => live && setBrief(b)).catch((e) => live && setBriefError(e.message));
    return () => { live = false; };
  }, [id, address, canRead, briefHash]);

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

  if (project === undefined) return <p>Loading project...</p>;
  if (project === null) {
    return (
      <section>
        <PageHeader title={loadError ? "Project could not be loaded" : "Project not found"} lede={loadError || "Check the link you were sent, or create a new project."} />
        <Link className="btn" to="/create">Create a project</Link>
      </section>
    );
  }

  const working = canWork(project);
  const awaiting = !project.onChain && project.status === STATUS.FUNDED && !working && !canRefund(project); // demo: developer must accept
  const submitted = project.status === STATUS.SUBMITTED;
  const reviewOpen = canReview(project);
  const refundable = canRefund(project);
  const releasable = canRelease(project);
  const pendingExt = project.extensionRequest;
  const settled = [STATUS.APPROVED, STATUS.AUTO_RELEASED, STATUS.REFUNDED].includes(project.status);

  return (
    <section>
      <PageHeader title={project.name} lede={`Project ${project.id}`} actions={<span className={`badge badge-${statusTone(project.status)}`}>{project.status}</span>} />

      <div className="card stack">
        <dl className="summary">
          <dt>Escrow</dt><dd>{project.amount} MON</dd>
          <dt>Deadline</dt><dd>{fmt(project.deadline)}</dd>
          {pendingExt && (<><dt>Extension requested</dt><dd>{fmt(pendingExt.requestedDeadline)} (waiting for the client)</dd></>)}
          <dt>Client</dt><dd className="mono" title={project.clientAddress}>{shortAddress(project.clientAddress)}</dd>
          <dt>Developer</dt><dd className="mono" title={project.developerAddress}>{shortAddress(project.developerAddress)}</dd>
          {project.websiteURL && (<><dt>Submitted site</dt><dd className="mono wrap"><a href={project.websiteURL} target="_blank" rel="noreferrer noopener">{project.websiteURL}</a></dd></>)}
          {project.reviewDeadline && submitted && (<><dt>Review closes</dt><dd>{fmt(project.reviewDeadline)}</dd></>)}
          {role && role !== "other" && (<><dt>You are the</dt><dd>{role}</dd></>)}
        </dl>
        {project.escrowSimulated && <p className="hint-note">Demo mode: escrow is simulated in this browser.</p>}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {!address && (
        <div className="card stack">
          <h2>Connect your wallet to view the brief</h2>
          <p>The requirements and actions are available to the client and developer wallets for this project.</p>
          <WalletButton />
        </div>
      )}

      {address && role === "other" && (
        <div className="card stack">
          <h2>This wallet is not part of the project</h2>
          <p>Connected as <span className="mono">{shortAddress(address)}</span>. Switch to the client or developer wallet to see the brief.</p>
        </div>
      )}

      {canRead && !brief && (
        <div className="card stack">
          <h2>Project brief</h2>
          {briefError ? <p className="error" role="alert">{briefError}</p> : <p>Loading the requirements...</p>}
        </div>
      )}

      {brief && (
        <div className="card stack">
          <div className="row-between">
            <h2>Project brief</h2>
            <span className={`badge badge-${brief.hashMatches ? "ok" : "bad"}`}>{brief.hashMatches ? "Matches the contract" : "Does not match the contract"}</span>
          </div>
          <p className="wrap">{brief.description}</p>
          <div><h3>Required pages</h3><ul className="chips">{brief.pages.map((x) => <li key={x} className="chip chip-static">{x}</li>)}</ul></div>
          <div><h3>Required features</h3><ul className="chips">{brief.features.map((x) => <li key={x} className="chip chip-static">{x}</li>)}</ul></div>
        </div>
      )}

      {/* Developer */}
      {role === "developer" && awaiting && (
        <div className="card stack">
          <h2>Accept this project</h2>
          <p>Accepting starts the work. You can submit a deliverable and request extensions only after you accept.</p>
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I have read the requirements and agree to deliver by {fmt(project.deadline)} for {project.amount} MON.</span>
          </label>
          {brief && !brief.hashMatches && <p className="error" role="alert">The brief does not match the contract, so it cannot be accepted.</p>}
          <div className="actions">
            <button className="btn" type="button" disabled={!agreed || !brief?.hashMatches || busy} onClick={() => run(() => acceptProject(id, address, project.briefHash))}>
              {busy ? "Confirming..." : "Accept project"}
            </button>
          </div>
        </div>
      )}

      {role === "developer" && !awaiting && (
        <div className="card stack">
          <h2>Your actions</h2>
          {working ? (
            <>
              <div className="actions">
                <Link className="btn" to={`/submit?project=${encodeURIComponent(id)}`}>Submit deliverable</Link>
                <Link className="btn btn-secondary" to={`/extensions?project=${encodeURIComponent(id)}`}>{pendingExt ? "View extension request" : "Request extension"}</Link>
              </div>
              <p className="hint-note">Submit before {fmt(project.deadline)}. After the deadline the client can reclaim the escrow.</p>
            </>
          ) : releasable ? (
            <>
              <p>The client did not approve or dispute before the review window closed. You can release the escrow to yourself.</p>
              <div className="actions">
                <button className="btn" type="button" disabled={busy} onClick={() => run(() => releaseAfterReview(id))}>{busy ? "Confirming..." : `Release ${project.amount} MON`}</button>
              </div>
            </>
          ) : submitted ? (
            <>
              <p>Your website is with the client for review until {fmt(project.reviewDeadline)}. If they make no decision by then, you can release the escrow yourself.</p>
              <div className="actions"><Link className="btn btn-secondary" to={`/report?project=${encodeURIComponent(id)}`}>View verification report</Link></div>
            </>
          ) : refundable ? (
            <p className="hint-note">The deadline passed without a submission. The escrow can now be refunded to the client.</p>
          ) : (
            <p className="hint-note">No developer actions are available while the project is {project.status.toLowerCase()}.</p>
          )}
        </div>
      )}

      {/* Client */}
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
        <div className="card stack">
          <h2>Work in progress</h2>
          <p>{project.onChain ? "Your funds are locked and the developer can work now. Send them this page link." : "The developer accepted the project."} You will review their submission here.</p>
          {pendingExt && (
            <div className="actions"><Link className="btn" to={`/extensions?project=${encodeURIComponent(id)}`}>Respond to extension request</Link></div>
          )}
        </div>
      )}

      {role === "client" && reviewOpen && (
        <div className="card stack">
          <h2>Review the submission</h2>
          <p>The developer submitted a website. Run the inspector, review the evidence and the site itself, then approve or raise a dispute before {fmt(project.reviewDeadline)}. If you do nothing by then, the developer can release the escrow.</p>
          <div className="actions"><Link className="btn" to={`/report?project=${encodeURIComponent(id)}`}>Open verification report</Link></div>
        </div>
      )}

      {/* Anyone may trigger these once the deadline passes; the contract decides who gets paid. */}
      {refundable && (role === "client" || role === "other" || !role) && (
        <div className="card stack">
          <h2>Deadline passed without a submission</h2>
          <p>The escrow can be returned to the client.</p>
          <div className="actions">
            <button className="btn" type="button" disabled={busy || !address} onClick={() => run(() => refundAfterDeadline(id))}>{busy ? "Confirming..." : `Refund ${project.amount} MON to the client`}</button>
          </div>
        </div>
      )}

      {releasable && role === "client" && (
        <div className="card stack">
          <h2>Review window closed</h2>
          <p>No decision was made before {fmt(project.reviewDeadline)}, so the escrow goes to the developer.</p>
        </div>
      )}

      {project.status === STATUS.DISPUTED && canRead && (
        <div className="card stack">
          <h2>Disputed</h2>
          <p>The client disputed the submission. In this version of the contract disputed funds stay locked: there is no arbitration step yet.</p>
        </div>
      )}

      {settled && canRead && project.onChain && <WithdrawCard address={address} />}
      {settled && canRead && project.escrowSimulated && (
        <p className="hint-note">Demo mode: in the live contract the {project.status === STATUS.REFUNDED ? "client" : "developer"} would now withdraw {project.amount} MON.</p>
      )}
    </section>
  );
}
