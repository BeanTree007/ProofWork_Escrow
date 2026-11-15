import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import TagInput from "../components/TagInput";
import { createProject } from "../lib/gateway";
import { DEMO_DEVELOPER, useWallet } from "../lib/wallet";
import { REVIEW_WINDOW_DAYS } from "../lib/projectModel";

const empty = { name: "", description: "", pages: [], features: [], amount: "", developerAddress: "", deadline: "" };

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

function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function CreateProject() {
  const wallet = useWallet();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [created, setCreated] = useState(null);
  const formRef = useRef(null);

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const onText = (key) => (e) => set(key)(e.target.value);
  const focusFirstError = () =>
    requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitError("");
    setBusy(true);
    try {
      setCreated(await createProject(form, wallet.address));
      window.scrollTo(0, 0);
    } catch (err) {
      if (err.fieldErrors) {
        setErrors(err.fieldErrors);
        focusFirstError();
      } else if (err.code === "NO_WALLET") {
        setSubmitError(err.message);
      } else {
        setSubmitError("The project could not be created. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <section>
        <PageHeader title="Escrow funded" lede={`${created.name} is open for the developer to start.`} />
        <div className="card stack">
          <span className="badge badge-ok">{created.status}</span>
          <dl className="summary">
            <dt>Project ID</dt><dd className="mono">{created.id}</dd>
            <dt>Escrow</dt><dd>{created.amount} MON</dd>
            <dt>Developer</dt><dd className="mono wrap">{created.developerAddress}</dd>
            <dt>Deadline</dt><dd>{new Date(created.deadline).toLocaleString()}</dd>
          </dl>
          <p className="hint-note">Demo mode: no real transaction was sent. Funding is simulated until the Monad contract is connected.</p>
          <div className="actions">
            <Link className="btn" to="/dashboard">Go to dashboard</Link>
            <button className="btn btn-secondary" type="button" onClick={() => { setCreated(null); setForm(empty); }}>
              Create another project
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
        title="Create a project"
        lede="Describe the website you need and lock the payment in escrow. The developer is paid only when you approve."
      />
      <div className="create-layout">
        <form ref={formRef} className="card stack" onSubmit={onSubmit} noValidate>
          <Field id="name" label="Project name" error={err("name")}>
            <input id="name" className="input" value={form.name} onChange={onText("name")} aria-invalid={!!err("name") || undefined} aria-describedby={desc("name")} autoComplete="off" />
          </Field>

          <Field id="description" label="Website description" hint="What the site is for, who it serves and the style you expect." error={err("description")}>
            <textarea id="description" className="input" value={form.description} onChange={onText("description")} aria-invalid={!!err("description") || undefined} aria-describedby={desc("description")} />
          </Field>

          <Field id="pages" label="Required pages" hint="Type a page name and press Enter." error={err("pages")}>
            <TagInput id="pages" values={form.pages} onChange={set("pages")} placeholder="Home, About, Contact" invalid={!!err("pages")} describedBy={desc("pages")} />
          </Field>

          <Field id="features" label="Required features" hint="Type a feature and press Enter." error={err("features")}>
            <TagInput id="features" values={form.features} onChange={set("features")} placeholder="Contact form, Mobile layout" invalid={!!err("features")} describedBy={desc("features")} />
          </Field>

          <div className="two-up">
            <Field id="amount" label="Escrow amount (MON)" error={err("amount")}>
              <input id="amount" className="input" inputMode="decimal" value={form.amount} onChange={onText("amount")} placeholder="2.5" aria-invalid={!!err("amount") || undefined} aria-describedby={desc("amount")} />
            </Field>
            <Field id="deadline" label="Initial deadline" error={err("deadline")}>
              <input id="deadline" type="datetime-local" className="input" min={toLocalInput(new Date())} value={form.deadline} onChange={onText("deadline")} aria-invalid={!!err("deadline") || undefined} aria-describedby={desc("deadline")} />
            </Field>
          </div>

          <Field id="developerAddress" label="Developer wallet address" hint="Payment is released to this address on approval. Only this wallet can open and accept the project." error={err("developerAddress")}>
            <input id="developerAddress" className="input mono" value={form.developerAddress} onChange={onText("developerAddress")} placeholder="0x..." spellCheck="false" autoComplete="off" aria-invalid={!!err("developerAddress") || undefined} aria-describedby={desc("developerAddress")} />
            <button type="button" className="link-btn" onClick={() => set("developerAddress")(DEMO_DEVELOPER)}>Use the demo developer wallet</button>
          </Field>

          {!wallet.address && <p className="hint-note">Connect a wallet (top right) to fund escrow. Your wallet becomes the client on the contract.</p>}
          {submitError && <p className="error" role="alert">{submitError}</p>}
          <div className="actions">
            <button className="btn" type="submit" disabled={busy || !wallet.address}>{busy ? "Funding escrow..." : "Create project and fund escrow"}</button>
          </div>
        </form>

        <aside className="card stack side-note" aria-label="Escrow terms">
          <h2>How escrow works</h2>
          <p>Your funds are locked in the smart contract when you create the project. Neither side can take them alone.</p>
          <p>If the developer misses the deadline and delivers nothing, you can reclaim the funds.</p>
          <p>After delivery you have {REVIEW_WINDOW_DAYS} days to approve or raise a dispute. If you do not respond, the funds go to the developer.</p>
          <p>The AI inspector produces evidence for your review. It never releases or withholds payment.</p>
        </aside>
      </div>
    </section>
  );
}
