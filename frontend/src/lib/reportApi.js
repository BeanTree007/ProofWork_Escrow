// Verification report API (Flask backend, proxied at /api by Vite).
// The report shape is defined in docs/report-contract.md.

const base = (projectId) => `/api/projects/${encodeURIComponent(projectId)}`;

async function request(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw Object.assign(new Error("The inspection service could not be reached. Is the backend running?"), { code: "OFFLINE" });
  }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const message = body?.error || `The inspection service answered with status ${res.status}.`;
    throw Object.assign(new Error(message), { code: res.status === 404 ? "NOT_FOUND" : res.status === 409 ? "BUSY" : "ERROR", status: res.status });
  }
  return body;
}

// Resolves to the stored report, or null when none exists yet.
export async function getReport(projectId) {
  try {
    return await request(`${base(projectId)}/report`);
  } catch (e) {
    if (e.code === "NOT_FOUND") return null;
    throw e;
  }
}

export function runInspection(projectId, { websiteUrl, pages = [], features = [] }) {
  return request(`${base(projectId)}/inspection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ website_url: websiteUrl, pages, features }),
  });
}

export function screenshotUrl(projectId, file, generatedAt) {
  const v = generatedAt ? `?v=${encodeURIComponent(generatedAt)}` : "";
  return `${base(projectId)}/screenshots/${encodeURIComponent(file)}${v}`;
}
