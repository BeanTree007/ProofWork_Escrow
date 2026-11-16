import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import TagInput from "../components/TagInput";
import { approveProject, canReview, disputeProject, getBrief, getProject } from "../lib/gateway";
import { STATUS, roleFor, statusTone } from "../lib/projectModel";
import { getReport, runInspection, screenshotUrl } from "../lib/reportApi";
import { useBlockchainWallet } from "../services/blockchain/useBlockchainWallet";

// Renders the evidence report described in docs/report-contract.md.
// Rules: the report never decides; checks listed in incomplete_checks are "not checked", never a pass;
// text from the inspected site is rendered as plain text only (React escapes it).

const REQUIREMENT_LABEL = {
  detected: ["Detected", "ok"],
  not_detected: ["Not detected", "bad"],
  needs_review: ["Needs review", "warn"],
};
const CHECK_NAMES = {
  pages: "Required page detection",
  contact_form: "Contact form detection",
  screenshots: "Screenshots",
  responsiveness: "Mobile responsiveness",
  lighthouse: "Lighthouse metrics",
};
const SCORES = [["performance", "Performance"], ["accessibility", "Accessibility"], ["seo", "SEO"], ["best_practices", "Best practices"]];

const scoreTone = (s) => (s == null ? "muted" : s >= 90 ? "ok" : s >= 50 ? "warn" : "bad");
const fmtDate = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };

// On-chain projects use client/developer, demo projects use clientAddress/developerAddress.
function normalize(p) {
  if (!p) return p;
  return { ...p, clientAddress: p.clientAddress ?? p.client, developerAddress: p.developerAddress ?? p.developer };
}

function Badge({ tone = "muted", children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function NotChecked({ reason }) {
  return (
    <div className="not-checked">
      <Badge>Not checked</Badge>
      <span className="hint-note">{reason}</span>
    </div>
  );
}

function Section({ title, badge, children }) {
  return (
    <div className="card stack">
      <div className="row-between"><h2>{title}</h2>{badge}</div>
      {children}
    </div>
  );
}

function ProjectPicker() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  return (
    <section>
      <PageHeader title="Verification report" lede="Evidence gathered from the submitted website, for the client to review." />
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); if (id.trim()) navigate(`/report?project=${encodeURIComponent(id.trim())}`); }}>
        <div className="field">
          <label htmlFor="report-project">Project ID</label>
          <input id="report-project" className="input" value={id} onChange={(e) => setId(e.target.value)} placeholder="1" />
        </div>
        <div className="actions"><button className="btn" type="submit" disabled={!id.trim()}>Open report</button></div>
      </form>
    </section>
  );
}

function InspectionForm({ initial, busy, onRun, onCancel }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); onRun(form); }} aria-busy={busy}>
      <h2>Run the inspector</h2>
      <p className="hint-note">The inspector loads the site, takes screenshots, checks screen sizes, runs Lighthouse and matches the brief. It can take up to a minute.</p>
      <div className="field">
        <label htmlFor="insp-url">Website URL</label>
        <input id="insp-url" className="input" type="url" value={form.websiteUrl} onChange={(e) => set("websiteUrl")(e.target.value)} placeholder="https://example.com" required />
      </div>
      <div className="field">
        <label htmlFor="insp-pages">Required pages</label>
        <TagInput id="insp-pages" values={form.pages} onChange={set("pages")} placeholder="Home, About, Contact" />
      </div>
      <div className="field">
        <label htmlFor="insp-features">Required features</label>
        <TagInput id="insp-features" values={form.features} onChange={set("features")} placeholder="Contact form, Mobile layout" />
      </div>
      <div className="actions">
        <button className="btn" type="submit" disabled={busy || !form.websiteUrl.trim()}>{busy ? "Inspecting the site..." : "Run inspection"}</button>
        {onCancel && <button className="btn btn-secondary" type="button" onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </form>
  );
}

function Overview({ report }) {
  const r = report.reachability;
  const counts = report.requirements.reduce((acc, x) => ({ ...acc, [x.status]: (acc[x.status] || 0) + 1 }), {});
  return (
    <Section title="Website reachability" badge={<Badge tone={r.reachable ? "ok" : "bad"}>{r.reachable ? "Reachable" : "Not reachable"}</Badge>}>
      <dl className="summary">
        <dt>Submitted URL</dt><dd className="mono wrap">{report.website_url}</dd>
        {r.final_url && r.final_url !== report.website_url && (<><dt>Final URL</dt><dd className="mono wrap">{r.final_url}</dd></>)}
        <dt>Status code</dt><dd>{r.status_code ?? "None"}</dd>
        <dt>Response time</dt><dd>{r.response_ms != null ? `${r.response_ms} ms` : "Not measured"}</dd>
        <dt>HTTPS</dt><dd>{r.https ? "Yes" : "No"}</dd>
        {report.metadata.title && (<><dt>Page title</dt><dd className="wrap">{report.metadata.title}</dd></>)}
        {report.metadata.description && (<><dt>Description</dt><dd className="wrap">{report.metadata.description}</dd></>)}
        <dt>Requirements</dt>
        <dd>{counts.detected || 0} detected, {counts.not_detected || 0} not detected, {counts.needs_review || 0} need review</dd>
      </dl>
      {r.error && <p className="error" role="status">{r.error}</p>}
    </Section>
  );
}

function Summary({ summary }) {
  const ai = summary.generated_by === "ai";
  return (
    <Section title="Summary" badge={<Badge tone={ai ? "accent" : "muted"}>{ai ? `Written by AI (${summary.model || "model"})` : "Template summary, no AI"}</Badge>}>
      <p className="summary-text">{summary.text || "No summary was produced."}</p>
      {summary.error && <p className="hint-note">AI summary unavailable: {summary.error}</p>}
    </Section>
  );
}

function Checklist({ report, incomplete }) {
  if (!report.requirements.length) return <Section title="Requirement checklist"><p className="hint-note">No required pages or features were given.</p></Section>;
  return (
    <Section title="Requirement checklist">
      <ul className="checklist">
        {report.requirements.map((req) => {
          const blocked = req.method === "not_inspected" || (req.kind === "page" && incomplete.pages);
          const [label, tone] = blocked ? ["Not checked", "muted"] : REQUIREMENT_LABEL[req.status];
          return (
            <li key={req.id}>
              <div className="row-between">
                <strong className="wrap">{req.text} <span className="hint-note">({req.kind})</span></strong>
                <Badge tone={tone}>{label}</Badge>
              </div>
              <p className="hint-note wrap">{req.evidence}</p>
            </li>
          );
        })}
      </ul>
      <p className="hint-note">"Not detected" means the automated checks found no evidence. It does not prove the item is absent.</p>
    </Section>
  );
}

function Pages({ report, incomplete }) {
  return (
    <Section title="Required page detection">
      {incomplete.pages ? <NotChecked reason={incomplete.pages} /> : report.pages.required.length === 0 ? (
        <p className="hint-note">No required pages were given.</p>
      ) : (
        <ul className="checklist">
          {report.pages.required.map((p, i) => (
            <li key={`${p.name}-${i}`} className="row-between">
              <div>
                <strong>{p.name}</strong>
                {p.matched_url && <div className="mono wrap hint-note">{p.matched_url}</div>}
              </div>
              <Badge tone={p.detected ? "ok" : "bad"}>{p.detected ? "Found" : "Not detected"}</Badge>
            </li>
          ))}
        </ul>
      )}
      {report.pages.discovered.length > 0 && (
        <details>
          <summary>Pages discovered on the site ({report.pages.discovered.length})</summary>
          <ul className="plain-list">
            {report.pages.discovered.map((d) => <li key={d.url} className="wrap"><span className="mono">{d.url}</span>{d.title && ` (${d.title})`}</li>)}
          </ul>
        </details>
      )}
    </Section>
  );
}

function ContactForm({ cf, reason }) {
  return (
    <Section title="Contact form detection" badge={!reason && <Badge tone={cf.detected ? "ok" : "bad"}>{cf.detected ? "Detected" : "Not detected"}</Badge>}>
      {reason ? <NotChecked reason={reason} /> : cf.forms.length === 0 ? (
        <p className="hint-note">No forms were found on the inspected pages.</p>
      ) : (
        <ul className="checklist">
          {cf.forms.map((f, i) => (
            <li key={i}>
              <div className="mono wrap hint-note">{f.page_url} · {f.method.toUpperCase()} {f.action || "(no action)"}</div>
              <div className="chips">
                {f.fields.map((fl, j) => <span key={j} className="chip chip-static">{fl.name || "(unnamed)"}: {fl.type}</span>)}
              </div>
              <div className="flags">
                <Badge tone={f.has_email_field ? "ok" : "muted"}>{f.has_email_field ? "Email field" : "No email field"}</Badge>
                <Badge tone={f.has_message_field ? "ok" : "muted"}>{f.has_message_field ? "Message field" : "No message field"}</Badge>
                <Badge tone={f.has_submit ? "ok" : "muted"}>{f.has_submit ? "Submit button" : "No submit button"}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="hint-note">Form structure only. Whether messages are actually delivered was not tested.</p>
    </Section>
  );
}

function Screenshots({ projectId, report, reason }) {
  const shots = report.screenshots;
  return (
    <Section title="Screenshot captures">
      {reason && <NotChecked reason={reason} />}
      {shots.length > 0 && (
        <div className="shot-grid">
          {shots.map((s, i) => (
            <figure key={i} className="shot">
              {s.taken && s.file ? (
                <a href={screenshotUrl(projectId, s.file, report.generated_at)} target="_blank" rel="noreferrer">
                  <img src={screenshotUrl(projectId, s.file, report.generated_at)} alt={`Screenshot: ${s.label}`} loading="lazy" />
                </a>
              ) : (
                <div className="shot-missing"><Badge>Not taken</Badge><span className="hint-note">{s.error}</span></div>
              )}
              <figcaption>
                <strong>{s.label}</strong>
                <span className="hint-note">{s.viewport.width} × {s.viewport.height}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {!reason && shots.length === 0 && <p className="hint-note">No screenshots were taken.</p>}
    </Section>
  );
}

function Responsiveness({ resp, reason }) {
  return (
    <Section title="Mobile responsiveness">
      {reason || !resp.checks_run ? <NotChecked reason={reason || "The responsiveness check did not run."} /> : (
        <ul className="checklist">
          {resp.viewports.map((v) => (
            <li key={v.name} className="row-between">
              <div>
                <strong>{v.name}</strong> <span className="hint-note">{v.width} × {v.height}</span>
                {v.error && <div className="hint-note">{v.error}</div>}
              </div>
              <div className="flags">
                {v.horizontal_overflow == null ? <Badge>Not measured</Badge> : (
                  <Badge tone={v.horizontal_overflow ? "warn" : "ok"}>{v.horizontal_overflow ? "Horizontal overflow" : "No overflow"}</Badge>
                )}
                {v.viewport_meta != null && <Badge tone={v.viewport_meta ? "ok" : "warn"}>{v.viewport_meta ? "Viewport tag" : "No viewport tag"}</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Lighthouse({ lh, reason }) {
  return (
    <Section title="Lighthouse metrics">
      {!lh.ran ? <NotChecked reason={reason || lh.error || "Lighthouse did not run."} /> : (
        <div className="score-grid">
          {SCORES.map(([key, label]) => (
            <div key={key} className={`score score-${scoreTone(lh[key])}`}>
              <span className="score-value">{lh[key] ?? "–"}</span>
              <span className="score-label">{label}</span>
            </div>
          ))}
        </div>
      )}
      {lh.ran && <p className="hint-note">Scores from 0 to 100, measured once on the home page. They vary between runs.</p>}
    </Section>
  );
}

function Decision({ project, address, onUpdated }) {
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(kind) {
    setBusy(true);
    setError("");
    try {
      const updated = kind === "approve" ? await approveProject(project.id, address) : await disputeProject(project.id, address);
      onUpdated(normalize(updated));
      setConfirm(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card stack decision">
      <h2>Your decision</h2>
      <p>The report above is evidence only. Review the website yourself, then choose before {new Date(project.reviewDeadline).toLocaleString()}. Approving releases {project.amount} MON to the developer. Raising a dispute keeps the funds locked in escrow.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {confirm ? (
        <div className="actions">
          <button className={`btn ${confirm === "dispute" ? "btn-danger" : ""}`} type="button" disabled={busy} onClick={() => act(confirm)}>
            {busy ? "Confirming..." : confirm === "approve" ? "Yes, approve and release funds" : "Yes, raise a dispute"}
          </button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setConfirm(null)}>Go back</button>
        </div>
      ) : (
        <div className="actions">
          <button className="btn" type="button" onClick={() => setConfirm("approve")}>Approve work</button>
          <button className="btn btn-danger" type="button" onClick={() => setConfirm("dispute")}>Raise dispute</button>
        </div>
      )}
    </div>
  );
}

export default function VerificationReport() {
  const [params] = useSearchParams();
  const projectId = (params.get("project") || params.get("projectId") || "").trim();
  if (!projectId) return <ProjectPicker />;
  return <ReportView key={projectId} projectId={projectId} />;
}

function ReportView({ projectId }) {
  const { address } = useBlockchainWallet();
  const [project, setProject] = useState(undefined);
  const [brief, setBrief] = useState(null);
  const [report, setReport] = useState(undefined); // undefined = loading, null = none yet
  const [loadError, setLoadError] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let live = true;
    getProject(projectId).then((p) => live && setProject(normalize(p))).catch(() => live && setProject(null));
    getReport(projectId).then((r) => live && setReport(r)).catch((e) => { if (live) { setReport(null); setLoadError(e.message); } });
    return () => { live = false; };
  }, [projectId]);

  const role = project && address ? roleFor(project, address) : null;
  const isParty = role === "client" || role === "developer";
  useEffect(() => {
    setBrief(null);
    if (!isParty) return;
    let live = true;
    getBrief(projectId, address).then((b) => live && setBrief(b)).catch(() => {});
    return () => { live = false; };
  }, [projectId, address, isParty]);

  const initialForm = useMemo(() => {
    const fromReport = (kind) => report?.requirements.filter((r) => r.kind === kind).map((r) => r.text) ?? [];
    return {
      websiteUrl: project?.websiteURL || report?.website_url || "",
      pages: brief?.pages ?? fromReport("page"),
      features: brief?.features ?? fromReport("feature"),
    };
  }, [project, report, brief]);

  const incomplete = useMemo(
    () => Object.fromEntries((report?.incomplete_checks ?? []).map((c) => [c.check, c.reason])),
    [report],
  );

  async function run(form) {
    setRunning(true);
    setRunError("");
    try {
      setReport(await runInspection(projectId, { websiteUrl: form.websiteUrl.trim(), pages: form.pages, features: form.features }));
      setLoadError("");
      setShowForm(false);
    } catch (e) {
      setRunError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const title = project?.name ? `Verification report: ${project.name}` : `Verification report`;
  const lede = `Project ${projectId}. Evidence gathered from the submitted website, for the client to review.`;
  const statusBadge = project && <span className={`badge badge-${statusTone(project.status)}`}>{project.status}</span>;

  if (report === undefined) return <section><PageHeader title={title} lede={lede} /><p>Loading report...</p></section>;

  const canDecide = role === "client" && canReview(project);
  const formVisible = !report || showForm;

  return (
    <section className="report">
      <PageHeader title={title} lede={lede} actions={statusBadge} />

      {loadError && <p className="error" role="alert">{loadError}</p>}
      {runError && <p className="error" role="alert">{runError}</p>}

      {!report && (
        <div className="card stack">
          <h2>No report yet</h2>
          <p>No inspection has been run for this project. {project?.websiteURL ? "The developer has submitted a website, so you can run one now." : "Run one once the developer has submitted a website URL."}</p>
        </div>
      )}

      {formVisible && <InspectionForm initial={initialForm} busy={running} onRun={run} onCancel={report ? () => setShowForm(false) : null} />}

      {report && (
        <>
          <div className="card disclaimer" role="note">
            <strong>Evidence only.</strong> {report.disclaimer}
            <div className="row-between disclaimer-meta">
              <span className="hint-note">Generated {fmtDate(report.generated_at)} · schema v{report.schema_version}</span>
              {!showForm && <button className="btn btn-secondary" type="button" onClick={() => setShowForm(true)}>Re-run inspection</button>}
            </div>
          </div>

          <Summary summary={report.ai_summary} />
          <Overview report={report} />
          {report.website_url && (
            <div className="actions">
              <a className="btn btn-secondary" href={report.reachability.final_url || report.website_url} target="_blank" rel="noreferrer noopener">Open the submitted website</a>
            </div>
          )}
          <Checklist report={report} incomplete={incomplete} />
          <Pages report={report} incomplete={incomplete} />
          <ContactForm cf={report.contact_form} reason={incomplete.contact_form} />
          <Screenshots projectId={projectId} report={report} reason={incomplete.screenshots} />
          <Responsiveness resp={report.responsiveness} reason={incomplete.responsiveness} />
          <Lighthouse lh={report.metrics.lighthouse} reason={incomplete.lighthouse} />

          {report.incomplete_checks.length > 0 && (
            <Section title="Checks that did not run" badge={<Badge tone="warn">{report.incomplete_checks.length} not checked</Badge>}>
              <ul className="plain-list">
                {report.incomplete_checks.map((c, i) => <li key={i}><strong>{CHECK_NAMES[c.check] || c.check}:</strong> {c.reason}</li>)}
              </ul>
            </Section>
          )}

          {canDecide && <Decision project={project} address={address} onUpdated={setProject} />}
          {role === "client" && project && !canDecide && (
            <p className="hint-note">
              {project.status === STATUS.SUBMITTED
                ? "The review window has closed, so approve and dispute are no longer available. The developer can release the escrow from the project page."
                : `Approve and dispute are available while the project is Submitted. It is currently ${project.status}.`}
            </p>
          )}
        </>
      )}

      <p className="hint-note"><Link to="/dashboard">Back to my projects</Link></p>
    </section>
  );
}
