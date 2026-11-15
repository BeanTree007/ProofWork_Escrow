import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { getProject, approveProject, disputeProject } from "../lib/gateway";
import * as blockchain from "../services/blockchain";
import PageHeader from "../components/PageHeader";

const PROJECT_STATES = {
  'Funded': 'Escrow funded, developer is working',
  'Submitted': 'Website submitted, awaiting client review',
  'Approved': 'Approved by client, developer can withdraw',
  'AutoReleased': 'Review timeout, developer can withdraw',
  'Disputed': 'Client raised dispute, funds locked',
  'Refunded': 'Deadline missed, client can withdraw',
};

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("id") || "1";
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  async function loadProject() {
    setLoading(true);
    setError(null);
    try {
      const proj = await getProject(projectId);
      if (proj) {
        setProject(proj);
      } else {
        setError("Project not found");
      }
    } catch (err) {
      setError(err.message || "Failed to load project");
      console.error("Load project error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProject();
  }, [projectId]);

  async function handleApprove() {
    setActionLoading(true);
    try {
      await blockchain.approveProject(projectId);
      await loadProject();
    } catch (err) {
      alert("Error: " + (err.message || "Failed to approve project"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDispute() {
    setActionLoading(true);
    try {
      await blockchain.disputeProject(projectId);
      await loadProject();
    } catch (err) {
      alert("Error: " + (err.message || "Failed to dispute project"));
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <section>
        <PageHeader title="Dashboard" lede="Loading project details..." />
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <PageHeader title="Dashboard" />
        <div className="card" style={{ color: "var(--error)" }}>
          <p><strong>Error:</strong> {error}</p>
          <button className="btn" onClick={loadProject}>Try again</button>
        </div>
      </section>
    );
  }

  if (!project) {
    return (
      <section>
        <PageHeader title="Dashboard" />
        <div className="card">
          <p>Project #{projectId} not found</p>
          <Link to="/create" className="btn">Create a project</Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title={`Project #${projectId}`}
        lede={PROJECT_STATES[project.status] || PROJECT_STATES[project.state] || "Status unknown"}
      />
      <div className="create-layout">
        <div className="card stack">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
            <dl>
              <dt>State</dt>
              <dd><strong>{project.status || project.state}</strong></dd>
              
              <dt>Amount (MON)</dt>
              <dd>{project.amount || (BigInt(project.escrowAmount) / BigInt(1e18)).toString()}</dd>
              
              <dt>Deadline</dt>
              <dd>{new Date(project.deadline).toLocaleString()}</dd>
            </dl>
            
            <dl>
              <dt>Client</dt>
              <dd className="mono wrap">{project.client || "Unknown"}</dd>
              
              <dt>Developer</dt>
              <dd className="mono wrap">{project.developer || project.developerAddress || "Unknown"}</dd>
            </dl>
          </div>

          {project.websiteURL && (
            <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
              <dt>Website URL</dt>
              <dd>
                <a href={project.websiteURL} target="_blank" rel="noopener noreferrer">
                  {project.websiteURL}
                </a>
              </dd>
            </div>
          )}

          {project.txHash && (
            <div style={{ marginTop: "1rem", fontSize: "0.9em", color: "var(--text-muted)" }}>
              <p>Transaction: <code>{project.txHash.slice(0, 10)}...</code></p>
            </div>
          )}

          <div className="actions" style={{ marginTop: "2rem" }}>
            <button className="btn" onClick={loadProject} disabled={actionLoading}>
              {actionLoading ? "Loading..." : "Refresh"}
            </button>
            
            {(project.status === "Submitted" || project.state === "Submitted") && (
              <>
                <button className="btn" onClick={handleApprove} disabled={actionLoading}>
                  {actionLoading ? "Approving..." : "Approve Project"}
                </button>
                <button className="btn btn-secondary" onClick={handleDispute} disabled={actionLoading}>
                  {actionLoading ? "Disputing..." : "Raise Dispute"}
                </button>
              </>
            )}

            {(project.status === "Funded" || project.state === "Funded") && (
              <Link className="btn btn-secondary" to={`/submit?projectId=${projectId}`}>
                Submit Website (Developer)
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
