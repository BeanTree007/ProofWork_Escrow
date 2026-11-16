// Project brief store (Flask backend). Briefs are stored under their SHA-256, which is the
// contract's detailsHash, so the server cannot hand back a brief that differs from the contract.

const url = (hash) => `/api/briefs/${encodeURIComponent(hash)}`;
const fail = (code, message) => Object.assign(new Error(message), { code });

export async function putBrief(hash, { name, description, pages, features }) {
  let res;
  try {
    res = await fetch(url(hash), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, pages, features }),
    });
  } catch {
    throw fail("OFFLINE", "The ProofWork server could not be reached to share the brief.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw fail("ERROR", body?.error || `The server answered with status ${res.status}.`);
  return body;
}

/** Resolves to the stored brief, or null when the server has none for this hash. */
export async function fetchBrief(hash) {
  let res;
  try {
    res = await fetch(url(hash));
  } catch {
    throw fail("OFFLINE", "The ProofWork server could not be reached to load the brief.");
  }
  if (res.status === 404) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw fail("ERROR", body?.error || `The server answered with status ${res.status}.`);
  return body;
}
