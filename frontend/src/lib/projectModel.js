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

export function shortAddress(addr) {
  if (!addr || typeof addr !== 'string') return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function sameAddress(a, b) {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function roleFor(project, address) {
  if (!address) return "other";
  if (sameAddress(address, project.clientAddress)) return "client";
  if (sameAddress(address, project.developerAddress)) return "developer";
  return "other";
}

export function statusTone(status) {
  switch (status) {
    case STATUS.APPROVED:
    case STATUS.FUNDED:
      return "ok";
    case STATUS.SUBMITTED:
    case STATUS.IN_PROGRESS:
      return "accent";
    case STATUS.DISPUTED:
    case STATUS.REFUNDED:
      return "bad";
    default:
      return "muted";
  }
}

/** Returns an object of field -> message. Empty object means the input is valid. */
export function validateProjectInput(input, now = Date.now(), clientAddress) {
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

  const devAddr = (input.developerAddress || "").trim();
  if (!ADDRESS.test(devAddr)) e.developerAddress = "Enter a wallet address that starts with 0x followed by 40 hex characters.";
  else if (clientAddress && sameAddress(devAddr, clientAddress)) e.developerAddress = "Developer address must be different from client address.";

  const deadline = new Date(input.deadline).getTime();
  if (!input.deadline || Number.isNaN(deadline)) e.deadline = "Choose a deadline date and time.";
  else if (deadline <= now) e.deadline = "Choose a deadline in the future.";
  return e;
}

export async function computeBriefHash(brief) {
  const text = `${brief.description}|${brief.pages.join(',')}|${brief.features.join(',')}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
