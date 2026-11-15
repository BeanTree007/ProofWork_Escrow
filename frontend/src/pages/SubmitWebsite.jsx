import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useState, useRef } from "react";
import * as blockchain from "../services/blockchain";
import PageHeader from "../components/PageHeader";

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
  const navigate = useNavigate();
  const projectId = searchParams.get("projectId") || "";
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
      if (!form.websiteURL || form.websiteURL.trim().length === 0) {
        newErrors.websiteURL = "Website URL is required";
      } else if (form.websiteURL.length > 2048) {
        newErrors.websiteURL = "URL too long (max 2048 characters)";
      }

      if (Object.keys(newErrors).length) {
        setErrors(newErrors);
        focusFirstError();
        setLoading(false);
        return;
      }

      const result = await blockchain.submitWebsite(
        parseInt(form.projectId),
        form.websiteURL.trim()
      );

      setSuccess({
        txHash: result.txHash,
        projectId: form.projectId,
      });
    } catch (err) {
      const msg = err.message || "Failed to submit website";
      if (msg.includes("state")) {
        setErrors({ general: "Project is not in Funded state. It may already have a submission." });
      } else {
        setErrors({ general: msg });
      }
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
            <dt>Transaction Hash</dt>
            <dd className="mono">{success.txHash.slice(0, 10)}...</dd>
            <dt>Project ID</dt>
            <dd className="mono">{success.projectId}</dd>
          </dl>
          <div className="actions">
            <Link className="btn" to={`/dashboard?id=${success.projectId}`}>
              View dashboard
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
      <div className="create-layout">
        <form ref={formRef} className="card stack" onSubmit={onSubmit} noValidate>
          <Field id="projectId" label="Project ID" error={err("projectId")}>
            <input
              id="projectId"
              className="input"
              type="number"
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
            <button className="btn" type="submit" disabled={loading}>
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
