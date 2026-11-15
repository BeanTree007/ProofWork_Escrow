// Shared project model: contract states, review window and input validation.
export const STATUS = {
  CREATED: "Created",
  FUNDED: "Funded",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  DISPUTED: "Disputed",
  EXPIRED: "Expired",
  REFUNDED: "Refunded",
  EXTENSION_REQUESTED: "Extension Requested",
};

export const REVIEW_WINDOW_DAYS = 7;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/** Returns an object of field -> message. Empty object means the input is valid. */
export function validateProjectInput(input, now = Date.now(), clientAddress = "") {
  const e = {};
  const name = (input.name || "").trim();
  if (name.length < 3 || name.length > 80) e.name = "Enter a project name of 3 to 80 characters.";
  if ((input.description || "").trim().length < 20) e.description = "Describe the website in at least 20 characters so the developer knows what to build.";
  if (!input.pages?.length) e.pages = "Add at least one required page, for example Home or Contact.";
  if (!input.features?.length) e.features = "Add at least one required feature, for example a contact form.";

  const amount = String(input.amount ?? "").trim();
  const decimals = amount.split(".")[1]?.length ?? 0;
  if (!/^\d*\.?\d+$/.test(amount) || Number(amount) <= 0) e.amount = "Enter an escrow amount greater than 0.";
  else if (decimals > 18) e.amount = "Use at most 18 decimal places.";

  const dev = (input.developerAddress || "").trim();
  if (!ADDRESS.test(dev)) e.developerAddress = "Enter a wallet address that starts with 0x followed by 40 hex characters.";
  else if (sameAddress(dev, clientAddress)) e.developerAddress = "The developer wallet must be different from your own wallet.";

  const deadline = new Date(input.deadline).getTime();
  if (!input.deadline || Number.isNaN(deadline)) e.deadline = "Choose a deadline date and time.";
  else if (deadline <= now) e.deadline = "Choose a deadline in the future.";
  return e;
}

export function sameAddress(a, b) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export const shortAddress = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

/** "client", "developer" or "other" for a connected address. */
export function roleFor(project, address) {
  if (sameAddress(address, project.clientAddress)) return "client";
  if (sameAddress(address, project.developerAddress)) return "developer";
  return "other";
}

const TONES = {
  [STATUS.APPROVED]: "ok",
  [STATUS.SUBMITTED]: "warn",
  [STATUS.EXTENSION_REQUESTED]: "warn",
  [STATUS.REFUNDED]: "warn",
  [STATUS.DISPUTED]: "bad",
  [STATUS.EXPIRED]: "bad",
};
export const statusTone = (status) => TONES[status] ?? "";

/** Demo hash (SHA-256). The contract will store keccak256 of the same canonical JSON. */
export async function computeBriefHash({ description, pages, features }) {
  const canonical = JSON.stringify({ description: description.trim(), pages, features });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return "0x" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
