import { useSearchParams, Link } from "react-router-dom";
import { useState, useRef } from "react";
import PageHeader from "../components/PageHeader";
import WalletButton from "../components/WalletButton";
import { submitWebsite } from "../lib/gateway";
import { useWallet } from "../lib/wallet";

function Field({ id, label, hint, error, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span id={`${id}-msg`} className="error" role="alert">{error}</span>
      ) : (
        hint && <span id={`${id}-msg`} className="hint">{hint}</span>
      )}
    </div>
  );
}

export default function SubmitWebsite() {
  const [searchParams] = useSearchParams();
  const { address } = useWallet();
  const projectId = searchParams.get("project") || searchParams.get("projectId") || "";
  const formRef = useRef(null);

  const [form, setForm] = useState({ projectId, websiteURL: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onText = (key) => (e) => set(key)(e.target.value);
  const focusFirstError = () =>
    requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());

  async function onSubmit(e) {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      const newErrors = {};
      if (!form.projectId || form.projectId.trim().length === 0) {
        newErrors.projectId = "Project ID is required";
      }
      const url = form.websiteURL.trim();
      if (!url) {
        newErrors.websiteURL = "Website URL is required";
      } else if (url.length > 2048) {
        newErrors.websiteURL = "URL too long (max 2048 characters)";
      } else if (!/^https?:\/\/[^\s/]+/i.test(url)) {
        newErrors.websiteURL = "Enter a full URL starting with http:// or https://";
      }

      if (Object.keys(newErrors).length) {
        setErrors(newErrors);
        focusFirstError();
        setLoading(false);
        return;
      }

      const id = form.projectId.trim();
      const project = await submitWebsite(id, address, form.websiteURL.trim());
      setSuccess({ projectId: id, websiteURL: project?.websiteURL || form.websiteURL.trim() });
    } catch (err) {
      setErrors({ general: err.message || "Failed to submit website" });
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <section>
        <PageHeader title="Website submitted" lede="Developer has submitted the website for client review." />
        <div className="card stack">
          <span className="badge badge-ok">Submitted</span>
          <dl className="summary">
            <dt>Project ID</dt>
            <dd className="mono">{success.projectId}</dd>
            <dt>Website</dt>
            <dd className="mono wrap">{success.websiteURL}</dd>
          </dl>
          <div className="actions">
            <Link className="btn" to={`/projects/${encodeURIComponent(success.projectId)}`}>
              View project
            </Link>
            <Link className="btn btn-secondary" to={`/report?project=${encodeURIComponent(success.projectId)}`}>
              View verification report
            </Link>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setSuccess(null);
                setForm({ projectId: "", websiteURL: "" });
              }}
            >
              Submit another
            </button>
          </div>
        </div>
      </section>
    );
  }

  const err = (k) => errors[k];
  const desc = (k) => `${k}-msg`;

  return (
    <section>
      <PageHeader
        title="Submit Website"
        lede="Developer submits the completed website URL for client review."
      />
      {!address && (
        <div className="card stack">
          <h2>Connect the developer wallet</h2>
          <p>Only the developer wallet for the project can submit a website.</p>
          <WalletButton />
        </div>
      )}
      <div className="create-layout">
        <form ref={formRef} className="card stack" onSubmit={onSubmit} noValidate>
          <Field id="projectId" label="Project ID" error={err("projectId")}>
            <input
              id="projectId"
              className="input"
              value={form.projectId}
              onChange={onText("projectId")}
              aria-invalid={!!err("projectId") || undefined}
              aria-describedby={desc("projectId")}
              placeholder="1"
            />
          </Field>

          <Field id="websiteURL" label="Website URL" hint="The completed website address." error={err("websiteURL")}>
            <input
              id="websiteURL"
              className="input"
              type="url"
              value={form.websiteURL}
              onChange={onText("websiteURL")}
              placeholder="https://example.com"
              aria-invalid={!!err("websiteURL") || undefined}
              aria-describedby={desc("websiteURL")}
            />
          </Field>

          {errors.general && <p className="error" role="alert">{errors.general}</p>}

          <div className="actions">
            <button className="btn" type="submit" disabled={loading || !address}>
              {loading ? "Submitting..." : "Submit Website"}
            </button>
            <Link className="btn btn-secondary" to="/dashboard">
              Cancel
            </Link>
          </div>
        </form>

        <aside className="card stack side-note" aria-label="Submission info">
          <h2>What happens next</h2>
          <p>After submission, the client has {import.meta.env.VITE_REVIEW_WINDOW_DAYS || 7} days to review and approve.</p>
          <p>The inspection pipeline will analyze the website and generate an evidence report for the client's review.</p>
          <p>If approved, you can withdraw the escrow. If disputed, funds remain locked.</p>
        </aside>
      </div>
    </section>
  );
}
