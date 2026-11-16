import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import WalletButton from "../components/WalletButton";
import { canWork, getProject, requestExtension, respondToExtension } from "../lib/gateway";
import { roleFor, statusTone } from "../lib/projectModel";
import { useBlockchainWallet } from "../services/blockchain/useBlockchainWallet";

const fmt = (iso) => new Date(iso).toLocaleString();

function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ProjectPicker() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  return (
    <section>
      <PageHeader title="Deadline extensions" lede="The developer can ask for a later deadline; the client approves or rejects it before the current deadline." />
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); if (id.trim()) navigate(`/extensions?project=${encodeURIComponent(id.trim())}`); }}>
        <div className="field">
          <label htmlFor="ext-project">Project ID</label>
          <input id="ext-project" className="input" value={id} onChange={(e) => setId(e.target.value)} placeholder="1" />
        </div>
        <div className="actions"><button className="btn" type="submit" disabled={!id.trim()}>Open project</button></div>
      </form>
    </section>
  );
}

export default function ExtensionRequests() {
  const [params] = useSearchParams();
  const projectId = (params.get("project") || "").trim();
  if (!projectId) return <ProjectPicker />;
  return <Extensions key={projectId} projectId={projectId} />;
}

function Extensions({ projectId }) {
  const { address } = useBlockchainWallet();
  const [project, setProject] = useState(undefined);
  const [loadError, setLoadError] = useState("");
  const [requested, setRequested] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    getProject(projectId).then((p) => live && setProject(p)).catch((e) => { if (live) { setProject(null); setLoadError(e.message); } });
    return () => { live = false; };
  }, [projectId]);

  useEffect(() => {
    if (project?.deadline && !requested) setRequested(toLocalInput(new Date(new Date(project.deadline).getTime() + 7 * 864e5)));
  }, [project, requested]);

  async function run(kind, action, message) {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      setProject(await action());
      setNotice(message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (project === undefined) return <p>Loading project...</p>;
  if (project === null) {
    return (
      <section>
        <PageHeader title={loadError ? "Project could not be loaded" : "Project not found"} lede={loadError || "Check the project ID."} />
        <Link className="btn btn-secondary" to="/extensions">Choose another project</Link>
      </section>
    );
  }

  const role = address ? roleFor(project, address) : null;
  const pending = project.extensionRequest;
  const open = canWork(project); // the contract allows extensions only while work is open and before the deadline
  const requestedDate = requested ? new Date(requested) : null;
  const requestValid = requestedDate && !Number.isNaN(requestedDate.getTime()) && requestedDate > new Date(project.deadline);

  return (
    <section>
      <PageHeader
        title={`Deadline extension: ${project.name}`}
        lede={`Project ${project.id}`}
        actions={<span className={`badge badge-${statusTone(project.status)}`}>{project.status}</span>}
      />

      <div className="card stack">
        <dl className="summary">
          <dt>Current deadline</dt><dd>{fmt(project.deadline)}</dd>
          <dt>Pending request</dt><dd>{pending ? fmt(pending.requestedDeadline) : "None"}</dd>
        </dl>
        {project.escrowSimulated && <p className="hint-note">Demo mode: changes are simulated in this browser.</p>}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="hint-note" role="status">{notice}</p>}

      {!address && (
        <div className="card stack">
          <h2>Connect your wallet</h2>
          <p>The developer requests extensions and the client responds to them.</p>
          <WalletButton />
        </div>
      )}

      {address && role === "other" && (
        <div className="card"><p>This wallet is not the client or the developer for this project.</p></div>
      )}

      {!open && (role === "client" || role === "developer") && (
        <div className="card"><p className="hint-note">Extensions can be requested and answered only while work is open and before the deadline. This project is {project.status.toLowerCase()}{new Date(project.deadline) <= new Date() ? " and its deadline has passed" : ""}.</p></div>
      )}

      {open && role === "developer" && !pending && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); run("request", () => requestExtension(projectId, address, requestedDate.toISOString()), "Extension requested. The client must respond before the current deadline."); }}>
          <h2>Request a later deadline</h2>
          <div className="field">
            <label htmlFor="ext-deadline">New deadline</label>
            <input id="ext-deadline" className="input" type="datetime-local" value={requested} min={toLocalInput(new Date(project.deadline))} onChange={(e) => setRequested(e.target.value)} aria-invalid={!requestValid || undefined} aria-describedby="ext-deadline-msg" />
            <span id="ext-deadline-msg" className={requestValid ? "hint" : "error"}>{requestValid ? "The client decides. Until they approve, the current deadline still applies." : "Choose a time after the current deadline."}</span>
          </div>
          <div className="actions">
            <button className="btn" type="submit" disabled={!requestValid || !!busy}>{busy === "request" ? "Confirming..." : "Request extension"}</button>
          </div>
        </form>
      )}

      {open && role === "developer" && pending && (
        <div className="card"><p>Your request to move the deadline to {fmt(pending.requestedDeadline)} is waiting for the client. Only one request can be pending at a time.</p></div>
      )}

      {open && role === "client" && pending && (
        <div className="card stack">
          <h2>The developer asked for more time</h2>
          <p>Move the deadline from {fmt(project.deadline)} to {fmt(pending.requestedDeadline)}? If you do not respond before the current deadline, the request lapses.</p>
          <div className="actions">
            <button className="btn" type="button" disabled={!!busy} onClick={() => run("approve", () => respondToExtension(projectId, address, true), "Extension approved. The deadline has moved.")}>{busy === "approve" ? "Confirming..." : "Approve extension"}</button>
            <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => run("reject", () => respondToExtension(projectId, address, false), "Extension rejected. The deadline is unchanged.")}>{busy === "reject" ? "Confirming..." : "Reject"}</button>
          </div>
        </div>
      )}

      {open && role === "client" && !pending && (
        <div className="card"><p className="hint-note">There is no extension request to respond to.</p></div>
      )}

      <p className="hint-note"><Link to={`/projects/${encodeURIComponent(projectId)}`}>Back to the project</Link></p>
    </section>
  );
}
